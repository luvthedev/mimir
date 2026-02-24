/**
 * @module components/workflow/ExportDialog
 * @description Modal dialog for exporting generated workflow code.
 *
 * Provides options for:
 * - Export format: single TypeScript file, npm package, or GitHub Gist
 * - Include dependencies listing
 * - Include test scaffolding
 * - Custom package name (for npm package format)
 *
 * Handles file download via Blob/URL.createObjectURL for single-file exports
 * and generates a ZIP-like structure for package exports.
 */

import { useState, useCallback, useRef } from 'react';
import {
  X,
  Download,
  Package,
  Github,
  FileCode2,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import type { EditorNode, EditorConnection } from '../../types/workflow';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'single-file' | 'npm-package' | 'github-gist';

export interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: EditorNode[];
  connections: EditorConnection[];
  workflowName?: string;
  isValid: boolean;
  validationErrors: string[];
}

interface ExportHistoryEntry {
  timestamp: string;
  format: ExportFormat;
  filename: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a kebab-case filename from a workflow name + date.
 */
function generateFilename(name: string, ext: string): string {
  const sanitized =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workflow';
  const date = new Date().toISOString().split('T')[0];
  return `${sanitized}-${date}.${ext}`;
}

/**
 * Sanitize a string into a valid npm package name.
 */
function sanitizePackageName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-') || 'mimir-workflow'
  );
}

/**
 * Trigger a browser file download from a string content.
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

/**
 * Collect dependencies based on node types.
 */
function collectDependencies(nodes: EditorNode[]): Record<string, string> {
  const deps: Record<string, string> = {
    '@langchain/core': '^1.0.0',
  };
  const usesLLM = nodes.some((n) => n.type === 'extract' || n.type === 'transform');
  if (usesLLM) {
    deps['@langchain/openai'] = '^1.0.0';
  }
  return deps;
}

/**
 * Generate a dependency comment header.
 */
function generateDependencyComment(deps: Record<string, string>): string {
  const lines = [
    '// ============================================================================',
    '// Required Dependencies',
    '// ============================================================================',
    '//',
    '// Install these packages before running:',
    '//',
    '//   npm install \\',
  ];
  const entries = Object.entries(deps);
  entries.forEach(([name, version], i) => {
    const sep = i < entries.length - 1 ? ' \\' : '';
    lines.push(`//     ${name}@${version.replace('^', '')}${sep}`);
  });
  lines.push('//');
  lines.push('// ============================================================================');
  return lines.join('\n');
}

/**
 * Generate package.json content.
 */
function generatePackageJson(
  packageName: string,
  workflowName: string,
  usesLLM: boolean,
  includeTests: boolean,
): string {
  const deps: Record<string, string> = { '@langchain/core': '^1.0.0' };
  if (usesLLM) deps['@langchain/openai'] = '^1.0.0';

  const devDeps: Record<string, string> = {
    typescript: '^5.6.0',
    '@types/node': '^22.0.0',
    tsx: '^4.19.0',
  };
  if (includeTests) devDeps['vitest'] = '^3.2.0';

  const scripts: Record<string, string> = { build: 'tsc', start: 'tsx src/index.ts' };
  if (includeTests) {
    scripts['test'] = 'vitest run';
    scripts['test:watch'] = 'vitest';
  }

  return JSON.stringify(
    {
      name: packageName,
      version: '1.0.0',
      description: `Generated LangChain workflow: ${workflowName}`,
      type: 'module',
      main: 'build/index.js',
      scripts,
      dependencies: deps,
      devDependencies: devDeps,
      engines: { node: '>=22' },
    },
    null,
    2,
  );
}

/**
 * Generate tsconfig.json content.
 */
function generateTsConfigContent(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2022'],
        outDir: './build',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'build'],
    },
    null,
    2,
  );
}

/**
 * Generate README.md content.
 */
