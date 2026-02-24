/**
 * @module codegen/chainTemplates
 * @description Assembles ordered workflow nodes into a LangChain chain
 * using `.pipe()` based on connection order.
 *
 * The main export, `generateChain`, takes topologically-sorted nodes and
 * their connections, maps each node to its generated variable name, and
 * produces the TypeScript code that pipes them together into a single
 * `RunnableSequence`.
 */

import type { WorkflowNode, WorkflowConnection } from '../types/workflow.js';
import type { ParsedImport } from './codeFormatting.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of chain assembly code generation.
 */
export interface ChainCodeResult {
  /** TypeScript code that assembles the chain */
  code: string;
  /** Additional imports needed for chain assembly */
  imports: ParsedImport[];
}

// ============================================================================
// Chain Assembly
// ============================================================================

/**
 * Generate TypeScript code that assembles a LangChain chain from
 * topologically-sorted workflow nodes.
 *
 * Uses `.pipe()` to chain `Runnable` instances together in execution
 * order, following the directed edges from source to target.
 *
 * @param orderedNodes - Nodes in topological (execution) order
 * @param connections - All workflow connections
 * @param variableMap - Mapping from node ID to generated variable name
 * @returns Chain assembly code and required imports
 *
 * @example
 * ```typescript
 * const result = generateChain(
 *   [uploadNode, extractNode, outputNode],
 *   [{ sourceNodeId: 'u1', targetNodeId: 'e1', ... }, { sourceNodeId: 'e1', targetNodeId: 'o1', ... }],
 *   new Map([['u1', 'uploadCsv'], ['e1', 'extractData'], ['o1', 'outputResult']]),
 * );
 * ```
 */
export function generateChain(
  orderedNodes: WorkflowNode[],
  connections: WorkflowConnection[],
  variableMap: Map<string, string>,
): ChainCodeResult {
  const imports: ParsedImport[] = [
    {
      module: '@langchain/core/runnables',
      namedExports: ['RunnableSequence'],
      isTypeImport: false,
    },
  ];

  if (orderedNodes.length === 0) {
    return {
      code: '// No nodes to chain\nconst chain = RunnableSequence.from([]);',
      imports,
    };
  }

  if (orderedNodes.length === 1) {
    const varName = variableMap.get(orderedNodes[0].id) ?? 'unknownNode';
    return {
      code: `// Single-node chain\nconst chain = ${varName};`,
      imports: [], // No RunnableSequence needed for single node
    };
  }

  // Build adjacency list from connections
  const adjacency = new Map<string, string[]>();
  for (const conn of connections) {
    const targets = adjacency.get(conn.sourceNodeId) ?? [];
    targets.push(conn.targetNodeId);
    adjacency.set(conn.sourceNodeId, targets);
  }

  // Find root nodes (no incoming connections)
  const hasIncoming = new Set<string>(connections.map((c) => c.targetNodeId));
  const roots = orderedNodes.filter((n) => !hasIncoming.has(n.id));

  // For a linear chain (single path), use .pipe() syntax
  // For DAGs with branches, fall back to RunnableSequence.from()
  const isLinear = orderedNodes.every((node) => {
    const outgoing = adjacency.get(node.id) ?? [];
    return outgoing.length <= 1;
  }) && roots.length <= 1;

  if (isLinear) {
    return generateLinearChain(orderedNodes, variableMap, imports);
  }

  return generateSequenceChain(orderedNodes, variableMap, imports);
}

// ============================================================================
// Linear Chain (.pipe() syntax)
// ============================================================================

/**
 * Generate a linear chain using the `.pipe()` fluent syntax.
 *
 * This produces the most readable output for simple linear workflows:
 * `uploadNode.pipe(extractNode).pipe(outputNode)`
 */
function generateLinearChain(
  orderedNodes: WorkflowNode[],
  variableMap: Map<string, string>,
  imports: ParsedImport[],
): ChainCodeResult {
  const varNames = orderedNodes.map(
    (n) => variableMap.get(n.id) ?? 'unknownNode',
  );

  const firstVar = varNames[0];
  const pipeChain = varNames
    .slice(1)
    .map((v) => `.pipe(${v})`)
    .join('\n  ');

  const code = [
    '// Assemble the workflow chain',
    `const chain = ${firstVar}`,
    `  ${pipeChain};`,
  ].join('\n');

  return { code, imports };
}

// ============================================================================
// Sequence Chain (RunnableSequence.from())
// ============================================================================

/**
 * Generate a chain using `RunnableSequence.from()` for more complex DAGs.
 *
 * Nodes are passed in topological order, which ensures that each node's
 * dependencies have already been executed.
 */
function generateSequenceChain(
  orderedNodes: WorkflowNode[],
  variableMap: Map<string, string>,
  imports: ParsedImport[],
): ChainCodeResult {
  const varNames = orderedNodes.map(
    (n) => variableMap.get(n.id) ?? 'unknownNode',
  );

  const nodeList = varNames.map((v) => `    ${v},`).join('\n');

  const code = [
    '// Assemble the workflow chain (sequence)',
    'const chain = RunnableSequence.from([',
    nodeList,
    ']);',
  ].join('\n');

  return { code, imports };
}

// ============================================================================
// Chain Execution Wrapper
// ============================================================================

/**
 * Generate the execution wrapper that invokes the chain with error
 * handling and logging.
 *
 * @param workflowName - Human-readable workflow name for logging
 * @returns TypeScript code string for the execution wrapper
 */
export function generateExecutionWrapper(workflowName: string): string {
  return `
// ============================================================================
// Execute the workflow chain
// ============================================================================

/**
 * Run the generated workflow chain.
 *
 * @param input - The initial input data for the chain
 * @returns The final output from the last node in the chain
 */
export async function runWorkflow(input: string): Promise<string> {
  console.log("Starting workflow: ${workflowName}");
  const startTime = Date.now();

  try {
    const result = await chain.invoke(input);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(\`Workflow "${workflowName}" completed in \${duration}s\`);
    return result;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(\`Workflow "${workflowName}" failed after \${duration}s:\`, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}`;
}
