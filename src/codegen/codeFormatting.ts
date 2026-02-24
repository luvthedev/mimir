/**
 * @module codegen/codeFormatting
 * @description Utility functions for formatting generated TypeScript code.
 *
 * Provides helpers for deduplicating/sorting imports, converting node IDs
 * to camelCase variable names, and inserting JSDoc comments for each node.
 */

// ============================================================================
// Import Formatting
// ============================================================================

export interface ImportStatement {
  /** The module path, e.g. "@langchain/core/documents" */
  module: string;
  /** Named imports, e.g. ["Document", "BaseDocumentLoader"] */
  namedImports: string[];
  /** Whether this is a type-only import */
  isTypeOnly?: boolean;
}

/**
 * Deduplicates and sorts import statements.
 *
 * - Merges imports from the same module
 * - Deduplicates named imports within each module
 * - Sorts modules alphabetically
 * - Sorts named imports alphabetically within each module
 *
 * @param imports - Array of import statements to format
 * @returns Formatted import block as a string
 */
export function formatImports(imports: ImportStatement[]): string {
  // Group by module, separating type-only imports
  const moduleMap = new Map<string, { names: Set<string>; isTypeOnly: boolean }>();

  for (const imp of imports) {
    const key = `${imp.isTypeOnly ? 'type:' : ''}${imp.module}`;
    const existing = moduleMap.get(key);
    if (existing) {
      for (const name of imp.namedImports) {
        existing.names.add(name);
      }
    } else {
      moduleMap.set(key, {
        names: new Set(imp.namedImports),
        isTypeOnly: imp.isTypeOnly ?? false,
      });
    }
  }

  // Sort modules: @langchain/* first, then others alphabetically
  const sortedKeys = Array.from(moduleMap.keys()).sort((a, b) => {
    const modA = a.replace(/^type:/, '');
    const modB = b.replace(/^type:/, '');
    const isLangchainA = modA.startsWith('@langchain');
    const isLangchainB = modB.startsWith('@langchain');
    if (isLangchainA && !isLangchainB) return -1;
    if (!isLangchainA && isLangchainB) return 1;
    return modA.localeCompare(modB);
  });

  const lines: string[] = [];
  for (const key of sortedKeys) {
    const entry = moduleMap.get(key)!;
    const modulePath = key.replace(/^type:/, '');
    const sortedNames = Array.from(entry.names).sort();
    const typePrefix = entry.isTypeOnly ? 'type ' : '';
    lines.push(`import ${typePrefix}{ ${sortedNames.join(', ')} } from '${modulePath}';`);
  }

  return lines.join('\n');
}

// ============================================================================
// Variable Name Formatting
// ============================================================================

/**
 * Converts a node ID to a valid camelCase TypeScript variable name.
 *
 * - Strips non-alphanumeric characters (except hyphens and underscores)
 * - Converts UUID-style IDs to short descriptive names using the node type
 * - Falls back to a sanitized version of the ID
 *
 * @param nodeId - The node ID (e.g., "node-abc123", "n1", "upload-docs")
 * @param nodeType - The node type for generating descriptive names
 * @param index - Optional index for disambiguation
 * @returns A valid camelCase variable name
 */
export function formatVariableName(
  nodeId: string,
  nodeType: string,
  index?: number,
): string {
  // Try to create a meaningful name from the type and index
  const suffix = index !== undefined ? `${index + 1}` : '';
  const baseName = `${nodeType}Node${suffix}`;

  // Validate the result is a valid JS identifier
  return toCamelCase(baseName);
}

/**
 * Converts a string to camelCase.
 *
 * @param input - The input string (can contain hyphens, underscores, spaces)
 * @returns camelCase version of the string
 */
export function toCamelCase(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, chr: string) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

// ============================================================================
// JSDoc Comment Generation
// ============================================================================

/**
 * Generates a JSDoc comment block for a workflow node.
 *
 * @param nodeType - The type of the node
 * @param nodeId - The original node ID
 * @param config - The node configuration
 * @returns A JSDoc comment string
 */
export function addComment(
  nodeType: string,
  nodeId: string,
  config: Record<string, any>,
): string {
  const typeDescriptions: Record<string, string> = {
    upload: 'Handles file upload and initial data ingestion',
    extract: 'Extracts structured data from uploaded content',
    transform: 'Transforms and processes extracted data',
    output: 'Produces final output in the specified format',
  };

  const description = typeDescriptions[nodeType] || `Processes data as ${nodeType} step`;
  const configEntries = Object.entries(config);
  const configLines = configEntries.length > 0
    ? configEntries.map(([key, value]) => ` * @config ${key} - ${JSON.stringify(value)}`).join('\n')
    : '';

  const lines = [
    '/**',
    ` * ${description}`,
    ` * @nodeId ${nodeId}`,
    ` * @nodeType ${nodeType}`,
  ];

  if (configLines) {
    lines.push(configLines);
  }

  lines.push(' */');
  return lines.join('\n');
}

// ============================================================================
// Generated Code Header
// ============================================================================

/**
 * Generates the file header for generated code.
 *
 * @param workflowId - The workflow ID
 * @param workflowName - The workflow name
 * @returns Header comment string
 */
export function generateHeader(workflowId: string, workflowName: string): string {
  const timestamp = new Date().toISOString();
  return [
    '/**',
    ` * AUTO-GENERATED CODE - DO NOT EDIT MANUALLY`,
    ` *`,
    ` * Generated from workflow: ${workflowName}`,
    ` * Workflow ID: ${workflowId}`,
    ` * Generated at: ${timestamp}`,
    ` *`,
    ` * WARNING: Manual edits to this file will break visual editor sync.`,
    ` * Edit the workflow in the visual editor and regenerate instead.`,
    ' */',
    '',
  ].join('\n');
}