function generateReadmeContent(
  workflowName: string,
  _packageName: string,
  usesLLM: boolean,
  nodeTypes: string[],
): string {
  const envBlock = usesLLM
    ? `\n## Environment Variables\n\n| Variable | Description | Required |\n|----------|-------------|----------|\n| \`OPENAI_API_KEY\` | OpenAI API key | Yes |\n| \`MIMIR_DEFAULT_MODEL\` | LLM model (default: gpt-4-turbo) | No |\n`
    : '';

  const nodeList = nodeTypes
    .map((t) => `- **${t.charAt(0).toUpperCase() + t.slice(1)}**`)
    .join('\n');

  return `# ${workflowName}

Auto-generated LangChain workflow package.

## Quick Start

\`\`\`bash
npm install
npm start
\`\`\`
${envBlock}
## Workflow Nodes

${nodeList}

## Programmatic Usage

\`\`\`typescript
import { runWorkflow } from './src/index.js';
const result = await runWorkflow('your input data');
\`\`\`
`;
}

/**
 * Generate a test scaffold.
 */
function generateTestFile(workflowName: string): string {
  return `import { describe, it, expect } from 'vitest';
import { runWorkflow } from '../index.js';

describe('${workflowName}', () => {
  it('should export the runWorkflow function', () => {
    expect(typeof runWorkflow).toBe('function');
  });

  it('should execute the workflow with sample input', async () => {
    // TODO: Provide actual test input and uncomment:
    // const result = await runWorkflow('sample input');
    // expect(result).toBeDefined();
    expect(true).toBe(true);
  });
});
`;
}

// ============================================================================
// Inline Code Generator (frontend-only, mirrors backend CodeGenerator)
// ============================================================================

/**
 * Lightweight code generator that runs entirely in the browser.
 * Mirrors the backend CodeGenerator logic so exports work without
 * a backend round-trip.
 */
