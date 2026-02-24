/**
 * @module codegen/CodeGenerator
 * @description Main code generation service that converts visual workflows
 * into executable LangChain TypeScript code.
 *
 * Orchestrates the full generation pipeline:
 * 1. Validate the workflow (connections, cycles, orphans)
 * 2. Topologically sort nodes for correct execution order
 * 3. Generate code for each node using node templates
 * 4. Assemble the chain using chain templates
 * 5. Merge and format imports
 * 6. Produce the final TypeScript source with header, imports, LLM setup,
 *    node code, chain assembly, and execution wrapper
 *
 * @example
 * ```typescript
 * import { CodeGenerator } from './codegen/CodeGenerator.js';
 * import type { Workflow } from './types/workflow.js';
 *
 * const generator = new CodeGenerator();
 * const workflow: Workflow = { ... };
 * const code = await generator.generateCode(workflow);
 * console.log(code); // Valid TypeScript ready for execution
 * ```
 */

import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
} from '../types/workflow.js';
import {
  formatImports,
  formatVariableName,
  addComments,
  generateHeader,
} from './codeFormatting.js';
import type { ParsedImport } from './codeFormatting.js';
import { generateNodeCode } from './nodeTemplates.js';
import { generateChain, generateExecutionWrapper } from './chainTemplates.js';

// ============================================================================
// Validation Errors
// ============================================================================

/**
 * Error thrown when workflow validation fails during code generation.
 */
