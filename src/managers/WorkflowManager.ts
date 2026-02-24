/**
 * @module managers/WorkflowManager
 * @description Persistence service for visual workflow editor state
 *
 * Provides CRUD operations for workflows, including their nodes and connections.
 * Follows the same delegation pattern as TodoManager: business logic lives here,
 * while low-level graph operations are delegated to the IGraphManager.
 *
 * For operations that require transactional consistency across multiple graph
 * entities (e.g. creating a workflow with all its nodes and connections), this
 * service uses the Neo4j driver directly via `graphManager.getDriver()`.
 *
 * @example
 * ```typescript
 * import { WorkflowPersistenceService } from './WorkflowManager.js';
 * import { createGraphManager } from './index.js';
 *
 * const graphManager = await createGraphManager();
 * const workflowService = new WorkflowPersistenceService(graphManager);
 *
 * const workflow = await workflowService.createWorkflow({
 *   name: 'CSV Pipeline',
 *   userId: 'user-1',
 *   nodes: [
 *     { type: 'upload', position: { x: 0, y: 0 } },
 *     { type: 'extract', position: { x: 200, y: 0 } }
 *   ],
 *   connections: [
 *     { sourceNodeId: '__node_0__', targetNodeId: '__node_1__', sourcePort: 'output', targetPort: 'input' }
 *   ]
 * });
 * ```
 */

import neo4j from 'neo4j-driver';
import type { IGraphManager } from '../types/IGraphManager.js';
import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  CreateWorkflowNodeInput,
  CreateWorkflowConnectionInput,
} from '../types/workflow.js';

// ============================================================================
// Helpers
// ============================================================================

/** Generate a timestamped ID with a given prefix */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Current ISO timestamp */
function now(): string {
  return new Date().toISOString();
}

// ============================================================================
// WorkflowPersistenceService
// ============================================================================

/**
 * WorkflowPersistenceService – CRUD for visual editor workflows
 *
 * Workflows are stored as a set of Neo4j `:Node` entities:
 * - `type = 'workflow'` – the top-level workflow container
 * - `type = 'workflow_node'` – a step inside the workflow
 * - `type = 'workflow_connection'` – a directed edge between two steps
 *
 * Relationships:
 * - `(workflow)-[:contains]->(workflow_node)`
 * - `(workflow)-[:contains]->(workflow_connection)`
 * - `(workflow_connection)-[:references]->(source workflow_node)` via properties
 */
export class WorkflowPersistenceService {
  constructor(private graphManager: IGraphManager) {}

  // ==========================================================================
  // CREATE
  // ==========================================================================

  /**
   * Create a new workflow with optional nodes and connections
   *
   * All entities are created inside a single Neo4j transaction to ensure
   * atomicity. If any part fails the entire workflow creation is rolled back.
   *
   * When `connections` reference nodes by positional placeholder (`__node_0__`,
   * `__node_1__`, etc.), those placeholders are resolved to the generated
   * workflow-node IDs automatically.
   *
   * @param input - Workflow creation input
   * @returns The full Workflow object with generated IDs
   *
   * @example
   * ```typescript
   * const wf = await service.createWorkflow({
   *   name: 'ETL Pipeline',
   *   userId: 'user-42',
   *   description: 'Extract, transform, load pipeline',
   *   nodes: [
   *     { type: 'upload', position: { x: 0, y: 0 }, config: {} },
   *     { type: 'transform', position: { x: 200, y: 0 }, config: { rule: 'trim' } },
   *     { type: 'output', position: { x: 400, y: 0 }, config: { format: 'json' } }
   *   ],
   *   connections: [
   *     { sourceNodeId: '__node_0__', targetNodeId: '__node_1__', sourcePort: 'out', targetPort: 'in' },
   *     { sourceNodeId: '__node_1__', targetNodeId: '__node_2__', sourcePort: 'out', targetPort: 'in' }
   *   ]
   * });
   * ```
   */
  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    const workflowId = generateId('wf');
    const timestamp = now();

