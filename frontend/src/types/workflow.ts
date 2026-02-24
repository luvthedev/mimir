/**
 * @module types/workflow
 * @description Frontend type definitions for the visual workflow editor.
 *
 * Mirrors the backend workflow types (src/types/workflow.ts) for use
 * within the React frontend. Keeps the frontend self-contained without
 * cross-workspace imports.
 */

// ============================================================================
// Workflow Node Types
// ============================================================================

/**
 * Valid node types for workflow processing steps.
 *
 * - upload: Data ingestion / file upload step
 * - extract: Data extraction / parsing step
 * - transform: Data transformation / manipulation step
 * - output: Final output / export step
 */
export type WorkflowNodeType = 'upload' | 'extract' | 'transform' | 'output';

/**
 * A node on the visual editor canvas.
 */
export interface EditorNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/**
 * A directed connection between two nodes.
 */
export interface EditorConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
}

/**
 * A validation error returned by the workflow validator.
 */
export interface ValidationError {
  type: 'invalid_connection' | 'cycle' | 'orphan' | 'missing_connection' | 'duplicate_connection';
  message: string;
  nodeIds?: string[];
  connectionId?: string;
}

/**
 * Metadata about a node type for the palette.
 */
export interface NodeTypeInfo {
  type: WorkflowNodeType;
  label: string;
  description: string;
  color: string;
  icon: string;
  ports: {
    inputs: string[];
    outputs: string[];
  };
}

/**
 * All available node types with their metadata.
 */
export const NODE_TYPE_CATALOG: NodeTypeInfo[] = [
  {
    type: 'upload',
    label: 'Upload',
    description: 'Data ingestion / file upload step',
    color: '#4a9eff',  // frost-ice
    icon: 'Upload',
    ports: { inputs: [], outputs: ['data'] },
  },
  {
    type: 'extract',
    label: 'Extract',
    description: 'Data extraction / parsing step',
    color: '#d4af37',  // valhalla-gold
    icon: 'FileSearch',
    ports: { inputs: ['data'], outputs: ['data'] },
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Data transformation / manipulation step',
    color: '#8b5cf6',  // magic-rune
    icon: 'Shuffle',
    ports: { inputs: ['data'], outputs: ['data'] },
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Final output / export step',
    color: '#10b981',  // green
    icon: 'Download',
    ports: { inputs: ['data'], outputs: [] },
  },
];
