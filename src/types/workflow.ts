/**
 * @module types/workflow
 * @description Type definitions for the visual workflow editor
 *
 * Defines the core data structures for representing visual workflows,
 * including node definitions, connections, and metadata. These types
 * enforce type safety for workflow objects throughout the codebase.
 *
 * @example
 * ```typescript
 * import type { Workflow, WorkflowNode, WorkflowConnection } from './types/workflow.js';
 *
 * const node: WorkflowNode = {
 *   id: 'node-1',
 *   type: 'extract',
 *   position: { x: 100, y: 200 },
 *   config: { format: 'json' },
 *   metadata: { label: 'Extract Data' },
 *   createdAt: '2024-01-01T00:00:00Z',
 * };
 *
 * const workflow: Workflow = {
 *   id: 'wf-1',
 *   name: 'My Pipeline',
 *   description: 'Data extraction pipeline',
 *   nodes: [node],
 *   connections: [],
 *   createdAt: '2024-01-01T00:00:00Z',
 *   updatedAt: '2024-01-01T00:00:00Z',
 *   userId: 'user-123',
 * };
 * ```
 */

/**
 * Valid node types in a visual workflow
 *
 * - **upload**: Data ingestion / file upload step
 * - **extract**: Data extraction / parsing step
 * - **transform**: Data transformation / processing step
 * - **output**: Final output / export step
 */
export type WorkflowNodeType = 'upload' | 'extract' | 'transform' | 'output';

/**
 * 2D position of a node on the visual editor canvas
 */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * A single node in a visual workflow
 *
 * @property id - Unique identifier for this node
 * @property type - The processing step type (upload, extract, transform, output)
 * @property position - Canvas coordinates for visual placement
 * @property config - Type-specific configuration (e.g., format, filters, mappings)
 * @property metadata - Additional display metadata (e.g., label, description, icon)
 * @property createdAt - ISO 8601 timestamp of creation
 */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: NodePosition;
  config: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string;
}

/**
 * A directed connection (edge) between two workflow nodes
 *
 * Represents data flow from one node's output port to another node's input port.
 * Used for edge validation and execution ordering.
 *
 * @property id - Unique identifier for this connection
 * @property sourceNodeId - ID of the node where data originates
 * @property targetNodeId - ID of the node receiving data
 * @property sourcePort - Output port name on the source node (e.g., 'output', 'error')
 * @property targetPort - Input port name on the target node (e.g., 'input', 'data')
 * @property createdAt - ISO 8601 timestamp of creation
 */
export interface WorkflowConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
  createdAt: string;
}

/**
 * Complete workflow definition with nodes, connections, and metadata
 *
 * @property id - Unique workflow identifier (UUID)
 * @property name - Human-readable workflow name
 * @property description - Optional description of the workflow's purpose
 * @property nodes - Ordered array of processing nodes
 * @property connections - Array of directed connections between nodes
 * @property createdAt - ISO 8601 timestamp of creation
 * @property updatedAt - ISO 8601 timestamp of last modification
 * @property userId - Owner user identifier (UUID)
 * @property isActive - Whether the workflow is active (not soft-deleted)
 */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  createdAt: string;
  updatedAt: string;
  userId: string;
  isActive: boolean;
}

/**
 * Input for creating a new workflow (server assigns id, timestamps, isActive)
 */
export interface CreateWorkflowInput {
  name: string;
  description?: string;
  userId: string;
  nodes?: Omit<WorkflowNode, 'createdAt'>[];
  connections?: Omit<WorkflowConnection, 'id' | 'createdAt'>[];
}

/**
 * Input for updating an existing workflow
 */
export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: Omit<WorkflowNode, 'createdAt'>[];
  connections?: Omit<WorkflowConnection, 'id' | 'createdAt'>[];
  isActive?: boolean;
}
