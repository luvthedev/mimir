/**
 * @module managers/WorkflowPersistenceService
 * @description Persistence service for visual workflow editor state
 *
 * Provides CRUD operations for workflows, their nodes, and connections
 * using the Neo4j graph database. Workflows are stored as :Workflow nodes
 * with :WorkflowNode children connected via HAS_NODE edges and
 * :WorkflowConnection nodes connected via HAS_CONNECTION edges.
 *
 * Follows the existing project patterns:
 * - Dependency injection via constructor (receives IGraphManager)
 * - Session-based Neo4j driver access via getDriver()
 * - Idempotent schema initialization
 * - Async/await throughout
 *
 * @example
 * ```typescript
 * import { createGraphManager } from './managers/index.js';
 * import { WorkflowPersistenceService } from './managers/WorkflowPersistenceService.js';
 *
 * const graphManager = await createGraphManager();
 * const workflowService = new WorkflowPersistenceService(graphManager);
 * await workflowService.initializeSchema();
 *
 * const workflow = await workflowService.createWorkflow({
 *   name: 'Document Pipeline',
 *   description: 'Extract and process documents',
 *   userId: 'user-1'
 * });
 * ```
 */

import type { Driver } from 'neo4j-driver';
import type { IGraphManager } from '../types/IGraphManager.js';
import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  CreateWorkflowInput,
  UpdateWorkflowInput,
} from '../types/workflow.js';

/**
 * WorkflowPersistenceService - CRUD operations for visual workflow state
 *
 * Stores workflows in Neo4j using dedicated labels:
 * - :Workflow - The workflow container with metadata
 * - :WorkflowNode - Individual processing nodes with position/config
 * - :WorkflowConnection - Directed connections between nodes
 *
 * Relationships:
 * - (Workflow)-[:HAS_NODE]->(WorkflowNode)
 * - (Workflow)-[:HAS_CONNECTION]->(WorkflowConnection)
 */
export class WorkflowPersistenceService {
  private driver: Driver;

  constructor(private graphManager: IGraphManager) {
    this.driver = graphManager.getDriver();
  }

  // ============================================================================
  // SCHEMA INITIALIZATION
  // ============================================================================

