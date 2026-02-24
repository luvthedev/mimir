/**
 * @module managers/WorkflowPersistenceService
 * @description Persistence layer for visual workflow editor state
 *
 * Provides CRUD operations for workflows, nodes, and connections using
 * the Neo4j graph database. Workflows are stored as graph nodes with
 * typed relationships to their child nodes and connections.
 *
 * Node labels used:
 * - `WorkflowRoot` - Top-level workflow container
 * - `WorkflowNode` - Individual processing step within a workflow
 * - `WorkflowConnection` - Directed edge definition between workflow nodes
 *
 * Relationship types:
 * - `HAS_NODE` - WorkflowRoot -> WorkflowNode
 * - `HAS_CONNECTION` - WorkflowRoot -> WorkflowConnection
 *
 * @since 1.0.0
 */

import * as crypto from 'node:crypto';
import type { IGraphManager } from '../types/IGraphManager.js';
import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  CreateWorkflowInput,
  UpdateWorkflowInput,
} from '../types/workflow.js';

/**
 * WorkflowPersistenceService - Handles workflow CRUD persistence to Neo4j
 *
 * Follows the same patterns as the orchestration persistence layer:
 * - Gets raw Neo4j driver via graphManager.getDriver()
 * - Manages sessions in try/finally blocks
 * - Uses parameterized Cypher queries
 *
 * @example
 * ```typescript
 * const service = new WorkflowPersistenceService(graphManager);
 * await service.initialize();
 *
 * const workflow = await service.createWorkflow({
 *   name: 'ETL Pipeline',
 *   description: 'Extract, transform, and load data',
 *   userId: 'user-123',
 *   nodes: [
 *     { id: 'n1', type: 'upload', position: { x: 0, y: 0 }, config: {}, metadata: {} },
 *     { id: 'n2', type: 'transform', position: { x: 200, y: 0 }, config: {}, metadata: {} },
 *   ],
 *   connections: [
 *     { sourceNodeId: 'n1', targetNodeId: 'n2', sourcePort: 'output', targetPort: 'input' },
 *   ],
 * });
 * ```
 */
export class WorkflowPersistenceService {
  constructor(private graphManager: IGraphManager) {}

  /**
   * Initialize schema constraints and indexes for workflow persistence
   *
   * Creates:
   * - Unique constraint on WorkflowRoot.id
   * - Unique constraint on WorkflowNode.id
   * - Unique constraint on WorkflowConnection.id
   * - Composite index on (WorkflowNode.workflowId, WorkflowNode.nodeType)
   * - Composite index on (WorkflowConnection.workflowId, WorkflowConnection.sourceNodeId, WorkflowConnection.targetNodeId)
   * - Index on WorkflowRoot.userId for fast user-scoped queries
   */
  async initialize(): Promise<void> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      // Unique constraints
      await session.run(`
        CREATE CONSTRAINT workflow_root_id_unique IF NOT EXISTS
        FOR (w:WorkflowRoot) REQUIRE w.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT workflow_node_id_unique IF NOT EXISTS
        FOR (n:WorkflowNode) REQUIRE n.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT workflow_connection_id_unique IF NOT EXISTS
        FOR (c:WorkflowConnection) REQUIRE c.id IS UNIQUE
      `);

      // Composite index on (workflowId, nodeType) for workflow_nodes queries
      await session.run(`
        CREATE INDEX workflow_node_type_idx IF NOT EXISTS
        FOR (n:WorkflowNode) ON (n.workflowId, n.nodeType)
      `);

      // Composite index on (workflowId, sourceNodeId, targetNodeId) for workflow_connections queries
      await session.run(`
        CREATE INDEX workflow_connection_endpoints_idx IF NOT EXISTS
        FOR (c:WorkflowConnection) ON (c.workflowId, c.sourceNodeId, c.targetNodeId)
      `);

      // Index on userId for fast user-scoped queries
      await session.run(`
        CREATE INDEX workflow_user_idx IF NOT EXISTS
        FOR (w:WorkflowRoot) ON (w.userId)
      `);

