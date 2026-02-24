/**
 * @module codegen/codeGenerator
 * @description Main CodeGenerator service that converts a visual Workflow
 * into executable LangChain TypeScript code.
 *
 * Orchestrates validation, topological sorting, template-based code generation,
 * import deduplication, and final assembly into a single TypeScript string.
 *
 * @example
 * ```typescript
 * import { CodeGenerator } from './codegen/codeGenerator.js';
 *
 * const generator = new CodeGenerator();
 * const code = await generator.generateCode(workflow);
 * console.log(code);
 * ```
 */

import type { Workflow, WorkflowNode, WorkflowConnection } from '../types/workflow.js';
import { generateChain } from './chainTemplates.js';
import { formatImports, generateFileHeader } from './codeFormatting.js';

// ============================================================================
// Validation
// ============================================================================

/** Validation error detail */
export interface ValidationError {
  nodeId?: string;
  message: string;
}

/** Result from workflow validation */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a workflow for code generation readiness.
 *
 * Checks performed:
 * - Workflow has at least one node
 * - All connection endpoints reference existing nodes
 * - No duplicate connections
 * - No self-loops
 * - Graph is acyclic (validated during topological sort)
 *
 * @param workflow - The workflow to validate
 * @returns Validation result with errors if invalid
 */
export function validateWorkflow(workflow: Workflow): ValidationResult {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));

  // Must have at least one node
  if (workflow.nodes.length === 0) {
    errors.push({ message: 'Workflow must contain at least one node.' });
    return { valid: false, errors };
  }

  // Validate connections reference existing nodes
  for (const conn of workflow.connections) {
    if (!nodeIds.has(conn.sourceNodeId)) {
      errors.push({
        nodeId: conn.sourceNodeId,
        message: `Connection "${conn.id}" references non-existent source node "${conn.sourceNodeId}".`,
      });
    }
    if (!nodeIds.has(conn.targetNodeId)) {
      errors.push({
        nodeId: conn.targetNodeId,
        message: `Connection "${conn.id}" references non-existent target node "${conn.targetNodeId}".`,
      });
    }

    // No self-loops
    if (conn.sourceNodeId === conn.targetNodeId) {
      errors.push({
        nodeId: conn.sourceNodeId,
        message: `Connection "${conn.id}" is a self-loop on node "${conn.sourceNodeId}".`,
      });
    }
  }

  // No duplicate connections (same source -> target)
  const connectionKeys = new Set<string>();
  for (const conn of workflow.connections) {
    const key = `${conn.sourceNodeId}->${conn.targetNodeId}:${conn.sourcePort}->${conn.targetPort}`;
    if (connectionKeys.has(key)) {
      errors.push({
        message: `Duplicate connection from "${conn.sourceNodeId}" to "${conn.targetNodeId}".`,
      });
    }
    connectionKeys.add(key);
  }

  // Validate node types
  const validTypes = new Set(['upload', 'extract', 'transform', 'output']);
  for (const node of workflow.nodes) {
    if (!validTypes.has(node.type)) {
      errors.push({
        nodeId: node.id,
        message: `Node "${node.id}" has unsupported type "${node.type}".`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Code Generator Service
// ============================================================================

/**
 * CodeGenerator service that converts visual workflows into executable
 * LangChain TypeScript code.
 *
 * The generation pipeline:
 * 1. Validate the workflow structure
 * 2. Topologically sort nodes based on connections
 * 3. Generate code for each node using templates
 * 4. Assemble the chain with proper input/output wiring
 * 5. Deduplicate and sort imports
 * 6. Add file header with metadata
 */
export class CodeGenerator {
  /**
   * Generate executable LangChain TypeScript code from a visual workflow.
   *
   * @param workflow - The complete workflow definition
   * @returns Generated TypeScript code as a string
   * @throws {Error} If the workflow fails validation or contains cycles
   */
  async generateCode(workflow: Workflow): Promise<string> {
    const startTime = performance.now();

    // Step 1: Validate
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      const messages = validation.errors.map((e) => e.message).join('\n  - ');
      throw new Error(`Workflow validation failed:\n  - ${messages}`);
    }

    // Step 2-4: Generate chain (includes topological sort + template generation)
    const { imports: rawImports, code: chainCode } = generateChain(
      workflow.nodes,
      workflow.connections
    );

    // Step 5: Deduplicate and sort imports
    const sortedImports = formatImports(rawImports);

    // Step 6: Assemble final code
    const header = generateFileHeader(workflow.id, workflow.name);

    const sections: string[] = [
      header,
      sortedImports.join('\n'),
      '',
      '// ' + '='.repeat(76),
      '// Workflow Execution',
      '// ' + '='.repeat(76),
      '',
      'async function main(): Promise<void> {',
      '  console.log("Starting workflow: ' + escapeString(workflow.name) + '");',
      '  const startTime = performance.now();',
      '  try {',
      indentCode(chainCode, 4),
      '',
      '    const elapsed = (performance.now() - startTime).toFixed(0);',
      '    console.log(`Workflow completed successfully in ${elapsed}ms`);',
      '  } catch (error) {',
      '    console.error("Workflow execution failed:", error);',
      '    throw error;',
      '  }',
      '}',
      '',
      'main().catch((error) => {',
      '  console.error("Fatal error:", error);',
      '  process.exit(1);',
      '});',
      '',
    ];

    const generatedCode = sections.join('\n');

    const elapsed = performance.now() - startTime;
    if (elapsed > 500) {
      console.warn(
        `Code generation took ${elapsed.toFixed(0)}ms (target: <500ms)`
      );
    }

    return generatedCode;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Indent every line of a code block by the specified number of spaces.
 */
function indentCode(code: string, spaces: number): string {
  const indent = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.trim() ? indent + line : line))
    .join('\n');
}

/**
 * Escape a string for safe inclusion in a single-quoted JS string literal.
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}
