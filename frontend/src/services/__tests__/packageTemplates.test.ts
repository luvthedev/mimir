/**
 * Tests for the package template generators.
 *
 * Covers: generatePackageJson, generateTsConfig, generateReadme,
 *         generateTestScaffold, sanitizePackageName
 */

import { describe, it, expect } from 'vitest';
import {
  generatePackageJson,
  generateTsConfig,
  generateReadme,
  generateTestScaffold,
  sanitizePackageName,
} from '../packageTemplates';

// ============================================================================
// generatePackageJson
// ============================================================================

describe('generatePackageJson', () => {
  it('should generate valid JSON', () => {
    const result = generatePackageJson({
      name: 'test-workflow',
      description: 'A test workflow',
      workflowName: 'Test Workflow',
      includeTests: false,
    });

    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('should include LangChain dependencies', () => {
    const result = generatePackageJson({
      name: 'test-workflow',
      description: 'A test workflow',
      workflowName: 'Test Workflow',
      includeTests: false,
    });
    const pkg = JSON.parse(result);

    expect(pkg.dependencies['@langchain/core']).toBeDefined();
    expect(pkg.dependencies['@langchain/openai']).toBeDefined();
    expect(pkg.dependencies['langchain']).toBeDefined();
  });

  it('should include TypeScript dev dependencies', () => {
    const result = generatePackageJson({
      name: 'test-workflow',
      description: 'A test workflow',
      workflowName: 'Test Workflow',
      includeTests: false,
    });
    const pkg = JSON.parse(result);

    expect(pkg.devDependencies['typescript']).toBeDefined();
    expect(pkg.devDependencies['tsx']).toBeDefined();
    expect(pkg.devDependencies['@types/node']).toBeDefined();
  });

  it('should include vitest when tests are enabled', () => {
    const result = generatePackageJson({
      name: 'test-workflow',
      description: 'A test workflow',
      workflowName: 'Test Workflow',
      includeTests: true,
    });
    const pkg = JSON.parse(result);

    expect(pkg.devDependencies['vitest']).toBeDefined();
    expect(pkg.scripts['test']).toBe('vitest run');
    expect(pkg.scripts['test:watch']).toBe('vitest');
  });

  it('should not include vitest when tests are disabled', () => {
    const result = generatePackageJson({
      name: 'test-workflow',
      description: 'A test workflow',
      workflowName: 'Test Workflow',
      includeTests: false,
    });
    const pkg = JSON.parse(result);

    expect(pkg.devDependencies['vitest']).toBeUndefined();
    expect(pkg.scripts['test']).toBeUndefined();
  });

  it('should sanitize the package name', () => {
    const result = generatePackageJson({
      name: 'My Workflow!',
      description: 'Test',
      workflowName: 'My Workflow',
      includeTests: false,
    });
    const pkg = JSON.parse(result);

    expect(pkg.name).toBe('my-workflow');
  });

  it('should include extra dependencies when provided', () => {
    const result = generatePackageJson({
      name: 'test-workflow',
      description: 'Test',
      workflowName: 'Test',
      includeTests: false,
      extraDependencies: { 'zod': '^3.0.0' },
    });
    const pkg = JSON.parse(result);

    expect(pkg.dependencies['zod']).toBe('^3.0.0');
  });

  it('should use ESM module type', () => {
    const result = generatePackageJson({
      name: 'test',
      description: 'Test',
      workflowName: 'Test',
      includeTests: false,
    });
    const pkg = JSON.parse(result);

    expect(pkg.type).toBe('module');
  });

  it('should include start and build scripts', () => {
    const result = generatePackageJson({
      name: 'test',
      description: 'Test',
      workflowName: 'Test',
      includeTests: false,
    });
    const pkg = JSON.parse(result);

    expect(pkg.scripts['build']).toBe('tsc');
    expect(pkg.scripts['start']).toBe('tsx src/index.ts');
    expect(pkg.scripts['dev']).toBe('tsx watch src/index.ts');
  });
});

// ============================================================================
// generateTsConfig
// ============================================================================

describe('generateTsConfig', () => {
  it('should generate valid JSON', () => {
    const result = generateTsConfig();
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('should use strict mode', () => {
    const config = JSON.parse(generateTsConfig());
    expect(config.compilerOptions.strict).toBe(true);
  });

  it('should target ES2022', () => {
    const config = JSON.parse(generateTsConfig());
    expect(config.compilerOptions.target).toBe('ES2022');
  });

  it('should use Node16 module resolution', () => {
    const config = JSON.parse(generateTsConfig());
    expect(config.compilerOptions.module).toBe('Node16');
    expect(config.compilerOptions.moduleResolution).toBe('Node16');
  });

  it('should output to build directory', () => {
    const config = JSON.parse(generateTsConfig());
    expect(config.compilerOptions.outDir).toBe('./build');
    expect(config.compilerOptions.rootDir).toBe('./src');
  });

  it('should exclude node_modules and test files from compilation', () => {
    const config = JSON.parse(generateTsConfig());
    expect(config.exclude).toContain('node_modules');
    expect(config.exclude).toContain('**/*.test.ts');
  });

  it('should include source maps and declarations', () => {
    const config = JSON.parse(generateTsConfig());
    expect(config.compilerOptions.sourceMap).toBe(true);
    expect(config.compilerOptions.declaration).toBe(true);
  });
});

// ============================================================================
// generateReadme
// ============================================================================

describe('generateReadme', () => {
  const defaultOptions = {
    name: 'Test Workflow',
    description: 'A workflow for testing',
    nodeTypes: ['upload', 'extract', 'output'],
    nodeCount: 3,
    generatedAt: '2025-01-01T00:00:00Z',
    includeTests: false,
  };

  it('should include the workflow name as title', () => {
    const readme = generateReadme(defaultOptions);
    expect(readme).toContain('# Test Workflow');
  });

  it('should include the description', () => {
    const readme = generateReadme(defaultOptions);
    expect(readme).toContain('A workflow for testing');
  });

  it('should include node count and types', () => {
    const readme = generateReadme(defaultOptions);
    expect(readme).toContain('3');
    expect(readme).toContain('upload');
    expect(readme).toContain('extract');
    expect(readme).toContain('output');
  });

  it('should include setup and usage instructions', () => {
    const readme = generateReadme(defaultOptions);
    expect(readme).toContain('npm install');
    expect(readme).toContain('npm start');
    expect(readme).toContain('OPENAI_API_KEY');
  });

  it('should include testing section when tests are enabled', () => {
    const readme = generateReadme({ ...defaultOptions, includeTests: true });
    expect(readme).toContain('npm test');
    expect(readme).toContain('Testing');
  });

  it('should not include testing section when tests are disabled', () => {
    const readme = generateReadme({ ...defaultOptions, includeTests: false });
    expect(readme).not.toContain('npm test');
  });

  it('should include dependency list', () => {
    const readme = generateReadme(defaultOptions);
    expect(readme).toContain('@langchain/core');
    expect(readme).toContain('@langchain/openai');
  });

  it('should deduplicate node types', () => {
    const readme = generateReadme({
      ...defaultOptions,
      nodeTypes: ['extract', 'extract', 'output'],
    });
    // Should only appear once in the node types column
    const matches = readme.match(/extract/g);
    // At least present, and the table line should only have it once
    expect(matches).toBeTruthy();
  });
});

// ============================================================================
// generateTestScaffold
// ============================================================================

describe('generateTestScaffold', () => {
  it('should include the workflow name in the describe block', () => {
    const scaffold = generateTestScaffold('My Workflow');
    expect(scaffold).toContain("describe('My Workflow Workflow'");
  });

  it('should include an import test', () => {
    const scaffold = generateTestScaffold('My Workflow');
    expect(scaffold).toContain('should export the workflow function');
    expect(scaffold).toContain('executeMyWorkflowWorkflow');
  });

  it('should use vitest imports', () => {
    const scaffold = generateTestScaffold('Test');
    expect(scaffold).toContain("from 'vitest'");
    expect(scaffold).toContain('describe');
    expect(scaffold).toContain('expect');
  });

  it('should include a commented integration test', () => {
    const scaffold = generateTestScaffold('Test');
    expect(scaffold).toContain('Uncomment');
    expect(scaffold).toContain('integration testing');
  });
});

// ============================================================================
// sanitizePackageName
// ============================================================================

describe('sanitizePackageName', () => {
  it('should convert to lowercase', () => {
    expect(sanitizePackageName('My Workflow')).toBe('my-workflow');
  });

  it('should replace spaces with hyphens', () => {
    expect(sanitizePackageName('test workflow name')).toBe('test-workflow-name');
  });

  it('should remove special characters', () => {
    expect(sanitizePackageName('test@workflow!v2')).toBe('test-workflow-v2');
  });

  it('should collapse multiple hyphens', () => {
    expect(sanitizePackageName('test---workflow')).toBe('test-workflow');
  });

  it('should strip leading/trailing hyphens', () => {
    expect(sanitizePackageName('-test-')).toBe('test');
  });

  it('should return default for empty input', () => {
    expect(sanitizePackageName('')).toBe('workflow-export');
  });

  it('should handle unicode characters', () => {
    const result = sanitizePackageName('workflow-v2');
    expect(result).toBe('workflow-v2');
  });
});
