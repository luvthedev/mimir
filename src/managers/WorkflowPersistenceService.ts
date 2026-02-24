// ============================================================================
// WorkflowPersistenceService - CRUD operations for visual editor workflows
// ============================================================================

import type { Driver } from 'neo4j-driver';
import type { IGraphManager } from '../types/IGraphManager.js';
import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  ListWorkflowsOptions
} from '../types/workflow.js';

/**
 * WorkflowPersistenceService - Manages persistence of visual workflow definitions
 *
 * Stores workflows as graph nodes in Neo4j using the unified graph model:
 * - Each Workflow is a Node with type 'workflow'
 * - Each WorkflowNode is a Node with type 'workflow_node', linked via 'has_node' edges
 * - Each WorkflowConnection is an edge with type 'connects_to' between workflow_node nodes
 *
 * This enables both efficient retrieval of entire workflows and
 * graph-based queries across workflow structures.
 *
 * @example
 * ```typescript
 * const service = new WorkflowPersistenceService(graphManager);
 *
 * // Create a workflow
 * const workflow = await service.createWorkflow({
 *   name: 'CSV Pipeline',
 *   description: 'Process CSV uploads',
 *   userId: 'user-123',
 *   nodes: [
 *     { id: 'n1', type: 'upload', position: { x: 0, y: 0 }, config: {} },
 *     { id: 'n2', type: 'extract', position: { x: 200, y: 0 }, config: {} }
 *   ],
 *   connections: [
 *     { id: 'c1', sourceNodeId: 'n1', targetNodeId: 'n2', sourcePort: 'output', targetPort: 'input' }
 *   ]
 * });
 * ```
 */
export class WorkflowPersistenceService {
  private driver: Driver;

  constructor(private graphManager: IGraphManager) {
    this.driver = graphManager.getDriver();
  }

  // ============================================================================
  // CREATE
  // ============================================================================

