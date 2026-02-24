/**
 * @module codegen/codeFormatting
 * @description Utility functions for formatting generated TypeScript code.
 *
 * Provides helpers for:
 * - Deduplicating and sorting import statements
 * - Converting node IDs to valid camelCase variable names
 * - Inserting JSDoc comments for each workflow node
 */

// ============================================================================
// Import Formatting
// ============================================================================

/**
 * A parsed import statement with its module and named exports.
 */
export interface ParsedImport {
  /** The module specifier, e.g. "@langchain/core/runnables" */
  module: string;
  /** Named exports to import from the module */
  namedExports: string[];
  /** Whether this is a type-only import */
  isTypeImport: boolean;
}

/**
 * Deduplicate and sort import statements.
 *
 * Merges imports from the same module, removes duplicate named exports,
 * and sorts both modules and exports alphabetically.
 *
 * @param imports - Array of parsed import objects
 * @returns Formatted import block as a string
 *
 * @example
 * ```typescript
 * const imports: ParsedImport[] = [
 *   { module: '@langchain/openai', namedExports: ['ChatOpenAI'], isTypeImport: false },
 *   { module: '@langchain/openai', namedExports: ['ChatOpenAI', 'OpenAIEmbeddings'], isTypeImport: false },
 *   { module: '@langchain/core/runnables', namedExports: ['RunnableSequence'], isTypeImport: false },
 * ];
 * const formatted = formatImports(imports);
 * // import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
 * // import { RunnableSequence } from "@langchain/core/runnables";
 * ```
 */
export function formatImports(imports: ParsedImport[]): string {
  // Group by module, separating type and value imports
  const moduleMap = new Map<string, { exports: Set<string>; isTypeImport: boolean }>();

  for (const imp of imports) {
    const key = `${imp.isTypeImport ? 'type:' : ''}${imp.module}`;
    const existing = moduleMap.get(key);
    if (existing) {
      for (const exp of imp.namedExports) {
        existing.exports.add(exp);
      }
    } else {
      moduleMap.set(key, {
        exports: new Set(imp.namedExports),
        isTypeImport: imp.isTypeImport,
      });
    }
  }

  // Sort modules alphabetically, then format
  const sortedKeys = [...moduleMap.keys()].sort((a, b) => {
    // Strip type: prefix for comparison
    const aModule = a.replace(/^type:/, '');
    const bModule = b.replace(/^type:/, '');
    return aModule.localeCompare(bModule);
  });

  const lines: string[] = [];
  for (const key of sortedKeys) {
    const entry = moduleMap.get(key)!;
    const module = key.replace(/^type:/, '');
    const sortedExports = [...entry.exports].sort();
    const typePrefix = entry.isTypeImport ? 'type ' : '';
    lines.push(`import ${typePrefix}{ ${sortedExports.join(', ')} } from "${module}";`);
  }

  return lines.join('\n');
}

// ============================================================================
// Variable Name Formatting
// ============================================================================

/**
 * Convert a node ID (UUID or arbitrary string) into a valid camelCase
 * TypeScript variable name.
 *
 * - Strips non-alphanumeric characters
 * - Converts to camelCase based on word boundaries (hyphens, underscores)
 * - Prepends "node" if the result starts with a digit
 * - Falls back to "node" + index if the ID produces an empty string
 *
 * @param nodeId - The raw node ID string
 * @param nodeType - The type of the node (used as prefix)
 * @param index - Positional index in the workflow (fallback identifier)
 * @returns A valid camelCase variable name
 *
 * @example
 * ```typescript
 * formatVariableName('abc-def-123', 'upload', 0);   // "uploadAbcDef123"
 * formatVariableName('node-1', 'extract', 1);        // "extractNode1"
 * ```
 */
export function formatVariableName(
  nodeId: string,
  nodeType: string,
  index: number,
): string {
  // Split on common separators and non-alphanumeric characters
  const parts = nodeId
    .split(/[-_\s.]+/)
    .filter((p) => p.length > 0);

  if (parts.length === 0) {
    return `${nodeType}Node${index}`;
  }

  // Take at most the first 3 segments to keep names short for UUIDs
  const shortParts = parts.slice(0, 3);

  // Build camelCase: first word lowercase, rest capitalized
  const camelParts = shortParts.map((part, i) => {
    if (i === 0) return part.toLowerCase();
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });

  const baseName = camelParts.join('');

  // Prefix with node type
  const prefixed = `${nodeType}${baseName.charAt(0).toUpperCase()}${baseName.slice(1)}`;

  // Ensure starts with a letter
  if (/^\d/.test(prefixed)) {
    return `node${prefixed}`;
  }

  return prefixed;
}

// ============================================================================
// JSDoc Comment Generation
// ============================================================================

/**
 * Generate a JSDoc comment block for a workflow node.
 *
 * @param nodeType - The workflow node type
 * @param label - Human-readable label from node metadata
 * @param config - Node configuration object
 * @returns Multi-line JSDoc string
 *
 * @example
 * ```typescript
 * const doc = addComments('upload', 'CSV Uploader', { format: 'csv' });
 * // /**
 * //  * Upload Node: CSV Uploader
 * //  *
 * //  * Type: upload
 * //  * Config: {"format":"csv"}
 * //  *\/
 * ```
 */
export function addComments(
  nodeType: string,
  label: string,
  config: Record<string, any>,
): string {
  const typeLabel = nodeType.charAt(0).toUpperCase() + nodeType.slice(1);
  const configStr = Object.keys(config).length > 0
    ? JSON.stringify(config)
    : 'none';

  const lines = [
    '/**',
    ` * ${typeLabel} Node: ${label || 'Unnamed'}`,
    ' *',
    ` * Type: ${nodeType}`,
    ` * Config: ${configStr}`,
    ' */',
  ];

  return lines.join('\n');
}

// ============================================================================
// Generated Code Header
// ============================================================================

/**
 * Generate the file header comment for generated code.
 *
 * Includes a timestamp, workflow ID, and a warning that manual edits
 * will break visual editor synchronisation.
 *
 * @param workflowId - UUID of the source workflow
 * @param workflowName - Human-readable workflow name
 * @returns Multi-line header comment string
 */
export function generateHeader(
  workflowId: string,
  workflowName: string,
): string {
  const timestamp = new Date().toISOString();
  return [
    '// ============================================================================',
    `// AUTO-GENERATED CODE - ${workflowName}`,
    '// ============================================================================',
    '//',
    `// Workflow ID : ${workflowId}`,
    `// Generated   : ${timestamp}`,
    '//',
    '// WARNING: Manual edits to this file will break synchronisation with the',
    '//          visual workflow editor. Make changes in the editor instead.',
    '// ============================================================================',
    '',
  ].join('\n');
}
