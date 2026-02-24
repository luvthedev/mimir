/**
 * @module managers/WorkflowPersistenceService
 * @description Persistence layer for visual workflow editor state
 *
 * Provides CRUD operations for workflows, their nodes, and connections.
 * Uses Neo4j graph labels (Workflow, WorkflowNode, WorkflowConnection)
 * with the existing Neo4j driver from GraphManager.
 *
 * @example
 * ```typescript
 * import { WorkflowPersistenceService } from './managers/WorkflowPersistenceService.js';
 *
 * const service = new WorkflowPersistenceService(graphManager.getDriver());
 *
 * // Create a workflow
 * const workflow = await service.createWorkflow({
 *   userId: 'user-123',
 *   name: 'ETL Pipeline',
 *   description: 'Extract, transform, and load data',
 *   nodes: [
 *     { type: 'upload', position: { x: 0, y: 0 } },
 *     { type: 'transform', position: { x: 200, y: 0 } },
 *     { type: 'output', position: { x: 400, y: 0 } }
 *   ]
 * });
 * ```
 */

import crypto from 'crypto';
import type { Driver } from 'neo4j-driver';
import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  CreateWorkflowInput,
  UpdateWorkflowInput
} from '../types/workflow.js';

/**
 * WorkflowPersistenceService - CRUD operations for visual workflows
 *
 * Stores workflows, nodes, and connections as separate Neo4j graph labels
 * with relationships linking nodes and connections to their parent workflow.
 * Composite indexes ensure fast queries by user and workflow ID.
 */
export class WorkflowPersistenceService {
  private driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  // ============================================================================
  // CREATE
  // ============================================================================

  /**
   * Create a new workflow with optional nodes and connections
   *
   * Creates a Workflow label node and optionally its child WorkflowNode
   * and WorkflowConnection label nodes, all linked by HAS_NODE and
   * HAS_CONNECTION relationships.
   *
   * @param input - Workflow creation input
   * @returns The created workflow with all nodes and connections
   *
   * @example
   * ```typescript
   * const workflow = await service.createWorkflow({
   *   userId: 'user-abc',
   *   name: 'Data Pipeline',
   *   description: 'Process incoming CSV files',
   *   nodes: [
   *     { type: 'upload', position: { x: 0, y: 0 }, config: { accept: '.csv' } },
   *     { type: 'transform', position: { x: 200, y: 0 }, config: { operation: 'filter' } },
   *     { type: 'output', position: { x: 400, y: 0 }, config: { format: 'json' } }
   *   ],
   *   connections: [
   *     { sourceNodeId: '<node-0-id>', targetNodeId: '<node-1-id>', sourcePort: 'out', targetPort: 'in' }
   *   ]
   * });
   * ```
   */
  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      const workflowId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Create workflow node
      await tx.run(
        `CREATE (w:Workflow {
          id: $id,
          userId: $userId,
          name: $name,
          description: $description,
          isActive: true,
          createdAt: $createdAt,
          updatedAt: $updatedAt
        })`,
        {
          id: workflowId,
          userId: input.userId,
          name: input.name,
          description: input.description || '',
          createdAt: now,
          updatedAt: now
        }
      );

      // Create workflow nodes
      const nodes: WorkflowNode[] = [];
      if (input.nodes && input.nodes.length > 0) {
        for (const nodeInput of input.nodes) {
          const nodeId = crypto.randomUUID();
          const node: WorkflowNode = {
            id: nodeId,
            workflowId,
            type: nodeInput.type,
            position: nodeInput.position,
            config: nodeInput.config || {},
            metadata: nodeInput.metadata || {},
            createdAt: now
          };

          await tx.run(
            `CREATE (wn:WorkflowNode {
              id: $id,
              workflowId: $workflowId,
              nodeType: $nodeType,
              position: $position,
              config: $config,
              metadata: $metadata,
              createdAt: $createdAt
            })
            WITH wn
            MATCH (w:Workflow {id: $workflowId})
            CREATE (w)-[:HAS_NODE]->(wn)`,
            {
              id: node.id,
              workflowId: node.workflowId,
              nodeType: node.type,
              position: JSON.stringify(node.position),
              config: JSON.stringify(node.config),
              metadata: JSON.stringify(node.metadata),
              createdAt: node.createdAt
            }
          );

          nodes.push(node);
        }
      }

