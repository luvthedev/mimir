/**
 * @module types/workflow
 * @description Type definitions for the visual workflow editor
 *
 * Defines the data structures for representing visual workflows in the editor,
 * including node definitions, connections between nodes, and workflow metadata.
 * These types enforce type safety for workflow objects throughout the codebase.
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
 *   createdAt: '2026-02-24T00:00:00Z'
 * };
 *
 * const workflow: Workflow = {
 *   id: 'wf-abc123',
 *   name: 'Data Pipeline',
 *   description: 'Extract and transform data',
 *   nodes: [node],
 *   connections: [],
 *   createdAt: '2026-02-24T00:00:00Z',
 *   updatedAt: '2026-02-24T00:00:00Z',
 *   userId: 'user-1'
 * };
 * ```
 */

// ============================================================================
// Workflow Node Types
// ============================================================================

/**
 * Valid node types in a visual workflow
 *
 * - **upload**: Data ingestion / file upload step
 * - **extract**: Data extraction from a source
 * - **transform**: Data transformation / processing step
 * - **output**: Final output / export step
 */
export type WorkflowNodeType = 'upload' | 'extract' | 'transform' | 'output';

/**
 * 2D position of a node on the visual editor canvas
 */
export interface WorkflowNodePosition {
  x: number;
  y: number;
}

/**
 * A node in a visual workflow
 *
 * Represents a single processing step in the workflow graph. Each node
 * has a type, a canvas position, an arbitrary configuration object, and
 * optional metadata for display purposes.
 *
 * @property id - Unique identifier for the node (UUID)
 * @property type - The processing step type (upload, extract, transform, output)
 * @property position - Canvas coordinates for visual placement
 * @property config - Arbitrary configuration specific to the node type
 * @property metadata - Optional display metadata (labels, descriptions, icons, etc.)
 * @property createdAt - ISO 8601 timestamp of creation
 */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string;
}

/**
 * Input for creating a new workflow node (id and createdAt are generated)
 */
export interface WorkflowNodeInput {
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config?: Record<string, any>;
  metadata?: Record<string, any>;
}

// ============================================================================
// Workflow Connection Types
// ============================================================================

/**
 * A directed connection (edge) between two nodes in a workflow
 *
 * Represents data flow from a source node's output port to a target node's
 * input port. Connections define the execution order and data dependencies
 * in the workflow graph.
 *
 * @property id - Unique identifier for the connection (UUID)
 * @property sourceNodeId - ID of the node where the connection originates
 * @property targetNodeId - ID of the node where the connection terminates
 * @property sourcePort - Named output port on the source node
 * @property targetPort - Named input port on the target node
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
 * Input for creating a new workflow connection (id and createdAt are generated)
 */
export interface WorkflowConnectionInput {
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
}

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * A complete visual workflow definition
 *
 * Contains the full graph structure (nodes + connections) along with
 * metadata for identification, ownership, and lifecycle tracking.
 *
 * @property id - Unique identifier (UUID)
 * @property name - Human-readable workflow name
 * @property description - Optional longer description of the workflow's purpose
 * @property nodes - Array of processing nodes in the workflow
 * @property connections - Array of connections defining data flow between nodes
 * @property createdAt - ISO 8601 timestamp of creation
 * @property updatedAt - ISO 8601 timestamp of last modification
 * @property userId - Owner user ID
 * @property isActive - Whether the workflow is active (soft delete support)
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
 * Input for creating a new workflow
 */
export interface WorkflowCreateInput {
  name: string;
  description?: string;
  userId: string;
  nodes?: WorkflowNodeInput[];
  connections?: WorkflowConnectionInput[];
}

/**
 * Input for updating an existing workflow
 *
 * All fields are optional; only provided fields will be updated.
 * To update nodes or connections, provide the full replacement arrays.
 */
export interface WorkflowUpdateInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNodeInput[];
  connections?: WorkflowConnectionInput[];
  isActive?: boolean;
}
