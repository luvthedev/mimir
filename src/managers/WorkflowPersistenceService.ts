/**
 * @module managers/WorkflowPersistenceService
 * @description Persistence layer for visual workflow editor state
 *
 * Provides async CRUD operations for workflows, including their nodes and
 * connections. Uses Neo4j graph database with separate node labels (Workflow,
 * WorkflowNode, WorkflowConnection) and relationships for efficient queries.
 *
 * Follows the same service pattern as TodoManager - accepts an IGraphManager
 * and uses its Neo4j driver for direct Cypher queries.
 *
 * @example
 * ```typescript
 * import { WorkflowPersistenceService } from './managers/WorkflowPersistenceService.js';
 *
 * const service = new WorkflowPersistenceService(graphManager);
 *
 * // Create a workflow
 * const workflow = await service.createWorkflow({
 *   name: 'My Pipeline',
 *   description: 'Process documents',
 *   userId: 'user-1',
 *   nodes: [
 *     { type: 'upload', position: { x: 0, y: 0 } },
 *     { type: 'extract', position: { x: 200, y: 0 } }
 *   ],
 *   connections: [
 *     { sourceNodeId: '<node-id>', targetNodeId: '<node-id>', sourcePort: 'output', targetPort: 'input' }
 *   ]
 * });
 * ```
 */

import { randomUUID } from 'node:crypto';
import type { Record as Neo4jRecord } from 'neo4j-driver';
import type { IGraphManager } from '../types/IGraphManager.js';
import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  CreateWorkflowInput,
  UpdateWorkflowInput
} from '../types/workflow.js';

/**
 * WorkflowPersistenceService - Handles workflow CRUD operations
 *
 * Delegates to the Neo4j driver (via IGraphManager.getDriver()) for
 * direct Cypher queries against Workflow, WorkflowNode, and
 * WorkflowConnection node labels.
 */
export class WorkflowPersistenceService {
  constructor(private graphManager: IGraphManager) {}

  // ============================================================================
  // CREATE
  // ============================================================================

  /**
   * Create a new workflow with optional nodes and connections.
   *
   * Creates the workflow record, then batch-creates any provided nodes
   * and connections within a single transaction for atomicity.
   *
   * @param input - Workflow creation input
   * @returns The fully populated Workflow object
   *
   * @example
   * ```typescript
   * const workflow = await service.createWorkflow({
   *   name: 'Document Pipeline',
   *   userId: 'user-abc',
   *   nodes: [
   *     { type: 'upload', position: { x: 0, y: 0 } }
   *   ]
   * });
   * ```
   */
  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();
    const tx = session.beginTransaction();