  /**
   * Create a new workflow with its nodes and connections
   *
   * Creates the workflow node, all child workflow_node nodes, and
   * workflow connections within a single transaction for atomicity.
   *
   * @param input - Workflow creation input (name, userId, nodes, connections)
   * @returns The created Workflow with all fields populated
   *
   * @example
   * const workflow = await service.createWorkflow({
   *   name: 'Data Pipeline',
   *   userId: 'user-123',
   *   nodes: [
   *     { id: 'n1', type: 'upload', position: { x: 0, y: 0 }, config: {} }
   *   ]
   * });
   */
  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      const now = new Date().toISOString();
      const workflowId = `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // 1. Create the workflow node
      await tx.run(
        `CREATE (w:Node {
          id: $id,
          type: 'workflow',
          name: $name,
          description: $description,
          userId: $userId,
          isActive: $isActive,
          created: $now,
          updated: $now,
          has_embedding: false
        })`,
        {
          id: workflowId,
          name: input.name,
          description: input.description || '',
          userId: input.userId,
          isActive: input.isActive !== false,
          now
        }
      );

      // 2. Create workflow_node nodes and link them to the workflow
      const nodes = input.nodes || [];
      for (const node of nodes) {
        const nodeId = `wfn-${workflowId}-${node.id}`;
        await tx.run(
          `MATCH (w:Node {id: $workflowId})
           CREATE (n:Node {
             id: $nodeId,
             type: 'workflow_node',
             originalNodeId: $originalNodeId,
             nodeType: $nodeType,
             position_x: $posX,
             position_y: $posY,
             config_json: $configJson,
             metadata_json: $metadataJson,
             created: $now,
             updated: $now,
             has_embedding: false
           })
           CREATE (w)-[:EDGE {
             id: $edgeId,
             type: 'has_node',
             created: $now
           }]->(n)`,
          {
            workflowId,
            nodeId,
            originalNodeId: node.id,
            nodeType: node.type,
            posX: node.position.x,
            posY: node.position.y,
            configJson: JSON.stringify(node.config),
            metadataJson: JSON.stringify(node.metadata || {}),
            edgeId: `edge-has-${nodeId}-${Date.now()}`,
            now
          }
        );
      }

      // 3. Create connections between workflow nodes
      const connections = input.connections || [];
      for (const conn of connections) {
        const sourceId = `wfn-${workflowId}-${conn.sourceNodeId}`;
        const targetId = `wfn-${workflowId}-${conn.targetNodeId}`;
        const connEdgeId = `wfc-${workflowId}-${conn.id}`;

        await tx.run(
          `MATCH (s:Node {id: $sourceId})
           MATCH (t:Node {id: $targetId})
           CREATE (s)-[:EDGE {
             id: $connEdgeId,
             type: 'connects_to',
             connectionId: $connectionId,
             sourcePort: $sourcePort,
             targetPort: $targetPort,
             created: $now
           }]->(t)`,
          {
            sourceId,
            targetId,
            connEdgeId,
            connectionId: conn.id,
            sourcePort: conn.sourcePort,
            targetPort: conn.targetPort,
            now
          }
        );
      }

      await tx.commit();

      return {
        id: workflowId,
        name: input.name,
        description: input.description || '',
        nodes,
        connections,
        createdAt: now,
        updatedAt: now,
        userId: input.userId,
        isActive: input.isActive !== false
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // READ
  // ============================================================================

  /**
   * Retrieve a workflow by its ID, including all nodes and connections
   *
   * Fetches the workflow metadata, all linked workflow_node nodes, and
   * all connections between them in optimized queries.
   *
   * @param workflowId - The unique workflow ID
   * @returns The Workflow object or null if not found
   *
   * @example
   * const workflow = await service.getWorkflowById('workflow-1732456789-abc123');
   * if (workflow) {
   *   console.log(`${workflow.name}: ${workflow.nodes.length} nodes`);
   * }
   */
  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    const session = this.driver.session();
    try {
      // Fetch workflow metadata
      const wfResult = await session.run(
        `MATCH (w:Node {id: $workflowId, type: 'workflow'})
         RETURN w`,
        { workflowId }
      );

      if (wfResult.records.length === 0) {
        return null;
      }

      const wfProps = wfResult.records[0].get('w').properties;

      // Fetch all workflow nodes
      const nodesResult = await session.run(
        `MATCH (w:Node {id: $workflowId})-[:EDGE {type: 'has_node'}]->(n:Node {type: 'workflow_node'})
         RETURN n
         ORDER BY n.created`,
        { workflowId }
      );

      const nodes: WorkflowNode[] = nodesResult.records.map(r => {
        const props = r.get('n').properties;
        return {
          id: props.originalNodeId,
          type: props.nodeType,
          position: { x: this.toNumber(props.position_x), y: this.toNumber(props.position_y) },
          config: this.parseJson(props.config_json, {}),
          metadata: this.parseJson(props.metadata_json, undefined)
        };
      });

      // Fetch all connections between workflow nodes
      const connsResult = await session.run(
        `MATCH (w:Node {id: $workflowId})-[:EDGE {type: 'has_node'}]->(s:Node)
         MATCH (s)-[c:EDGE {type: 'connects_to'}]->(t:Node)
         MATCH (w)-[:EDGE {type: 'has_node'}]->(t)
         RETURN c, s.originalNodeId AS sourceNodeId, t.originalNodeId AS targetNodeId`,
        { workflowId }
      );

      const connections: WorkflowConnection[] = connsResult.records.map(r => {
        const cProps = r.get('c').properties;
        return {
          id: cProps.connectionId,
          sourceNodeId: r.get('sourceNodeId'),
          targetNodeId: r.get('targetNodeId'),
          sourcePort: cProps.sourcePort,
          targetPort: cProps.targetPort
        };
      });

      return {
        id: wfProps.id,
        name: wfProps.name,
        description: wfProps.description || '',
        nodes,
        connections,
        createdAt: wfProps.created,
        updatedAt: wfProps.updated,
        userId: wfProps.userId,
        isActive: wfProps.isActive !== false
      };
    } finally {
      await session.close();
    }
  }

  /**
   * List workflows with optional filtering by user and active status
   *
   * Retrieves workflow metadata without loading nodes/connections for
   * efficient listing. Supports pagination via limit/offset.
   *
   * @param options - Filter and pagination options
   * @returns Array of Workflow objects (with empty nodes/connections arrays)
   *
   * @example
   * // List all active workflows for a user
   * const workflows = await service.listWorkflows({
   *   userId: 'user-123',
   *   isActive: true,
   *   limit: 20
   * });
   */
  async listWorkflows(options: ListWorkflowsOptions = {}): Promise<Workflow[]> {
    const session = this.driver.session();
    try {
      const conditions: string[] = ["w.type = 'workflow'"];
      const params: Record<string, any> = {};

      if (options.userId !== undefined) {
        conditions.push('w.userId = $userId');
        params.userId = options.userId;
      }

      if (options.isActive !== undefined) {
        conditions.push('w.isActive = $isActive');
        params.isActive = options.isActive;
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      let query = `MATCH (w:Node) ${whereClause} RETURN w ORDER BY w.updated DESC`;

      if (options.limit !== undefined) {
        query += ` LIMIT $limit`;
        params.limit = options.limit;
      }

      if (options.offset !== undefined) {
        query += ` SKIP $offset`;
        params.offset = options.offset;
      }

      const result = await session.run(query, params);

      return result.records.map(r => {
        const props = r.get('w').properties;
        return {
          id: props.id,
          name: props.name,
          description: props.description || '',
          nodes: [],        // Not loaded in list view for performance
          connections: [],   // Not loaded in list view for performance
          createdAt: props.created,
          updatedAt: props.updated,
          userId: props.userId,
          isActive: props.isActive !== false
        };
      });
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  /**
   * Update a workflow's metadata, nodes, and/or connections
   *
   * If nodes or connections are provided, the existing ones are replaced
   * entirely (delete old + create new) within a transaction.
   *
   * @param workflowId - The workflow ID to update
   * @param input - Fields to update
   * @returns The updated Workflow
   * @throws {Error} If workflow not found
   *
   * @example
   * // Update workflow name
   * const updated = await service.updateWorkflow('workflow-123', {
   *   name: 'Renamed Pipeline'
   * });
   *
   * @example
   * // Replace all nodes and connections
   * const updated = await service.updateWorkflow('workflow-123', {
   *   nodes: [newNode1, newNode2],
   *   connections: [newConn1]
   * });
   */
  async updateWorkflow(workflowId: string, input: UpdateWorkflowInput): Promise<Workflow> {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      const now = new Date().toISOString();

      // Verify workflow exists
      const existsResult = await tx.run(
        `MATCH (w:Node {id: $workflowId, type: 'workflow'}) RETURN w`,
        { workflowId }
      );

      if (existsResult.records.length === 0) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Update metadata fields
      const setFields: string[] = ['w.updated = $now'];
      const params: Record<string, any> = { workflowId, now };

      if (input.name !== undefined) {
        setFields.push('w.name = $name');
        params.name = input.name;
      }
      if (input.description !== undefined) {
        setFields.push('w.description = $description');
        params.description = input.description;
      }
      if (input.isActive !== undefined) {
        setFields.push('w.isActive = $isActive');
        params.isActive = input.isActive;
      }

      await tx.run(
        `MATCH (w:Node {id: $workflowId}) SET ${setFields.join(', ')}`,
        params
      );

      // If nodes are provided, replace all existing nodes and connections
      if (input.nodes !== undefined) {
        // Delete existing workflow_node nodes and their edges
        await tx.run(
          `MATCH (w:Node {id: $workflowId})-[r1:EDGE {type: 'has_node'}]->(n:Node {type: 'workflow_node'})
           OPTIONAL MATCH (n)-[r2:EDGE {type: 'connects_to'}]->(m)
           OPTIONAL MATCH (x)-[r3:EDGE {type: 'connects_to'}]->(n)
           DELETE r1, r2, r3, n`,
          { workflowId }
        );

        // Create new nodes
        for (const node of input.nodes) {
          const nodeId = `wfn-${workflowId}-${node.id}`;
          await tx.run(
            `MATCH (w:Node {id: $workflowId})
             CREATE (n:Node {
               id: $nodeId,
               type: 'workflow_node',
               originalNodeId: $originalNodeId,
               nodeType: $nodeType,
               position_x: $posX,
               position_y: $posY,
               config_json: $configJson,
               metadata_json: $metadataJson,
               created: $now,
               updated: $now,
               has_embedding: false
             })
             CREATE (w)-[:EDGE {
               id: $edgeId,
               type: 'has_node',
               created: $now
             }]->(n)`,
            {
              workflowId,
              nodeId,
              originalNodeId: node.id,
              nodeType: node.type,
              posX: node.position.x,
              posY: node.position.y,
              configJson: JSON.stringify(node.config),
              metadataJson: JSON.stringify(node.metadata || {}),
              edgeId: `edge-has-${nodeId}-${Date.now()}`,
              now
            }
          );
        }

        // Create new connections
        const connections = input.connections || [];
        for (const conn of connections) {
          const sourceId = `wfn-${workflowId}-${conn.sourceNodeId}`;
          const targetId = `wfn-${workflowId}-${conn.targetNodeId}`;
          const connEdgeId = `wfc-${workflowId}-${conn.id}`;

          await tx.run(
            `MATCH (s:Node {id: $sourceId})
             MATCH (t:Node {id: $targetId})
             CREATE (s)-[:EDGE {
               id: $connEdgeId,
               type: 'connects_to',
               connectionId: $connectionId,
               sourcePort: $sourcePort,
               targetPort: $targetPort,
               created: $now
             }]->(t)`,
            {
              sourceId,
              targetId,
              connEdgeId,
              connectionId: conn.id,
              sourcePort: conn.sourcePort,
              targetPort: conn.targetPort,
              now
            }
          );
        }
      } else if (input.connections !== undefined) {
        // Only connections changed (without nodes changing)
        // Delete existing connections
        await tx.run(
          `MATCH (w:Node {id: $workflowId})-[:EDGE {type: 'has_node'}]->(s:Node)
           MATCH (s)-[c:EDGE {type: 'connects_to'}]->(t:Node)
           MATCH (w)-[:EDGE {type: 'has_node'}]->(t)
           DELETE c`,
          { workflowId }
        );

        // Create new connections
        for (const conn of input.connections) {
          const sourceId = `wfn-${workflowId}-${conn.sourceNodeId}`;
          const targetId = `wfn-${workflowId}-${conn.targetNodeId}`;
          const connEdgeId = `wfc-${workflowId}-${conn.id}`;

          await tx.run(
            `MATCH (s:Node {id: $sourceId})
             MATCH (t:Node {id: $targetId})
             CREATE (s)-[:EDGE {
               id: $connEdgeId,
               type: 'connects_to',
               connectionId: $connectionId,
               sourcePort: $sourcePort,
               targetPort: $targetPort,
               created: $now
             }]->(t)`,
            {
              sourceId,
              targetId,
              connEdgeId,
              connectionId: conn.id,
              sourcePort: conn.sourcePort,
              targetPort: conn.targetPort,
              now
            }
          );
        }
      }

      await tx.commit();

      // Return the full updated workflow
      const result = await this.getWorkflowById(workflowId);
      if (!result) {
        throw new Error(`Failed to retrieve updated workflow: ${workflowId}`);
      }
      return result;
    } catch (error) {
      // Only rollback if transaction hasn't been committed
      try {
        await tx.rollback();
      } catch {
        // Transaction was already committed or rolled back
      }
      throw error;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // DELETE
  // ============================================================================

  /**
   * Delete a workflow and all its nodes and connections
   *
   * Removes the workflow node, all linked workflow_node nodes, and
   * all connection edges in a single transaction.
   *
   * @param workflowId - The workflow ID to delete
   * @returns true if deleted, false if not found
   *
   * @example
   * const deleted = await service.deleteWorkflow('workflow-123');
   * if (deleted) {
   *   console.log('Workflow deleted');
   * }
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      // Delete all workflow_node nodes and their edges (including connections)
      await tx.run(
        `MATCH (w:Node {id: $workflowId, type: 'workflow'})-[r1:EDGE {type: 'has_node'}]->(n:Node {type: 'workflow_node'})
         OPTIONAL MATCH (n)-[r2:EDGE]-(m)
         DELETE r2, r1, n`,
        { workflowId }
      );

      // Delete the workflow node itself
      const result = await tx.run(
        `MATCH (w:Node {id: $workflowId, type: 'workflow'})
         DETACH DELETE w
         RETURN count(w) AS deleted`,
        { workflowId }
      );

      await tx.commit();

      const deleted = result.records[0]?.get('deleted');
      return (typeof deleted === 'object' && deleted !== null && 'toNumber' in deleted)
        ? deleted.toNumber() > 0
        : Number(deleted) > 0;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Safely parse a JSON string, returning a default value on failure
   */
  private parseJson<T>(json: string | undefined | null, defaultValue: T): T {
    if (!json) return defaultValue;
    try {
      return JSON.parse(json) as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Convert a Neo4j integer or number to a JavaScript number
   */
  private toNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && 'toNumber' in value) return value.toNumber();
    return Number(value);
  }
}
