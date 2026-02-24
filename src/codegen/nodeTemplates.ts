/**
 * @module codegen/nodeTemplates
 * @description Template functions for generating TypeScript code for each workflow node type.
 *
 * Each function generates a self-contained code block for a specific node type,
 * including variable declarations, LangChain API calls, and error handling.
 */

import type { WorkflowNode } from '../types/workflow.js';
import { formatVariableName, addComment } from './codeFormatting.js';
import type { ImportStatement } from './codeFormatting.js';

// ============================================================================
// Types
// ============================================================================

export interface NodeCodeBlock {
  /** The generated TypeScript code for this node */
  code: string;
  /** Import statements required by this node */
  imports: ImportStatement[];
  /** The variable name that holds this node's output */
  outputVariable: string;
}

// ============================================================================
// Upload Node Template
// ============================================================================

/**
 * Generates code for an upload node.
 *
 * Upload nodes handle file ingestion using LangChain document loaders.
 * They accept file paths or URLs and produce Document objects.
 *
 * @param node - The workflow node definition
 * @param index - Index of this node among nodes of the same type
 * @returns Generated code block with imports
 */
export function generateUploadNode(node: WorkflowNode, index: number): NodeCodeBlock {
  const varName = formatVariableName(node.id, 'upload', index);
  const outputVar = `${varName}Result`;
  const acceptedFormats = node.config.acceptedFormats || ['pdf', 'csv', 'txt'];
  const sourcePath = node.config.sourcePath || './uploads';

  const comment = addComment('upload', node.id, node.config);

  const code = `${comment}
const ${varName}Loader = new TextLoader(${JSON.stringify(sourcePath)});
let ${outputVar}: Document[];
try {
  console.log('[${node.id}] Loading documents from ${sourcePath}...');
  ${outputVar} = await ${varName}Loader.load();
  console.log(\`[${node.id}] Loaded \${${outputVar}.length} documents\`);
} catch (error: any) {
  console.error('[${node.id}] Upload failed:', error.message);
  throw new Error(\`Upload node ${node.id} failed: \${error.message}\`);
}`;

  const imports: ImportStatement[] = [
    { module: '@langchain/core/documents', namedImports: ['Document'] },
    { module: 'langchain/document_loaders/fs/text', namedImports: ['TextLoader'] },
  ];

  return { code, imports, outputVariable: outputVar };
}

// ============================================================================
// Extract Node Template
// ============================================================================

/**
 * Generates code for an extract node.
 *
 * Extract nodes use LangChain LLM chains to extract structured data
 * from documents. They take Document[] input and produce parsed output.
 *
 * @param node - The workflow node definition
 * @param index - Index of this node among nodes of the same type
 * @param inputVariable - The variable name from the preceding node's output
 * @returns Generated code block with imports
 */
export function generateExtractNode(
  node: WorkflowNode,
  index: number,
  inputVariable: string,
): NodeCodeBlock {
  const varName = formatVariableName(node.id, 'extract', index);
  const outputVar = `${varName}Result`;
  const extractionPrompt = node.config.prompt || 'Extract the key information from the following text:';
  const modelName = node.config.model || 'gpt-4';

  const comment = addComment('extract', node.id, node.config);

  const code = `${comment}
const ${varName}Model = new ChatOpenAI({
  modelName: ${JSON.stringify(modelName)},
  temperature: 0,
});
const ${varName}Prompt = ChatPromptTemplate.fromMessages([
  ['system', ${JSON.stringify(extractionPrompt)}],
  ['human', '{input}'],
]);
const ${varName}Chain = ${varName}Prompt.pipe(${varName}Model).pipe(new StringOutputParser());
let ${outputVar}: string;
try {
  const inputText = Array.isArray(${inputVariable})
    ? ${inputVariable}.map((doc: any) => doc.pageContent || doc).join('\\n\\n')
    : String(${inputVariable});
  console.log('[${node.id}] Extracting data...');
  ${outputVar} = await ${varName}Chain.invoke({ input: inputText });
  console.log(\`[${node.id}] Extraction complete (\${${outputVar}.length} chars)\`);
} catch (error: any) {
  console.error('[${node.id}] Extraction failed:', error.message);
  throw new Error(\`Extract node ${node.id} failed: \${error.message}\`);
}`;

  const imports: ImportStatement[] = [
    { module: '@langchain/openai', namedImports: ['ChatOpenAI'] },
    { module: '@langchain/core/prompts', namedImports: ['ChatPromptTemplate'] },
    { module: '@langchain/core/output_parsers', namedImports: ['StringOutputParser'] },
  ];

  return { code, imports, outputVariable: outputVar };
}

// ============================================================================
// Transform Node Template
// ============================================================================

/**
 * Generates code for a transform node.
 *
 * Transform nodes apply data transformations using LangChain's
 * RunnableLambda for custom processing logic, or LLM-based transformation.
 *
 * @param node - The workflow node definition
 * @param index - Index of this node among nodes of the same type
 * @param inputVariable - The variable name from the preceding node's output
 * @returns Generated code block with imports
 */
