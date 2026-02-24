/**
 * @module codegen
 * @description Code generation system for converting visual workflows
 * into executable LangChain TypeScript code.
 *
 * Main entry point:
 * - **CodeGenerator**: Service that validates and generates code from workflows
 *
 * Supporting modules:
 * - **nodeTemplates**: Template functions for each node type
 * - **chainTemplates**: Chain assembly code generation
 * - **codeFormatting**: Import dedup, variable naming, JSDoc comments
 *
 * @example
 * ```typescript
 * import { CodeGenerator } from './codegen/index.js';
 *
 * const generator = new CodeGenerator();
 * const code = await generator.generateCode(workflow);
 * ```
 */

export { CodeGenerator, WorkflowValidationError, CycleDetectedError } from './CodeGenerator.js';
export {
  generateUploadNode,
  generateExtractNode,
  generateTransformNode,
  generateOutputNode,
  generateNodeCode,
  nodeTemplateMap,
} from './nodeTemplates.js';
export type { NodeCodeResult } from './nodeTemplates.js';
export { generateChain, generateExecutionWrapper } from './chainTemplates.js';
export type { ChainCodeResult } from './chainTemplates.js';
export {
  formatImports,
  formatVariableName,
  addComments,
  generateHeader,
} from './codeFormatting.js';
export type { ParsedImport } from './codeFormatting.js';
export { CodeExporter } from './CodeExporter.js';
export type {
  ExportFormat,
  ExportOptions,
  FileExportResult,
  PackageFile,
  PackageExportResult,
  GistExportResult,
  ExportHistoryEntry,
} from './CodeExporter.js';
export {
  generatePackageJson,
  generateTsConfig,
  generateReadme,
  generateTestScaffold,
} from './packageTemplates.js';
export type { PackageTemplateOptions } from './packageTemplates.js';
