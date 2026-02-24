/**
 * @module codegen/codeGenerator
 * @description Main CodeGenerator service that converts visual workflows into executable
 * LangChain TypeScript code.
 *
 * Responsibilities:
 * - Validates workflow structure before code generation
 * - Performs topological sort to determine correct execution order
 * - Generates imports, node code, and chain assembly
 * - Produces complete, compilable TypeScript output
 */

import type { Workflow, WorkflowNode, WorkflowConnection } from '../types/workflow.js';
import { formatImports, generateHeader } from './codeFormatting.js';
import { generateChain } from './chainTemplates.js';

// ============================================================================
// Types
// ============================================================================

export interface CodeGenerationResult {
  /** The complete generated TypeScript code */
  code: string;
  /** Whether the code was generated successfully */
  success: boolean;
  /** Validation errors (if any) */
  errors: string[];
  /** Generation duration in milliseconds */
  durationMs: number;
}

export interface ValidationResult {
  /** Whether the workflow is valid for code generation */
  valid: boolean;
  /** Validation error messages */
  errors: string[];
}

// ============================================================================
// Topological Sort
// ============================================================================

/**
 * Performs a topological sort of workflow nodes based on connections.
 *
 * Uses Kahn's algorithm (BFS-based) to determine execution order.
 * Detects cycles and throws a descriptive error if one is found.
 *
 * @param nodes - All workflow nodes
 * @param connections - All workflow connections
 * @returns Nodes in topologically sorted order (upstream before downstream)
 * @throws Error if a cycle is detected in the workflow
 */
export function topologicalSort(
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
): WorkflowNode[] {
  const nodeMap = new Map<string, WorkflowNode>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Build adjacency list and compute in-degrees
  for (const conn of connections) {
    // Only count connections between nodes that exist in our node list
    if (nodeMap.has(conn.sourceNodeId) && nodeMap.has(conn.targetNodeId)) {
      adjacency.get(conn.sourceNodeId)!.push(conn.targetNodeId);
      inDegree.set(conn.targetNodeId, (inDegree.get(conn.targetNodeId) || 0) + 1);
    }
  }

  // Find all nodes with in-degree 0 (entry points)
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  // Process nodes in topological order
  const sorted: WorkflowNode[] = [];
  while (queue.length > 0) {
    // Sort queue for deterministic output (by node type priority, then ID)
    queue.sort((a, b) => {
      const typeOrder: Record<string, number> = { upload: 0, extract: 1, transform: 2, output: 3 };
      const nodeA = nodeMap.get(a)!;
      const nodeB = nodeMap.get(b)!;
      const typeCompare = (typeOrder[nodeA.type] ?? 99) - (typeOrder[nodeB.type] ?? 99);
      if (typeCompare !== 0) return typeCompare;
      return a.localeCompare(b);
    });

    const nodeId = queue.shift()!;
    sorted.push(nodeMap.get(nodeId)!);

    for (const neighbor of adjacency.get(nodeId) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If not all nodes are in sorted list, there's a cycle
  if (sorted.length !== nodes.length) {
    const unsorted = nodes.filter(n => !sorted.includes(n));
    const cycleNodeIds = unsorted.map(n => n.id).join(', ');
    throw new Error(
      `Cycle detected in workflow. The following nodes are part of a cycle: ${cycleNodeIds}. ` +
      `Workflows must be directed acyclic graphs (DAGs).`
    );
  }

  return sorted;
}

// ============================================================================
// Workflow Validation
// ============================================================================

/**
 * Validates a workflow for code generation readiness.
 *
 * Checks:
 * - Workflow has at least one node
 * - All connections reference existing nodes
 * - No cycles exist
 * - At least one entry point (upload node or node with no incoming connections)
 * - At least one output node or terminal node
 *
 * @param workflow - The workflow to validate
 * @returns Validation result with error messages
 */
export function validateWorkflow(workflow: Workflow): ValidationResult {
  const errors: string[] = [];

  // Check for empty workflow
  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push('Workflow has no nodes. Add at least one node to generate code.');
    return { valid: false, errors };
  }

  // Check that all connection endpoints reference existing nodes
  const nodeIds = new Set(workflow.nodes.map(n => n.id));
  for (const conn of workflow.connections) {
    if (!nodeIds.has(conn.sourceNodeId)) {
      errors.push(`Connection ${conn.id} references non-existent source node: ${conn.sourceNodeId}`);
    }
    if (!nodeIds.has(conn.targetNodeId)) {
      errors.push(`Connection ${conn.id} references non-existent target node: ${conn.targetNodeId}`);
    }
  }

  // Don't proceed with further validation if connections are broken
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check for at least one entry point (upload node)
  const uploadNodes = workflow.nodes.filter(n => n.type === 'upload');
  if (uploadNodes.length === 0) {
    errors.push('Workflow must have at least one upload node as an entry point.');
  }

  // Check for at least one output node
  const outputNodes = workflow.nodes.filter(n => n.type === 'output');
  if (outputNodes.length === 0) {
    errors.push('Workflow must have at least one output node.');
  }

  // Check for cycles using topological sort
  try {
    topologicalSort(workflow.nodes, workflow.connections);
  } catch (error: any) {
    errors.push(error.message);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Code Generator Service
// ============================================================================

/**
 * Main code generation service.
 *
 * Converts a visual workflow into executable LangChain TypeScript code.
 * Validates the workflow, generates imports, node code, and chain assembly.
 *
 * @param workflow - The workflow to generate code for
 * @returns Code generation result with the complete TypeScript code
 */
export async function generateCode(workflow: Workflow): Promise<CodeGenerationResult> {
  const startTime = performance.now();

  // Step 1: Validate the workflow
  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    return {
      code: '',
      success: false,
      errors: validation.errors,
      durationMs: performance.now() - startTime,
    };
  }

  try {
    // Step 2: Topological sort for execution order
    const orderedNodes = topologicalSort(workflow.nodes, workflow.connections);

    // Step 3: Generate chain code (nodes + assembly)
    const chainResult = generateChain(orderedNodes, workflow.connections);

    // Step 4: Format imports
    const importBlock = formatImports(chainResult.imports);

    // Step 5: Assemble the complete file
    const header = generateHeader(workflow.id, workflow.name);

    const code = [
      header,
      importBlock,
      '',
      '// ============================================================================',
      `// Workflow: ${workflow.name}`,
      `// Description: ${workflow.description || 'No description'}`,
      '// ============================================================================',
      '',
      `export async function execute${sanitizeName(workflow.name)}Workflow(): Promise<any> {`,
      `  console.log('Starting workflow: ${workflow.name} (${workflow.id})');`,
      `  const startTime = Date.now();`,
      '',
      indent(chainResult.nodeCode, 2),
      '',
      `  const durationMs = Date.now() - startTime;`,
      `  console.log(\`Workflow completed in \${durationMs}ms\`);`,
      chainResult.finalOutputVariable
        ? `  return ${chainResult.finalOutputVariable};`
        : '  return undefined;',
      '}',
      '',
    ].join('\n');

    const durationMs = performance.now() - startTime;

    return {
      code,
      success: true,
      errors: [],
      durationMs,
    };
  } catch (error: any) {
    return {
      code: '',
      success: false,
      errors: [error.message],
      durationMs: performance.now() - startTime,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Indents a block of code by the specified number of spaces.
 */
function indent(code: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return code
    .split('\n')
    .map(line => (line.trim() ? pad + line : line))
    .join('\n');
}

/**
 * Sanitizes a workflow name for use as a TypeScript function identifier.
 */
function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