      // Create workflow connections
      const connections: WorkflowConnection[] = [];
      if (input.connections && input.connections.length > 0) {
        for (const connInput of input.connections) {
          const connId = crypto.randomUUID();
          const connection: WorkflowConnection = {
            id: connId,
            workflowId,
            sourceNodeId: connInput.sourceNodeId,
            targetNodeId: connInput.targetNodeId,
            sourcePort: connInput.sourcePort,
            targetPort: connInput.targetPort,
            createdAt: now
          };

          await tx.run(
            `CREATE (wc:WorkflowConnection {
              id: $id,
              workflowId: $workflowId,
              sourceNodeId: $sourceNodeId,
              targetNodeId: $targetNodeId,
              sourcePort: $sourcePort,
              targetPort: $targetPort,
              createdAt: $createdAt
            })
            WITH wc
            MATCH (w:Workflow {id: $workflowId})
            CREATE (w)-[:HAS_CONNECTION]->(wc)`,
            {
              id: connection.id,
              workflowId: connection.workflowId,
              sourceNodeId: connection.sourceNodeId,
              targetNodeId: connection.targetNodeId,
              sourcePort: connection.sourcePort,
              targetPort: connection.targetPort,
              createdAt: connection.createdAt
            }
          );

          connections.push(connection);
        }
      }

      await tx.commit();

      return {
        id: workflowId,
        userId: input.userId,
        name: input.name,
        description: input.description || '',
        nodes,
        connections,
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
   * Get a workflow by ID with all its nodes and connections
   *
   * Retrieves the workflow and all related WorkflowNode and
   * WorkflowConnection entities in a single query for efficiency.
   *
   * @param workflowId - UUID of the workflow to retrieve
   * @returns The workflow with nodes and connections, or null if not found
   *
   * @example
   * ```typescript
   * const workflow = await service.getWorkflowById('550e8400-...');
   * if (workflow) {
   *   console.log(`Workflow "${workflow.name}" has ${workflow.nodes.length} nodes`);
   * }
   * ```
   */
  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    const session = this.driver.session();
    try {
      // Fetch workflow
      const workflowResult = await session.run(
        `MATCH (w:Workflow {id: $id})
         WHERE w.isActive = true
         RETURN w`,
        { id: workflowId }
      );

      if (workflowResult.records.length === 0) {
        return null;
      }

      const wProps = workflowResult.records[0].get('w').properties;

      // Fetch nodes
      const nodesResult = await session.run(
        `MATCH (w:Workflow {id: $workflowId})-[:HAS_NODE]->(wn:WorkflowNode)
         RETURN wn
         ORDER BY wn.createdAt`,
        { workflowId }
      );

      const nodes: WorkflowNode[] = nodesResult.records.map(record => {
        const props = record.get('wn').properties;
        return this.mapWorkflowNode(props);
      });

      // Fetch connections
      const connectionsResult = await session.run(
        `MATCH (w:Workflow {id: $workflowId})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
         RETURN wc
         ORDER BY wc.createdAt`,
        { workflowId }
      );

      const connections: WorkflowConnection[] = connectionsResult.records.map(record => {
        const props = record.get('wc').properties;
        return this.mapWorkflowConnection(props);
      });

      return {
        id: wProps.id,
        userId: wProps.userId,
        name: wProps.name,
        description: wProps.description || '',
        nodes,
        connections,
        isActive: wProps.isActive,
        createdAt: wProps.createdAt,
        updatedAt: wProps.updatedAt
      };
    } finally {
      await session.close();
    }
  }

