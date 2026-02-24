/**
 * @module types/workflow
 * @description Type definitions for the visual workflow editor
 *
 * Workflows represent visual DAGs (directed acyclic graphs) in the editor.
 * Each workflow contains nodes (processing steps) and connections (data flow
 * between steps). These types enforce type safety for workflow objects
 * throughout the codebase and map to the Neo4j persistence layer.
 *
 * Neo4j labels used:
 * - Workflow: Top-level workflow container
 * - WorkflowNode: Individual processing step within a workflow
 * - WorkflowConnection: Edge between two workflow nodes
 *
 * @example
 * ```typescript
 * import type { Workflow, WorkflowNode, WorkflowConnection } from './types/workflow.js';
 *
 * const node: WorkflowNode = {
 *   id: 'node-abc123',
 *   workflowId: 'wf-xyz789',
 *   type: 'extract',
 *   position: { x: 200, y: 150 },
 *   config: { format: 'csv', delimiter: ',' },
 *   metadata: { label: 'Parse CSV' },
 *   createdAt: '2025-01-15T10:30:00Z'
 * };
 * ```
 */

// ============================================================================
// Workflow Node Types
// ============================================================================

/**
 * Valid node types for workflow processing steps.
 *
 * - **upload**: Data ingestion / file upload step
 * - **extract**: Data extraction / parsing step
 * - **transform**: Data transformation / manipulation step
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
 * A single processing step within a workflow.
 *
 * @property id - Unique identifier (UUID)
 * @property workflowId - Parent workflow UUID (foreign key)
 * @property type - Processing step type
 * @property position - Canvas coordinates for the visual editor
 * @property config - Type-specific configuration (stored as JSONB)
 * @property metadata - Additional display/UI metadata (stored as JSONB)
 * @property createdAt - ISO 8601 creation timestamp
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
 * Input for creating a new WorkflowNode (id and createdAt are generated).
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
 * A directed edge between two workflow nodes representing data flow.
 *
 * @property id - Unique identifier (UUID)
 * @property workflowId - Parent workflow UUID (foreign key)
 * @property sourceNodeId - UUID of the source workflow node
 * @property targetNodeId - UUID of the target workflow node
 * @property sourcePort - Named output port on the source node
 * @property targetPort - Named input port on the target node
 * @property createdAt - ISO 8601 creation timestamp
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

/**
 * Input for creating a new WorkflowConnection (id and createdAt are generated).
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
 * A complete workflow definition including nodes and connections.
 *
 * @property id - Unique identifier (UUID)
 * @property name - Human-readable workflow name
 * @property description - Optional description of what the workflow does
 * @property nodes - Array of processing steps
 * @property connections - Array of data flow edges between nodes
 * @property createdAt - ISO 8601 creation timestamp
 * @property updatedAt - ISO 8601 last-update timestamp
 * @property userId - UUID of the owning user
 * @property isActive - Soft-delete flag (default true)
 *
 * @example
 * ```typescript
 * const workflow: Workflow = {
 *   id: 'wf-abc123',
 *   name: 'CSV Import Pipeline',
 *   description: 'Upload, parse, transform, and store CSV data',
 *   nodes: [uploadNode, extractNode, transformNode, outputNode],
 *   connections: [conn1, conn2, conn3],
 *   createdAt: '2025-01-15T10:00:00Z',
 *   updatedAt: '2025-01-15T12:30:00Z',
 *   userId: 'user-xyz789',
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

/**
 * Input for creating a new Workflow (id, timestamps, isActive are generated).
 */
export interface WorkflowCreateInput {
  name: string;
  description?: string;
  userId: string;
  nodes?: WorkflowNodeInput[];
  connections?: WorkflowConnectionInput[];
}

/**
 * Input for updating an existing Workflow.
 * All fields are optional; only provided fields are updated.
 */
export interface WorkflowUpdateInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNodeInput[];
  connections?: WorkflowConnectionInput[];
  isActive?: boolean;
}