      console.log('Workflow schema initialized');
    } catch (error: any) {
      console.error('Workflow schema initialization failed:', error.message);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a new workflow with optional nodes and connections
   *
   * @param input - Workflow creation input with name, userId, and optional nodes/connections
   * @returns The fully-hydrated Workflow object
   * @throws {Error} If Neo4j session creation or query execution fails
   *
   * @example
   * ```typescript
   * const workflow = await service.createWorkflow({
   *   name: 'Image Processing',
   *   description: 'Resize and optimize images',
   *   userId: 'user-456',
   * });
   * ```
   */
  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    const workflowId = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      // Create the workflow root node
      await session.run(`
        CREATE (w:WorkflowRoot {
          id: $id,
          userId: $userId,
          name: $name,
          description: $description,
          isActive: true,
          createdAt: datetime($now),
          updatedAt: datetime($now)
        })
        RETURN w.id AS id
      `, {
        id: workflowId,
        userId: input.userId,
        name: input.name,
        description: input.description || '',
        now,
      });

      // Create nodes if provided
      const nodes: WorkflowNode[] = [];
      if (input.nodes && input.nodes.length > 0) {
        for (const nodeInput of input.nodes) {
          const nodeId = nodeInput.id || crypto.randomUUID();
          await session.run(`
            MATCH (w:WorkflowRoot {id: $workflowId})
            CREATE (n:WorkflowNode {
              id: $nodeId,
              workflowId: $workflowId,
              nodeType: $nodeType,
              position: $position,
              config: $config,
              metadata: $metadata,
              createdAt: datetime($now)
            })
            CREATE (w)-[:HAS_NODE]->(n)
            RETURN n.id AS id
          `, {
            workflowId,
            nodeId,
            nodeType: nodeInput.type,
            position: JSON.stringify(nodeInput.position),
            config: JSON.stringify(nodeInput.config),
            metadata: JSON.stringify(nodeInput.metadata),
            now,
          });

          nodes.push({
            id: nodeId,
            type: nodeInput.type,
            position: nodeInput.position,
            config: nodeInput.config,
            metadata: nodeInput.metadata,
            createdAt: now,
          });
        }
      }

      // Create connections if provided
      const connections: WorkflowConnection[] = [];
      if (input.connections && input.connections.length > 0) {
        for (const connInput of input.connections) {
          const connId = crypto.randomUUID();
          await session.run(`
            MATCH (w:WorkflowRoot {id: $workflowId})
            CREATE (c:WorkflowConnection {
              id: $connId,
              workflowId: $workflowId,
              sourceNodeId: $sourceNodeId,
              targetNodeId: $targetNodeId,
              sourcePort: $sourcePort,
              targetPort: $targetPort,
              createdAt: datetime($now)
            })
            CREATE (w)-[:HAS_CONNECTION]->(c)
            RETURN c.id AS id
          `, {
            workflowId,
            connId,
            sourceNodeId: connInput.sourceNodeId,
            targetNodeId: connInput.targetNodeId,
            sourcePort: connInput.sourcePort,
            targetPort: connInput.targetPort,
            now,
          });

          connections.push({
            id: connId,
            sourceNodeId: connInput.sourceNodeId,
            targetNodeId: connInput.targetNodeId,
            sourcePort: connInput.sourcePort,
            targetPort: connInput.targetPort,
            createdAt: now,
          });
        }
      }

      return {
        id: workflowId,
        name: input.name,
        description: input.description || '',
        nodes,
        connections,
        createdAt: now,
        updatedAt: now,
        userId: input.userId,
        isActive: true,
      };
    } catch (error) {
      console.error(`Failed to create workflow:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Retrieve a workflow by ID with all nodes and connections
   *
   * @param workflowId - UUID of the workflow to retrieve
   * @returns The workflow or null if not found
   * @throws {Error} If Neo4j session creation or query execution fails
   */
  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      // Get workflow root
      const wfResult = await session.run(`
        MATCH (w:WorkflowRoot {id: $workflowId})
        RETURN w.id AS id,
               w.userId AS userId,
               w.name AS name,
               w.description AS description,
               w.isActive AS isActive,
               toString(w.createdAt) AS createdAt,
               toString(w.updatedAt) AS updatedAt
      `, { workflowId });

      if (wfResult.records.length === 0) {
        return null;
      }

      const wfRecord = wfResult.records[0];

      // Get nodes
      const nodesResult = await session.run(`
        MATCH (w:WorkflowRoot {id: $workflowId})-[:HAS_NODE]->(n:WorkflowNode)
        RETURN n.id AS id,
               n.nodeType AS type,
               n.position AS position,
               n.config AS config,
               n.metadata AS metadata,
               toString(n.createdAt) AS createdAt
        ORDER BY n.createdAt
      `, { workflowId });

      const nodes: WorkflowNode[] = nodesResult.records.map(record => ({
        id: record.get('id'),
        type: record.get('type'),
        position: JSON.parse(record.get('position')),
        config: JSON.parse(record.get('config')),
        metadata: JSON.parse(record.get('metadata')),
        createdAt: record.get('createdAt'),
      }));

      // Get connections
      const connsResult = await session.run(`
        MATCH (w:WorkflowRoot {id: $workflowId})-[:HAS_CONNECTION]->(c:WorkflowConnection)
        RETURN c.id AS id,
               c.sourceNodeId AS sourceNodeId,
               c.targetNodeId AS targetNodeId,
               c.sourcePort AS sourcePort,
               c.targetPort AS targetPort,
               toString(c.createdAt) AS createdAt
        ORDER BY c.createdAt
      `, { workflowId });

      const connections: WorkflowConnection[] = connsResult.records.map(record => ({
        id: record.get('id'),
        sourceNodeId: record.get('sourceNodeId'),
        targetNodeId: record.get('targetNodeId'),
        sourcePort: record.get('sourcePort'),
        targetPort: record.get('targetPort'),
        createdAt: record.get('createdAt'),
      }));

      return {
        id: wfRecord.get('id'),
        name: wfRecord.get('name'),
        description: wfRecord.get('description'),
        nodes,
        connections,
        createdAt: wfRecord.get('createdAt'),
        updatedAt: wfRecord.get('updatedAt'),
        userId: wfRecord.get('userId'),
        isActive: wfRecord.get('isActive'),
      };
    } catch (error) {
      console.error(`Failed to get workflow ${workflowId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * List workflows for a specific user
   *
   * Returns workflow metadata without nodes/connections for fast listing.
   * Only returns active (non-deleted) workflows by default.
   *
   * @param userId - UUID of the user whose workflows to list
   * @param includeInactive - Whether to include soft-deleted workflows (default: false)
   * @returns Array of workflow objects (without nodes/connections for performance)
   */
  async listWorkflows(userId: string, includeInactive: boolean = false): Promise<Workflow[]> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      const activeClause = includeInactive ? '' : 'AND w.isActive = true';
      const result = await session.run(`
        MATCH (w:WorkflowRoot {userId: $userId})
        WHERE 1=1 ${activeClause}
        RETURN w.id AS id,
               w.userId AS userId,
               w.name AS name,
               w.description AS description,
               w.isActive AS isActive,
               toString(w.createdAt) AS createdAt,
               toString(w.updatedAt) AS updatedAt
        ORDER BY w.updatedAt DESC
      `, { userId });

      return result.records.map(record => ({
        id: record.get('id'),
        name: record.get('name'),
        description: record.get('description'),
        nodes: [],
        connections: [],
        createdAt: record.get('createdAt'),
        updatedAt: record.get('updatedAt'),
        userId: record.get('userId'),
        isActive: record.get('isActive'),
      }));
    } catch (error) {
      console.error(`Failed to list workflows for user ${userId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Update a workflow's metadata, nodes, and/or connections
   *
   * When nodes or connections are provided, the existing ones are replaced entirely
   * (delete-and-recreate strategy) to ensure consistency with the visual editor state.
   *
   * @param workflowId - UUID of the workflow to update
   * @param input - Fields to update
   * @returns The updated workflow or null if not found
   * @throws {Error} If Neo4j session creation or query execution fails
   */
  async updateWorkflow(workflowId: string, input: UpdateWorkflowInput): Promise<Workflow | null> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();
    const now = new Date().toISOString();

    try {
      // Check workflow exists
      const existsResult = await session.run(`
        MATCH (w:WorkflowRoot {id: $workflowId})
        RETURN w.id AS id
      `, { workflowId });

      if (existsResult.records.length === 0) {
        return null;
      }

      // Build SET clauses dynamically for metadata updates
      const setClauses: string[] = ['w.updatedAt = datetime($now)'];
      const params: Record<string, any> = { workflowId, now };

      if (input.name !== undefined) {
        setClauses.push('w.name = $name');
        params.name = input.name;
      }
      if (input.description !== undefined) {
        setClauses.push('w.description = $description');
        params.description = input.description;
      }
      if (input.isActive !== undefined) {
        setClauses.push('w.isActive = $isActive');
        params.isActive = input.isActive;
      }

      await session.run(`
        MATCH (w:WorkflowRoot {id: $workflowId})
        SET ${setClauses.join(', ')}
        RETURN w.id AS id
      `, params);

      // Replace nodes if provided
      if (input.nodes !== undefined) {
        // Delete existing nodes
        await session.run(`
          MATCH (w:WorkflowRoot {id: $workflowId})-[:HAS_NODE]->(n:WorkflowNode)
          DETACH DELETE n
        `, { workflowId });

        // Create new nodes
        for (const nodeInput of input.nodes) {
          const nodeId = nodeInput.id || crypto.randomUUID();
          await session.run(`
            MATCH (w:WorkflowRoot {id: $workflowId})
            CREATE (n:WorkflowNode {
              id: $nodeId,
              workflowId: $workflowId,
              nodeType: $nodeType,
              position: $position,
              config: $config,
              metadata: $metadata,
              createdAt: datetime($now)
            })
            CREATE (w)-[:HAS_NODE]->(n)
            RETURN n.id AS id
          `, {
            workflowId,
            nodeId,
            nodeType: nodeInput.type,
            position: JSON.stringify(nodeInput.position),
            config: JSON.stringify(nodeInput.config),
            metadata: JSON.stringify(nodeInput.metadata),
            now,
          });
        }
      }

      // Replace connections if provided
      if (input.connections !== undefined) {
        // Delete existing connections
        await session.run(`
          MATCH (w:WorkflowRoot {id: $workflowId})-[:HAS_CONNECTION]->(c:WorkflowConnection)
          DETACH DELETE c
        `, { workflowId });

        // Create new connections
        for (const connInput of input.connections) {
          const connId = crypto.randomUUID();
          await session.run(`
            MATCH (w:WorkflowRoot {id: $workflowId})
            CREATE (c:WorkflowConnection {
              id: $connId,
              workflowId: $workflowId,
              sourceNodeId: $sourceNodeId,
              targetNodeId: $targetNodeId,
              sourcePort: $sourcePort,
              targetPort: $targetPort,
              createdAt: datetime($now)
            })
            CREATE (w)-[:HAS_CONNECTION]->(c)
            RETURN c.id AS id
          `, {
            workflowId,
            connId,
            sourceNodeId: connInput.sourceNodeId,
            targetNodeId: connInput.targetNodeId,
            sourcePort: connInput.sourcePort,
            targetPort: connInput.targetPort,
            now,
          });
        }
      }

      // Return the fully-hydrated updated workflow
      return this.getWorkflowById(workflowId);
    } catch (error) {
      console.error(`Failed to update workflow ${workflowId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Soft-delete a workflow by setting isActive to false
   *
   * Preserves all data for potential recovery. To hard-delete,
   * use deleteWorkflowPermanently.
   *
   * @param workflowId - UUID of the workflow to delete
   * @returns True if the workflow was found and deleted, false if not found
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();
    const now = new Date().toISOString();

    try {
      const result = await session.run(`
        MATCH (w:WorkflowRoot {id: $workflowId})
        SET w.isActive = false,
            w.updatedAt = datetime($now)
        RETURN w.id AS id
      `, { workflowId, now });

      return result.records.length > 0;
    } catch (error) {
      console.error(`Failed to delete workflow ${workflowId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Permanently delete a workflow and all its nodes and connections
   *
   * This operation cannot be undone.
   *
   * @param workflowId - UUID of the workflow to permanently delete
   * @returns True if the workflow was found and deleted, false if not found
   */
  async deleteWorkflowPermanently(workflowId: string): Promise<boolean> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      // Delete connections first, then nodes, then root
      await session.run(`
        MATCH (w:WorkflowRoot {id: $workflowId})-[:HAS_CONNECTION]->(c:WorkflowConnection)
        DETACH DELETE c
      `, { workflowId });

      await session.run(`
        MATCH (w:WorkflowRoot {id: $workflowId})-[:HAS_NODE]->(n:WorkflowNode)
        DETACH DELETE n
      `, { workflowId });

      const result = await session.run(`
        MATCH (w:WorkflowRoot {id: $workflowId})
        DELETE w
        RETURN count(w) AS deleted
      `, { workflowId });

      const deletedCount = result.records[0]?.get('deleted')?.toNumber?.() ?? result.records[0]?.get('deleted') ?? 0;
      return deletedCount > 0;
    } catch (error) {
      console.error(`Failed to permanently delete workflow ${workflowId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }
}
