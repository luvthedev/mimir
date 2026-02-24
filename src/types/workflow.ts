/**
 * @module types/workflow
 * @description Type definitions for visual workflow editor state
 *
 * Defines the core data structures for representing visual workflows,
 * including node definitions, connections between nodes, and workflow metadata.
 * These types are persisted to Neo4j as separate node labels (Workflow,
 * WorkflowNode, WorkflowConnection) with relationships between them.
 *
 * @example
 * ```typescript
 * const workflow: Workflow = {
 *   id: 'wf-abc123',
 *   name: 'Document Processing Pipeline',
 *   description: 'Extract and transform uploaded documents',
 *   nodes: [
 *     { id: 'n1', type: 'upload', position: { x: 100, y: 200 }, config: {}, metadata: {} },
 *     { id: 'n2', type: 'extract', position: { x: 300, y: 200 }, config: {}, metadata: {} }
 *   ],
 *   connections: [
 *     { id: 'c1', sourceNodeId: 'n1', targetNodeId: 'n2', sourcePort: 'output', targetPort: 'input' }
 *   ],
 *   userId: 'user-xyz',
 *   isActive: true,
 *   createdAt: '2025-01-01T00:00:00Z',
 *   updatedAt: '2025-01-01T00:00:00Z'
 * };
 * ```
 */

// ============================================================================
// Workflow Node Types
// ============================================================================

/**
 * Valid types for workflow nodes in the visual editor.
 *
 * - **upload**: File or data upload entry point
 * - **extract**: Data extraction / parsing step
 * - **transform**: Data transformation / processing step
 * - **output**: Final output / export step
 */
export type WorkflowNodeType = 'upload' | 'extract' | 'transform' | 'output';

/**
 * 2D position of a node on the visual editor canvas.
 */
export interface WorkflowNodePosition {
  x: number;
  y: number;
}

/**
 * A single node in a visual workflow.
 *
 * Each node represents a processing step with a type, position on the canvas,
 * configuration for its behavior, and optional metadata.
 *
 * @property id - Unique identifier for the node (UUID)
 * @property type - The processing step type (upload, extract, transform, output)
 * @property position - Canvas coordinates for visual placement
 * @property config - Type-specific configuration (e.g., extraction rules, output format)
 * @property metadata - Additional metadata (e.g., display label, color, notes)
 * @property createdAt - ISO 8601 timestamp of creation
 *
 * @example
 * ```typescript
 * const uploadNode: WorkflowNode = {
 *   id: 'node-1',
 *   type: 'upload',
 *   position: { x: 100, y: 200 },
 *   config: { acceptedFormats: ['pdf', 'csv'] },
 *   metadata: { label: 'Upload Documents' },
 *   createdAt: '2025-01-01T00:00:00Z'
 * };
 * ```
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
 * A connection (edge) between two workflow nodes.
 *
 * Connections define the data flow between processing steps.
 * Each connection links a source node's output port to a target node's input port.
 *
 * @property id - Unique identifier for the connection (UUID)
 * @property sourceNodeId - ID of the source workflow node
 * @property targetNodeId - ID of the target workflow node
 * @property sourcePort - Name of the output port on the source node
 * @property targetPort - Name of the input port on the target node
 * @property createdAt - ISO 8601 timestamp of creation
 *
 * @example
 * ```typescript
 * const connection: WorkflowConnection = {
 *   id: 'conn-1',
 *   sourceNodeId: 'node-1',
 *   targetNodeId: 'node-2',
 *   sourcePort: 'output',
 *   targetPort: 'input',
 *   createdAt: '2025-01-01T00:00:00Z'
 * };
 * ```
 */
export interface WorkflowConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
  createdAt: string;
}

// ============================================================================
// Workflow (Aggregate Root)
// ============================================================================

/**
 * A complete workflow definition including all nodes and connections.
 *
 * The Workflow is the aggregate root that owns its nodes and connections.
 * It represents a complete visual pipeline configuration that can be
 * persisted, retrieved, and edited in the visual editor.
 *
 * @property id - Unique identifier for the workflow (UUID)
 * @property name - Human-readable workflow name
 * @property description - Optional description of the workflow's purpose
 * @property nodes - Array of workflow nodes (processing steps)
 * @property connections - Array of connections between nodes (data flow)
 * @property userId - ID of the user who owns this workflow
 * @property isActive - Whether the workflow is active (soft delete support)
 * @property createdAt - ISO 8601 timestamp of creation
 * @property updatedAt - ISO 8601 timestamp of last modification
 *
 * @example
 * ```typescript
 * const workflow: Workflow = {
 *   id: 'wf-abc123',
 *   name: 'Invoice Processing',
 *   description: 'Extract data from uploaded invoices and output to CSV',
 *   nodes: [...],
 *   connections: [...],
 *   userId: 'user-1',
 *   isActive: true,
 *   createdAt: '2025-01-01T00:00:00Z',
 *   updatedAt: '2025-01-15T12:30:00Z'
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
// Input Types (for create/update operations)
// ============================================================================

/**
 * Input for creating a new workflow.
 * ID, timestamps, and isActive are generated by the persistence layer.
 */
export interface CreateWorkflowInput {
  name: string;
  description?: string;
  nodes?: Array<{
    type: WorkflowNodeType;
    position: WorkflowNodePosition;
    config?: Record<string, any>;
    metadata?: Record<string, any>;
  }>;
  connections?: Array<{
    sourceNodeId: string;
    targetNodeId: string;
    sourcePort: string;
    targetPort: string;
  }>;
  userId: string;
}

/**
 * Input for updating an existing workflow.
 * All fields are optional; only provided fields are updated.
 */
export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: Array<{
    id?: string;
    type: WorkflowNodeType;
    position: WorkflowNodePosition;
    config?: Record<string, any>;
    metadata?: Record<string, any>;
  }>;
  connections?: Array<{
    id?: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourcePort: string;
    targetPort: string;
  }>;
  isActive?: boolean;
}
