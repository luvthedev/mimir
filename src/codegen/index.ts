/**
 * @module codegen
 * @description Code generation system for converting visual workflows into
 * executable LangChain TypeScript code.
 *
 * Entry points:
 * - {@link CodeGenerator} - Main service class
 * - {@link generateChain} - Chain assembly from nodes and connections
 * - {@link generateNodeCode} - Single node code generation
 * - {@link topologicalSort} - Node ordering utility
 *
 * @example
 * ```typescript
 * import { CodeGenerator } from './codegen/index.js';
 *
 * const generator = new CodeGenerator();
 * const tsCode = await generator.generateCode(workflow);
 * ```
 */

// Main service
export { CodeGenerator, validateWorkflow } from './codeGenerator.js';
export type { ValidationError, ValidationResult } from './codeGenerator.js';

// Chain assembly
export { generateChain, topologicalSort } from './chainTemplates.js';

// Node templates
export {
  generateNodeCode,
  generateUploadNode,
  generateExtractNode,
  generateTransformNode,
  generateOutputNode,
} from './nodeTemplates.js';
export type { NodeTemplateResult } from './nodeTemplates.js';

// Formatting utilities
export {
  formatImports,
  formatVariableNames,
  addComments,
  generateFileHeader,
} from './codeFormatting.js';