  /**
   * Initialize workflow-specific indexes and constraints
   *
   * Creates:
   * - Unique constraint on Workflow.id
   * - Unique constraint on WorkflowNode.id
   * - Unique constraint on WorkflowConnection.id
   * - Composite index on (WorkflowNode.workflowId, WorkflowNode.nodeType)
   * - Composite index on (WorkflowConnection.workflowId, WorkflowConnection.sourceNodeId, WorkflowConnection.targetNodeId)
   * - Index on Workflow.userId for fast user-scoped queries
   *
   * Idempotent: safe to call multiple times.
   */
  async initializeSchema(): Promise<void> {
    const session = this.driver.session();
    try {
      // Unique constraints
      await session.run(`
        CREATE CONSTRAINT workflow_id_unique IF NOT EXISTS
        FOR (w:Workflow) REQUIRE w.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT workflow_node_id_unique IF NOT EXISTS
        FOR (wn:WorkflowNode) REQUIRE wn.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT workflow_connection_id_unique IF NOT EXISTS
        FOR (wc:WorkflowConnection) REQUIRE wc.id IS UNIQUE
      `);

      // Index on userId for fast user-scoped workflow listing
      await session.run(`
        CREATE INDEX workflow_userId IF NOT EXISTS
        FOR (w:Workflow) ON (w.userId)
      `);

      // Composite index on workflowId + nodeType for fast node queries
      await session.run(`
        CREATE INDEX workflow_node_type IF NOT EXISTS
        FOR (wn:WorkflowNode) ON (wn.workflowId, wn.nodeType)
      `);

      // Composite index on workflowId + source + target for connection queries
      await session.run(`
        CREATE INDEX workflow_connection_endpoints IF NOT EXISTS
        FOR (wc:WorkflowConnection) ON (wc.workflowId, wc.sourceNodeId, wc.targetNodeId)
      `);

      console.log('✅ Workflow schema initialized');
    } catch (error: any) {
      console.error('❌ Workflow schema initialization failed:', error.message);
      throw error;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // WORKFLOW CRUD
  // ============================================================================

  /**
   * Create a new workflow with optional initial nodes and connections
   *
   * @param input - Workflow creation input
   * @returns The created workflow with all fields populated
   *
   * @example
   * ```typescript
   * const workflow = await service.createWorkflow({
   *   name: 'My Pipeline',
   *   description: 'Processes documents',
   *   userId: 'user-1',
   *   nodes: [
   *     { id: 'n1', type: 'upload', position: { x: 0, y: 0 }, config: {}, metadata: {} }
   *   ],
   *   connections: []
   * });
   * ```
   */
  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    const session = this.driver.session();
    const tx = session.beginTransaction();
    try {
      const id = `workflow-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();

      // Create the workflow node
      await tx.run(
        `CREATE (w:Workflow {
          id: $id,
          name: $name,
          description: $description,
          userId: $userId,
          isActive: true,
          createdAt: $now,
          updatedAt: $now
        })`,
        {
          id,
          name: input.name,
          description: input.description || '',
          userId: input.userId,
          now,
        }
      );

      // Create workflow nodes
      const nodes = input.nodes || [];
      for (const node of nodes) {
        await this.createWorkflowNodeInTx(tx, id, node, now);
      }

      // Create workflow connections
      const connections = input.connections || [];
      for (const conn of connections) {
        await this.createWorkflowConnectionInTx(tx, id, conn, now);
      }

      await tx.commit();

      return {
        id,
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
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Retrieve a workflow by ID with all its nodes and connections
   *
   * @param workflowId - The workflow UUID
   * @returns The full workflow or null if not found
   */
  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    const session = this.driver.session();
    try {
      // Fetch workflow metadata
      const wfResult = await session.run(
        `MATCH (w:Workflow {id: $id})
         RETURN w.id AS id, w.name AS name, w.description AS description,
                w.userId AS userId, w.isActive AS isActive,
                w.createdAt AS createdAt, w.updatedAt AS updatedAt`,
        { id: workflowId }
      );

      if (wfResult.records.length === 0) {
        return null;
      }

      const wfRecord = wfResult.records[0];

      // Fetch nodes
      const nodesResult = await session.run(
        `MATCH (w:Workflow {id: $id})-[:HAS_NODE]->(wn:WorkflowNode)
         RETURN wn.id AS id, wn.nodeType AS type,
                wn.positionX AS positionX, wn.positionY AS positionY,
                wn.config AS config, wn.metadata AS metadata
         ORDER BY wn.createdAt`,
        { id: workflowId }
      );

      const nodes: WorkflowNode[] = nodesResult.records.map((r) => ({
        id: r.get('id'),
        type: r.get('type'),
        position: {
          x: this.toNumber(r.get('positionX')),
          y: this.toNumber(r.get('positionY')),
        },
        config: this.parseJson(r.get('config')),
        metadata: this.parseJson(r.get('metadata')),
      }));

      // Fetch connections
      const connsResult = await session.run(
        `MATCH (w:Workflow {id: $id})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
         RETURN wc.id AS id, wc.sourceNodeId AS sourceNodeId,
                wc.targetNodeId AS targetNodeId,
                wc.sourcePort AS sourcePort, wc.targetPort AS targetPort
         ORDER BY wc.createdAt`,
        { id: workflowId }
      );

      const connections: WorkflowConnection[] = connsResult.records.map((r) => ({
        id: r.get('id'),
        sourceNodeId: r.get('sourceNodeId'),
        targetNodeId: r.get('targetNodeId'),
        sourcePort: r.get('sourcePort'),
        targetPort: r.get('targetPort'),
      }));

      return {
        id: wfRecord.get('id'),
        name: wfRecord.get('name'),
        description: wfRecord.get('description') || '',
        nodes,
        connections,
        createdAt: wfRecord.get('createdAt'),
        updatedAt: wfRecord.get('updatedAt'),
        userId: wfRecord.get('userId'),
        isActive: wfRecord.get('isActive') ?? true,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * List workflows for a user, optionally filtering by active status
   *
   * @param userId - The user's ID
   * @param activeOnly - If true (default), only return active workflows
   * @returns Array of workflows (without nodes/connections for performance)
   */
  async listWorkflows(
    userId: string,
    activeOnly: boolean = true
  ): Promise<Omit<Workflow, 'nodes' | 'connections'>[]> {
    const session = this.driver.session();
    try {
      const activeClause = activeOnly ? 'AND w.isActive = true' : '';
      const result = await session.run(
        `MATCH (w:Workflow)
         WHERE w.userId = $userId ${activeClause}
         RETURN w.id AS id, w.name AS name, w.description AS description,
                w.userId AS userId, w.isActive AS isActive,
                w.createdAt AS createdAt, w.updatedAt AS updatedAt
         ORDER BY w.updatedAt DESC`,
        { userId }
      );

      return result.records.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        description: r.get('description') || '',
        createdAt: r.get('createdAt'),
        updatedAt: r.get('updatedAt'),
        userId: r.get('userId'),
        isActive: r.get('isActive') ?? true,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Update an existing workflow's metadata, nodes, and/or connections
   *
   * When nodes or connections are provided, the existing ones are replaced
   * entirely (delete-then-recreate) to ensure consistency with the visual
   * editor's full-state save model.
   *
   * @param workflowId - The workflow UUID to update
   * @param input - Fields to update
   * @returns The updated workflow, or null if not found
   */
  async updateWorkflow(
    workflowId: string,
    input: UpdateWorkflowInput
  ): Promise<Workflow | null> {
    const session = this.driver.session();
    const tx = session.beginTransaction();
    try {
      // Verify workflow exists
      const existsResult = await tx.run(
        `MATCH (w:Workflow {id: $id}) RETURN w.id AS id`,
        { id: workflowId }
      );

      if (existsResult.records.length === 0) {
        await tx.rollback();
        return null;
      }

      const now = new Date().toISOString();

      // Build SET clause dynamically for metadata fields
      const setClauses: string[] = ['w.updatedAt = $now'];
      const params: Record<string, any> = { id: workflowId, now };

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

      await tx.run(
        `MATCH (w:Workflow {id: $id}) SET ${setClauses.join(', ')}`,
        params
      );

      // Replace nodes if provided
      if (input.nodes !== undefined) {
        // Delete existing nodes
        await tx.run(
          `MATCH (w:Workflow {id: $id})-[:HAS_NODE]->(wn:WorkflowNode)
           DETACH DELETE wn`,
          { id: workflowId }
        );

        // Create new nodes
        for (const node of input.nodes) {
          await this.createWorkflowNodeInTx(tx, workflowId, node, now);
        }
      }

      // Replace connections if provided
      if (input.connections !== undefined) {
        // Delete existing connections
        await tx.run(
          `MATCH (w:Workflow {id: $id})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
           DETACH DELETE wc`,
          { id: workflowId }
        );

        // Create new connections
        for (const conn of input.connections) {
          await this.createWorkflowConnectionInTx(tx, workflowId, conn, now);
        }
      }

      await tx.commit();

      // Return full workflow
      return this.getWorkflowById(workflowId);
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Soft-delete a workflow by setting isActive to false
   *
   * Does not remove data from the database; sets isActive = false and
   * updates the timestamp. Use listWorkflows with activeOnly=false to
   * see soft-deleted workflows.
   *
   * @param workflowId - The workflow UUID to delete
   * @returns True if the workflow was found and deleted, false otherwise
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();
      const result = await session.run(
        `MATCH (w:Workflow {id: $id})
         SET w.isActive = false, w.updatedAt = $now
         RETURN w.id AS id`,
        { id: workflowId, now }
      );

      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  /**
   * Create a WorkflowNode within an existing transaction
   */
  private async createWorkflowNodeInTx(
    tx: any,
    workflowId: string,
    node: WorkflowNode,
    createdAt: string
  ): Promise<void> {
    await tx.run(
      `MATCH (w:Workflow {id: $workflowId})
       CREATE (wn:WorkflowNode {
         id: $nodeId,
         workflowId: $workflowId,
         nodeType: $nodeType,
         positionX: $positionX,
         positionY: $positionY,
         config: $config,
         metadata: $metadata,
         createdAt: $createdAt
       })
       CREATE (w)-[:HAS_NODE]->(wn)`,
      {
        workflowId,
        nodeId: node.id,
        nodeType: node.type,
        positionX: node.position.x,
        positionY: node.position.y,
        config: JSON.stringify(node.config),
        metadata: JSON.stringify(node.metadata),
        createdAt,
      }
    );
  }

  /**
   * Create a WorkflowConnection within an existing transaction
   */
  private async createWorkflowConnectionInTx(
    tx: any,
    workflowId: string,
    conn: WorkflowConnection,
    createdAt: string
  ): Promise<void> {
    await tx.run(
      `MATCH (w:Workflow {id: $workflowId})
       CREATE (wc:WorkflowConnection {
         id: $connId,
         workflowId: $workflowId,
         sourceNodeId: $sourceNodeId,
         targetNodeId: $targetNodeId,
         sourcePort: $sourcePort,
         targetPort: $targetPort,
         createdAt: $createdAt
       })
       CREATE (w)-[:HAS_CONNECTION]->(wc)`,
      {
        workflowId,
        connId: conn.id,
        sourceNodeId: conn.sourceNodeId,
        targetNodeId: conn.targetNodeId,
        sourcePort: conn.sourcePort,
        targetPort: conn.targetPort,
        createdAt,
      }
    );
  }

  /**
   * Safely parse a JSON string, returning empty object on failure
   */
  private parseJson(value: any): Record<string, any> {
    if (value === null || value === undefined) {
      return {};
    }
    if (typeof value === 'object') {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  /**
   * Convert a Neo4j Integer or number to a plain JS number
   */
  private toNumber(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }
    // Neo4j integers have a toNumber() method
    if (typeof value === 'object' && typeof value.toNumber === 'function') {
      return value.toNumber();
    }
    return Number(value);
  }
}
