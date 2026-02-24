/**
 * @module utils/workflowValidation
 * @description Validation utilities for the visual workflow editor.
 *
 * Provides functions to validate connections between nodes, detect cycles,
 * ensure workflow completeness, and generate user-friendly error messages.
 */

import type { WorkflowNodeType, WorkflowNode, WorkflowConnection } from '../types/workflow';

// ============================================================================
// Connection Rules
// ============================================================================

/**
 * Defines which node types each type can connect TO (outgoing).
 * E.g. 'upload' can send data to 'extract' or 'transform'.
 */
const VALID_TARGETS: Record<WorkflowNodeType, WorkflowNodeType[]> = {
  upload: ['extract', 'transform'],
  extract: ['transform', 'output'],
  transform: ['transform', 'output'],
  output: [], // output nodes cannot send data anywhere
};

/**
 * Defines which node types each type can receive FROM (incoming).
 * E.g. 'output' can receive from 'extract' or 'transform'.
 */
const VALID_SOURCES: Record<WorkflowNodeType, WorkflowNodeType[]> = {
  upload: [], // upload nodes do not accept incoming connections
  extract: ['upload'],
  transform: ['upload', 'extract', 'transform'],
  output: ['extract', 'transform'],
};

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ConnectionValidationResult {
  valid: boolean;
  errors: string[];
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationError[];
}

export interface WorkflowValidationError {
  type: 'orphan' | 'cycle' | 'invalid_connection' | 'missing_connection' | 'duplicate';
  message: string;
  nodeIds?: string[];
  connectionId?: string;
}

// ============================================================================
// Connection Validation
// ============================================================================

/**
 * Check whether a proposed connection between two nodes is valid.
 *
 * Rules enforced:
 * 1. Cannot connect a node to itself
 * 2. Source node type must allow connections to target node type
 * 3. Target node type must allow connections from source node type
 * 4. The connection must not create a cycle in the graph
 * 5. No duplicate connections between the same source and target
 */
