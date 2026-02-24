/**
 * @module codegen/chainTemplates
 * @description Assembles workflow nodes into a LangChain chain using
 * topologically-sorted execution order derived from connections.
 *
 * The generated code wires nodes sequentially, passing the output of
 * each step as input to the next via the connection graph.
 */

import type { WorkflowNode, WorkflowConnection } from '../types/workflow.js';
import { generateNodeCode, type NodeTemplateResult } from './nodeTemplates.js';
import { formatVariableNames } from './codeFormatting.js';

// ============================================================================
// Topological Sort
// ============================================================================

/**
 * Perform a topological sort on workflow nodes using Kahn's algorithm.
 *
 * Produces an execution order that respects the directed edges
 * (connections) in the workflow graph. Detects cycles and throws
 * a validation error if one is found.
 *
 * @param nodes - All nodes in the workflow
 * @param connections - All connections (edges) in the workflow
 * @returns Nodes in valid execution order
 * @throws {Error} If the graph contains a cycle
 */
export function topologicalSort(
  nodes: WorkflowNode[],
  connections: WorkflowConnection[]
): WorkflowNode[] {
  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Build adjacency list and in-degree map
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const conn of connections) {
    const targets = adjacency.get(conn.sourceNodeId);
    if (targets) {
      targets.push(conn.targetNodeId);
    }
    inDegree.set(
      conn.targetNodeId,
      (inDegree.get(conn.targetNodeId) ?? 0) + 1
    );
  }

  // Seed the queue with nodes that have no incoming edges
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const sorted: WorkflowNode[] = [];

  while (queue.length > 0) {
    // Sort queue for deterministic output (by node id)
    queue.sort();
    const current = queue.shift()!;
    const node = nodeMap.get(current);
    if (node) {
      sorted.push(node);
    }

    for (const neighbour of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbour) ?? 1) - 1;
      inDegree.set(neighbour, newDegree);
      if (newDegree === 0) {
        queue.push(neighbour);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    const visitedIds = new Set(sorted.map((n) => n.id));
    const cycleNodes = nodes
      .filter((n) => !visitedIds.has(n.id))
      .map((n) => n.id);
    throw new Error(
      `Workflow contains a cycle involving nodes: ${cycleNodes.join(', ')}. ` +
        'Cycles are not supported in code generation.'
    );
  }

  return sorted;
}

// ============================================================================
// Input Resolution
// ============================================================================

/**
 * Find the input variable name for a given node by looking at incoming
 * connections and mapping them to the output variable of the source node.
 *
 * @param nodeId - The target node ID
 * @param connections - All connections in the workflow
 * @param outputVariables - Map of node ID to its output variable name
 * @returns The input variable name, or undefined if no input
 */
function resolveInputVariable(
  nodeId: string,
  connections: WorkflowConnection[],
  outputVariables: Map<string, string>
): string | undefined {
  const incoming = connections.filter((c) => c.targetNodeId === nodeId);
  if (incoming.length === 0) {
    return undefined;
  }
  // Use the first incoming connection's source output
  // (multiple inputs could be combined but the simple case is a single pipe)
  return outputVariables.get(incoming[0].sourceNodeId);
}

// ============================================================================
// Chain Generation
// ============================================================================

/**
 * Generate the assembled LangChain chain code from sorted nodes and connections.
 *
 * Produces a complete code body (excluding the file header and imports)
 * that executes each node in topological order, wiring outputs to inputs
 * based on connections.
 *
 * @param nodes - All workflow nodes
 * @param connections - All workflow connections
 * @returns Object containing all required imports and the assembled chain code
 */
export function generateChain(
  nodes: WorkflowNode[],
  connections: WorkflowConnection[]
): { imports: string[]; code: string } {
  const sorted = topologicalSort(nodes, connections);

  const allImports: string[] = [];
  const codeBlocks: string[] = [];
  const outputVariables = new Map<string, string>();

  for (const node of sorted) {
    const varName = formatVariableNames(node.id);
    const inputVariable = resolveInputVariable(
      node.id,
      connections,
      outputVariables
    );

    const result: NodeTemplateResult = generateNodeCode(
      varName,
      node,
      inputVariable
    );

    allImports.push(...result.imports);
    codeBlocks.push(result.code);
    outputVariables.set(node.id, result.outputVariable);
  }

  const chainCode = codeBlocks.join('\n');

  return { imports: allImports, code: chainCode };
}
