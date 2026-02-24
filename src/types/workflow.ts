/**
 * @module types/workflow
 * @description Type definitions for visual workflow editor state
 *
 * Workflows represent visual pipelines composed of nodes and connections.
 * Each workflow belongs to a user and contains a DAG of processing steps
 * (upload, extract, transform, output) connected by directed edges.
 *
 * These types are used by the WorkflowPersistenceService and mapped to
 * the Neo4j graph model where workflows, nodes, and connections are
 * stored as graph nodes with typed relationships.
 *
 * @example
 * ```typescript
 * import type { Workflow, WorkflowNode, WorkflowConnection } from './types/workflow.js';
 *
 * const node: WorkflowNode = {
 *   id: 'node-1',
 *   type: 'extract',
 *   position: { x: 200, y: 100 },
 *   config: { parser: 'pdf', outputFormat: 'text' },
 *   metadata: { label: 'PDF Extractor' }
 * };
 *
 * const workflow: Workflow = {
 *   id: 'wf-abc123',
 *   name: 'Document Pipeline',
 *   description: 'Extract and transform documents',
 *   nodes: [node],
 *   connections: [],
 *   createdAt: '2024-01-01T00:00:00Z',
 *   updatedAt: '2024-01-01T00:00:00Z',
 *   userId: 'user-1'
 * };
 * ```
 */

// ============================================================================
// Workflow Node Types
// ============================================================================

/**
 * The processing step types available in a workflow
 *
 * - **upload**: Ingests data from external sources (files, APIs, etc.)
 * - **extract**: Parses and extracts structured data from raw input
 * - **transform**: Applies transformations, filters, or enrichments
 * - **output**: Produces final output (file, API call, notification, etc.)
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
 * A single processing node in a workflow
 *
 * Represents a step in the visual pipeline with its position on the canvas,
 * configuration for its processing logic, and optional metadata for display.
 *
 * @property id - Unique identifier for this node within the workflow
 * @property type - The processing step type (upload, extract, transform, output)
 * @property position - Canvas coordinates for visual editor placement
 * @property config - Type-specific configuration for the node's behavior
 * @property metadata - Optional display and organizational metadata
 *
 * @example
 * ```typescript
 * const uploadNode: WorkflowNode = {
 *   id: 'node-upload-1',
 *   type: 'upload',
 *   position: { x: 50, y: 100 },
 *   config: { source: 's3', bucket: 'documents', prefix: 'inbox/' },
 *   metadata: { label: 'S3 Upload', color: '#4CAF50' }
 * };
 * ```
 */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * A directed connection between two workflow nodes
 *
 * Represents a data flow edge from one node's output port to another
 * node's input port. Used for edge validation and DAG construction.
 *
 * @property id - Unique identifier for this connection
 * @property sourceNodeId - ID of the node where data flows from
 * @property targetNodeId - ID of the node where data flows to
 * @property sourcePort - Output port name on the source node
 * @property targetPort - Input port name on the target node
 *
 * @example
 * ```typescript
 * const connection: WorkflowConnection = {
 *   id: 'conn-1',
 *   sourceNodeId: 'node-upload-1',
 *   targetNodeId: 'node-extract-1',
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
 * Contains the full state of a visual workflow including all nodes,
 * connections, and metadata. This is the top-level entity persisted
 * to the database.
 *
 * @property id - Unique workflow identifier (UUID)
 * @property name - Human-readable workflow name
 * @property description - Optional description of the workflow's purpose
 * @property nodes - Array of processing nodes in the workflow
 * @property connections - Array of directed connections between nodes
 * @property createdAt - ISO 8601 creation timestamp
 * @property updatedAt - ISO 8601 last-update timestamp
 * @property userId - ID of the user who owns this workflow
 * @property isActive - Whether the workflow is active (not soft-deleted)
 *
 * @example
 * ```typescript
 * const workflow: Workflow = {
 *   id: 'wf-abc123',
 *   name: 'Invoice Processing',
 *   description: 'Extract line items from uploaded invoices',
 *   nodes: [uploadNode, extractNode, transformNode, outputNode],
 *   connections: [conn1, conn2, conn3],
 *   createdAt: '2024-01-01T00:00:00Z',
 *   updatedAt: '2024-01-15T10:30:00Z',
 *   userId: 'user-42',
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
 * @property name - Required workflow name
 * @property description - Optional description
 * @property nodes - Initial nodes (defaults to empty array)
 * @property connections - Initial connections (defaults to empty array)
 * @property userId - ID of the owning user
 */
export interface CreateWorkflowInput {
  name: string;
  description?: string;
  nodes?: WorkflowNode[];
  connections?: WorkflowConnection[];
  userId: string;
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
