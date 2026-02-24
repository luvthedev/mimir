/**
 * @module types/workflow
 * @description Type definitions for the visual workflow editor state
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
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   workflowId: '660e8400-e29b-41d4-a716-446655440000',
 *   type: 'extract',
 *   position: { x: 200, y: 100 },
 *   config: { format: 'csv', delimiter: ',' },
 *   metadata: { label: 'Extract CSV' },
 *   createdAt: '2024-01-01T00:00:00Z'
 * };
 * ```
 */

// ============================================================================
// Workflow Node Types
// ============================================================================

/**
 * Node types available in the visual workflow editor
 *
 * - **upload**: Data ingestion / file upload step
 * - **extract**: Data extraction and parsing step
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
 * A single node in a visual workflow
 *
 * Represents a processing step with its position on the canvas,
 * type-specific configuration, and optional metadata.
 *
 * @property id - Unique identifier (UUID)
 * @property workflowId - ID of the parent workflow (UUID)
 * @property type - Processing step type (upload, extract, transform, output)
 * @property position - Canvas coordinates for visual placement
 * @property config - Type-specific configuration object
 * @property metadata - Optional metadata (labels, descriptions, styling, etc.)
 * @property createdAt - ISO 8601 timestamp of creation
 */
export interface WorkflowNode {
  id: string;
  workflowId: string;
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string;
}

// ============================================================================
// Workflow Connections
// ============================================================================

/**
 * A directed connection (edge) between two workflow nodes
 *
 * Represents a data flow path from a source node's output port
 * to a target node's input port. Used for edge validation and
 * execution ordering.
 *
 * @property id - Unique identifier (UUID)
 * @property workflowId - ID of the parent workflow (UUID)
 * @property sourceNodeId - ID of the source workflow node (UUID)
 * @property targetNodeId - ID of the target workflow node (UUID)
 * @property sourcePort - Name of the output port on the source node
 * @property targetPort - Name of the input port on the target node
 * @property createdAt - ISO 8601 timestamp of creation
 */
export interface WorkflowConnection {
  id: string;
  workflowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
  createdAt: string;
}

// ============================================================================
// Workflow
// ============================================================================

/**
 * A complete workflow definition with nodes and connections
 *
 * Represents the full state of a visual workflow editor canvas,
 * including all processing nodes and the connections between them.
 *
 * @property id - Unique identifier (UUID)
 * @property userId - Owner user ID (UUID)
 * @property name - Human-readable workflow name
 * @property description - Optional description of the workflow's purpose
 * @property nodes - Array of workflow nodes (processing steps)
 * @property connections - Array of connections (data flow edges)
 * @property isActive - Whether the workflow is active (soft-delete support)
 * @property createdAt - ISO 8601 timestamp of creation
 * @property updatedAt - ISO 8601 timestamp of last update
 */
export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Input Types (for create/update operations)
// ============================================================================

/**
 * Input for creating a new workflow
 */
export interface CreateWorkflowInput {
  userId: string;
  name: string;
  description?: string;
  nodes?: CreateWorkflowNodeInput[];
  connections?: CreateWorkflowConnectionInput[];
}

/**
 * Input for updating an existing workflow
 */
export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: CreateWorkflowNodeInput[];
  connections?: CreateWorkflowConnectionInput[];
  isActive?: boolean;
}

/**
 * Input for creating a workflow node (id and workflowId are generated)
 */
export interface CreateWorkflowNodeInput {
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Input for creating a workflow connection (id and workflowId are generated)
 */
export interface CreateWorkflowConnectionInput {
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
}
