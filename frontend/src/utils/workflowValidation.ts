/**
 * @module workflowValidation
 * @description Validation utilities for the visual workflow editor.
 *
 * Provides functions to validate connections between workflow nodes,
 * detect cycles, check for orphaned nodes, and return user-friendly
 * error messages.
 */

import type { WorkflowNodeType } from '../types/workflow';

// ============================================================================
// Types
// ============================================================================

export interface EditorNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  config: Record<string, any>;
  metadata: Record<string, any>;
}

export interface EditorConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
}

export interface ValidationError {
  type: 'invalid_connection' | 'cycle_detected' | 'orphan_node' | 'missing_node' | 'duplicate_connection' | 'self_connection';
  message: string;
  nodeIds?: string[];
  connectionId?: string;
}

// ============================================================================
// Connection Rules
// ============================================================================

/**
 * Defines which node types can connect to which.
 * Key = source type, Value = set of valid target types.
 *
 * Flow: upload -> extract -> transform -> output
 * Also: upload -> transform, extract -> output (skip steps allowed)
 * NOT allowed: anything -> upload (upload is entry only)
 * NOT allowed: output -> anything (output is terminal)
 */
const VALID_TARGET_TYPES: Record<WorkflowNodeType, Set<WorkflowNodeType>> = {
  upload:    new Set(['extract', 'transform']),
  extract:   new Set(['transform', 'output']),
  transform: new Set(['transform', 'output']),
  output:    new Set(), // output cannot be a source
};

const VALID_SOURCE_TYPES: Record<WorkflowNodeType, Set<WorkflowNodeType>> = {
  upload:    new Set(), // upload cannot be a target
  extract:   new Set(['upload']),
  transform: new Set(['upload', 'extract', 'transform']),
  output:    new Set(['extract', 'transform']),
};

// ============================================================================
// Connection Validation
// ============================================================================

/**
 * Checks whether a proposed connection between two nodes is valid.
 *
 * Rules enforced:
 * 1. No self-connections
 * 2. No duplicate connections
 * 3. Source type must be allowed to connect to target type
 * 4. Target type must accept connections from source type
 * 5. No cycles would be created
 *
 * @returns null if valid, or a ValidationError describing the problem
 */
export function isValidConnection(
  sourceNodeId: string,
  targetNodeId: string,
  _sourcePort: string,
  _targetPort: string,
  nodes: EditorNode[],
  existingConnections: EditorConnection[],
): ValidationError | null {
  // Rule 1: No self-connections
  if (sourceNodeId === targetNodeId) {
    return {
      type: 'self_connection',
      message: 'A node cannot connect to itself.',
      nodeIds: [sourceNodeId],
    };
  }

  // Find nodes
  const sourceNode = nodes.find(n => n.id === sourceNodeId);
  const targetNode = nodes.find(n => n.id === targetNodeId);

  if (!sourceNode) {
    return {
      type: 'missing_node',
      message: `Source node "${sourceNodeId}" not found.`,
      nodeIds: [sourceNodeId],
    };
  }

  if (!targetNode) {
    return {
      type: 'missing_node',
      message: `Target node "${targetNodeId}" not found.`,
      nodeIds: [targetNodeId],
    };
  }

  // Rule 2: No duplicate connections
  const isDuplicate = existingConnections.some(
    c => c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId,
  );
  if (isDuplicate) {
    return {
      type: 'duplicate_connection',
      message: `A connection from "${sourceNode.metadata.label || sourceNode.type}" to "${targetNode.metadata.label || targetNode.type}" already exists.`,
      nodeIds: [sourceNodeId, targetNodeId],
    };
  }

  // Rule 3: Source type must be allowed to connect to target type
  const allowedTargets = VALID_TARGET_TYPES[sourceNode.type];
  if (!allowedTargets.has(targetNode.type)) {
    const sourceLabel = sourceNode.metadata.label || sourceNode.type;
    const targetLabel = targetNode.metadata.label || targetNode.type;

    if (sourceNode.type === 'output') {
      return {
        type: 'invalid_connection',
        message: `"${sourceLabel}" is an output node and cannot connect to other nodes.`,
        nodeIds: [sourceNodeId, targetNodeId],
      };
    }

    return {
      type: 'invalid_connection',
      message: `Cannot connect "${sourceLabel}" (${sourceNode.type}) to "${targetLabel}" (${targetNode.type}). ${sourceNode.type} nodes can only connect to: ${Array.from(allowedTargets).join(', ') || 'nothing'}.`,
      nodeIds: [sourceNodeId, targetNodeId],
    };
  }

  // Rule 4: Target must accept connections from source type
  const allowedSources = VALID_SOURCE_TYPES[targetNode.type];
  if (!allowedSources.has(sourceNode.type)) {
    const targetLabel = targetNode.metadata.label || targetNode.type;

    if (targetNode.type === 'upload') {
      return {
        type: 'invalid_connection',
        message: `"${targetLabel}" is an upload node and cannot receive connections.`,
        nodeIds: [sourceNodeId, targetNodeId],
      };
    }

    return {
      type: 'invalid_connection',
      message: `"${targetLabel}" (${targetNode.type}) does not accept connections from ${sourceNode.type} nodes.`,
      nodeIds: [sourceNodeId, targetNodeId],
    };
  }

  // Rule 5: No cycles
  if (wouldCreateCycle(sourceNodeId, targetNodeId, existingConnections)) {
    return {
      type: 'cycle_detected',
      message: 'This connection would create a cycle in the workflow. Workflows must be acyclic (DAG).',
      nodeIds: [sourceNodeId, targetNodeId],
    };
  }

  return null;
}

// ============================================================================
// Cycle Detection
// ============================================================================