function generateWorkflowCode(
  nodes: EditorNode[],
  connections: EditorConnection[],
  workflowName: string,
): string {
  // Topological sort via Kahn's algorithm
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }
  for (const c of connections) {
    adjacency.get(c.sourceNodeId)?.push(c.targetNodeId);
    inDegree.set(c.targetNodeId, (inDegree.get(c.targetNodeId) ?? 0) + 1);
  }

  const queue = [...inDegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
    .sort();

  const sorted: EditorNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);
    const neighbors = [...(adjacency.get(id) ?? [])].sort();
    for (const nb of neighbors) {
      const nd = (inDegree.get(nb) ?? 1) - 1;
      inDegree.set(nb, nd);
      if (nd === 0) queue.push(nb);
    }
  }

  // Variable names
  const varMap = new Map<string, string>();
  const used = new Set<string>();
  sorted.forEach((node) => {
    const parts = node.id.split(/[-_\s.]+/).filter((p) => p.length > 0).slice(0, 3);
    const camel = parts.map((p, j) =>
      j === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
    ).join('');
    let name = `${node.type}${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
    if (/^\d/.test(name)) name = `node${name}`;
    let candidate = name;
    let attempt = 0;
    while (used.has(candidate)) {
      attempt++;
      candidate = `${name}${attempt}`;
    }
    used.add(candidate);
    varMap.set(node.id, candidate);
  });

  const usesLLM = sorted.some((n) => n.type === 'extract' || n.type === 'transform');

  // Imports
  const importMap = new Map<string, Set<string>>();
  const addImport = (mod: string, name: string) => {
    if (!importMap.has(mod)) importMap.set(mod, new Set());
    importMap.get(mod)!.add(name);
  };

  // Node code
  const nodeBlocks: string[] = [];
  for (const node of sorted) {
    const v = varMap.get(node.id)!;
    const label = (node.metadata?.label as string) || node.type;
    const config = node.config ?? {};

    // JSDoc
    const typeLabel = node.type.charAt(0).toUpperCase() + node.type.slice(1);
    const configStr = Object.keys(config).length > 0 ? JSON.stringify(config) : 'none';
    nodeBlocks.push(`/**\n * ${typeLabel} Node: ${label}\n *\n * Type: ${node.type}\n * Config: ${configStr}\n */`);

    if (node.type === 'upload') {
      addImport('@langchain/core/runnables', 'RunnableLambda');
      const source = (config.source as string) || 'input';
      const fmt = (config.format as string) || 'text';
      nodeBlocks.push(`const ${v} = new RunnableLambda({\n  func: async (input: string) => {\n    console.log("[${label}] Ingesting data from source: ${source} (format: ${fmt})");\n    return input;\n  },\n});`);
    } else if (node.type === 'extract') {
      addImport('@langchain/core/prompts', 'ChatPromptTemplate');
      addImport('@langchain/core/output_parsers', 'StringOutputParser');
      const fmt = (config.format as string) || 'text';
      const prompt = ((config.prompt as string) || `Extract and structure the following data (format: ${fmt}):`).replace(/`/g, '\\`').replace(/\$/g, '\\$');
      nodeBlocks.push(`const ${v}Prompt = ChatPromptTemplate.fromMessages([\n  ["system", "You are a data extraction assistant. Extract structured information from the provided input."],\n  ["human", \`${prompt}\\n\\nInput data:\\n{input}\`],\n]);\nconst ${v} = ${v}Prompt\n  .pipe(llm)\n  .pipe(new StringOutputParser());`);
    } else if (node.type === 'transform') {
      addImport('@langchain/core/prompts', 'ChatPromptTemplate');
      addImport('@langchain/core/output_parsers', 'StringOutputParser');
      const op = (config.operation as string) || 'transform';
      const prompt = ((config.prompt as string) || `Apply the following transformation (${op}) to the input data:`).replace(/`/g, '\\`').replace(/\$/g, '\\$');
      nodeBlocks.push(`const ${v}Prompt = ChatPromptTemplate.fromMessages([\n  ["system", "You are a data transformation assistant. Transform the input data according to the instructions."],\n  ["human", \`${prompt}\\n\\nInput data:\\n{input}\`],\n]);\nconst ${v} = ${v}Prompt\n  .pipe(llm)\n  .pipe(new StringOutputParser());`);
    } else if (node.type === 'output') {
      addImport('@langchain/core/runnables', 'RunnableLambda');
      const dest = (config.destination as string) || 'stdout';
      const fmt = (config.format as string) || 'text';
      nodeBlocks.push(`const ${v} = new RunnableLambda({\n  func: async (input: string) => {\n    console.log("[${label}] Writing output to: ${dest} (format: ${fmt})");\n    console.log("[${label}] Output received:", typeof input === "string" ? input.substring(0, 200) + "..." : input);\n    return input;\n  },\n});`);
    }

    nodeBlocks.push('');
  }

  if (usesLLM) {
    addImport('@langchain/openai', 'ChatOpenAI');
  }

  // Chain assembly
  const isLinear =
    sorted.every((node) => {
      const outgoing = adjacency.get(node.id) ?? [];
      return outgoing.length <= 1;
    }) &&
    sorted.filter((n) => !connections.some((c) => c.targetNodeId === n.id)).length <= 1;

  let chainCode: string;
  if (sorted.length === 0) {
    addImport('@langchain/core/runnables', 'RunnableSequence');
    chainCode = '// No nodes to chain\nconst chain = RunnableSequence.from([]);';
  } else if (sorted.length === 1) {
    chainCode = `// Single-node chain\nconst chain = ${varMap.get(sorted[0].id)};`;
  } else if (isLinear) {
    addImport('@langchain/core/runnables', 'RunnableSequence');
    const names = sorted.map((n) => varMap.get(n.id)!);
    chainCode = `// Assemble the workflow chain\nconst chain = ${names[0]}\n  ${names.slice(1).map((v) => `.pipe(${v})`).join('\n  ')};`;
  } else {
    addImport('@langchain/core/runnables', 'RunnableSequence');
    const names = sorted.map((n) => varMap.get(n.id)!);
    chainCode = `// Assemble the workflow chain (sequence)\nconst chain = RunnableSequence.from([\n${names.map((v) => `    ${v},`).join('\n')}\n]);`;
  }

  // Format imports
  const sortedModules = [...importMap.keys()].sort();
  const importLines = sortedModules.map((mod) => {
    const exports = [...importMap.get(mod)!].sort();
    return `import { ${exports.join(', ')} } from "${mod}";`;
  });

  // LLM setup
  const llmSetup = usesLLM
    ? `// ============================================================================
// LLM Configuration
// ============================================================================

const llm = new ChatOpenAI({
  model: process.env.MIMIR_DEFAULT_MODEL || "gpt-4-turbo",
  temperature: 0,
  maxTokens: 4096,
});
`
    : '';

  // Header
  const timestamp = new Date().toISOString();
  const header = [
    '// ============================================================================',
    `// AUTO-GENERATED CODE - ${workflowName}`,
    '// ============================================================================',
    '//',
    `// Generated   : ${timestamp}`,
    '//',
    '// WARNING: Manual edits to this file will break synchronisation with the',
    '//          visual workflow editor. Make changes in the editor instead.',
    '// ============================================================================',
    '',
  ].join('\n');

  // Execution wrapper
  const executionWrapper = `
// ============================================================================
// Execute the workflow chain
// ============================================================================

export async function runWorkflow(input: string): Promise<string> {
  console.log("Starting workflow: ${workflowName}");
  const startTime = Date.now();

  try {
    const result = await chain.invoke(input);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(\`Workflow "${workflowName}" completed in \${duration}s\`);
    return result;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(\`Workflow "${workflowName}" failed after \${duration}s:\`, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}`;

  return [
    header,
    importLines.join('\n'),
    '',
    llmSetup,
    nodeBlocks.join('\n'),
    chainCode,
    executionWrapper,
    '',
  ]
    .filter((s) => s !== undefined)
    .join('\n');
}

