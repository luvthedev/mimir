/**
 * @module workflowValidation
 * @description Validation utilities for the visual workflow editor.
 *
 * Provides functions to validate connections between nodes, detect cycles,
 * check for orphan nodes, and return user-friendly error messages.
 */

// Re-use the backend types for node/connection shapes.
// These are duplicated here so the frontend bundle does not import from `src/`.
export type WorkflowNodeType = 'upload' | 'extract' | 'transform' | 'output';

export interface EditorNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface EditorConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
}

// ---------------------------------------------------------------------------
// Port compatibility rules
// ---------------------------------------------------------------------------

/** Which node types can act as a *source* flowing into a given *target* type. */
const VALID_TARGET_SOURCES: Record<WorkflowNodeType, WorkflowNodeType[]> = {
  upload: [],                              // upload accepts no incoming connections
  extract: ['upload'],                     // extract only from uploads
  transform: ['extract', 'transform'],     // transform chains or from extract
  output: ['transform', 'extract'],        // output from transform or extract
};

/** Which node types a given *source* type can connect *to*. */
const VALID_SOURCE_TARGETS: Record<WorkflowNodeType, WorkflowNodeType[]> = {
  upload: ['extract'],
  extract: ['transform', 'output'],
  transform: ['transform', 'output'],
  output: [],                              // output cannot source connections
};

// ---------------------------------------------------------------------------
// Connection-level validation
// ---------------------------------------------------------------------------

export interface ConnectionValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Check whether a proposed connection between two nodes is valid.
 *
 * Rules enforced:
 * 1. Cannot connect a node to itself.
 * 2. Source and target node types must be compatible per the port rules.
 * 3. Adding the connection must not introduce a cycle.
 * 4. Duplicate connections are rejected.
 */