/**
 * Checks if adding an edge from sourceNodeId to targetNodeId would create a cycle.
 * Uses DFS from targetNodeId to see if we can reach sourceNodeId through existing edges.
 */
export function wouldCreateCycle(
  sourceNodeId: string,
  targetNodeId: string,
  connections: EditorConnection[],
): boolean {
  // Build adjacency list (source -> targets)
  const adjacency = new Map<string, Set<string>>();
  for (const conn of connections) {
    if (!adjacency.has(conn.sourceNodeId)) {
      adjacency.set(conn.sourceNodeId, new Set());
    }
    adjacency.get(conn.sourceNodeId)!.add(conn.targetNodeId);
  }

  // If we add sourceNodeId -> targetNodeId, check if targetNodeId can reach sourceNodeId
  // (which would form a cycle)
  const visited = new Set<string>();
  const stack = [targetNodeId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === sourceNodeId) {
      return true; // Cycle detected
    }
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjacency.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
  }

  return false;
}

// ============================================================================
// Workflow Validation
// ============================================================================

/**
 * Validates an entire workflow for structural correctness.
 *
 * Checks:
 * 1. At least one upload node exists
 * 2. At least one output node exists
 * 3. No orphaned nodes (every node is connected to at least one other)
 * 4. All connections reference existing nodes
 * 5. No cycles
 * 6. All connection type rules are satisfied
 *
 * @returns Array of ValidationErrors. Empty array means workflow is valid.
 */
export function validateWorkflow(
  nodes: EditorNode[],
  connections: EditorConnection[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (nodes.length === 0) {
    return errors; // Empty workflow is valid (nothing to validate)
  }

  // Check: at least one upload node
  const uploadNodes = nodes.filter(n => n.type === 'upload');
  if (uploadNodes.length === 0) {
    errors.push({
      type: 'missing_node',
      message: 'Workflow needs at least one Upload node as an entry point.',
    });
  }

  // Check: at least one output node
  const outputNodes = nodes.filter(n => n.type === 'output');
  if (outputNodes.length === 0) {
    errors.push({
      type: 'missing_node',
      message: 'Workflow needs at least one Output node as an endpoint.',
    });
  }

  // Check: orphaned nodes (no connections to or from)
  if (nodes.length > 1) {
    const connectedNodeIds = new Set<string>();
    for (const conn of connections) {
      connectedNodeIds.add(conn.sourceNodeId);
      connectedNodeIds.add(conn.targetNodeId);
    }

    const orphans = nodes.filter(n => !connectedNodeIds.has(n.id));
    for (const orphan of orphans) {
      errors.push({
        type: 'orphan_node',
        message: `"${orphan.metadata.label || orphan.type}" node is not connected to any other node.`,
        nodeIds: [orphan.id],
      });
    }
  }

  // Check: connections reference existing nodes
  const nodeIds = new Set(nodes.map(n => n.id));
  for (const conn of connections) {
    if (!nodeIds.has(conn.sourceNodeId)) {
      errors.push({
        type: 'missing_node',
        message: `Connection references non-existent source node "${conn.sourceNodeId}".`,
        connectionId: conn.id,
      });
    }
    if (!nodeIds.has(conn.targetNodeId)) {
      errors.push({
        type: 'missing_node',
        message: `Connection references non-existent target node "${conn.targetNodeId}".`,
        connectionId: conn.id,
      });
    }
  }

  // Check: all connection type rules
  for (const conn of connections) {
    const error = isValidConnection(
      conn.sourceNodeId,
      conn.targetNodeId,
      conn.sourcePort,
      conn.targetPort,
      nodes,
      connections.filter(c => c.id !== conn.id), // Exclude self to avoid duplicate check
    );
    if (error && error.type !== 'duplicate_connection') {
      errors.push({
        ...error,
        connectionId: conn.id,
      });
    }
  }

  return errors;
}

// ============================================================================
// User-Friendly Error Messages
// ============================================================================

/**
 * Returns user-friendly error messages for connection attempts.
 * Groups errors by type and provides actionable suggestions.
 */
export function getConnectionErrors(
  sourceNodeId: string,
  targetNodeId: string,
  nodes: EditorNode[],
  connections: EditorConnection[],
): string[] {
  const error = isValidConnection(
    sourceNodeId,
    targetNodeId,
    'output',
    'input',
    nodes,
    connections,
  );

  if (!error) return [];

  const messages: string[] = [error.message];

  // Add suggestions based on error type
  switch (error.type) {
    case 'cycle_detected':
      messages.push('Tip: Restructure your workflow to avoid circular dependencies.');
      break;
    case 'invalid_connection': {
      const sourceNode = nodes.find(n => n.id === sourceNodeId);
      if (sourceNode) {
        const validTargets = VALID_TARGET_TYPES[sourceNode.type];
        if (validTargets.size > 0) {
          messages.push(`Valid targets for ${sourceNode.type}: ${Array.from(validTargets).join(', ')}.`);
        }
      }
      break;
    }
    case 'self_connection':
      messages.push('Connect this node to a different node instead.');
      break;
    case 'duplicate_connection':
      messages.push('These nodes are already connected.');
      break;
  }

  return messages;
}

/**
 * Returns the set of valid target node types for a given source type.
 * Useful for UI hints (e.g., highlighting valid drop targets).
 */
export function getValidTargetTypes(sourceType: WorkflowNodeType): WorkflowNodeType[] {
  return Array.from(VALID_TARGET_TYPES[sourceType] || []);
}

/**
 * Returns the set of valid source node types for a given target type.
 * Useful for UI hints.
 */
export function getValidSourceTypes(targetType: WorkflowNodeType): WorkflowNodeType[] {
  return Array.from(VALID_SOURCE_TYPES[targetType] || []);
}
