/**
 * @module managers/WorkflowPersistenceService
 * @description Persistence layer for visual workflow editor state
 *
 * Manages CRUD operations for workflows, their nodes, and connections
 * in Neo4j. Uses separate node labels (Workflow, WorkflowNode,
 * WorkflowConnection) with relationships to maintain the visual editor
 * graph structure.
 *
 * Neo4j Schema:
 * - (:Workflow)-[:HAS_NODE]->(:WorkflowNode)
 * - (:Workflow)-[:HAS_CONNECTION]->(:WorkflowConnection)
 * - (:WorkflowNode)-[:CONNECTS_TO]->(:WorkflowNode)  (via WorkflowConnection)
 *
 * @example
 * ```typescript
 * import { WorkflowPersistenceService } from './managers/WorkflowPersistenceService.js';
 *
 * const service = new WorkflowPersistenceService(graphManager);
 * await service.initialize();
 *
 * const workflow = await service.createWorkflow({
 *   name: 'My Pipeline',
 *   userId: 'user-123',
 *   nodes: [
 *     { type: 'upload', position: { x: 0, y: 0 } },
 *     { type: 'extract', position: { x: 200, y: 0 } }
 *   ],
 *   connections: [
 *     { sourceNodeId: '<node-0-id>', targetNodeId: '<node-1-id>', sourcePort: 'out', targetPort: 'in' }
 *   ]
 * });
 * ```
 */

import type { Driver } from 'neo4j-driver';
import type { IGraphManager } from '../types/IGraphManager.js';
import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  WorkflowCreateInput,
  WorkflowUpdateInput,
  WorkflowNodeInput,
  WorkflowConnectionInput,
} from '../types/workflow.js';

// ============================================================================
// Helper: generate a UUID (Node >= 19 has crypto.randomUUID)
// ============================================================================

function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// WorkflowPersistenceService
// ============================================================================

/**
 * Persistence service for visual workflow editor state.
 *
 * Follows the existing Mimir pattern of accepting an IGraphManager and
 * using its driver for direct Cypher queries. Schema initialization is
 * idempotent (safe to call on every startup).
 */
export class WorkflowPersistenceService {
  private driver: Driver;

  constructor(private graphManager: IGraphManager) {
    this.driver = graphManager.getDriver();
  }

  // ==========================================================================
  // Schema Initialization
  // ==========================================================================