export function generateTransformNode(
  node: WorkflowNode,
  index: number,
  inputVariable: string,
): NodeCodeBlock {
  const varName = formatVariableName(node.id, 'transform', index);
  const outputVar = `${varName}Result`;
  const transformPrompt = node.config.prompt || 'Transform the following data as instructed:';
  const operation = node.config.operation || 'llm';

  const comment = addComment('transform', node.id, node.config);

  let code: string;
  let imports: ImportStatement[];

  if (operation === 'custom' && node.config.expression) {
    // Custom transform using RunnableLambda
    code = `${comment}
const ${varName}Transform = RunnableLambda.from(async (input: any) => {
  console.log('[${node.id}] Applying custom transform...');
  const data = typeof input === 'string' ? input : JSON.stringify(input);
  return data;
});
let ${outputVar}: string;
try {
  ${outputVar} = await ${varName}Transform.invoke(${inputVariable});
  console.log(\`[${node.id}] Transform complete (\${${outputVar}.length} chars)\`);
} catch (error: any) {
  console.error('[${node.id}] Transform failed:', error.message);
  throw new Error(\`Transform node ${node.id} failed: \${error.message}\`);
}`;

    imports = [
      { module: '@langchain/core/runnables', namedImports: ['RunnableLambda'] },
    ];
  } else {
    // LLM-based transform
    code = `${comment}
const ${varName}Model = new ChatOpenAI({
  modelName: ${JSON.stringify(node.config.model || 'gpt-4')},
  temperature: ${node.config.temperature ?? 0},
});
const ${varName}Prompt = ChatPromptTemplate.fromMessages([
  ['system', ${JSON.stringify(transformPrompt)}],
  ['human', '{input}'],
]);
const ${varName}Chain = ${varName}Prompt.pipe(${varName}Model).pipe(new StringOutputParser());
let ${outputVar}: string;
try {
  const inputText = typeof ${inputVariable} === 'string'
    ? ${inputVariable}
    : JSON.stringify(${inputVariable});
  console.log('[${node.id}] Transforming data...');
  ${outputVar} = await ${varName}Chain.invoke({ input: inputText });
  console.log(\`[${node.id}] Transform complete (\${${outputVar}.length} chars)\`);
} catch (error: any) {
  console.error('[${node.id}] Transform failed:', error.message);
  throw new Error(\`Transform node ${node.id} failed: \${error.message}\`);
}`;

    imports = [
      { module: '@langchain/openai', namedImports: ['ChatOpenAI'] },
      { module: '@langchain/core/prompts', namedImports: ['ChatPromptTemplate'] },
      { module: '@langchain/core/output_parsers', namedImports: ['StringOutputParser'] },
    ];
  }

  return { code, imports, outputVariable: outputVar };
}

// ============================================================================
// Output Node Template
// ============================================================================

/**
 * Generates code for an output node.
 *
 * Output nodes handle the final output of the workflow, writing results
 * to files, console, or returning structured data.
 *
 * @param node - The workflow node definition
 * @param index - Index of this node among nodes of the same type
 * @param inputVariable - The variable name from the preceding node's output
 * @returns Generated code block with imports
 */
export function generateOutputNode(
  node: WorkflowNode,
  index: number,
  inputVariable: string,
): NodeCodeBlock {
  const varName = formatVariableName(node.id, 'output', index);
  const outputVar = `${varName}Result`;
  const format = node.config.format || 'json';
  const destination = node.config.destination || 'console';

  const comment = addComment('output', node.id, node.config);

  let outputCode: string;
  if (destination === 'file') {
    const filePath = node.config.filePath || './output/result';
    outputCode = `  await fs.writeFile(
    ${JSON.stringify(filePath)},
    typeof formattedOutput === 'string' ? formattedOutput : JSON.stringify(formattedOutput, null, 2),
    'utf-8'
  );
  console.log(\`[${node.id}] Output written to ${filePath}\`);`;
  } else {
    outputCode = `  console.log('[${node.id}] Output:', typeof formattedOutput === 'string' ? formattedOutput : JSON.stringify(formattedOutput, null, 2));`;
  }

  const code = `${comment}
let ${outputVar}: any;
try {
  console.log('[${node.id}] Preparing ${format} output...');
  let formattedOutput: any;
  if (${JSON.stringify(format)} === 'json') {
    formattedOutput = typeof ${inputVariable} === 'string'
      ? JSON.parse(${inputVariable})
      : ${inputVariable};
  } else {
    formattedOutput = String(${inputVariable});
  }
${outputCode}
  ${outputVar} = formattedOutput;
  console.log('[${node.id}] Output complete');
} catch (error: any) {
  console.error('[${node.id}] Output failed:', error.message);
  throw new Error(\`Output node ${node.id} failed: \${error.message}\`);
}`;

  const imports: ImportStatement[] = [];
  if (destination === 'file') {
    imports.push({ module: 'fs/promises', namedImports: ['writeFile as fsWriteFile'] });
  }

  return { code, imports, outputVariable: outputVar };
}

// ============================================================================
// Node Template Dispatcher
// ============================================================================

/**
 * Generates code for any node type by dispatching to the appropriate template function.
 *
 * @param node - The workflow node definition
 * @param index - Index of this node among nodes of the same type
 * @param inputVariable - The variable name from the preceding node's output (empty for upload nodes)
 * @returns Generated code block with imports
 */
export function generateNodeCode(
  node: WorkflowNode,
  index: number,
  inputVariable: string,
): NodeCodeBlock {
  switch (node.type) {
    case 'upload':
      return generateUploadNode(node, index);
    case 'extract':
      return generateExtractNode(node, index, inputVariable);
    case 'transform':
      return generateTransformNode(node, index, inputVariable);
    case 'output':
      return generateOutputNode(node, index, inputVariable);
    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}