    try {
      const workflowId = randomUUID();
      const now = new Date().toISOString();

      // Create the workflow node
      await tx.run(
        `CREATE (w:Workflow {
          id: $id,
          userId: $userId,
          name: $name,
          description: $description,
          isActive: $isActive,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })`,
        {
          id: workflowId,
          userId: input.userId,
          name: input.name,
          description: input.description || '',
          isActive: true,
          createdAt: now,
          updatedAt: now
        }
      );

      // Create nodes if provided
      const createdNodes: WorkflowNode[] = [];
      if (input.nodes && input.nodes.length > 0) {
        const nodeRecords = input.nodes.map((n) => ({
          id: randomUUID(),
          workflowId,
          nodeType: n.type,
          position: JSON.stringify(n.position),
          config: JSON.stringify(n.config || {}),
          metadata: JSON.stringify(n.metadata || {}),
          createdAt: now
        }));

        await tx.run(
          `UNWIND $nodes AS node
           CREATE (wn:WorkflowNode {
             id: node.id,
             workflowId: node.workflowId,
             nodeType: node.nodeType,
             position: node.position,
             config: node.config,
             metadata: node.metadata,
             createdAt: node.createdAt
           })
           WITH wn, node
           MATCH (w:Workflow {id: node.workflowId})
           CREATE (w)-[:HAS_NODE]->(wn)`,
          { nodes: nodeRecords }
        );

        for (const nr of nodeRecords) {
          createdNodes.push({
            id: nr.id,
            type: input.nodes[nodeRecords.indexOf(nr)].type,
            position: input.nodes[nodeRecords.indexOf(nr)].position,
            config: input.nodes[nodeRecords.indexOf(nr)].config || {},
            metadata: input.nodes[nodeRecords.indexOf(nr)].metadata || {},
            createdAt: nr.createdAt
          });
        }
      }

      // Create connections if provided
      const createdConnections: WorkflowConnection[] = [];
      if (input.connections && input.connections.length > 0) {
        const connRecords = input.connections.map((c) => ({
          id: randomUUID(),
          workflowId,
          sourceNodeId: c.sourceNodeId,
          targetNodeId: c.targetNodeId,
          sourcePort: c.sourcePort,
          targetPort: c.targetPort,
          createdAt: now
        }));

        await tx.run(
          `UNWIND $connections AS conn
           CREATE (wc:WorkflowConnection {
             id: conn.id,
             workflowId: conn.workflowId,
             sourceNodeId: conn.sourceNodeId,
             targetNodeId: conn.targetNodeId,
             sourcePort: conn.sourcePort,
             targetPort: conn.targetPort,
             createdAt: conn.createdAt
           })
           WITH wc, conn
           MATCH (w:Workflow {id: conn.workflowId})
           CREATE (w)-[:HAS_CONNECTION]->(wc)`,
          { connections: connRecords }
        );

        for (const cr of connRecords) {
          const inputConn = input.connections[connRecords.indexOf(cr)];
          createdConnections.push({
            id: cr.id,
            sourceNodeId: inputConn.sourceNodeId,
            targetNodeId: inputConn.targetNodeId,
            sourcePort: inputConn.sourcePort,
            targetPort: inputConn.targetPort,
            createdAt: cr.createdAt
          });
        }
      }

      await tx.commit();

      return {
        id: workflowId,
        name: input.name,
        description: input.description || '',
        nodes: createdNodes,
        connections: createdConnections,
        userId: input.userId,
        isActive: true,
        createdAt: now,
        updatedAt: now
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
   * Get a workflow by ID, including all nodes and connections.
   *
   * Retrieves the workflow record and eagerly loads all associated nodes
   * and connections in a single query for performance.
   *
   * @param workflowId - The UUID of the workflow
   * @returns The full Workflow object, or null if not found
   *
   * @example
   * ```typescript
   * const workflow = await service.getWorkflowById('wf-abc123');
   * if (workflow) {
   *   console.log(`${workflow.name}: ${workflow.nodes.length} nodes`);
   * }
   * ```
   */
  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      // Get workflow
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

      // Get nodes
      const nodesResult = await session.run(
        `MATCH (w:Workflow {id: $workflowId})-[:HAS_NODE]->(wn:WorkflowNode)
         RETURN wn
         ORDER BY wn.createdAt`,
        { workflowId }
      );

      const nodes: WorkflowNode[] = nodesResult.records.map((r: Neo4jRecord) => {
        const props = r.get('wn').properties;
        return this.mapWorkflowNode(props);
      });

      // Get connections
      const connsResult = await session.run(
        `MATCH (w:Workflow {id: $workflowId})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
         RETURN wc
         ORDER BY wc.createdAt`,
        { workflowId }
      );

      const connections: WorkflowConnection[] = connsResult.records.map((r: Neo4jRecord) => {
        const props = r.get('wc').properties;
        return this.mapWorkflowConnection(props);
      });

      return {
        id: wfProps.id,
        name: wfProps.name,
        description: wfProps.description || '',
        nodes,
        connections,
        userId: wfProps.userId,
        isActive: wfProps.isActive,
        createdAt: wfProps.createdAt,
        updatedAt: wfProps.updatedAt
      };
    } finally {
      await session.close();
    }
  }

  /**
   * List all active workflows for a given user.
   *
   * Returns workflow metadata without eagerly loading nodes and connections
   * for performance. Use getWorkflowById to load the full workflow.
   *
   * @param userId - The user's ID
   * @returns Array of Workflow objects (with empty nodes/connections arrays)
   *
   * @example
   * ```typescript
   * const workflows = await service.listWorkflows('user-abc');
   * for (const wf of workflows) {
   *   console.log(`${wf.name} - created ${wf.createdAt}`);
   * }
   * ```
   */
  async listWorkflows(userId: string): Promise<Workflow[]> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      const result = await session.run(
        `MATCH (w:Workflow {userId: $userId})
         WHERE w.isActive = true
         RETURN w
         ORDER BY w.updatedAt DESC`,
        { userId }
      );

