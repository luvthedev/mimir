/**
 * @module codegen/nodeTemplates
 * @description Template functions for generating LangChain TypeScript code
 * for each workflow node type.
 *
 * Each generator function accepts a variable name and node configuration,
 * returning a TypeScript code string that can be assembled into a full chain.
 */

import type { WorkflowNode } from '../types/workflow.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a node template generation, including the code body
 * and any imports it requires.
 */
export interface NodeTemplateResult {
  /** Import statements required by this node's generated code */
  imports: string[];
  /** The TypeScript code body for this node */
  code: string;
  /** The variable name that holds this node's output */
  outputVariable: string;
}

// ============================================================================
// Upload Node
// ============================================================================

/**
 * Generate TypeScript code for an upload / data-ingestion node.
 *
 * Produces code that reads a file and converts it to a LangChain Document.
 *
 * @param varName - camelCase variable name for this node
 * @param node - The workflow node definition
 * @returns Generated code with imports
 */
export function generateUploadNode(
  varName: string,
  node: WorkflowNode
): NodeTemplateResult {
  const config = node.config ?? {};
  const source: string = config.source ?? 'file';
  const format: string = config.format ?? 'text';
  const filePath: string = config.filePath ?? './input';

  const imports = [
    'import { Document } from "@langchain/core/documents";',
    'import * as fs from "node:fs/promises";',
  ];

  const code = `
/**
 * Upload node: ${node.metadata?.label ?? varName}
 * Source: ${source} | Format: ${format}
 */
const ${varName}Run = async (): Promise<Document[]> => {
  try {
    console.log("[${varName}] Reading input from ${source}...");
    const raw = await fs.readFile(${JSON.stringify(filePath)}, "utf-8");
    const doc = new Document({
      pageContent: raw,
      metadata: {
        source: ${JSON.stringify(source)},
        format: ${JSON.stringify(format)},
        nodeId: ${JSON.stringify(node.id)},
      },
    });
    console.log("[${varName}] Loaded document (" + raw.length + " chars)");
    return [doc];
  } catch (error) {
    console.error("[${varName}] Upload failed:", error);
    throw error;
  }
};
const ${varName}Output = await ${varName}Run();`;

  return { imports, code, outputVariable: `${varName}Output` };
}

// ============================================================================
// Extract Node
// ============================================================================

/**
 * Generate TypeScript code for a data-extraction node.
 *
 * Uses a LangChain LLM to extract structured information from documents.
 *
 * @param varName - camelCase variable name for this node
 * @param node - The workflow node definition
 * @param inputVariable - Variable name holding input data from previous node
 * @returns Generated code with imports
 */
export function generateExtractNode(
  varName: string,
  node: WorkflowNode,
  inputVariable?: string
): NodeTemplateResult {
  const config = node.config ?? {};
  const extractionPrompt: string =
    config.prompt ?? 'Extract the key information from the following text.';
  const model: string = config.model ?? 'gpt-4';

  const imports = [
    'import { ChatOpenAI } from "@langchain/openai";',
    'import { HumanMessage, SystemMessage } from "@langchain/core/messages";',
  ];

  const inputRef = inputVariable
    ? `${inputVariable}.map((d: any) => d.pageContent).join("\\n")`
    : '"(no input)"';

  const code = `
/**
 * Extract node: ${node.metadata?.label ?? varName}
 * Model: ${model}
 */
const ${varName}Run = async (input: string): Promise<string> => {
  try {
    console.log("[${varName}] Extracting with ${model}...");
    const llm = new ChatOpenAI({ modelName: ${JSON.stringify(model)}, temperature: 0 });
    const response = await llm.invoke([
      new SystemMessage(${JSON.stringify(extractionPrompt)}),
      new HumanMessage(input),
    ]);
    const result = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
    console.log("[${varName}] Extraction complete (" + result.length + " chars)");
    return result;
  } catch (error) {
    console.error("[${varName}] Extraction failed:", error);
    throw error;
  }
};
const ${varName}Output = await ${varName}Run(${inputRef});`;

  return { imports, code, outputVariable: `${varName}Output` };
}

// ============================================================================
// Transform Node
// ============================================================================

/**
 * Generate TypeScript code for a data-transformation node.
 *
 * Uses a LangChain LLM to transform or process data according to a prompt.
 *
 * @param varName - camelCase variable name for this node
 * @param node - The workflow node definition
 * @param inputVariable - Variable name holding input data from previous node
 * @returns Generated code with imports
 */