export function isValidConnection(
  sourceNode: WorkflowNode,
  targetNode: WorkflowNode,
  existingConnections: WorkflowConnection[],
  allNodes: WorkflowNode[],
): ConnectionValidationResult {
  const errors: string[] = [];

  // Rule 1: no self-connections
  if (sourceNode.id === targetNode.id) {
    errors.push('Cannot connect a node to itself.');
    return { valid: false, errors };
  }

  // Rule 2: source type allows this target type
  if (!VALID_TARGETS[sourceNode.type].includes(targetNode.type)) {
    errors.push(
      `"${formatNodeType(sourceNode.type)}" nodes cannot send data to "${formatNodeType(targetNode.type)}" nodes.`,
    );
  }

  // Rule 3: target type allows this source type
  if (!VALID_SOURCES[targetNode.type].includes(sourceNode.type)) {
    errors.push(
      `"${formatNodeType(targetNode.type)}" nodes cannot receive data from "${formatNodeType(sourceNode.type)}" nodes.`,
    );
  }

  // Rule 4: no duplicate connections
  const duplicate = existingConnections.some(
    (c) => c.sourceNodeId === sourceNode.id && c.targetNodeId === targetNode.id,
  );
  if (duplicate) {
    errors.push('This connection already exists.');
  }

  // Rule 5: would this create a cycle?
  if (errors.length === 0 && wouldCreateCycle(sourceNode.id, targetNode.id, existingConnections, allNodes)) {
    errors.push('This connection would create a cycle in the workflow.');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Workflow Validation
// ============================================================================

/**
 * Validate an entire workflow for completeness and correctness.
 *
 * Checks performed:
 * - Every node has at least one connection (no orphans), except single-node workflows
 * - No cycles exist in the graph
 * - All connections reference valid node types
 * - No duplicate connections
 */
export function validateWorkflow(
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = [];

  if (nodes.length === 0) {
    return { valid: true, errors: [] };
  }

  // Check for orphan nodes (nodes with no connections) when there are multiple nodes
  if (nodes.length > 1) {
    const connectedNodeIds = new Set<string>();
    for (const conn of connections) {
      connectedNodeIds.add(conn.sourceNodeId);
      connectedNodeIds.add(conn.targetNodeId);
    }

    for (const node of nodes) {
      if (!connectedNodeIds.has(node.id)) {
        errors.push({
          type: 'orphan',
          message: `"${getNodeLabel(node)}" is not connected to any other node.`,
          nodeIds: [node.id],
        });
      }
    }
  }

  // Check for cycles
  if (hasCycle(nodes, connections)) {
    errors.push({
      type: 'cycle',
      message: 'The workflow contains a cycle. Data must flow in one direction.',
    });
  }

  // Check each connection for valid source/target types
  for (const conn of connections) {
    const sourceNode = nodes.find((n) => n.id === conn.sourceNodeId);
    const targetNode = nodes.find((n) => n.id === conn.targetNodeId);

    if (sourceNode && targetNode) {
      if (!VALID_TARGETS[sourceNode.type].includes(targetNode.type)) {
        errors.push({
          type: 'invalid_connection',
          message: `Invalid connection: "${formatNodeType(sourceNode.type)}" cannot connect to "${formatNodeType(targetNode.type)}".`,
          connectionId: conn.id,
          nodeIds: [sourceNode.id, targetNode.id],
        });
      }
    }
  }

  // Check for duplicate connections
  const seen = new Set<string>();
  for (const conn of connections) {
    const key = `${conn.sourceNodeId}->${conn.targetNodeId}`;
    if (seen.has(key)) {
      errors.push({
        type: 'duplicate',
        message: 'Duplicate connection detected between the same nodes.',
        connectionId: conn.id,
        nodeIds: [conn.sourceNodeId, conn.targetNodeId],
      });
    }
    seen.add(key);
  }

  // Check that upload nodes have at least one outgoing connection
  for (const node of nodes) {
    if (node.type === 'upload' && nodes.length > 1) {
      const hasOutgoing = connections.some((c) => c.sourceNodeId === node.id);
      if (!hasOutgoing) {
        errors.push({
          type: 'missing_connection',
          message: `"${getNodeLabel(node)}" needs at least one outgoing connection.`,
          nodeIds: [node.id],
        });
      }
    }

    if (node.type === 'output' && nodes.length > 1) {
      const hasIncoming = connections.some((c) => c.targetNodeId === node.id);
      if (!hasIncoming) {
        errors.push({
          type: 'missing_connection',
          message: `"${getNodeLabel(node)}" needs at least one incoming connection.`,
          nodeIds: [node.id],
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Error Message Helpers
// ============================================================================

/**
 * Get user-friendly error messages from a connection validation result.
 */
export function getConnectionErrors(
  sourceNode: WorkflowNode,
  targetNode: WorkflowNode,
  existingConnections: WorkflowConnection[],
  allNodes: WorkflowNode[],
): string[] {
  const result = isValidConnection(sourceNode, targetNode, existingConnections, allNodes);
  return result.errors;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Detect whether adding an edge from sourceId to targetId
 * would create a cycle in the directed graph.
 *
 * Uses BFS from targetId to see if we can reach sourceId
 * through existing connections. If yes, adding source->target
 * would close a loop.
 */
function wouldCreateCycle(
  sourceId: string,
  targetId: string,
  connections: WorkflowConnection[],
  _allNodes: WorkflowNode[],
): boolean {
  const visited = new Set<string>();
  const queue: string[] = [targetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const conn of connections) {
      if (conn.sourceNodeId === current) {
        queue.push(conn.targetNodeId);
      }
    }
  }

  return false;
}

/**
 * Detect whether the current graph contains any cycle.
 * Uses Kahn's algorithm (topological sort).
 */
function hasCycle(nodes: WorkflowNode[], connections: WorkflowConnection[]): boolean {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const conn of connections) {
    const current = inDegree.get(conn.targetNodeId) ?? 0;
    inDegree.set(conn.targetNodeId, current + 1);
    adjacency.get(conn.sourceNodeId)?.push(conn.targetNodeId);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(nodeId);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const neighbor of adjacency.get(current) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  return processed < nodes.length;
}

/**
 * Format a node type for display.
 */
function formatNodeType(type: WorkflowNodeType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Get a user-friendly label for a node.
 */
function getNodeLabel(node: WorkflowNode): string {
  return (node.metadata?.label as string) || `${formatNodeType(node.type)} Node`;
}
