/**
 * @module codegen/codeFormatting
 * @description Utility functions for formatting generated LangChain code.
 *
 * Provides helpers for deduplicating / sorting imports, converting node IDs
 * to valid camelCase variable names, and inserting JSDoc comments.
 */

// ============================================================================
// Import Formatting
// ============================================================================

/**
 * Deduplicate and sort an array of import statements.
 *
 * Removes exact duplicates, then sorts alphabetically so that
 * generated code has deterministic, readable imports.
 *
 * @param imports - Array of raw import statement strings
 * @returns Deduplicated, sorted import statements
 *
 * @example
 * ```typescript
 * formatImports([
 *   'import { ChatOpenAI } from "@langchain/openai";',
 *   'import * as fs from "node:fs/promises";',
 *   'import { ChatOpenAI } from "@langchain/openai";',
 * ]);
 * // => [
 * //   'import * as fs from "node:fs/promises";',
 * //   'import { ChatOpenAI } from "@langchain/openai";',
 * // ]
 * ```
 */
export function formatImports(imports: string[]): string[] {
  // Deduplicate
  const unique = [...new Set(imports)];

  // Sort: node builtins first, then @langchain, then everything else
  return unique.sort((a, b) => {
    const aOrder = importSortOrder(a);
    const bOrder = importSortOrder(b);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  });
}

/**
 * Assign a numeric sort-order bucket to an import statement.
 *
 * 0 = node builtins (node:*)
 * 1 = @langchain packages
 * 2 = everything else
 */
function importSortOrder(importLine: string): number {
  if (importLine.includes('"node:') || importLine.includes("'node:")) {
    return 0;
  }
  if (importLine.includes('"@langchain/') || importLine.includes("'@langchain/")) {
    return 1;
  }
  return 2;
}

// ============================================================================
// Variable Name Formatting
// ============================================================================

/**
 * Convert a workflow node ID into a valid camelCase TypeScript variable name.
 *
 * Strips common prefixes (e.g. "wfn-"), replaces non-alphanumeric characters
 * with underscores, and converts to camelCase.
 *
 * @param nodeId - The raw node ID string (e.g. "wfn-upload-1", "node_extract_data")
 * @returns A valid camelCase variable name (e.g. "upload1", "extractData")
 *
 * @example
 * ```typescript
 * formatVariableNames('wfn-upload-1');   // => "upload1"
 * formatVariableNames('my_transform');   // => "myTransform"
 * formatVariableNames('node-extract-data'); // => "extractData"
 * ```
 */
export function formatVariableNames(nodeId: string): string {
  // Strip common prefixes
  let cleaned = nodeId
    .replace(/^wfn-/, '')
    .replace(/^wfc-/, '')
    .replace(/^node-/, '');

  // Replace non-alphanumeric characters with spaces for splitting
  cleaned = cleaned.replace(/[^a-zA-Z0-9]/g, ' ').trim();

  // Split into words and convert to camelCase
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return `node_${nodeId.replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  const camel = words
    .map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');

  // Ensure it doesn't start with a digit
  if (/^\d/.test(camel)) {
    return `node${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
  }

  return camel;
}

// ============================================================================
// Comment Generation
// ============================================================================

/**
 * Wrap a code block with a JSDoc-style comment header describing the node.
 *
 * @param nodeLabel - Human-readable label for the node
 * @param nodeType - The workflow node type (upload, extract, etc.)
 * @param nodeId - The original node ID
 * @param code - The code block to annotate
 * @returns The code block prefixed with a JSDoc comment
 */
export function addComments(
  nodeLabel: string,
  nodeType: string,
  nodeId: string,
  code: string
): string {
  const header = [
    '// ' + '='.repeat(76),
    `// Node: ${nodeLabel}`,
    `// Type: ${nodeType}`,
    `// ID:   ${nodeId}`,
    '// ' + '='.repeat(76),
  ].join('\n');

  return `${header}\n${code}`;
}

// ============================================================================
// File Header
// ============================================================================

/**
 * Generate the file header comment with timestamp, workflow ID,
 * and a warning about manual edits.
 *
 * @param workflowId - The workflow ID
 * @param workflowName - Human-readable workflow name
 * @returns The header string
 */
export function generateFileHeader(
  workflowId: string,
  workflowName: string
): string {
  const timestamp = new Date().toISOString();

  return [
    '/**',
    ` * Generated LangChain Workflow: ${workflowName}`,
    ` *`,
    ` * Workflow ID: ${workflowId}`,
    ` * Generated:  ${timestamp}`,
    ` *`,
    ` * WARNING: This file was auto-generated from the visual workflow editor.`,
    ` * Manual edits will break the visual sync between this code and the editor.`,
    ` * To make changes, use the visual workflow editor instead.`,
    ' */',
    '',
  ].join('\n');
}