export function isValidConnection(
  sourceNodeId: string,
  targetNodeId: string,
  nodes: EditorNode[],
  existingConnections: EditorConnection[],
): ConnectionValidationResult {
  const errors: string[] = [];

  // 1. Self-loop
  if (sourceNodeId === targetNodeId) {
    errors.push('Cannot connect a node to itself.');
    return { valid: false, errors };
  }

  const sourceNode = nodes.find((n) => n.id === sourceNodeId);
  const targetNode = nodes.find((n) => n.id === targetNodeId);

  if (!sourceNode || !targetNode) {
    errors.push('One or both nodes could not be found.');
    return { valid: false, errors };
  }

  // 2. Type compatibility
  const allowedTargets = VALID_SOURCE_TARGETS[sourceNode.type];
  if (!allowedTargets.includes(targetNode.type)) {
    const sourceLabel = nodeTypeLabel(sourceNode.type);
    const targetLabel = nodeTypeLabel(targetNode.type);
    errors.push(
      `${sourceLabel} nodes cannot connect to ${targetLabel} nodes.`,
    );
  }

  const allowedSources = VALID_TARGET_SOURCES[targetNode.type];
  if (!allowedSources.includes(sourceNode.type)) {
    const targetLabel = nodeTypeLabel(targetNode.type);
    if (allowedSources.length === 0) {
      errors.push(`${targetLabel} nodes do not accept incoming connections.`);
    }
  }

  // 3. Duplicate check
  const duplicate = existingConnections.some(
    (c) => c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId,
  );
  if (duplicate) {
    errors.push('This connection already exists.');
  }

  // 4. Cycle detection (only if no errors so far, since cycle check is heavier)
  if (errors.length === 0) {
    const wouldCycle = detectCycle(sourceNodeId, targetNodeId, existingConnections);
    if (wouldCycle) {
      errors.push('This connection would create a cycle in the workflow.');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Workflow-level validation
// ---------------------------------------------------------------------------

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowError[];
  warnings: string[];
}

export interface WorkflowError {
  nodeId?: string;
  message: string;
}

/**
 * Validate the entire workflow graph.
 *
 * Checks:
 * - At least one node exists.
 * - No orphan nodes (every node has at least one connection, unless it is the
 *   only node in the workflow).
 * - All connections are individually valid.
 * - The workflow is a valid DAG (no cycles).
 * - At least one upload node and one output node exist.
 */
export function validateWorkflow(
  nodes: EditorNode[],
  connections: EditorConnection[],
): WorkflowValidationResult {
  const errors: WorkflowError[] = [];
  const warnings: string[] = [];

  if (nodes.length === 0) {
    errors.push({ message: 'Workflow has no nodes. Add at least one node.' });
    return { valid: false, errors, warnings };
  }

  // Check for required node types
  const hasUpload = nodes.some((n) => n.type === 'upload');
  const hasOutput = nodes.some((n) => n.type === 'output');

  if (!hasUpload) {
    warnings.push('Workflow has no Upload node. Typically a workflow starts with an upload step.');
  }
  if (!hasOutput) {
    warnings.push('Workflow has no Output node. Typically a workflow ends with an output step.');
  }

  // Orphan detection (nodes with zero connections when >1 node)
  if (nodes.length > 1) {
    const connectedIds = new Set<string>();
    connections.forEach((c) => {
      connectedIds.add(c.sourceNodeId);
      connectedIds.add(c.targetNodeId);
    });

    nodes.forEach((node) => {
      if (!connectedIds.has(node.id)) {
        errors.push({
          nodeId: node.id,
          message: `Node "${nodeTypeLabel(node.type)}" (${node.id}) is not connected to any other node.`,
        });
      }
    });
  }

  // Validate each connection individually
  connections.forEach((conn) => {
    const result = isValidConnection(
      conn.sourceNodeId,
      conn.targetNodeId,
      nodes,
      // Pass all connections *except* the current one for duplicate checks
      connections.filter((c) => c.id !== conn.id),
    );
    if (!result.valid) {
      result.errors.forEach((msg) => {
        errors.push({
          nodeId: conn.targetNodeId,
          message: `Connection ${conn.sourceNodeId} -> ${conn.targetNodeId}: ${msg}`,
        });
      });
    }
  });

  // Global cycle check
  if (hasCycle(connections)) {
    errors.push({ message: 'Workflow contains a cycle. Workflows must be acyclic (DAG).' });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Error message helpers
// ---------------------------------------------------------------------------

/**
 * Return user-friendly error messages for the current workflow state.
 */
export function getConnectionErrors(
  sourceNodeId: string,
  targetNodeId: string,
  nodes: EditorNode[],
  connections: EditorConnection[],
): string[] {
  const result = isValidConnection(sourceNodeId, targetNodeId, nodes, connections);
  return result.errors;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nodeTypeLabel(type: WorkflowNodeType): string {
  const labels: Record<WorkflowNodeType, string> = {
    upload: 'Upload',
    extract: 'Extract',
    transform: 'Transform',
    output: 'Output',
  };
  return labels[type] ?? type;
}

/**
 * Would adding an edge source->target create a cycle?
 *
 * We check whether `target` can already reach `source` via existing edges.
 * If yes, adding source->target closes a loop.
 */
function detectCycle(
  sourceNodeId: string,
  targetNodeId: string,
  connections: EditorConnection[],
): boolean {
  // BFS from target; if we can reach source, adding the edge creates a cycle.
  const visited = new Set<string>();
  const queue: string[] = [targetNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sourceNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    connections.forEach((c) => {
      if (c.sourceNodeId === current && !visited.has(c.targetNodeId)) {
        queue.push(c.targetNodeId);
      }
    });
  }

  return false;
}

/**
 * Check the entire graph for cycles using Kahn's algorithm.
 */
function hasCycle(connections: EditorConnection[]): boolean {
  const nodeIds = new Set<string>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  connections.forEach((c) => {
    nodeIds.add(c.sourceNodeId);
    nodeIds.add(c.targetNodeId);

    inDegree.set(c.targetNodeId, (inDegree.get(c.targetNodeId) ?? 0) + 1);
    if (!inDegree.has(c.sourceNodeId)) inDegree.set(c.sourceNodeId, 0);

    const adj = adjacency.get(c.sourceNodeId) ?? [];
    adj.push(c.targetNodeId);
    adjacency.set(c.sourceNodeId, adj);
  });

  const queue: string[] = [];
  nodeIds.forEach((id) => {
    if ((inDegree.get(id) ?? 0) === 0) queue.push(id);
  });

  let processed = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    processed++;
    (adjacency.get(node) ?? []).forEach((neighbor) => {
      const deg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    });
  }

  return processed < nodeIds.size;
}