  /**
   * List all active workflows for a user
   *
   * Returns workflow metadata (without nodes/connections) for listing views.
   * Use getWorkflowById to fetch the full workflow with nodes and connections.
   *
   * @param userId - UUID of the user
   * @returns Array of workflows (metadata only, no nodes/connections)
   *
   * @example
   * ```typescript
   * const workflows = await service.listWorkflows('user-abc');
   * for (const wf of workflows) {
   *   console.log(`${wf.name} - ${wf.nodes.length} nodes`);
   * }
   * ```
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

      const workflows: Workflow[] = [];

      for (const record of result.records) {
        const wProps = record.get('w').properties;
        const workflowId = wProps.id;

        // Fetch node count and connections for each workflow
        const nodesResult = await session.run(
          `MATCH (w:Workflow {id: $workflowId})-[:HAS_NODE]->(wn:WorkflowNode)
           RETURN wn
           ORDER BY wn.createdAt`,
          { workflowId }
        );

        const nodes: WorkflowNode[] = nodesResult.records.map(r => {
          const props = r.get('wn').properties;
          return this.mapWorkflowNode(props);
        });

        const connectionsResult = await session.run(
          `MATCH (w:Workflow {id: $workflowId})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
           RETURN wc
           ORDER BY wc.createdAt`,
          { workflowId }
        );

        const connections: WorkflowConnection[] = connectionsResult.records.map(r => {
          const props = r.get('wc').properties;
          return this.mapWorkflowConnection(props);
        });

        workflows.push({
          id: wProps.id,
          userId: wProps.userId,
          name: wProps.name,
          description: wProps.description || '',
          nodes,
          connections,
          isActive: wProps.isActive,
          createdAt: wProps.createdAt,
          updatedAt: wProps.updatedAt
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
   * Updates the workflow properties and optionally replaces all nodes
   * and connections. When nodes or connections are provided, the existing
   * ones are deleted and replaced (full replacement strategy).
   *
   * @param workflowId - UUID of the workflow to update
   * @param input - Fields to update
   * @returns The updated workflow, or null if not found
   *
   * @example
   * ```typescript
   * // Update just the name
   * const updated = await service.updateWorkflow('workflow-id', {
   *   name: 'Renamed Pipeline'
   * });
   *
   * // Replace all nodes and connections
   * const updated = await service.updateWorkflow('workflow-id', {
   *   nodes: [
   *     { type: 'upload', position: { x: 0, y: 0 } },
   *     { type: 'output', position: { x: 200, y: 0 } }
   *   ],
   *   connections: [
   *     { sourceNodeId: 'node-0', targetNodeId: 'node-1', sourcePort: 'out', targetPort: 'in' }
   *   ]
   * });
   * ```
   */
  async updateWorkflow(workflowId: string, input: UpdateWorkflowInput): Promise<Workflow | null> {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      const now = new Date().toISOString();

      // Check workflow exists and is active
      const existsResult = await tx.run(
        `MATCH (w:Workflow {id: $id})
         WHERE w.isActive = true
         RETURN w`,
        { id: workflowId }
      );

      if (existsResult.records.length === 0) {
        await tx.rollback();
        return null;
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

      // Replace nodes if provided
      let nodes: WorkflowNode[] = [];
      if (input.nodes !== undefined) {
        // Delete existing nodes and their relationships
        await tx.run(
          `MATCH (w:Workflow {id: $workflowId})-[:HAS_NODE]->(wn:WorkflowNode)
           DETACH DELETE wn`,
          { workflowId }
        );

        // Create new nodes
        for (const nodeInput of input.nodes) {
          const nodeId = crypto.randomUUID();
          const node: WorkflowNode = {
            id: nodeId,
            workflowId,
            type: nodeInput.type,
            position: nodeInput.position,
            config: nodeInput.config || {},
            metadata: nodeInput.metadata || {},
            createdAt: now
          };

          await tx.run(
            `CREATE (wn:WorkflowNode {
              id: $id,
              workflowId: $workflowId,
              nodeType: $nodeType,
              position: $position,
              config: $config,
              metadata: $metadata,
              createdAt: $createdAt
            })
            WITH wn
            MATCH (w:Workflow {id: $workflowId})
            CREATE (w)-[:HAS_NODE]->(wn)`,
            {
              id: node.id,
              workflowId: node.workflowId,
              nodeType: node.type,
              position: JSON.stringify(node.position),
              config: JSON.stringify(node.config),
              metadata: JSON.stringify(node.metadata),
              createdAt: node.createdAt
            }
          );

          nodes.push(node);
        }
      }

      // Replace connections if provided
      let connections: WorkflowConnection[] = [];
      if (input.connections !== undefined) {
        // Delete existing connections and their relationships
        await tx.run(
          `MATCH (w:Workflow {id: $workflowId})-[:HAS_CONNECTION]->(wc:WorkflowConnection)
           DETACH DELETE wc`,
          { workflowId }
        );

        // Create new connections
        for (const connInput of input.connections) {
          const connId = crypto.randomUUID();
          const connection: WorkflowConnection = {
            id: connId,
            workflowId,
            sourceNodeId: connInput.sourceNodeId,
            targetNodeId: connInput.targetNodeId,
            sourcePort: connInput.sourcePort,
            targetPort: connInput.targetPort,
            createdAt: now
          };

          await tx.run(
            `CREATE (wc:WorkflowConnection {
              id: $id,
              workflowId: $workflowId,
              sourceNodeId: $sourceNodeId,
              targetNodeId: $targetNodeId,
              sourcePort: $sourcePort,
              targetPort: $targetPort,
              createdAt: $createdAt
            })
            WITH wc
            MATCH (w:Workflow {id: $workflowId})
            CREATE (w)-[:HAS_CONNECTION]->(wc)`,
            {
              id: connection.id,
              workflowId: connection.workflowId,
              sourceNodeId: connection.sourceNodeId,
              targetNodeId: connection.targetNodeId,
              sourcePort: connection.sourcePort,
              targetPort: connection.targetPort,
              createdAt: connection.createdAt
            }
          );

          connections.push(connection);
        }
      }

      await tx.commit();

      // Return updated workflow - fetch full state if nodes/connections weren't replaced
      if (input.nodes === undefined || input.connections === undefined) {
        return this.getWorkflowById(workflowId);
      }

      const wProps = existsResult.records[0].get('w').properties;
      return {
        id: workflowId,
        userId: wProps.userId,
        name: input.name ?? wProps.name,
        description: input.description ?? wProps.description ?? '',
        nodes,
        connections,
        isActive: input.isActive ?? wProps.isActive,
        createdAt: wProps.createdAt,
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
  // DELETE
  // ============================================================================

  /**
   * Soft-delete a workflow by setting isActive to false
   *
   * Does not remove the data from the database, allowing for recovery.
   * The workflow and its nodes/connections remain in the database but
   * will not appear in list or get operations.
   *
   * @param workflowId - UUID of the workflow to delete
   * @returns true if the workflow was found and deleted, false otherwise
   *
   * @example
   * ```typescript
   * const deleted = await service.deleteWorkflow('workflow-id');
   * if (deleted) {
   *   console.log('Workflow deleted');
   * }
   * ```
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

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Map Neo4j WorkflowNode properties to TypeScript WorkflowNode interface
   */
  private mapWorkflowNode(props: Record<string, any>): WorkflowNode {
    return {
      id: props.id,
      workflowId: props.workflowId,
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
   * Map Neo4j WorkflowConnection properties to TypeScript WorkflowConnection interface
   */
  private mapWorkflowConnection(props: Record<string, any>): WorkflowConnection {
    return {
      id: props.id,
      workflowId: props.workflowId,
      sourceNodeId: props.sourceNodeId,
      targetNodeId: props.targetNodeId,
      sourcePort: props.sourcePort,
      targetPort: props.targetPort,
      createdAt: props.createdAt
    };
  }
}
