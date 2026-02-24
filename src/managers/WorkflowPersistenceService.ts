/**
 * @module managers/WorkflowPersistenceService
 * @description Persistence service for visual workflow editor state
 *
 * Provides CRUD operations for workflows, their nodes, and connections.
 * Uses Neo4j graph database with dedicated labels (Workflow, WorkflowNode,
 * WorkflowConnection) and relationships (HAS_NODE, HAS_CONNECTION) to
 * store workflow graph structures efficiently.
 *
 * @example
 * ```typescript
 * import { WorkflowPersistenceService } from './managers/WorkflowPersistenceService.js';
 *
 * const service = new WorkflowPersistenceService(graphManager);
 *
 * // Create a workflow
 * const workflow = await service.createWorkflow({
 *   name: 'Data Pipeline',
 *   description: 'Extract and transform data',
 *   userId: 'user-1',
 *   nodes: [
 *     { type: 'upload', position: { x: 0, y: 0 } },
 *     { type: 'transform', position: { x: 200, y: 0 } }
 *   ],
 *   connections: [
 *     { sourceNodeId: 'node-0', targetNodeId: 'node-1', sourcePort: 'out', targetPort: 'in' }
 *   ]
 * });
 *
 * // List workflows for a user
 * const workflows = await service.listWorkflows('user-1');
 * ```
 */

import { randomUUID } from 'node:crypto';
import type { IGraphManager } from '../types/index.js';
import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  WorkflowCreateInput,
  WorkflowUpdateInput,
} from '../types/workflow.js';

/**
 * WorkflowPersistenceService - Handles persistence of visual workflow editor state
 *
 * Stores workflows as a graph structure in Neo4j:
 * - `:Workflow` nodes hold metadata (name, description, userId, timestamps)
 * - `:WorkflowNode` nodes hold individual step data (type, position, config)
 * - `:WorkflowConnection` nodes hold edge data (source/target node IDs and ports)
 * - `HAS_NODE` relationships link Workflow -> WorkflowNode
 * - `HAS_CONNECTION` relationships link Workflow -> WorkflowConnection
 */
export class WorkflowPersistenceService {
  constructor(private graphManager: IGraphManager) {}

  // ============================================================================
  // CREATE
  // ============================================================================

  /**
   * Create a new workflow with optional initial nodes and connections
   *
   * @param input - Workflow creation input (name, description, userId, nodes, connections)
   * @returns The created Workflow with all nodes and connections populated
   *
   * @example
   * ```typescript
   * const wf = await service.createWorkflow({
   *   name: 'ETL Pipeline',
   *   userId: 'user-1',
   *   nodes: [{ type: 'upload', position: { x: 0, y: 0 } }]
   * });
   * ```
   */
  async createWorkflow(input: WorkflowCreateInput): Promise<Workflow> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    const workflowId = randomUUID();
    const now = new Date().toISOString();

