/**
 * @module types/workflow
 * @description Type definitions for the visual workflow editor state
 *
 * Defines the core data structures for representing visual workflows,
 * including node definitions, connections, and metadata. These types
 * enforce type safety for workflow objects throughout the codebase.
 *
 * In the Neo4j graph model, workflows are stored as unified :Node entities
 * with type='workflow', type='workflow_node', and type='workflow_connection'.
 * Relationships (edges) link workflow_node and workflow_connection nodes
 * back to their parent workflow.
 *
 * @example
 * ```typescript
 * import type { Workflow, WorkflowNode, WorkflowConnection } from './workflow.js';
 *
 * const node: WorkflowNode = {
 *   id: 'wfn-1',
 *   workflowId: 'wf-1',
 *   type: 'extract',
 *   position: { x: 200, y: 100 },
 *   config: { source: 'csv', delimiter: ',' },
 *   metadata: { label: 'CSV Extractor' }
 * };
 * ```
 */

// ============================================================================
// Workflow Node Types
// ============================================================================

/**
 * Allowed node types within a visual workflow
 *
 * - **upload**: Data ingestion / file upload step
 * - **extract**: Data extraction from a source
 * - **transform**: Data transformation / processing
 * - **output**: Final output / export step
 */
export type WorkflowNodeType = 'upload' | 'extract' | 'transform' | 'output';

/**
 * 2D position of a workflow node on the visual editor canvas
 */
export interface WorkflowNodePosition {
  x: number;
  y: number;
}

/**
 * A single node in a visual workflow
 *
 * Represents one step in the workflow pipeline. Each node has a type
 * that determines its behaviour, a position for the visual editor,
 * a configuration object for type-specific settings, and optional metadata.
 *
 * @property id - Unique identifier for this workflow node
 * @property workflowId - ID of the parent workflow this node belongs to
 * @property type - The kind of step (upload, extract, transform, output)
 * @property position - Canvas coordinates for the visual editor
 * @property config - Type-specific configuration (e.g. source settings, transform rules)
 * @property metadata - Optional display metadata (label, colour, icon, etc.)
 * @property createdAt - ISO 8601 creation timestamp
 *
 * @example
 * ```typescript
 * const uploadNode: WorkflowNode = {
 *   id: 'wfn-upload-1',
 *   workflowId: 'wf-123',
 *   type: 'upload',
 *   position: { x: 50, y: 100 },
 *   config: { acceptedFormats: ['csv', 'json'] },
 *   metadata: { label: 'File Upload' }
 * };
 * ```
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

/**
 * A connection (edge) between two workflow nodes
 *
 * Represents a directed data flow from a source node's output port
 * to a target node's input port in the visual editor.
 *
 * @property id - Unique identifier for this connection
 * @property workflowId - ID of the parent workflow
 * @property sourceNodeId - ID of the source WorkflowNode
 * @property targetNodeId - ID of the target WorkflowNode
 * @property sourcePort - Name of the output port on the source node
 * @property targetPort - Name of the input port on the target node
 * @property createdAt - ISO 8601 creation timestamp
 *
 * @example
 * ```typescript
 * const connection: WorkflowConnection = {
 *   id: 'wfc-1',
 *   workflowId: 'wf-123',
 *   sourceNodeId: 'wfn-upload-1',
 *   targetNodeId: 'wfn-extract-1',
 *   sourcePort: 'output',
 *   targetPort: 'input',
 *   createdAt: '2026-02-24T10:00:00Z'
 * };
 * ```
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
// Workflow (top-level container)
// ============================================================================

/**
 * A complete visual workflow definition
 *
 * Top-level container holding all nodes and connections that make up
 * a workflow. Includes ownership, metadata, and soft-delete flag.
 *
 * @property id - Unique workflow identifier (uuid)
 * @property name - Human-readable name
 * @property description - Optional description of the workflow's purpose
 * @property nodes - Array of workflow nodes (steps)
 * @property connections - Array of connections (edges between nodes)
 * @property userId - Owner / creator user ID
 * @property isActive - Soft-delete flag (true = active, false = deleted)
 * @property createdAt - ISO 8601 creation timestamp
 * @property updatedAt - ISO 8601 last-update timestamp
 *
 * @example
 * ```typescript
 * const workflow: Workflow = {
 *   id: 'wf-123',
 *   name: 'CSV Processing Pipeline',
 *   description: 'Upload CSV, extract columns, transform, export JSON',
 *   nodes: [uploadNode, extractNode, transformNode, outputNode],
 *   connections: [conn1, conn2, conn3],
 *   userId: 'user-456',
 *   isActive: true,
 *   createdAt: '2026-02-24T10:00:00Z',
 *   updatedAt: '2026-02-24T10:00:00Z'
 * };
 * ```
 */
export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  userId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Input types for create / update operations
// ============================================================================

/**
 * Input for creating a new workflow (id and timestamps are generated)
 */
export interface CreateWorkflowInput {
  name: string;
  description?: string;
  userId: string;
  nodes?: CreateWorkflowNodeInput[];
  connections?: CreateWorkflowConnectionInput[];
}

/**
 * Input for updating an existing workflow
 */
export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  nodes?: CreateWorkflowNodeInput[];
  connections?: CreateWorkflowConnectionInput[];
}

/**
 * Input for creating a workflow node (id and timestamps are generated)
 */
export interface CreateWorkflowNodeInput {
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Input for creating a workflow connection (id and timestamps are generated)
 */
export interface CreateWorkflowConnectionInput {
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
}
