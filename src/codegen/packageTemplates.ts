/**
 * @module codegen/packageTemplates
 * @description Template generators for npm package scaffolding when exporting
 * generated workflow code as a standalone package.
 *
 * Provides functions to generate:
 * - **package.json**: With LangChain and required dependencies
 * - **tsconfig.json**: Strict TypeScript settings for standalone execution
 * - **README.md**: Documents the generated workflow and usage instructions
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Options for generating package templates.
 */
export interface PackageTemplateOptions {
  /** Package name (will be kebab-cased) */
  packageName: string;
  /** Human-readable workflow name */
  workflowName: string;
  /** Optional workflow description */
  workflowDescription?: string;
  /** Whether the workflow uses LLM (extract/transform nodes) */
  usesLLM: boolean;
  /** List of node types used in the workflow */
  nodeTypes: string[];
  /** ISO timestamp of when the code was generated */
  generatedAt: string;
  /** Whether to include test scaffolding */
  includeTests: boolean;
}

// ============================================================================
// Package.json Generator
// ============================================================================

/**
 * Generate a package.json file for the exported workflow package.
 *
 * Includes LangChain dependencies and any required peer dependencies
 * based on the node types used in the workflow.
 *
 * @param options - Package template options
 * @returns JSON string of the package.json content
 */
export function generatePackageJson(options: PackageTemplateOptions): string {
  const dependencies: Record<string, string> = {
    '@langchain/core': '^1.0.0',
  };

  if (options.usesLLM) {
    dependencies['@langchain/openai'] = '^1.0.0';
  }

  const devDependencies: Record<string, string> = {
    typescript: '^5.6.0',
    '@types/node': '^22.0.0',
    'tsx': '^4.19.0',
  };

  if (options.includeTests) {
    devDependencies['vitest'] = '^3.2.0';
  }

  const scripts: Record<string, string> = {
    build: 'tsc',
    start: 'tsx src/index.ts',
  };

  if (options.includeTests) {
    scripts['test'] = 'vitest run';
    scripts['test:watch'] = 'vitest';
  }

  const pkg = {
    name: options.packageName,
    version: '1.0.0',
    description: options.workflowDescription ||
      `Generated LangChain workflow: ${options.workflowName}`,
    type: 'module',
    main: 'build/index.js',
    scripts,
    dependencies,
    devDependencies,
    engines: {
      node: '>=22',
    },
  };

  return JSON.stringify(pkg, null, 2);
}

// ============================================================================
// tsconfig.json Generator
// ============================================================================

/**
 * Generate a tsconfig.json for the exported workflow package.
 *
 * Uses strict TypeScript settings suitable for standalone execution.
 *
 * @returns JSON string of the tsconfig.json content
 */
export function generateTsConfig(): string {
  const config = {
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
  };

  return JSON.stringify(config, null, 2);
}

// ============================================================================
// README Generator
// ============================================================================

/**
 * Generate a README.md documenting the exported workflow.
 *
 * @param options - Package template options
 * @param generatedCode - The generated TypeScript source code
 * @returns Markdown string for the README
 */
export function generateReadme(
  options: PackageTemplateOptions,
  generatedCode: string,
): string {
  const envVars = options.usesLLM
    ? `
## Environment Variables

This workflow requires the following environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| \`OPENAI_API_KEY\` | OpenAI API key for LLM operations | Yes |
| \`MIMIR_DEFAULT_MODEL\` | LLM model to use (default: \`gpt-4-turbo\`) | No |
`
    : '';

  const testSection = options.includeTests
    ? `
## Testing

Run the test suite:

\`\`\`bash
npm test
\`\`\`

Run tests in watch mode:

\`\`\`bash
npm run test:watch
\`\`\`
`
    : '';

  const nodeList = options.nodeTypes
    .map((t) => `- **${t.charAt(0).toUpperCase() + t.slice(1)}**`)
    .join('\n');

  return `# ${options.workflowName}

${options.workflowDescription || `Auto-generated LangChain workflow package.`}

> Generated by Mimir Workflow Editor on ${options.generatedAt}

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Run the workflow
npm start
\`\`\`

## Build

\`\`\`bash
# Compile TypeScript
npm run build

# Run compiled output
node build/index.js
\`\`\`
${envVars}
## Workflow Nodes

This workflow uses the following node types:

${nodeList}

## Programmatic Usage

\`\`\`typescript
import { runWorkflow } from './src/index.js';

const result = await runWorkflow('your input data here');
console.log(result);
\`\`\`
${testSection}
## Project Structure

\`\`\`
${options.packageName}/
  src/
    index.ts        # Generated workflow code
  package.json
  tsconfig.json
  README.md
\`\`\`

## License

Generated code - use as needed.
`;
}

// ============================================================================
// Test Scaffold Generator
// ============================================================================

/**
 * Generate a basic Vitest test scaffold for the exported workflow.
 *
 * @param options - Package template options
 * @returns TypeScript test file content
 */
export function generateTestScaffold(options: PackageTemplateOptions): string {
  return `import { describe, it, expect } from 'vitest';
import { runWorkflow } from '../index.js';

describe('${options.workflowName}', () => {
  it('should export the runWorkflow function', () => {
    expect(typeof runWorkflow).toBe('function');
  });

  it('should execute the workflow with sample input', async () => {
    // TODO: Replace with actual test input for your workflow
    const input = 'sample test input';

    // NOTE: This test requires a valid OPENAI_API_KEY if the workflow uses LLM nodes.
    // For unit testing without API calls, mock the LLM:
    //
    // import { vi } from 'vitest';
    // vi.mock('@langchain/openai', () => ({
    //   ChatOpenAI: vi.fn().mockImplementation(() => ({
    //     invoke: vi.fn().mockResolvedValue({ content: 'mocked response' }),
    //   })),
    // }));

    // Uncomment to run integration test:
    // const result = await runWorkflow(input);
    // expect(result).toBeDefined();
    // expect(typeof result).toBe('string');
    expect(true).toBe(true); // Placeholder - replace with real assertions
  });
});
`;
}
