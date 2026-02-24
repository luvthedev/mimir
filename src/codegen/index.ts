/**
 * @module codegen
 * @description Code generation system for converting visual workflows into
 * executable LangChain TypeScript code.
 *
 * Main entry point: {@link generateCode}
 *
 * @example
 * ```typescript
 * import { generateCode } from './codegen/index.js';
 *
 * const result = await generateCode(workflow);
 * if (result.success) {
 *   console.log(result.code);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */

// Main API
export { generateCode, validateWorkflow, topologicalSort } from './codeGenerator.js';
export type { CodeGenerationResult, ValidationResult } from './codeGenerator.js';

// Templates
export { generateNodeCode, generateUploadNode, generateExtractNode, generateTransformNode, generateOutputNode } from './nodeTemplates.js';
export type { NodeCodeBlock } from './nodeTemplates.js';

export { generateChain } from './chainTemplates.js';
export type { ChainGenerationResult } from './chainTemplates.js';

// Formatting utilities
export { formatImports, formatVariableName, toCamelCase, addComment, generateHeader } from './codeFormatting.js';
export type { ImportStatement } from './codeFormatting.js';
