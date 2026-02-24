/**
 * @module codegen/nodeTemplates
 * @description Template functions for generating TypeScript code for each
 * workflow node type.
 *
 * Each generator function accepts a variable name, node configuration, and
 * returns a TypeScript code string that sets up and executes the
 * corresponding LangChain operation.
 *
 * Node types:
 * - **upload**: Data ingestion / file upload step
 * - **extract**: Data extraction / parsing step (LLM-powered)
 * - **transform**: Data transformation / manipulation step (LLM-powered)
 * - **output**: Final output / export step
 */

import type { WorkflowNode } from '../types/workflow.js';
import type { ParsedImport } from './codeFormatting.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of generating code for a single node.
 */
export interface NodeCodeResult {
  /** TypeScript code block for this node */
  code: string;
  /** Import statements required by this node */
  imports: ParsedImport[];
  /** The variable name that holds this node's output */
  outputVariable: string;
}

// ============================================================================
// Upload Node
// ============================================================================

/**
 * Generate code for an upload (data ingestion) node.
 *
 * Produces a `RunnableLambda` that reads input data and passes it
 * through. The upload step is the entry point of the chain.
 *
 * @param variableName - Unique variable name for this node
 * @param node - The workflow node definition
 * @returns Generated code, imports, and output variable
 */
export function generateUploadNode(
  variableName: string,
  node: WorkflowNode,
): NodeCodeResult {
  const label = (node.metadata?.label as string) || 'Upload';
  const source = (node.config?.source as string) || 'input';
  const format = (node.config?.format as string) || 'text';

  const imports: ParsedImport[] = [
    {
      module: '@langchain/core/runnables',
      namedExports: ['RunnableLambda'],
      isTypeImport: false,
    },
  ];

  const code = `// Upload Node: ${label}
const ${variableName} = new RunnableLambda({
  func: async (input: string) => {
    console.log("[${label}] Ingesting data from source: ${source} (format: ${format})");
    try {
      // Pass input data through for the next stage
      return input;
    } catch (error) {
      console.error("[${label}] Upload failed:", error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  },
});`;

  return {
    code,
    imports,
    outputVariable: variableName,
  };
}

// ============================================================================
// Extract Node
// ============================================================================

/**
 * Generate code for an extract (data extraction / parsing) node.
 *
 * Uses an LLM call to extract structured information from the
 * incoming data based on the node's configuration.
 *
 * @param variableName - Unique variable name for this node
 * @param node - The workflow node definition
 * @returns Generated code, imports, and output variable
 */
export function generateExtractNode(
  variableName: string,
  node: WorkflowNode,
): NodeCodeResult {
  const label = (node.metadata?.label as string) || 'Extract';
  const format = (node.config?.format as string) || 'text';
  const prompt = (node.config?.prompt as string) ||
    `Extract and structure the following data (format: ${format}):`;

  const imports: ParsedImport[] = [
    {
      module: '@langchain/core/prompts',
      namedExports: ['ChatPromptTemplate'],
      isTypeImport: false,
    },
    {
      module: '@langchain/core/output_parsers',
      namedExports: ['StringOutputParser'],
      isTypeImport: false,
    },
  ];

  // Escape backticks and dollar signs in the prompt for template literal safety
  const safePrompt = prompt.replace(/`/g, '\\`').replace(/\$/g, '\\$');

  const code = `// Extract Node: ${label}
const ${variableName}Prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a data extraction assistant. Extract structured information from the provided input."],
  ["human", \`${safePrompt}\\n\\nInput data:\\n{input}\`],
]);
const ${variableName} = ${variableName}Prompt
  .pipe(llm)
  .pipe(new StringOutputParser());`;

  return {
    code,
    imports,
    outputVariable: variableName,
  };
}

// ============================================================================
// Transform Node
// ============================================================================

/**
 * Generate code for a transform (data manipulation) node.
 *
 * Uses an LLM call to transform data according to the node's
 * configuration (e.g. summarise, reformat, filter, enrich).
 *
 * @param variableName - Unique variable name for this node
 * @param node - The workflow node definition
 * @returns Generated code, imports, and output variable
 */
export function generateTransformNode(
  variableName: string,
  node: WorkflowNode,
): NodeCodeResult {
  const label = (node.metadata?.label as string) || 'Transform';
  const operation = (node.config?.operation as string) || 'transform';
  const prompt = (node.config?.prompt as string) ||
    `Apply the following transformation (${operation}) to the input data:`;

  const imports: ParsedImport[] = [
    {
      module: '@langchain/core/prompts',
      namedExports: ['ChatPromptTemplate'],
      isTypeImport: false,
    },
    {
      module: '@langchain/core/output_parsers',
      namedExports: ['StringOutputParser'],
      isTypeImport: false,
    },
  ];

  const safePrompt = prompt.replace(/`/g, '\\`').replace(/\$/g, '\\$');

  const code = `// Transform Node: ${label}
const ${variableName}Prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a data transformation assistant. Transform the input data according to the instructions."],
  ["human", \`${safePrompt}\\n\\nInput data:\\n{input}\`],
]);
const ${variableName} = ${variableName}Prompt
  .pipe(llm)
  .pipe(new StringOutputParser());`;

  return {
    code,
    imports,
    outputVariable: variableName,
  };
}

// ============================================================================
// Output Node
// ============================================================================

/**
 * Generate code for an output (export / final step) node.
 *
 * Produces a `RunnableLambda` that captures the final result,
 * logs it, and returns it.
 *
 * @param variableName - Unique variable name for this node
 * @param node - The workflow node definition
 * @returns Generated code, imports, and output variable
 */
export function generateOutputNode(
  variableName: string,
  node: WorkflowNode,
): NodeCodeResult {
  const label = (node.metadata?.label as string) || 'Output';
  const destination = (node.config?.destination as string) || 'stdout';
  const format = (node.config?.format as string) || 'text';

  const imports: ParsedImport[] = [
    {
      module: '@langchain/core/runnables',
      namedExports: ['RunnableLambda'],
      isTypeImport: false,
    },
  ];

  const code = `// Output Node: ${label}
const ${variableName} = new RunnableLambda({
  func: async (input: string) => {
    console.log("[${label}] Writing output to: ${destination} (format: ${format})");
    try {
      // Capture and return the final result
      console.log("[${label}] Output received:", typeof input === "string" ? input.substring(0, 200) + "..." : input);
      return input;
    } catch (error) {
      console.error("[${label}] Output failed:", error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  },
});`;

  return {
    code,
    imports,
    outputVariable: variableName,
  };
}

// ============================================================================
// Node Template Dispatch
// ============================================================================

/**
 * Map of node types to their template generator functions.
 */
export const nodeTemplateMap: Record<
  string,
  (variableName: string, node: WorkflowNode) => NodeCodeResult
> = {
  upload: generateUploadNode,
  extract: generateExtractNode,
  transform: generateTransformNode,
  output: generateOutputNode,
};

/**
 * Generate code for any node type by dispatching to the correct template.
 *
 * @param variableName - Unique variable name for this node
 * @param node - The workflow node definition
 * @returns Generated code, imports, and output variable
 * @throws Error if the node type is unsupported
 */
export function generateNodeCode(
  variableName: string,
  node: WorkflowNode,
): NodeCodeResult {
  const generator = nodeTemplateMap[node.type];
  if (!generator) {
    throw new Error(
      `Unsupported workflow node type: "${node.type}". ` +
      `Supported types: ${Object.keys(nodeTemplateMap).join(', ')}`,
    );
  }
  return generator(variableName, node);
}
