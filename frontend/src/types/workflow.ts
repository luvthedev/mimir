/**
 * @module types/workflow (frontend)
 * @description Frontend type definitions for the visual workflow editor.
 *
 * These mirror the backend types in src/types/workflow.ts but are local
 * to the frontend to avoid cross-boundary imports.
 */

export type WorkflowNodeType = 'upload' | 'extract' | 'transform' | 'output';

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: WorkflowNodePosition;
  config: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface WorkflowConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
  createdAt: string;
}

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
