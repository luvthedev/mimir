/**
 * @module services/packageTemplates
 * @description Template generators for npm package export scaffolding.
 *
 * Provides functions to generate package.json, tsconfig.json, and README.md
 * content for exported workflow code packages. All generated content is
 * immediately usable without additional configuration.
 */

// ============================================================================
// Types
// ============================================================================

export interface PackageJsonOptions {
  /** Package name (kebab-case, npm-compatible) */
  name: string;
  /** Package description */
  description: string;
  /** Workflow name for metadata */
  workflowName: string;
  /** Whether to include test dependencies */
  includeTests: boolean;
  /** Additional dependencies to include */
  extraDependencies?: Record<string, string>;
}

export interface ReadmeOptions {
  /** Package/workflow name */
  name: string;
  /** Workflow description */
  description: string;
  /** Workflow node types used */
  nodeTypes: string[];
  /** Number of nodes in the workflow */
  nodeCount: number;
  /** Generated timestamp */
  generatedAt: string;
  /** Whether tests are included */
  includeTests: boolean;
}

// ============================================================================
// Core LangChain Dependencies
// ============================================================================

/** Standard LangChain dependencies required by generated workflows */
const LANGCHAIN_DEPENDENCIES: Record<string, string> = {
  '@langchain/core': '^1.0.1',
  '@langchain/openai': '^1.0.0',
  '@langchain/community': '^1.0.3',
  'langchain': '^1.0.1',
};

/** Dev dependencies for TypeScript execution */
const DEV_DEPENDENCIES: Record<string, string> = {
  'typescript': '^5.6.2',
  'tsx': '^4.19.0',
  '@types/node': '^22.0.0',
};

/** Test dependencies when tests are included */
const TEST_DEPENDENCIES: Record<string, string> = {
  'vitest': '^3.2.4',
};

// ============================================================================
// Package.json Generator
// ============================================================================

/**
 * Generates a package.json for an exported workflow package.
 *
 * Includes all required LangChain dependencies, TypeScript configuration,
 * and optional test setup with Vitest.
 *
 * @param options - Package configuration options
 * @returns Formatted package.json content as a string
 */
export function generatePackageJson(options: PackageJsonOptions): string {
  const {
    name,
    description,
    workflowName,
    includeTests,
    extraDependencies = {},
  } = options;

  const devDeps = includeTests
    ? { ...DEV_DEPENDENCIES, ...TEST_DEPENDENCIES }
    : { ...DEV_DEPENDENCIES };

  const scripts: Record<string, string> = {
    'build': 'tsc',
    'start': 'tsx src/index.ts',
    'dev': 'tsx watch src/index.ts',
  };

  if (includeTests) {
    scripts['test'] = 'vitest run';
    scripts['test:watch'] = 'vitest';
  }

  const packageJson = {
    name: sanitizePackageName(name),
    version: '1.0.0',
    description: description || `Generated workflow: ${workflowName}`,
    type: 'module',
    main: 'build/index.js',
    scripts,
    dependencies: {
      ...LANGCHAIN_DEPENDENCIES,
      ...extraDependencies,
    },
    devDependencies: devDeps,
    engines: {
      node: '>=18',
    },
  };

  return JSON.stringify(packageJson, null, 2);
}

// ============================================================================
// tsconfig.json Generator
// ============================================================================

/**
 * Generates a strict TypeScript configuration for an exported workflow package.
 *
 * Uses modern ES2022 target with Node16 module resolution for compatibility
 * with LangChain's ESM-based packages.
 *
 * @returns Formatted tsconfig.json content as a string
 */
export function generateTsConfig(): string {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'Node16',
      moduleResolution: 'Node16',
      outDir: './build',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      declaration: true,
      sourceMap: true,
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules', 'build', '**/*.test.ts'],
  };

  return JSON.stringify(tsconfig, null, 2);
}

// ============================================================================
// README Generator
// ============================================================================

/**
 * Generates a README.md documenting the exported workflow and usage instructions.
 *
 * @param options - README content options
 * @returns Formatted README.md content as a string
 */
export function generateReadme(options: ReadmeOptions): string {
  const {
    name,
    description,
    nodeTypes,
    nodeCount,
    generatedAt,
    includeTests,
  } = options;

  const uniqueNodeTypes = [...new Set(nodeTypes)];

  let readme = `# ${name}

${description}

## Overview

This package was auto-generated from a visual workflow in the Mimir orchestration platform.

| Property | Value |
|----------|-------|
| Nodes | ${nodeCount} |
| Node Types | ${uniqueNodeTypes.join(', ')} |
| Generated | ${generatedAt} |

## Prerequisites

- Node.js >= 18
- An OpenAI API key (set as \`OPENAI_API_KEY\` environment variable)

## Setup

\`\`\`bash
npm install
\`\`\`

## Usage

### Run directly

\`\`\`bash
# Set your API key
export OPENAI_API_KEY="your-key-here"

# Run the workflow
npm start
\`\`\`

### Import as a module

\`\`\`typescript
import { execute${sanitizeFunctionName(name)}Workflow } from './src/index.js';

const result = await execute${sanitizeFunctionName(name)}Workflow();
console.log(result);
\`\`\`

### Build

\`\`\`bash
npm run build
\`\`\`
`;

  if (includeTests) {
    readme += `
## Testing

\`\`\`bash
npm test
\`\`\`
`;
  }

  readme += `
## Project Structure

\`\`\`
${sanitizePackageName(name)}/
  src/
    index.ts          # Generated workflow code
${includeTests ? '  src/__tests__/\n    index.test.ts     # Test scaffold\n' : ''}  package.json
  tsconfig.json
  README.md
\`\`\`

## Dependencies

This workflow uses the following LangChain packages:

${Object.entries(LANGCHAIN_DEPENDENCIES).map(([pkg, ver]) => `- \`${pkg}\` ${ver}`).join('\n')}

---

*Auto-generated by Mimir Workflow Orchestration Platform*
`;

  return readme;
}

// ============================================================================
// Test Scaffold Generator
// ============================================================================

/**
 * Generates a basic Vitest test scaffold for the exported workflow.
 *
 * @param workflowName - The workflow name for the test description
 * @returns Test file content as a string
 */
export function generateTestScaffold(workflowName: string): string {
  const functionName = `execute${sanitizeFunctionName(workflowName)}Workflow`;

  return `/**
 * Test scaffold for the ${workflowName} workflow.
 *
 * These tests verify the generated workflow code is correctly structured
 * and can be imported without errors. Integration tests require API keys.
 */

import { describe, it, expect } from 'vitest';

describe('${workflowName} Workflow', () => {
  it('should export the workflow function', async () => {
    const mod = await import('../index.js');
    expect(typeof mod.${functionName}).toBe('function');
  });

  // Uncomment and configure for integration testing:
  // it('should execute the workflow successfully', async () => {
  //   const mod = await import('../index.js');
  //   const result = await mod.${functionName}();
  //   expect(result).toBeDefined();
  // }, 30000);
});
`;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sanitizes a string for use as an npm package name.
 * Converts to lowercase, replaces spaces/special chars with hyphens.
 */
export function sanitizePackageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'workflow-export';
}

/**
 * Sanitizes a workflow name for use as a TypeScript function name.
 * Converts to PascalCase.
 */
function sanitizeFunctionName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
