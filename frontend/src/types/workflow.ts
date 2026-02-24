/**
 * @module types/workflow
 * @description Frontend type definitions for the visual workflow editor.
 *
 * These mirror the backend workflow types for use in the React visual editor.
 */

/**
 * Node types available in the visual workflow editor
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
 */
export interface WorkflowNode {
  id: string;
  workflowId: string;
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * A directed connection (edge) between two workflow nodes
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
 * A complete workflow definition with nodes and connections
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

/**
 * Describes a node type for the palette
 */
export interface WorkflowNodeTypeInfo {
  type: WorkflowNodeType;
  label: string;
  description: string;
  icon: string;
  color: string;
  borderColor: string;
  bgColor: string;
  maxIncoming: number;
  maxOutgoing: number;
}

/**
 * Validation state for visual feedback on connections
 */
export type ConnectionValidationState = 'valid' | 'invalid' | 'pending';
