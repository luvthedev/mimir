/**
 * @module utils/workflowValidation
 * @description Validation utilities for the visual workflow editor.
 *
 * Provides functions to validate connections between workflow nodes,
 * detect cycles, check for orphaned nodes, and produce user-friendly
 * error messages.
 */

import type { WorkflowNodeType, EditorNode, EditorConnection, ValidationError } from '../types/workflow';

export type { EditorNode, EditorConnection, ValidationError };

// ============================================================================
// Allowed connection rules
// ============================================================================

/**
 * Defines which node types can connect to which other types.
 * Key = source type, value = set of valid target types.
 */
const VALID_TARGET_TYPES: Record<WorkflowNodeType, WorkflowNodeType[]> = {
  upload: ['extract'],
  extract: ['transform', 'output'],
  transform: ['transform', 'output'],
  output: [], // output nodes cannot connect to anything
};

/**
 * Maximum number of incoming connections per node type.
 */
const MAX_INCOMING: Record<WorkflowNodeType, number> = {
  upload: 0,
  extract: 1,
  transform: 5,
  output: 5,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Check whether a proposed connection between two nodes is valid.
 *
 * Rules enforced:
 *  1. Cannot connect a node to itself
 *  2. Source type must be allowed to connect to target type
 *  3. Adding this edge must not create a cycle
 *  4. Target must not exceed its max incoming connection limit
 *  5. No duplicate connections between the same two nodes
 */
export function isValidConnection(
  sourceNodeId: string,
  targetNodeId: string,
  nodes: EditorNode[],
  existingConnections: EditorConnection[],
): { valid: boolean; error?: string } {
  // Self-connection
  if (sourceNodeId === targetNodeId) {
    return { valid: false, error: 'A node cannot connect to itself.' };
  }

  const sourceNode = nodes.find((n) => n.id === sourceNodeId);
  const targetNode = nodes.find((n) => n.id === targetNodeId);

  if (!sourceNode || !targetNode) {
    return { valid: false, error: 'One or both nodes do not exist.' };
  }

  // Type compatibility
  const allowedTargets = VALID_TARGET_TYPES[sourceNode.type];
  if (!allowedTargets.includes(targetNode.type)) {
    return {
      valid: false,
      error: `Cannot connect ${sourceNode.type} to ${targetNode.type}. ${sourceNode.type} nodes can only connect to: ${allowedTargets.length > 0 ? allowedTargets.join(', ') : 'nothing (terminal node)'}.`,
    };
  }

  // Duplicate check
  const duplicate = existingConnections.some(
    (c) => c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId,
  );
  if (duplicate) {
    return { valid: false, error: 'This connection already exists.' };
  }

  // Incoming limit
  const incomingCount = existingConnections.filter(
    (c) => c.targetNodeId === targetNodeId,
  ).length;
  if (incomingCount >= MAX_INCOMING[targetNode.type]) {
    return {
      valid: false,
      error: `${targetNode.type} nodes can have at most ${MAX_INCOMING[targetNode.type]} incoming connection(s).`,
    };
  }

  // Cycle detection: would adding sourceNodeId -> targetNodeId create a cycle?
  if (wouldCreateCycle(sourceNodeId, targetNodeId, existingConnections)) {
    return {
      valid: false,
      error: 'This connection would create a cycle. Workflows must be acyclic (DAG).',
    };
  }

  return { valid: true };
}

/**
 * Validate the entire workflow and return all errors found.
 *
 * Checks performed:
 *  1. Every connection is individually valid
 *  2. No orphaned nodes (every node must have at least one connection,
 *     unless it is the only node)
 *  3. All non-upload nodes have at least one incoming connection
 *  4. All non-output nodes have at least one outgoing connection
 */
export function validateWorkflow(
  nodes: EditorNode[],
  connections: EditorConnection[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (nodes.length === 0) {
    return errors; // empty workflow is trivially valid
  }

  // Check each connection
  for (const conn of connections) {
    const result = isValidConnection(
      conn.sourceNodeId,
      conn.targetNodeId,
      nodes,
      connections.filter((c) => c.id !== conn.id), // exclude self for duplicate check
    );
    if (!result.valid) {
      errors.push({
        type: 'invalid_connection',
        message: result.error!,
        connectionId: conn.id,
        nodeIds: [conn.sourceNodeId, conn.targetNodeId],
      });
    }
  }

  // Orphan detection (only when there are 2+ nodes)
  if (nodes.length >= 2) {
    const connectedNodeIds = new Set<string>();
    for (const conn of connections) {
      connectedNodeIds.add(conn.sourceNodeId);
      connectedNodeIds.add(conn.targetNodeId);
    }

    for (const node of nodes) {
      if (!connectedNodeIds.has(node.id)) {
        errors.push({
          type: 'orphan',
          message: `Node "${node.metadata.label || node.type}" is not connected to any other node.`,
          nodeIds: [node.id],
        });
      }
    }
  }

  // Missing incoming connections for non-upload nodes
  for (const node of nodes) {
    if (node.type === 'upload') continue;
    const hasIncoming = connections.some((c) => c.targetNodeId === node.id);
    if (!hasIncoming && nodes.length >= 2) {
      errors.push({
        type: 'missing_connection',
        message: `Node "${node.metadata.label || node.type}" has no incoming connection.`,
        nodeIds: [node.id],
      });
    }
  }

  // Missing outgoing connections for non-output nodes
  for (const node of nodes) {
    if (node.type === 'output') continue;
    const hasOutgoing = connections.some((c) => c.sourceNodeId === node.id);
    if (!hasOutgoing && nodes.length >= 2) {
      errors.push({
        type: 'missing_connection',
        message: `Node "${node.metadata.label || node.type}" has no outgoing connection.`,
        nodeIds: [node.id],
      });
    }
  }

  return errors;
}

/**
 * Get user-friendly error messages for the current workflow state.
 * Returns an empty array when the workflow is valid.
 */
export function getConnectionErrors(
  nodes: EditorNode[],
  connections: EditorConnection[],
): string[] {
  const validationErrors = validateWorkflow(nodes, connections);
  // Deduplicate messages
  return [...new Set(validationErrors.map((e) => e.message))];
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Returns true if adding an edge from `sourceId` to `targetId`
 * would introduce a cycle in the graph formed by `connections`.
 *
 * Uses BFS from `targetId` following existing edges: if we can
 * reach `sourceId`, then the new edge would close a cycle.
 */
function wouldCreateCycle(
  sourceId: string,
  targetId: string,
  connections: EditorConnection[],
): boolean {
  // Build adjacency list (source -> targets)
  const adj = new Map<string, string[]>();
  for (const conn of connections) {
    const targets = adj.get(conn.sourceNodeId) ?? [];
    targets.push(conn.targetNodeId);
    adj.set(conn.sourceNodeId, targets);
  }

  // BFS from targetId through existing edges
  const visited = new Set<string>();
  const queue: string[] = [targetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adj.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return false;
}