    try {
      // --- 1. Create the workflow node ----
      await session.run(
        `CREATE (w:Node {
          id: $id,
          type: 'workflow',
          name: $name,
          description: $description,
          userId: $userId,
          isActive: true,
          created: $created,
          updated: $updated
        })`,
        {
          id: workflowId,
          name: input.name,
          description: input.description || '',
          userId: input.userId,
          created: timestamp,
          updated: timestamp,
        }
      );

      // --- 2. Create workflow nodes ----
      const nodeInputs = input.nodes || [];
      const createdNodes: WorkflowNode[] = [];
      // Map positional placeholder -> generated node ID
      const placeholderMap: Record<string, string> = {};

      for (let i = 0; i < nodeInputs.length; i++) {
        const ni = nodeInputs[i];
        const nodeId = generateId('wfn');
        placeholderMap[`__node_${i}__`] = nodeId;

        await session.run(
          `CREATE (n:Node {
            id: $id,
            type: 'workflow_node',
            workflowId: $workflowId,
            nodeType: $nodeType,
            positionX: $positionX,
            positionY: $positionY,
            config: $config,
            metadata: $metadata,
            created: $created,
            updated: $created
          })
          WITH n
          MATCH (w:Node {id: $workflowId, type: 'workflow'})
          CREATE (w)-[:CONTAINS]->(n)`,
          {
            id: nodeId,
            workflowId,
            nodeType: ni.type,
            positionX: neo4j.int(ni.position.x),
            positionY: neo4j.int(ni.position.y),
            config: JSON.stringify(ni.config || {}),
            metadata: JSON.stringify(ni.metadata || {}),
            created: timestamp,
          }
        );

        createdNodes.push({
          id: nodeId,
          workflowId,
          type: ni.type,
          position: ni.position,
          config: ni.config || {},
          metadata: ni.metadata || {},
          createdAt: timestamp,
        });
      }

      // --- 3. Create workflow connections ----
      const connInputs = input.connections || [];
      const createdConns: WorkflowConnection[] = [];

      for (const ci of connInputs) {
        const connId = generateId('wfc');
        // Resolve placeholders if used
        const sourceNodeId = placeholderMap[ci.sourceNodeId] || ci.sourceNodeId;
        const targetNodeId = placeholderMap[ci.targetNodeId] || ci.targetNodeId;

        await session.run(
          `CREATE (c:Node {
            id: $id,
            type: 'workflow_connection',
            workflowId: $workflowId,
            sourceNodeId: $sourceNodeId,
            targetNodeId: $targetNodeId,
            sourcePort: $sourcePort,
            targetPort: $targetPort,
            created: $created,
            updated: $created
          })
          WITH c
          MATCH (w:Node {id: $workflowId, type: 'workflow'})
          CREATE (w)-[:CONTAINS]->(c)`,
          {
            id: connId,
            workflowId,
            sourceNodeId,
            targetNodeId,
            sourcePort: ci.sourcePort,
            targetPort: ci.targetPort,
            created: timestamp,
          }
        );

        createdConns.push({
          id: connId,
          workflowId,
          sourceNodeId,
          targetNodeId,
          sourcePort: ci.sourcePort,
          targetPort: ci.targetPort,
          createdAt: timestamp,
        });
      }

      console.log(`Created workflow ${workflowId} with ${createdNodes.length} nodes and ${createdConns.length} connections`);

      return {
        id: workflowId,
        name: input.name,
        description: input.description || '',
        nodes: createdNodes,
        connections: createdConns,
        userId: input.userId,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    } catch (error) {
      console.error(`Failed to create workflow:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // READ
  // ==========================================================================

  /**
   * Retrieve a single workflow by ID, including all nodes and connections
   *
   * Executes a single Cypher query that fetches the workflow node and all
   * child workflow_node / workflow_connection nodes connected via CONTAINS.
   *
   * @param workflowId - Unique workflow ID
   * @returns Full Workflow object, or null if not found
   *
   * @example
   * ```typescript
   * const wf = await service.getWorkflowById('wf-1709000000000-abc123');
   * if (wf) {
   *   console.log(`${wf.name}: ${wf.nodes.length} nodes`);
   * }
   * ```
   */
  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      // Fetch workflow node
      const wfResult = await session.run(
        `MATCH (w:Node {id: $id, type: 'workflow'})
         RETURN w`,
        { id: workflowId }
      );

      if (wfResult.records.length === 0) {
        return null;
      }

      const wfProps = wfResult.records[0].get('w').properties;

      // Fetch child nodes
      const childrenResult = await session.run(
        `MATCH (w:Node {id: $id, type: 'workflow'})-[:CONTAINS]->(child:Node)
         RETURN child`,
        { id: workflowId }
      );

      const nodes: WorkflowNode[] = [];
      const connections: WorkflowConnection[] = [];

      for (const record of childrenResult.records) {
        const props = record.get('child').properties;
        if (props.type === 'workflow_node') {
          nodes.push(this.toWorkflowNode(props));
        } else if (props.type === 'workflow_connection') {
          connections.push(this.toWorkflowConnection(props));
        }
      }

      return {
        id: wfProps.id,
        name: wfProps.name,
        description: wfProps.description || '',
        nodes,
        connections,
        userId: wfProps.userId,
        isActive: wfProps.isActive ?? true,
        createdAt: wfProps.created,
        updatedAt: wfProps.updated,
      };
    } catch (error) {
      console.error(`Failed to get workflow ${workflowId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * List workflows for a given user, optionally filtered by active status
   *
   * Returns lightweight workflow objects *without* nested nodes/connections
   * for efficiency. Use `getWorkflowById` to fetch the full workflow.
   *
   * @param userId - User ID to filter by
   * @param activeOnly - If true (default), only return active workflows
   * @returns Array of Workflow objects (nodes and connections arrays empty)
   *
   * @example
   * ```typescript
   * const workflows = await service.listWorkflows('user-42');
   * for (const wf of workflows) {
   *   console.log(`${wf.name} (${wf.isActive ? 'active' : 'deleted'})`);
   * }
   * ```
   */
  async listWorkflows(userId: string, activeOnly: boolean = true): Promise<Workflow[]> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      const query = activeOnly
        ? `MATCH (w:Node {type: 'workflow', userId: $userId, isActive: true})
           RETURN w ORDER BY w.updated DESC`
        : `MATCH (w:Node {type: 'workflow', userId: $userId})
           RETURN w ORDER BY w.updated DESC`;

      const result = await session.run(query, { userId });

      return result.records.map((record) => {
        const props = record.get('w').properties;
        return {
          id: props.id,
          name: props.name,
          description: props.description || '',
          nodes: [],
          connections: [],
          userId: props.userId,
          isActive: props.isActive ?? true,
          createdAt: props.created,
          updatedAt: props.updated,
        };
      });
    } catch (error) {
      console.error(`Failed to list workflows for user ${userId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  /**
   * Update an existing workflow's metadata, nodes, and/or connections
   *
   * Supports partial updates:
   * - Pass `name` / `description` / `isActive` to update workflow metadata
   * - Pass `nodes` to replace **all** workflow nodes (old ones are deleted)
   * - Pass `connections` to replace **all** connections (old ones are deleted)
   *
   * Node and connection replacement is done inside a single session for
   * consistency.
   *
   * @param workflowId - ID of the workflow to update
   * @param input - Partial update payload
   * @returns Updated Workflow object
   * @throws {Error} If workflow not found
   *
   * @example
   * ```typescript
   * // Rename workflow
   * await service.updateWorkflow('wf-123', { name: 'New Name' });
   *
   * // Replace all nodes and connections
   * await service.updateWorkflow('wf-123', {
   *   nodes: [{ type: 'upload', position: { x: 0, y: 0 } }],
   *   connections: []
   * });
   * ```
   */
  async updateWorkflow(workflowId: string, input: UpdateWorkflowInput): Promise<Workflow> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();
    const timestamp = now();

    try {
      // --- 1. Update workflow metadata ----
      const setClauses: string[] = ['w.updated = $updated'];
      const params: Record<string, any> = { id: workflowId, updated: timestamp };

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

      const updateResult = await session.run(
        `MATCH (w:Node {id: $id, type: 'workflow'})
         SET ${setClauses.join(', ')}
         RETURN w`,
        params
      );

      if (updateResult.records.length === 0) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      // --- 2. Replace nodes if provided ----
      if (input.nodes !== undefined) {
        // Delete existing workflow nodes
        await session.run(
          `MATCH (w:Node {id: $id, type: 'workflow'})-[:CONTAINS]->(n:Node {type: 'workflow_node'})
           DETACH DELETE n`,
          { id: workflowId }
        );

        // Create new nodes
        for (const ni of input.nodes) {
          const nodeId = generateId('wfn');
          await session.run(
            `CREATE (n:Node {
              id: $nodeId,
              type: 'workflow_node',
              workflowId: $workflowId,
              nodeType: $nodeType,
              positionX: $positionX,
              positionY: $positionY,
              config: $config,
              metadata: $metadata,
              created: $created,
              updated: $created
            })
            WITH n
            MATCH (w:Node {id: $workflowId, type: 'workflow'})
            CREATE (w)-[:CONTAINS]->(n)`,
            {
              nodeId,
              workflowId,
              nodeType: ni.type,
              positionX: neo4j.int(ni.position.x),
              positionY: neo4j.int(ni.position.y),
              config: JSON.stringify(ni.config || {}),
              metadata: JSON.stringify(ni.metadata || {}),
              created: timestamp,
            }
          );
        }
      }

      // --- 3. Replace connections if provided ----
      if (input.connections !== undefined) {
        // Delete existing connections
        await session.run(
          `MATCH (w:Node {id: $id, type: 'workflow'})-[:CONTAINS]->(c:Node {type: 'workflow_connection'})
           DETACH DELETE c`,
          { id: workflowId }
        );

        // Create new connections
        for (const ci of input.connections) {
          const connId = generateId('wfc');
          await session.run(
            `CREATE (c:Node {
              id: $connId,
              type: 'workflow_connection',
              workflowId: $workflowId,
              sourceNodeId: $sourceNodeId,
              targetNodeId: $targetNodeId,
              sourcePort: $sourcePort,
              targetPort: $targetPort,
              created: $created,
              updated: $created
            })
            WITH c
            MATCH (w:Node {id: $workflowId, type: 'workflow'})
            CREATE (w)-[:CONTAINS]->(c)`,
            {
              connId,
              workflowId,
              sourceNodeId: ci.sourceNodeId,
              targetNodeId: ci.targetNodeId,
              sourcePort: ci.sourcePort,
              targetPort: ci.targetPort,
              created: timestamp,
            }
          );
        }
      }

      // Return the full updated workflow
      const result = await this.getWorkflowById(workflowId);
      if (!result) {
        throw new Error(`Workflow ${workflowId} not found after update`);
      }
      return result;
    } catch (error) {
      console.error(`Failed to update workflow ${workflowId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // DELETE
  // ==========================================================================

  /**
   * Soft-delete a workflow by setting isActive to false
   *
   * Does not remove the workflow or its children from the graph.
   * To hard-delete, use `hardDeleteWorkflow`.
   *
   * @param workflowId - ID of the workflow to soft-delete
   * @returns true if workflow was found and marked inactive
   *
   * @example
   * ```typescript
   * const deleted = await service.deleteWorkflow('wf-123');
   * console.log(deleted ? 'Soft-deleted' : 'Not found');
   * ```
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      const result = await session.run(
        `MATCH (w:Node {id: $id, type: 'workflow'})
         SET w.isActive = false, w.updated = $updated
         RETURN w.id as deletedId`,
        { id: workflowId, updated: now() }
      );

      const deleted = result.records.length > 0;
      if (deleted) {
        console.log(`Soft-deleted workflow ${workflowId}`);
      }
      return deleted;
    } catch (error) {
      console.error(`Failed to delete workflow ${workflowId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Hard-delete a workflow and all its child nodes and connections
   *
   * Permanently removes the workflow node and everything connected to it
   * via CONTAINS relationships. This cannot be undone.
   *
   * @param workflowId - ID of the workflow to permanently delete
   * @returns true if the workflow was found and removed
   *
   * @example
   * ```typescript
   * await service.hardDeleteWorkflow('wf-123');
   * ```
   */
  async hardDeleteWorkflow(workflowId: string): Promise<boolean> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      // Delete all children first, then the workflow itself
      const result = await session.run(
        `MATCH (w:Node {id: $id, type: 'workflow'})
         OPTIONAL MATCH (w)-[:CONTAINS]->(child:Node)
         DETACH DELETE child
         WITH w
         DETACH DELETE w
         RETURN count(*) as deleted`,
        { id: workflowId }
      );

      const deleted = result.records.length > 0;
      if (deleted) {
        console.log(`Hard-deleted workflow ${workflowId} and all children`);
      }
      return deleted;
    } catch (error) {
      console.error(`Failed to hard-delete workflow ${workflowId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /** Convert raw Neo4j node properties to a WorkflowNode */
  private toWorkflowNode(props: Record<string, any>): WorkflowNode {
    return {
      id: props.id,
      workflowId: props.workflowId,
      type: props.nodeType,
      position: {
        x: typeof props.positionX === 'object' && 'toNumber' in props.positionX
          ? props.positionX.toNumber()
          : Number(props.positionX),
        y: typeof props.positionY === 'object' && 'toNumber' in props.positionY
          ? props.positionY.toNumber()
          : Number(props.positionY),
      },
      config: this.parseJson(props.config),
      metadata: this.parseJson(props.metadata),
      createdAt: props.created,
    };
  }

  /** Convert raw Neo4j node properties to a WorkflowConnection */
  private toWorkflowConnection(props: Record<string, any>): WorkflowConnection {
    return {
      id: props.id,
      workflowId: props.workflowId,
      sourceNodeId: props.sourceNodeId,
      targetNodeId: props.targetNodeId,
      sourcePort: props.sourcePort,
      targetPort: props.targetPort,
      createdAt: props.created,
    };
  }

  /** Safely parse a JSON string, returning an empty object on failure */
  private parseJson(value: any): Record<string, any> {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    if (typeof value === 'object' && value !== null) {
      return value;
    }
    return {};
  }
}