// ============================================================================
// Component
// ============================================================================

export function ExportDialog({
  isOpen,
  onClose,
  nodes,
  connections,
  workflowName = 'Untitled Workflow',
  isValid,
  validationErrors,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('single-file');
  const [includeDeps, setIncludeDeps] = useState(true);
  const [includeTests, setIncludeTests] = useState(false);
  const [packageName, setPackageName] = useState(() =>
    sanitizePackageName(workflowName),
  );
  const [githubToken, setGithubToken] = useState('');
  const [gistPublic, setGistPublic] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    success: boolean;
    message: string;
    url?: string;
  } | null>(null);
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);

  const dialogRef = useRef<HTMLDivElement>(null);

  const canExport = isValid && nodes.length > 0 && !isExporting;

  const handleExport = useCallback(async () => {
    if (!canExport) return;

    setIsExporting(true);
    setExportResult(null);

    try {
      const code = generateWorkflowCode(nodes, connections, workflowName);
      const deps = collectDependencies(nodes);
      const usesLLM = nodes.some((n) => n.type === 'extract' || n.type === 'transform');
      const nodeTypes = [...new Set(nodes.map((n) => n.type))];

      if (format === 'single-file') {
        let content = code;
        if (includeDeps) {
          content = generateDependencyComment(deps) + '\n' + code;
        }
        const filename = generateFilename(workflowName, 'ts');
        downloadFile(content, filename, 'text/typescript');

        const entry: ExportHistoryEntry = {
          timestamp: new Date().toISOString(),
          format,
          filename,
        };
        setExportHistory((prev) => [...prev, entry]);
        setExportResult({
          success: true,
          message: `Downloaded ${filename}`,
        });
      } else if (format === 'npm-package') {
        const pkgName = sanitizePackageName(packageName || workflowName);

        // Build all package files
        const files: Array<{ path: string; content: string }> = [
          { path: 'package.json', content: generatePackageJson(pkgName, workflowName, usesLLM, includeTests) },
          { path: 'tsconfig.json', content: generateTsConfigContent() },
          {
            path: 'README.md',
            content: generateReadmeContent(workflowName, pkgName, usesLLM, nodeTypes),
          },
          { path: 'src/index.ts', content: code },
        ];
        if (includeTests) {
          files.push({
            path: 'src/__tests__/workflow.test.ts',
            content: generateTestFile(workflowName),
          });
        }
        if (usesLLM) {
          files.push({
            path: '.env.example',
            content:
              '# Required: OpenAI API Key\nOPENAI_API_KEY=your-api-key-here\n\n# Optional: Override default model\n# MIMIR_DEFAULT_MODEL=gpt-4-turbo\n',
          });
        }

        // Generate a combined text file with all package files
        // (ZIP requires a library; instead we create a single downloadable bundle)
        const separator = '\n// ' + '='.repeat(76) + '\n';
        const bundleContent = files
          .map((f) => `${'// FILE: ' + pkgName + '/' + f.path}\n${separator}\n${f.content}`)
          .join('\n\n');

        const filename = `${pkgName}-package.txt`;
        downloadFile(bundleContent, filename, 'text/plain');

        // Also download each file individually for immediate use
        for (const f of files) {
          const mimeType = f.path.endsWith('.json')
            ? 'application/json'
            : f.path.endsWith('.md')
              ? 'text/markdown'
              : 'text/typescript';
          downloadFile(f.content, `${pkgName}--${f.path.replace(/\//g, '--')}`, mimeType);
        }

        const entry: ExportHistoryEntry = {
          timestamp: new Date().toISOString(),
          format,
          filename: pkgName,
        };
        setExportHistory((prev) => [...prev, entry]);
        setExportResult({
          success: true,
          message: `Downloaded ${files.length} package files for "${pkgName}"`,
        });
      } else if (format === 'github-gist') {
        if (!githubToken.trim()) {
          setExportResult({
            success: false,
            message: 'GitHub personal access token is required.',
          });
          setIsExporting(false);
          return;
        }

        const depComment = generateDependencyComment(deps);
        const fullCode = depComment + '\n' + code;
        const filename = generateFilename(workflowName, 'ts');

        const response = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            description: `Mimir Workflow: ${workflowName} - Generated LangChain TypeScript code`,
            public: gistPublic,
            files: { [filename]: { content: fullCode } },
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
        }

        const gistData = (await response.json()) as {
          id: string;
          html_url: string;
        };

        const entry: ExportHistoryEntry = {
          timestamp: new Date().toISOString(),
          format,
          filename,
        };
        setExportHistory((prev) => [...prev, entry]);
        setExportResult({
          success: true,
          message: 'Gist created successfully!',
          url: gistData.html_url,
        });
      }
    } catch (error) {
      setExportResult({
        success: false,
        message: error instanceof Error ? error.message : 'Export failed.',
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    canExport,
    nodes,
    connections,
    workflowName,
    format,
    includeDeps,
    includeTests,
    packageName,
    githubToken,
    gistPublic,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-norse-shadow border border-norse-rune rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scroll-container"
        role="dialog"
        aria-modal="true"
        aria-label="Export Workflow"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-norse-rune">
          <div className="flex items-center space-x-2">
            <Download size={18} className="text-valhalla-gold" />
            <h2 className="text-lg font-semibold text-valhalla-gold">
              Export Workflow
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-norse-stone text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5">
          {/* Validation warning */}
          {!isValid && (
            <div className="flex items-start space-x-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle
                size={16}
                className="text-red-400 flex-shrink-0 mt-0.5"
              />
              <div>
                <p className="text-sm text-red-400 font-medium">
                  Workflow has validation errors
                </p>
                <ul className="mt-1 text-xs text-red-400/80 space-y-0.5">
                  {validationErrors.slice(0, 3).map((err, i) => (
                    <li key={i}>- {err}</li>
                  ))}
                  {validationErrors.length > 3 && (
                    <li>...and {validationErrors.length - 3} more</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {nodes.length === 0 && (
            <div className="flex items-start space-x-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle
                size={16}
                className="text-yellow-400 flex-shrink-0 mt-0.5"
              />
              <p className="text-sm text-yellow-400">
                Add at least one node to the workflow before exporting.
              </p>
            </div>
          )}

          {/* Export Format */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">
              Export Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                {
                  value: 'single-file' as ExportFormat,
                  icon: FileCode2,
                  label: 'Single File',
                  desc: '.ts file',
                },
                {
                  value: 'npm-package' as ExportFormat,
                  icon: Package,
                  label: 'npm Package',
                  desc: 'Full project',
                },
                {
                  value: 'github-gist' as ExportFormat,
                  icon: Github,
                  label: 'GitHub Gist',
                  desc: 'Share online',
                },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormat(opt.value)}
                  className={`flex flex-col items-center p-3 rounded-lg border transition-all text-center ${
                    format === opt.value
                      ? 'bg-valhalla-gold/10 border-valhalla-gold/50 text-valhalla-gold'
                      : 'bg-norse-stone border-norse-rune text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <opt.icon size={20} className="mb-1" />
                  <span className="text-xs font-medium">{opt.label}</span>
                  <span className="text-[10px] opacity-60">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {/* Include dependencies (for single-file) */}
            {format === 'single-file' && (
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDeps}
                  onChange={(e) => setIncludeDeps(e.target.checked)}
                  className="rounded border-norse-rune bg-norse-stone text-valhalla-gold focus:ring-valhalla-gold/50"
                />
                <span className="text-sm text-gray-300">
                  Include dependency installation instructions
                </span>
              </label>
            )}

            {/* Include tests */}
            {(format === 'npm-package' || format === 'single-file') && (
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTests}
                  onChange={(e) => setIncludeTests(e.target.checked)}
                  className="rounded border-norse-rune bg-norse-stone text-valhalla-gold focus:ring-valhalla-gold/50"
                />
                <span className="text-sm text-gray-300">
                  Include test scaffolding (Vitest)
                </span>
              </label>
            )}

            {/* Package name (for npm-package) */}
            {format === 'npm-package' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">
                  Package Name
                </label>
                <input
                  type="text"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  className="w-full px-3 py-2 bg-norse-stone border border-norse-rune rounded-lg text-sm text-gray-200 focus:border-valhalla-gold focus:outline-none transition-colors"
                  placeholder="my-workflow-package"
                />
              </div>
            )}

            {/* GitHub token (for gist) */}
            {format === 'github-gist' && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-medium">
                    GitHub Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="w-full px-3 py-2 bg-norse-stone border border-norse-rune rounded-lg text-sm text-gray-200 focus:border-valhalla-gold focus:outline-none transition-colors"
                    placeholder="ghp_..."
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Requires <code>gist</code> scope. Token is not stored.
                  </p>
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gistPublic}
                    onChange={(e) => setGistPublic(e.target.checked)}
                    className="rounded border-norse-rune bg-norse-stone text-valhalla-gold focus:ring-valhalla-gold/50"
                  />
                  <span className="text-sm text-gray-300">Make gist public</span>
                </label>
              </>
            )}
          </div>

          {/* Export result */}
          {exportResult && (
            <div
              className={`flex items-start space-x-2 p-3 rounded-lg border ${
                exportResult.success
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              {exportResult.success ? (
                <CheckCircle
                  size={16}
                  className="text-green-400 flex-shrink-0 mt-0.5"
                />
              ) : (
                <AlertTriangle
                  size={16}
                  className="text-red-400 flex-shrink-0 mt-0.5"
                />
              )}
              <div className="flex-1">
                <p
                  className={`text-sm ${
                    exportResult.success ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {exportResult.message}
                </p>
                {exportResult.url && (
                  <a
                    href={exportResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 text-xs text-valhalla-gold hover:underline mt-1"
                  >
                    <ExternalLink size={12} />
                    <span>Open Gist</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Export history */}
          {exportHistory.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium uppercase tracking-wider">
                Export History
              </label>
              <div className="bg-norse-stone rounded-lg border border-norse-rune divide-y divide-norse-rune max-h-32 overflow-y-auto scroll-container">
                {exportHistory.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      {entry.format === 'single-file' && (
                        <FileCode2 size={12} className="text-gray-500" />
                      )}
                      {entry.format === 'npm-package' && (
                        <Package size={12} className="text-gray-500" />
                      )}
                      {entry.format === 'github-gist' && (
                        <Github size={12} className="text-gray-500" />
                      )}
                      <span className="text-gray-300">{entry.filename}</span>
                    </div>
                    <span className="text-gray-500">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-norse-rune">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-norse-stone transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!canExport}
            className={`flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              canExport
                ? 'bg-valhalla-gold text-norse-night hover:bg-valhalla-gold/90 shadow-lg shadow-valhalla-gold/20'
                : 'bg-norse-rune text-gray-500 cursor-not-allowed'
            }`}
          >
            {isExporting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download size={14} />
                <span>Export</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