export class WorkflowValidationError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(`Workflow validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    this.name = 'WorkflowValidationError';
    this.errors = errors;
  }
}

/**
 * Error thrown when a cycle is detected in the workflow graph.
 */
export class CycleDetectedError extends WorkflowValidationError {
  constructor(nodeIds?: string[]) {
    const detail = nodeIds
      ? ` involving nodes: ${nodeIds.join(', ')}`
      : '';
    super([`Workflow contains a cycle${detail}. Workflows must be acyclic (DAG).`]);
    this.name = 'CycleDetectedError';
  }
}

// ============================================================================
// CodeGenerator Service
// ============================================================================

/**
 * Service that converts visual workflows into executable LangChain
 * TypeScript code.
 *
 * Stateless — each call to `generateCode` is independent.
 */
export class CodeGenerator {
  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Generate executable LangChain TypeScript code from a visual workflow.
   *
   * @param workflow - The complete workflow definition
   * @returns Generated TypeScript source code as a string
   * @throws {WorkflowValidationError} If the workflow has structural issues
   * @throws {CycleDetectedError} If the workflow contains a cycle
   */
  async generateCode(workflow: Workflow): Promise<string> {
    // Step 1: Validate
    this.validateWorkflow(workflow);

    // Step 2: Topological sort
    const orderedNodes = this.topologicalSort(
      workflow.nodes,
      workflow.connections,
    );

    // Step 3: Assign variable names
    const variableMap = this.buildVariableMap(orderedNodes);

    // Step 4: Generate node code blocks
    const allImports: ParsedImport[] = [];
    const nodeCodeBlocks: string[] = [];

    for (const node of orderedNodes) {
      const varName = variableMap.get(node.id)!;
      const label = (node.metadata?.label as string) || node.type;
      const config = node.config ?? {};

      // JSDoc comment
      const comment = addComments(node.type, label, config);
      nodeCodeBlocks.push(comment);

      // Node implementation code
      const result = generateNodeCode(varName, node);
      nodeCodeBlocks.push(result.code);
      allImports.push(...result.imports);

      // Blank line between nodes
      nodeCodeBlocks.push('');
    }

    // Step 5: Generate chain assembly
    const chainResult = generateChain(
      orderedNodes,
      workflow.connections,
      variableMap,
    );
    allImports.push(...chainResult.imports);

    // Step 6: Add LLM setup imports if any node uses the LLM
    const usesLLM = orderedNodes.some(
      (n) => n.type === 'extract' || n.type === 'transform',
    );
    if (usesLLM) {
      allImports.push({
        module: '@langchain/openai',
        namedExports: ['ChatOpenAI'],
        isTypeImport: false,
      });
    }

    // Step 7: Assemble final code
    const header = generateHeader(workflow.id, workflow.name);
    const importBlock = formatImports(allImports);
    const llmSetup = usesLLM ? this.generateLLMSetup() : '';
    const nodeCode = nodeCodeBlocks.join('\n');
    const chainCode = chainResult.code;
    const executionWrapper = generateExecutionWrapper(workflow.name);

    const sections = [
      header,
      importBlock,
      '',
      llmSetup,
      nodeCode,
      chainCode,
      executionWrapper,
      '', // trailing newline
    ].filter((s) => s !== undefined);

    return sections.join('\n');
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Validate the workflow structure before code generation.
   *
   * Checks:
   * - Workflow has at least one node
   * - All connections reference existing nodes
   * - No duplicate connections
   * - No self-connections
   * - The graph is acyclic (DAG)
   *
   * @throws {WorkflowValidationError} On any validation failure
   */
  private validateWorkflow(workflow: Workflow): void {
    const errors: string[] = [];

    // Must have at least one node
    if (!workflow.nodes || workflow.nodes.length === 0) {
      throw new WorkflowValidationError(['Workflow must contain at least one node.']);
    }

    // Build node ID set for reference checking
    const nodeIds = new Set(workflow.nodes.map((n) => n.id));

    // Validate connections
    const connectionSet = new Set<string>();
    for (const conn of workflow.connections) {
      // Self-connection
      if (conn.sourceNodeId === conn.targetNodeId) {
        errors.push(
          `Connection ${conn.id}: node "${conn.sourceNodeId}" cannot connect to itself.`,
        );
      }

      // Reference check
      if (!nodeIds.has(conn.sourceNodeId)) {
        errors.push(
          `Connection ${conn.id}: source node "${conn.sourceNodeId}" does not exist.`,
        );
      }
      if (!nodeIds.has(conn.targetNodeId)) {
        errors.push(
          `Connection ${conn.id}: target node "${conn.targetNodeId}" does not exist.`,
        );
      }

      // Duplicate check
      const key = `${conn.sourceNodeId}->${conn.targetNodeId}`;
      if (connectionSet.has(key)) {
        errors.push(
          `Duplicate connection from "${conn.sourceNodeId}" to "${conn.targetNodeId}".`,
        );
      }
      connectionSet.add(key);
    }

    if (errors.length > 0) {
      throw new WorkflowValidationError(errors);
    }

    // Cycle detection (done as part of topological sort, but we check early
    // to give a clear error message)
    this.detectCycles(workflow.nodes, workflow.connections);
  }

  // ==========================================================================
  // Cycle Detection
  // ==========================================================================

  /**
   * Detect cycles in the workflow graph using DFS colouring.
   *
   * @throws {CycleDetectedError} If a cycle is found
   */
  private detectCycles(
    nodes: WorkflowNode[],
    connections: WorkflowConnection[],
  ): void {
    const WHITE = 0; // Unvisited
    const GRAY = 1;  // In current DFS path
    const BLACK = 2; // Fully processed

    const color = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      color.set(node.id, WHITE);
      adjacency.set(node.id, []);
    }

    for (const conn of connections) {
      const targets = adjacency.get(conn.sourceNodeId);
      if (targets) {
        targets.push(conn.targetNodeId);
      }
    }

    const dfs = (nodeId: string, path: string[]): void => {
      color.set(nodeId, GRAY);
      path.push(nodeId);

      const neighbors = adjacency.get(nodeId) ?? [];
      for (const neighbor of neighbors) {
        const c = color.get(neighbor);
        if (c === GRAY) {
          // Found a cycle — extract the cycle path
          const cycleStart = path.indexOf(neighbor);
          const cycleNodes = path.slice(cycleStart);
          throw new CycleDetectedError(cycleNodes);
        }
        if (c === WHITE) {
          dfs(neighbor, path);
        }
      }

      color.set(nodeId, BLACK);
      path.pop();
    };

    for (const node of nodes) {
      if (color.get(node.id) === WHITE) {
        dfs(node.id, []);
      }
    }
  }

  // ==========================================================================
  // Topological Sort
  // ==========================================================================

  /**
   * Perform a topological sort on the workflow nodes using Kahn's algorithm.
   *
   * Ensures nodes are ordered so that every node appears after all of its
   * dependencies (i.e. after all nodes that have edges pointing to it).
   *
   * @param nodes - All workflow nodes
   * @param connections - All workflow connections
   * @returns Nodes in topological (execution) order
   * @throws {CycleDetectedError} If the graph contains a cycle
   */
  private topologicalSort(
    nodes: WorkflowNode[],
    connections: WorkflowConnection[],
  ): WorkflowNode[] {
    const nodeMap = new Map<string, WorkflowNode>();
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialise
    for (const node of nodes) {
      nodeMap.set(node.id, node);
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    // Build adjacency and in-degree counts
    for (const conn of connections) {
      const targets = adjacency.get(conn.sourceNodeId);
      if (targets) {
        targets.push(conn.targetNodeId);
      }
      inDegree.set(
        conn.targetNodeId,
        (inDegree.get(conn.targetNodeId) ?? 0) + 1,
      );
    }

    // Start with all zero-in-degree nodes
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // Sort the initial queue for deterministic output
    queue.sort();

    const sorted: WorkflowNode[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = nodeMap.get(nodeId);
      if (node) {
        sorted.push(node);
      }

      const neighbors = adjacency.get(nodeId) ?? [];
      // Sort neighbors for deterministic output
      const sortedNeighbors = [...neighbors].sort();
      for (const neighbor of sortedNeighbors) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // If not all nodes were processed, there's a cycle
    if (sorted.length !== nodes.length) {
      const remaining = nodes
        .filter((n) => !sorted.some((s) => s.id === n.id))
        .map((n) => n.id);
      throw new CycleDetectedError(remaining);
    }

    return sorted;
  }

  // ==========================================================================
  // Variable Name Generation
  // ==========================================================================

  /**
   * Build a mapping from node ID to unique variable name for all nodes.
   *
   * @param orderedNodes - Topologically sorted nodes
   * @returns Map from node ID to variable name
   */
  private buildVariableMap(orderedNodes: WorkflowNode[]): Map<string, string> {
    const map = new Map<string, string>();
    const usedNames = new Set<string>();

    for (let i = 0; i < orderedNodes.length; i++) {
      const node = orderedNodes[i];
      let varName = formatVariableName(node.id, node.type, i);

      // Ensure uniqueness
      let attempt = 0;
      let candidate = varName;
      while (usedNames.has(candidate)) {
        attempt++;
        candidate = `${varName}${attempt}`;
      }

      usedNames.add(candidate);
      map.set(node.id, candidate);
    }

    return map;
  }

  // ==========================================================================
  // LLM Setup
  // ==========================================================================

  /**
   * Generate the LLM configuration code block.
   *
   * This creates a `ChatOpenAI` instance that extract and transform
   * nodes will reference as `llm`.
   */
  private generateLLMSetup(): string {
    return `// ============================================================================
// LLM Configuration
// ============================================================================

const llm = new ChatOpenAI({
  model: process.env.MIMIR_DEFAULT_MODEL || "gpt-4-turbo",
  temperature: 0,
  maxTokens: 4096,
});
`;
  }
}
