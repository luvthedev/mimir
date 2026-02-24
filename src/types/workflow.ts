/**
 * @module types/workflow
 * @description TypeScript type definitions for the visual workflow editor
 *
 * Defines the core data structures for representing visual workflows,
 * including workflow nodes, connections, positions, and metadata.
 *
 * These types map onto the unified graph model:
 * - Workflow → Node with type 'workflow'
 * - WorkflowNode → Node with type 'workflow_node'
 * - WorkflowConnection → Edge with type 'workflow_connection'
 *
 * @example
 * ```typescript
 * import type { Workflow, WorkflowNode, WorkflowConnection } from './types/workflow.js';
 *
 * const node: WorkflowNode = {
 *   id: 'wfn-1',
 *   type: 'extract',
 *   position: { x: 100, y: 200 },
 *   config: { format: 'csv' },
 *   metadata: { label: 'Extract Data' }
 * };
 * ```
 */

// ============================================================================
// Workflow Node Types
// ============================================================================

/**
 * Types of nodes available in the visual workflow editor
 *
 * - **upload**: Data input/upload step
 * - **extract**: Extract data from a source
 * - **transform**: Transform/process data
 * - **output**: Final output/export step
 */
export type WorkflowNodeType = 'upload' | 'extract' | 'transform' | 'output';

/**
 * Position of a node on the visual editor canvas
 */
export interface WorkflowNodePosition {
  x: number;
  y: number;
}

/**
 * A node in the visual workflow editor
 *
 * Represents a single processing step in a workflow.
 * Each node has a type, canvas position, configuration, and optional metadata.
 *
 * @property id - Unique identifier for the node
 * @property type - The kind of processing step (upload, extract, transform, output)
 * @property position - X/Y coordinates on the visual editor canvas
 * @property config - Node-specific configuration (format, parameters, etc.)
 * @property metadata - Optional display metadata (label, description, color, etc.)
 *
 * @example
 * ```typescript
 * const uploadNode: WorkflowNode = {
 *   id: 'wfn-upload-1',
 *   type: 'upload',
 *   position: { x: 50, y: 100 },
 *   config: { acceptedFormats: ['csv', 'json'] },
 *   metadata: { label: 'Upload CSV' }
 * };
 * ```
 */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config: Record<string, any>;
  metadata?: Record<string, any>;
}

// ============================================================================
// Workflow Connections
// ============================================================================

/**
 * A connection (edge) between two workflow nodes
 *
 * Represents data flow between processing steps. Connections go from
 * a source node's output port to a target node's input port.
 *
 * @property id - Unique identifier for the connection
 * @property sourceNodeId - ID of the node where the connection starts
 * @property targetNodeId - ID of the node where the connection ends
 * @property sourcePort - Name of the output port on the source node
 * @property targetPort - Name of the input port on the target node
 *
 * @example
 * ```typescript
 * const connection: WorkflowConnection = {
 *   id: 'wfc-1',
 *   sourceNodeId: 'wfn-upload-1',
 *   targetNodeId: 'wfn-extract-1',
 *   sourcePort: 'output',
 *   targetPort: 'input'
 * };
 * ```
 */
export interface WorkflowConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
}

// ============================================================================
// Workflow
// ============================================================================

/**
 * A complete workflow definition
 *
 * Contains all metadata, nodes, and connections that define a visual
 * workflow. This is the top-level object persisted to the database.
 *
 * @property id - Unique workflow identifier
 * @property name - Human-readable workflow name
 * @property description - Optional description of what the workflow does
 * @property nodes - Array of workflow nodes (processing steps)
 * @property connections - Array of connections between nodes (data flow)
 * @property createdAt - ISO 8601 timestamp of creation
 * @property updatedAt - ISO 8601 timestamp of last modification
 * @property userId - ID of the user who owns this workflow
 * @property isActive - Whether the workflow is active (soft delete support)
 *
 * @example
 * ```typescript
 * const workflow: Workflow = {
 *   id: 'wf-1',
 *   name: 'CSV Processing Pipeline',
 *   description: 'Upload, extract, and transform CSV data',
 *   nodes: [uploadNode, extractNode, transformNode, outputNode],
 *   connections: [conn1, conn2, conn3],
 *   createdAt: '2026-02-24T00:00:00Z',
 *   updatedAt: '2026-02-24T00:00:00Z',
 *   userId: 'user-123',
 *   isActive: true
 * };
 * ```
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

// ============================================================================
// Input types for create/update operations
// ============================================================================

/**
 * Input for creating a new workflow
 *
 * Omits auto-generated fields (id, createdAt, updatedAt).
 * Nodes and connections are optional on creation.
 */
export interface CreateWorkflowInput {
  name: string;
  description?: string;
  userId: string;
  nodes?: WorkflowNode[];
  connections?: WorkflowConnection[];
  isActive?: boolean;
}

/**
 * Input for updating an existing workflow
 *
 * All fields are optional; only provided fields are updated.
 */
export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  connections?: WorkflowConnection[];
  isActive?: boolean;
}

// ============================================================================
// Query/filter types
// ============================================================================

/**
 * Options for listing workflows
 */
export interface ListWorkflowsOptions {
  userId?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}