    try {
      // Create the Workflow node
      await session.run(
        `
        CREATE (w:Workflow {
          id: $id,
          name: $name,
          description: $description,
          userId: $userId,
          isActive: true,
          createdAt: datetime($createdAt),
          updatedAt: datetime($updatedAt)
        })
        RETURN w.id AS id
        `,
        {
          id: workflowId,
          name: input.name,
          description: input.description || '',
          userId: input.userId,
          createdAt: now,
          updatedAt: now,
        }
      );

      // Create initial nodes if provided
      const nodes: WorkflowNode[] = [];
      if (input.nodes && input.nodes.length > 0) {
        for (const nodeInput of input.nodes) {
          const node = await this.createNode(session, workflowId, nodeInput, now);
          nodes.push(node);
        }
      }

      // Create initial connections if provided
      const connections: WorkflowConnection[] = [];
      if (input.connections && input.connections.length > 0) {
        for (const connInput of input.connections) {
          const conn = await this.createConnection(session, workflowId, connInput, now);
          connections.push(conn);
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
      console.error(`Failed to create workflow: ${error}`);
      throw error;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // READ
  // ============================================================================

  /**
   * Retrieve a workflow by ID with all its nodes and connections
   *
   * @param workflowId - UUID of the workflow to retrieve
   * @returns The full Workflow object or null if not found
   *
   * @example
   * ```typescript
   * const wf = await service.getWorkflowById('wf-abc123');
   * if (wf) {
   *   console.log(wf.name, wf.nodes.length);
   * }
   * ```
   */
  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      // Fetch workflow metadata
      const wfResult = await session.run(
        `
        MATCH (w:Workflow {id: $workflowId})
        RETURN w.id AS id,
               w.name AS name,
               w.description AS description,
               w.userId AS userId,
               w.isActive AS isActive,
               toString(w.createdAt) AS createdAt,
               toString(w.updatedAt) AS updatedAt
        `,
        { workflowId }
      );

      if (wfResult.records.length === 0) {
        return null;
      }

      const wfRecord = wfResult.records[0];

      // Fetch nodes
      const nodesResult = await session.run(
        `
        MATCH (w:Workflow {id: $workflowId})-[:HAS_NODE]->(wn:WorkflowNode)
        RETURN wn.id AS id,
               wn.nodeType AS type,
               wn.position AS position,
               wn.config AS config,
               wn.metadata AS metadata,
               toString(wn.createdAt) AS createdAt
        ORDER BY wn.createdAt
        `,
        { workflowId }
      );

      // Fetch connections
      const connsResult = await session.run(
        `
        MATCH (w:Workflow {id: $workflowId})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
        RETURN wc.id AS id,
               wc.sourceNodeId AS sourceNodeId,
               wc.targetNodeId AS targetNodeId,
               wc.sourcePort AS sourcePort,
               wc.targetPort AS targetPort,
               toString(wc.createdAt) AS createdAt
        ORDER BY wc.createdAt
        `,
        { workflowId }
      );

      const nodes: WorkflowNode[] = nodesResult.records.map((r: any) =>
        this.parseNodeRecord(r)
      );

      const connections: WorkflowConnection[] = connsResult.records.map((r: any) => ({
        id: r.get('id'),
        sourceNodeId: r.get('sourceNodeId'),
        targetNodeId: r.get('targetNodeId'),
        sourcePort: r.get('sourcePort'),
        targetPort: r.get('targetPort'),
        createdAt: r.get('createdAt'),
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
   * List all workflows for a given user
   *
   * Returns workflows sorted by updatedAt descending (most recently modified first).
   * Only returns active workflows by default. Nodes and connections are included.
   *
   * @param userId - UUID of the user whose workflows to list
   * @param includeInactive - Whether to include soft-deleted workflows (default: false)
   * @returns Array of Workflow objects
   *
   * @example
   * ```typescript
   * const workflows = await service.listWorkflows('user-1');
   * console.log(`User has ${workflows.length} workflows`);
   * ```
   */
  async listWorkflows(
    userId: string,
    includeInactive: boolean = false
  ): Promise<Workflow[]> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      const activeFilter = includeInactive ? '' : 'AND w.isActive = true';

      // Fetch all workflows for the user
      const wfResult = await session.run(
        `
        MATCH (w:Workflow {userId: $userId})
        WHERE w.userId = $userId ${activeFilter}
        RETURN w.id AS id,
               w.name AS name,
               w.description AS description,
               w.userId AS userId,
               w.isActive AS isActive,
               toString(w.createdAt) AS createdAt,
               toString(w.updatedAt) AS updatedAt
        ORDER BY w.updatedAt DESC
        `,
        { userId }
      );

      const workflows: Workflow[] = [];

      for (const wfRecord of wfResult.records) {
        const wfId = wfRecord.get('id');

        // Fetch nodes for this workflow
        const nodesResult = await session.run(
          `
          MATCH (w:Workflow {id: $wfId})-[:HAS_NODE]->(wn:WorkflowNode)
          RETURN wn.id AS id,
                 wn.nodeType AS type,
                 wn.position AS position,
                 wn.config AS config,
                 wn.metadata AS metadata,
                 toString(wn.createdAt) AS createdAt
          ORDER BY wn.createdAt
          `,
          { wfId }
        );

        // Fetch connections for this workflow
        const connsResult = await session.run(
          `
          MATCH (w:Workflow {id: $wfId})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
          RETURN wc.id AS id,
                 wc.sourceNodeId AS sourceNodeId,
                 wc.targetNodeId AS targetNodeId,
                 wc.sourcePort AS sourcePort,
                 wc.targetPort AS targetPort,
                 toString(wc.createdAt) AS createdAt
          ORDER BY wc.createdAt
          `,
          { wfId }
        );

        const nodes: WorkflowNode[] = nodesResult.records.map((r: any) =>
          this.parseNodeRecord(r)
        );

        const connections: WorkflowConnection[] = connsResult.records.map(
          (r: any) => ({
            id: r.get('id'),
            sourceNodeId: r.get('sourceNodeId'),
            targetNodeId: r.get('targetNodeId'),
            sourcePort: r.get('sourcePort'),
            targetPort: r.get('targetPort'),
            createdAt: r.get('createdAt'),
          })
        );

        workflows.push({
          id: wfId,
          name: wfRecord.get('name'),
          description: wfRecord.get('description') || '',
          nodes,
          connections,
          createdAt: wfRecord.get('createdAt'),
          updatedAt: wfRecord.get('updatedAt'),
          userId: wfRecord.get('userId'),
          isActive: wfRecord.get('isActive') ?? true,
        });
      }

      return workflows;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  /**
   * Update an existing workflow's metadata, nodes, and/or connections
   *
   * When nodes or connections arrays are provided, the existing ones are
   * replaced entirely (delete all + recreate). Metadata fields are merged.
   *
   * @param workflowId - UUID of the workflow to update
   * @param input - Fields to update
   * @returns The updated Workflow or null if workflow not found
   *
   * @example
   * ```typescript
   * const updated = await service.updateWorkflow('wf-abc123', {
   *   name: 'Updated Pipeline',
   *   nodes: [{ type: 'extract', position: { x: 100, y: 100 } }]
   * });
   * ```
   */
  async updateWorkflow(
    workflowId: string,
    input: WorkflowUpdateInput
  ): Promise<Workflow | null> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();
    const now = new Date().toISOString();

    try {
      // Verify workflow exists
      const existsResult = await session.run(
        `MATCH (w:Workflow {id: $workflowId}) RETURN w.id AS id`,
        { workflowId }
      );

      if (existsResult.records.length === 0) {
        return null;
      }

      // Build dynamic SET clause for metadata fields
      const setClauses: string[] = ['w.updatedAt = datetime($updatedAt)'];
      const params: Record<string, any> = { workflowId, updatedAt: now };

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

      await session.run(
        `
        MATCH (w:Workflow {id: $workflowId})
        SET ${setClauses.join(', ')}
        `,
        params
      );

      // Replace nodes if provided
      if (input.nodes !== undefined) {
        // Delete existing nodes
        await session.run(
          `
          MATCH (w:Workflow {id: $workflowId})-[:HAS_NODE]->(wn:WorkflowNode)
          DETACH DELETE wn
          `,
          { workflowId }
        );

        // Create new nodes
        for (const nodeInput of input.nodes) {
          await this.createNode(session, workflowId, nodeInput, now);
        }
      }

      // Replace connections if provided
      if (input.connections !== undefined) {
        // Delete existing connections
        await session.run(
          `
          MATCH (w:Workflow {id: $workflowId})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
          DETACH DELETE wc
          `,
          { workflowId }
        );

        // Create new connections
        for (const connInput of input.connections) {
          await this.createConnection(session, workflowId, connInput, now);
        }
      }

      // Return the updated workflow
      return this.getWorkflowById(workflowId);
    } catch (error) {
      console.error(`Failed to update workflow ${workflowId}: ${error}`);
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
   * Performs a hard delete, removing the workflow node and all related
   * WorkflowNode and WorkflowConnection nodes and their relationships.
   *
   * @param workflowId - UUID of the workflow to delete
   * @returns true if the workflow was found and deleted, false if not found
   *
   * @example
   * ```typescript
   * const deleted = await service.deleteWorkflow('wf-abc123');
   * if (deleted) {
   *   console.log('Workflow removed');
   * }
   * ```
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      // Delete all associated nodes and connections, then the workflow itself
      const result = await session.run(
        `
        MATCH (w:Workflow {id: $workflowId})
        OPTIONAL MATCH (w)-[:HAS_NODE]->(wn:WorkflowNode)
        OPTIONAL MATCH (w)-[:HAS_CONNECTION]->(wc:WorkflowConnection)
        WITH w, collect(DISTINCT wn) AS nodes, collect(DISTINCT wc) AS conns
        FOREACH (n IN nodes | DETACH DELETE n)
        FOREACH (c IN conns | DETACH DELETE c)
        DETACH DELETE w
        RETURN count(w) AS deleted
        `,
        { workflowId }
      );

      const deletedCount = result.records[0]?.get('deleted');
      return deletedCount > 0;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Create a single WorkflowNode and link it to the parent Workflow
   */
  private async createNode(
    session: any,
    workflowId: string,
    nodeInput: { type: string; position: { x: number; y: number }; config?: Record<string, any>; metadata?: Record<string, any> },
    timestamp: string
  ): Promise<WorkflowNode> {
    const nodeId = randomUUID();

    await session.run(
      `
      MATCH (w:Workflow {id: $workflowId})
      CREATE (wn:WorkflowNode {
        id: $nodeId,
        workflowId: $workflowId,
        nodeType: $nodeType,
        position: $position,
        config: $config,
        metadata: $metadata,
        createdAt: datetime($createdAt)
      })
      CREATE (w)-[:HAS_NODE]->(wn)
      RETURN wn.id AS id
      `,
      {
        workflowId,
        nodeId,
        nodeType: nodeInput.type,
        position: JSON.stringify(nodeInput.position),
        config: JSON.stringify(nodeInput.config || {}),
        metadata: JSON.stringify(nodeInput.metadata || {}),
        createdAt: timestamp,
      }
    );

    return {
      id: nodeId,
      type: nodeInput.type as WorkflowNode['type'],
      position: nodeInput.position,
      config: nodeInput.config || {},
      metadata: nodeInput.metadata || {},
      createdAt: timestamp,
    };
  }

  /**
   * Create a single WorkflowConnection and link it to the parent Workflow
   */
  private async createConnection(
    session: any,
    workflowId: string,
    connInput: { sourceNodeId: string; targetNodeId: string; sourcePort: string; targetPort: string },
    timestamp: string
  ): Promise<WorkflowConnection> {
    const connId = randomUUID();

    await session.run(
      `
      MATCH (w:Workflow {id: $workflowId})
      CREATE (wc:WorkflowConnection {
        id: $connId,
        workflowId: $workflowId,
        sourceNodeId: $sourceNodeId,
        targetNodeId: $targetNodeId,
        sourcePort: $sourcePort,
        targetPort: $targetPort,
        createdAt: datetime($createdAt)
      })
      CREATE (w)-[:HAS_CONNECTION]->(wc)
      RETURN wc.id AS id
      `,
      {
        workflowId,
        connId,
        sourceNodeId: connInput.sourceNodeId,
        targetNodeId: connInput.targetNodeId,
        sourcePort: connInput.sourcePort,
        targetPort: connInput.targetPort,
        createdAt: timestamp,
      }
    );

    return {
      id: connId,
      sourceNodeId: connInput.sourceNodeId,
      targetNodeId: connInput.targetNodeId,
      sourcePort: connInput.sourcePort,
      targetPort: connInput.targetPort,
      createdAt: timestamp,
    };
  }

  /**
   * Parse a Neo4j record into a WorkflowNode, handling JSON-stored fields
   */
  private parseNodeRecord(record: any): WorkflowNode {
    const positionRaw = record.get('position');
    const configRaw = record.get('config');
    const metadataRaw = record.get('metadata');

    return {
      id: record.get('id'),
      type: record.get('type'),
      position: typeof positionRaw === 'string' ? JSON.parse(positionRaw) : positionRaw || { x: 0, y: 0 },
      config: typeof configRaw === 'string' ? JSON.parse(configRaw) : configRaw || {},
      metadata: typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw || {},
      createdAt: record.get('createdAt'),
    };
  }
}