      return result.records.map((r: Neo4jRecord) => {
        const props = r.get('w').properties;
        return {
          id: props.id,
          name: props.name,
          description: props.description || '',
          nodes: [] as WorkflowNode[],
          connections: [] as WorkflowConnection[],
          userId: props.userId,
          isActive: props.isActive,
          createdAt: props.createdAt,
          updatedAt: props.updatedAt
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
   * Update an existing workflow.
   *
   * Updates workflow metadata and optionally replaces all nodes and connections.
   * When nodes or connections are provided, existing ones are deleted and replaced
   * (full replacement strategy) within a transaction.
   *
   * @param workflowId - The UUID of the workflow to update
   * @param input - Fields to update
   * @returns The updated Workflow object
   * @throws {Error} If workflow not found
   *
   * @example
   * ```typescript
   * const updated = await service.updateWorkflow('wf-abc123', {
   *   name: 'Renamed Pipeline',
   *   nodes: [
   *     { type: 'upload', position: { x: 0, y: 0 } },
   *     { type: 'output', position: { x: 400, y: 0 } }
   *   ]
   * });
   * ```
   */
  async updateWorkflow(workflowId: string, input: UpdateWorkflowInput): Promise<Workflow> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();
    const tx = session.beginTransaction();

    try {
      const now = new Date().toISOString();

      // Check workflow exists
      const existsResult = await tx.run(
        `MATCH (w:Workflow {id: $id})
         WHERE w.isActive = true
         RETURN w`,
        { id: workflowId }
      );

      if (existsResult.records.length === 0) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Update workflow metadata
      const setClauses: string[] = ['w.updatedAt = $updatedAt'];
      const params: Record<string, any> = { id: workflowId, updatedAt: now };

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
        `MATCH (w:Workflow {id: $id})
         SET ${setClauses.join(', ')}`,
        params
      );

      // Replace nodes if provided (delete existing, create new)
      if (input.nodes !== undefined) {
        // Delete existing nodes
        await tx.run(
          `MATCH (w:Workflow {id: $workflowId})-[:HAS_NODE]->(wn:WorkflowNode)
           DETACH DELETE wn`,
          { workflowId }
        );

        // Create new nodes
        if (input.nodes.length > 0) {
          const nodeRecords = input.nodes.map((n) => ({
            id: n.id || randomUUID(),
            workflowId,
            nodeType: n.type,
            position: JSON.stringify(n.position),
            config: JSON.stringify(n.config || {}),
            metadata: JSON.stringify(n.metadata || {}),
            createdAt: now
          }));

          await tx.run(
            `UNWIND $nodes AS node
             CREATE (wn:WorkflowNode {
               id: node.id,
               workflowId: node.workflowId,
               nodeType: node.nodeType,
               position: node.position,
               config: node.config,
               metadata: node.metadata,
               createdAt: node.createdAt
             })
             WITH wn, node
             MATCH (w:Workflow {id: node.workflowId})
             CREATE (w)-[:HAS_NODE]->(wn)`,
            { nodes: nodeRecords }
          );
        }
      }

      // Replace connections if provided (delete existing, create new)
      if (input.connections !== undefined) {
        // Delete existing connections
        await tx.run(
          `MATCH (w:Workflow {id: $workflowId})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
           DETACH DELETE wc`,
          { workflowId }
        );

        // Create new connections
        if (input.connections.length > 0) {
          const connRecords = input.connections.map((c) => ({
            id: c.id || randomUUID(),
            workflowId,
            sourceNodeId: c.sourceNodeId,
            targetNodeId: c.targetNodeId,
            sourcePort: c.sourcePort,
            targetPort: c.targetPort,
            createdAt: now
          }));

          await tx.run(
            `UNWIND $connections AS conn
             CREATE (wc:WorkflowConnection {
               id: conn.id,
               workflowId: conn.workflowId,
               sourceNodeId: conn.sourceNodeId,
               targetNodeId: conn.targetNodeId,
               sourcePort: conn.sourcePort,
               targetPort: conn.targetPort,
               createdAt: conn.createdAt
             })
             WITH wc, conn
             MATCH (w:Workflow {id: conn.workflowId})
             CREATE (w)-[:HAS_CONNECTION]->(wc)`,
            { connections: connRecords }
          );
        }
      }

      await tx.commit();

      // Return the full updated workflow
      const updated = await this.getWorkflowById(workflowId);
      if (!updated) {
        throw new Error(`Failed to retrieve updated workflow: ${workflowId}`);
      }
      return updated;
    } catch (error) {
      // Only rollback if we haven't committed yet
      try {
        await tx.rollback();
      } catch {
        // Transaction may already be committed or rolled back
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
   * Soft-delete a workflow by setting isActive to false.
   *
   * The workflow and its associated nodes and connections remain in the
   * database but are excluded from queries. This allows for recovery
   * if needed.
   *
   * @param workflowId - The UUID of the workflow to delete
   * @returns true if the workflow was found and deactivated, false if not found
   *
   * @example
   * ```typescript
   * const deleted = await service.deleteWorkflow('wf-abc123');
   * if (deleted) {
   *   console.log('Workflow deactivated');
   * }
   * ```
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    const driver = this.graphManager.getDriver();
    const session = driver.session();

    try {
      const now = new Date().toISOString();
      const result = await session.run(
        `MATCH (w:Workflow {id: $id})
         WHERE w.isActive = true
         SET w.isActive = false, w.updatedAt = $updatedAt
         RETURN w`,
        { id: workflowId, updatedAt: now }
      );

      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Map raw Neo4j WorkflowNode properties to a typed WorkflowNode object.
   */
  private mapWorkflowNode(props: Record<string, any>): WorkflowNode {
    return {
      id: props.id,
      type: props.nodeType,
      position: typeof props.position === 'string'
        ? JSON.parse(props.position)
        : props.position,
      config: typeof props.config === 'string'
        ? JSON.parse(props.config)
        : (props.config || {}),
      metadata: typeof props.metadata === 'string'
        ? JSON.parse(props.metadata)
        : (props.metadata || {}),
      createdAt: props.createdAt
    };
  }

  /**
   * Map raw Neo4j WorkflowConnection properties to a typed WorkflowConnection object.
   */
  private mapWorkflowConnection(props: Record<string, any>): WorkflowConnection {
    return {
      id: props.id,
      sourceNodeId: props.sourceNodeId,
      targetNodeId: props.targetNodeId,
      sourcePort: props.sourcePort,
      targetPort: props.targetPort,
      createdAt: props.createdAt
    };
  }
}