  /**
   * Create constraints and indexes for the workflow schema.
   * Safe to call multiple times (all statements use IF NOT EXISTS).
   */
  async initialize(): Promise<void> {
    const session = this.driver.session();
    try {
      // ── Unique constraints ───────────────────────────────────────────
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

      // ── Indexes for query performance ────────────────────────────────

      // Fast lookup of workflows by userId
      await session.run(`
        CREATE INDEX workflow_userId IF NOT EXISTS
        FOR (w:Workflow) ON (w.userId)
      `);

      // Composite index: (workflowId, nodeType) on WorkflowNode
      await session.run(`
        CREATE INDEX workflow_node_composite IF NOT EXISTS
        FOR (wn:WorkflowNode) ON (wn.workflowId, wn.nodeType)
      `);

      // Composite index: (workflowId, sourceNodeId, targetNodeId) on WorkflowConnection
      await session.run(`
        CREATE INDEX workflow_connection_composite IF NOT EXISTS
        FOR (wc:WorkflowConnection) ON (wc.workflowId, wc.sourceNodeId, wc.targetNodeId)
      `);

      console.log('Workflow schema initialized');
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // CREATE
  // ==========================================================================

  /**
   * Create a new workflow with optional initial nodes and connections.
   *
   * All nodes and connections are created inside a single transaction so the
   * operation is atomic (all-or-nothing).
   *
   * @param input - Workflow creation input
   * @returns The fully-populated Workflow object
   */
  async createWorkflow(input: WorkflowCreateInput): Promise<Workflow> {
    const session = this.driver.session();
    const tx = session.beginTransaction();
    try {
      const now = new Date().toISOString();
      const workflowId = generateId();

      // Create the Workflow node
      await tx.run(
        `CREATE (w:Workflow {
          id: $id,
          name: $name,
          description: $description,
          userId: $userId,
          isActive: $isActive,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })`,
        {
          id: workflowId,
          name: input.name,
          description: input.description ?? '',
          userId: input.userId,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        }
      );

      // Create WorkflowNode entries
      const nodes: WorkflowNode[] = [];
      if (input.nodes && input.nodes.length > 0) {
        for (const nodeInput of input.nodes) {
          const node = await this.createNodeInTx(tx, workflowId, nodeInput, now);
          nodes.push(node);
        }
      }

      // Create WorkflowConnection entries
      const connections: WorkflowConnection[] = [];
      if (input.connections && input.connections.length > 0) {
        for (const connInput of input.connections) {
          const conn = await this.createConnectionInTx(tx, workflowId, connInput, now);
          connections.push(conn);
        }
      }

      await tx.commit();

      return {
        id: workflowId,
        name: input.name,
        description: input.description ?? '',
        userId: input.userId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        nodes,
        connections,
      };
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // READ
  // ==========================================================================

  /**
   * Retrieve a single workflow by ID, including all its nodes and connections.
   *
   * @param workflowId - UUID of the workflow
   * @returns The Workflow or null if not found / soft-deleted
   */
  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    const session = this.driver.session();
    try {
      // Fetch workflow metadata
      const wfResult = await session.run(
        `MATCH (w:Workflow {id: $id})
         WHERE w.isActive = true
         RETURN w`,
        { id: workflowId }
      );

      if (wfResult.records.length === 0) {
        return null;
      }

      const wfProps = wfResult.records[0].get('w').properties;

      // Fetch nodes
      const nodesResult = await session.run(
        `MATCH (wn:WorkflowNode {workflowId: $workflowId})
         RETURN wn
         ORDER BY wn.createdAt`,
        { workflowId }
      );

      const nodes: WorkflowNode[] = nodesResult.records.map((r) =>
        this.recordToWorkflowNode(r.get('wn').properties)
      );

      // Fetch connections
      const connsResult = await session.run(
        `MATCH (wc:WorkflowConnection {workflowId: $workflowId})
         RETURN wc
         ORDER BY wc.createdAt`,
        { workflowId }
      );

      const connections: WorkflowConnection[] = connsResult.records.map((r) =>
        this.recordToWorkflowConnection(r.get('wc').properties)
      );

      return {
        id: wfProps.id,
        name: wfProps.name,
        description: wfProps.description,
        userId: wfProps.userId,
        isActive: wfProps.isActive,
        createdAt: wfProps.createdAt,
        updatedAt: wfProps.updatedAt,
        nodes,
        connections,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * List workflows owned by a specific user.
   *
   * Returns workflow metadata only (without nodes/connections) for
   * performance. Use {@link getWorkflowById} to fetch the full graph.
   *
   * @param userId - UUID of the user
   * @returns Array of workflow metadata (nodes/connections arrays are empty)
   */
  async listWorkflows(userId: string): Promise<Workflow[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (w:Workflow {userId: $userId})
         WHERE w.isActive = true
         RETURN w
         ORDER BY w.updatedAt DESC`,
        { userId }
      );

      return result.records.map((r) => {
        const props = r.get('w').properties;
        return {
          id: props.id,
          name: props.name,
          description: props.description,
          userId: props.userId,
          isActive: props.isActive,
          createdAt: props.createdAt,
          updatedAt: props.updatedAt,
          nodes: [],
          connections: [],
        };
      });
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  /**
   * Update an existing workflow's metadata, nodes, and/or connections.
   *
   * When nodes or connections arrays are provided they **replace** the
   * existing set (delete-then-recreate inside a transaction). This matches
   * the visual editor pattern where the client sends the full canvas state
   * on save.
   *
   * @param workflowId - UUID of the workflow to update
   * @param input - Fields to update
   * @returns The updated Workflow
   * @throws Error if the workflow does not exist or is soft-deleted
   */
  async updateWorkflow(
    workflowId: string,
    input: WorkflowUpdateInput
  ): Promise<Workflow> {
    const session = this.driver.session();
    const tx = session.beginTransaction();
    try {
      const now = new Date().toISOString();

      // Verify the workflow exists and is active
      const existCheck = await tx.run(
        `MATCH (w:Workflow {id: $id})
         WHERE w.isActive = true
         RETURN w`,
        { id: workflowId }
      );

      if (existCheck.records.length === 0) {
        throw new Error(`Workflow ${workflowId} not found or is inactive`);
      }

      // Build dynamic SET clause for metadata fields
      const sets: string[] = ['w.updatedAt = $updatedAt'];
      const params: Record<string, any> = { id: workflowId, updatedAt: now };

      if (input.name !== undefined) {
        sets.push('w.name = $name');
        params.name = input.name;
      }
      if (input.description !== undefined) {
        sets.push('w.description = $description');
        params.description = input.description;
      }
      if (input.isActive !== undefined) {
        sets.push('w.isActive = $isActive');
        params.isActive = input.isActive;
      }

      await tx.run(
        `MATCH (w:Workflow {id: $id})
         SET ${sets.join(', ')}`,
        params
      );

      // Replace nodes if provided
      let nodes: WorkflowNode[] | undefined;
      if (input.nodes !== undefined) {
        // Delete existing nodes
        await tx.run(
          `MATCH (wn:WorkflowNode {workflowId: $workflowId})
           DETACH DELETE wn`,
          { workflowId }
        );
        nodes = [];
        for (const nodeInput of input.nodes) {
          const node = await this.createNodeInTx(tx, workflowId, nodeInput, now);
          nodes.push(node);
        }
      }

      // Replace connections if provided
      let connections: WorkflowConnection[] | undefined;
      if (input.connections !== undefined) {
        // Delete existing connections
        await tx.run(
          `MATCH (wc:WorkflowConnection {workflowId: $workflowId})
           DETACH DELETE wc`,
          { workflowId }
        );
        connections = [];
        for (const connInput of input.connections) {
          const conn = await this.createConnectionInTx(tx, workflowId, connInput, now);
          connections.push(conn);
        }
      }

      await tx.commit();

      // Return the updated workflow (re-fetch for consistency)
      const updated = await this.getWorkflowById(workflowId);
      if (!updated) {
        throw new Error(`Failed to retrieve updated workflow ${workflowId}`);
      }
      return updated;
    } catch (error) {
      // Only rollback if the transaction hasn't been committed yet
      try {
        await tx.rollback();
      } catch {
        // Transaction already committed or closed
      }
      throw error;
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // DELETE (soft-delete)
  // ==========================================================================

  /**
   * Soft-delete a workflow by setting isActive = false.
   *
   * Nodes and connections are retained for potential recovery. To
   * permanently remove a workflow, use {@link hardDeleteWorkflow}.
   *
   * @param workflowId - UUID of the workflow to delete
   * @returns true if the workflow was soft-deleted, false if not found
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (w:Workflow {id: $id})
         WHERE w.isActive = true
         SET w.isActive = false, w.updatedAt = $updatedAt
         RETURN w`,
        { id: workflowId, updatedAt: new Date().toISOString() }
      );

      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Permanently remove a workflow and all its nodes and connections.
   *
   * @param workflowId - UUID of the workflow to remove
   * @returns true if the workflow was removed, false if not found
   */
  async hardDeleteWorkflow(workflowId: string): Promise<boolean> {
    const session = this.driver.session();
    const tx = session.beginTransaction();
    try {
      // Delete connections
      await tx.run(
        `MATCH (wc:WorkflowConnection {workflowId: $workflowId})
         DETACH DELETE wc`,
        { workflowId }
      );

      // Delete nodes
      await tx.run(
        `MATCH (wn:WorkflowNode {workflowId: $workflowId})
         DETACH DELETE wn`,
        { workflowId }
      );

      // Delete workflow
      const result = await tx.run(
        `MATCH (w:Workflow {id: $id})
         DELETE w
         RETURN count(w) AS deleted`,
        { id: workflowId }
      );

      await tx.commit();

      const deletedCount = result.records[0]?.get('deleted')?.toNumber?.() ??
                           result.records[0]?.get('deleted') ?? 0;
      return deletedCount > 0;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Create a WorkflowNode inside an existing transaction.
   */
  private async createNodeInTx(
    tx: any,
    workflowId: string,
    input: WorkflowNodeInput,
    createdAt: string
  ): Promise<WorkflowNode> {
    const nodeId = generateId();
    const positionJson = JSON.stringify(input.position);
    const configJson = JSON.stringify(input.config ?? {});
    const metadataJson = JSON.stringify(input.metadata ?? {});

    await tx.run(
      `CREATE (wn:WorkflowNode {
        id: $id,
        workflowId: $workflowId,
        nodeType: $nodeType,
        position: $position,
        config: $config,
        metadata: $metadata,
        createdAt: $createdAt
      })`,
      {
        id: nodeId,
        workflowId,
        nodeType: input.type,
        position: positionJson,
        config: configJson,
        metadata: metadataJson,
        createdAt,
      }
    );

    return {
      id: nodeId,
      workflowId,
      type: input.type,
      position: input.position,
      config: input.config ?? {},
      metadata: input.metadata ?? {},
      createdAt,
    };
  }

  /**
   * Create a WorkflowConnection inside an existing transaction.
   */
  private async createConnectionInTx(
    tx: any,
    workflowId: string,
    input: WorkflowConnectionInput,
    createdAt: string
  ): Promise<WorkflowConnection> {
    const connId = generateId();

    await tx.run(
      `CREATE (wc:WorkflowConnection {
        id: $id,
        workflowId: $workflowId,
        sourceNodeId: $sourceNodeId,
        targetNodeId: $targetNodeId,
        sourcePort: $sourcePort,
        targetPort: $targetPort,
        createdAt: $createdAt
      })`,
      {
        id: connId,
        workflowId,
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        sourcePort: input.sourcePort,
        targetPort: input.targetPort,
        createdAt,
      }
    );

    return {
      id: connId,
      workflowId,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      sourcePort: input.sourcePort,
      targetPort: input.targetPort,
      createdAt,
    };
  }

  /**
   * Convert Neo4j record properties to a WorkflowNode object.
   */
  private recordToWorkflowNode(props: Record<string, any>): WorkflowNode {
    return {
      id: props.id,
      workflowId: props.workflowId,
      type: props.nodeType,
      position: typeof props.position === 'string'
        ? JSON.parse(props.position)
        : props.position,
      config: typeof props.config === 'string'
        ? JSON.parse(props.config)
        : (props.config ?? {}),
      metadata: typeof props.metadata === 'string'
        ? JSON.parse(props.metadata)
        : (props.metadata ?? {}),
      createdAt: props.createdAt,
    };
  }

  /**
   * Convert Neo4j record properties to a WorkflowConnection object.
   */
  private recordToWorkflowConnection(
    props: Record<string, any>
  ): WorkflowConnection {
    return {
      id: props.id,
      workflowId: props.workflowId,
      sourceNodeId: props.sourceNodeId,
      targetNodeId: props.targetNodeId,
      sourcePort: props.sourcePort,
      targetPort: props.targetPort,
      createdAt: props.createdAt,
    };
  }
}