export function generateTransformNode(
  varName: string,
  node: WorkflowNode,
  inputVariable?: string
): NodeTemplateResult {
  const config = node.config ?? {};
  const transformPrompt: string =
    config.prompt ?? 'Transform the following data as instructed.';
  const model: string = config.model ?? 'gpt-4';
  const outputFormat: string = config.outputFormat ?? 'text';

  const imports = [
    'import { ChatOpenAI } from "@langchain/openai";',
    'import { HumanMessage, SystemMessage } from "@langchain/core/messages";',
  ];

  const inputRef = inputVariable ?? '"(no input)"';

  const code = `
/**
 * Transform node: ${node.metadata?.label ?? varName}
 * Model: ${model} | Output format: ${outputFormat}
 */
const ${varName}Run = async (input: string): Promise<string> => {
  try {
    console.log("[${varName}] Transforming with ${model}...");
    const llm = new ChatOpenAI({ modelName: ${JSON.stringify(model)}, temperature: 0 });
    const response = await llm.invoke([
      new SystemMessage(${JSON.stringify(transformPrompt)}),
      new HumanMessage(input),
    ]);
    const result = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
    console.log("[${varName}] Transform complete (" + result.length + " chars)");
    return result;
  } catch (error) {
    console.error("[${varName}] Transform failed:", error);
    throw error;
  }
};
const ${varName}Output = await ${varName}Run(${inputRef});`;

  return { imports, code, outputVariable: `${varName}Output` };
}

// ============================================================================
// Output Node
// ============================================================================

/**
 * Generate TypeScript code for an output / export node.
 *
 * Writes the final result to a file or stdout.
 *
 * @param varName - camelCase variable name for this node
 * @param node - The workflow node definition
 * @param inputVariable - Variable name holding input data from previous node
 * @returns Generated code with imports
 */
export function generateOutputNode(
  varName: string,
  node: WorkflowNode,
  inputVariable?: string
): NodeTemplateResult {
  const config = node.config ?? {};
  const destination: string = config.destination ?? 'file';
  const filePath: string = config.filePath ?? './output.txt';
  const format: string = config.format ?? 'text';

  const imports = ['import * as fs from "node:fs/promises";'];

  const inputRef = inputVariable ?? '"(no input)"';

  const code = `
/**
 * Output node: ${node.metadata?.label ?? varName}
 * Destination: ${destination} | Format: ${format}
 */
const ${varName}Run = async (input: string): Promise<void> => {
  try {
    console.log("[${varName}] Writing output to ${destination}...");
    const output = ${format === 'json' ? 'JSON.stringify(JSON.parse(input), null, 2)' : 'input'};
    ${
      destination === 'stdout'
        ? 'console.log(output);'
        : `await fs.writeFile(${JSON.stringify(filePath)}, output, "utf-8");
    console.log("[${varName}] Output written to ${filePath}");`
    }
  } catch (error) {
    console.error("[${varName}] Output failed:", error);
    throw error;
  }
};
await ${varName}Run(${inputRef});`;

  return {
    imports,
    code,
    outputVariable: `${varName}Output`,
  };
}

// ============================================================================
// Template Dispatcher
// ============================================================================

/** Map of node type to its template generator */
const templateGenerators: Record<
  string,
  (
    varName: string,
    node: WorkflowNode,
    inputVariable?: string
  ) => NodeTemplateResult
> = {
  upload: generateUploadNode,
  extract: generateExtractNode,
  transform: generateTransformNode,
  output: generateOutputNode,
};

/**
 * Generate code for any workflow node type.
 *
 * Dispatches to the appropriate template generator based on node.type.
 *
 * @param varName - camelCase variable name for this node
 * @param node - The workflow node definition
 * @param inputVariable - Variable name holding input data from previous node
 * @returns Generated code with imports
 * @throws {Error} If the node type is not supported
 */
export function generateNodeCode(
  varName: string,
  node: WorkflowNode,
  inputVariable?: string
): NodeTemplateResult {
  const generator = templateGenerators[node.type];
  if (!generator) {
    throw new Error(
      `Unsupported workflow node type: "${node.type}". ` +
        `Supported types: ${Object.keys(templateGenerators).join(', ')}`
    );
  }
  return generator(varName, node, inputVariable);
}
