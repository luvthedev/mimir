/**
 * @module codegen/packageTemplates.test
 * @description Tests for the package template generators.
 */

import { describe, it, expect } from 'vitest';
import {
  generatePackageJson,
  generateTsConfig,
  generateReadme,
  generateTestScaffold,
} from './packageTemplates.js';
import type { PackageTemplateOptions } from './packageTemplates.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createOptions(
  overrides: Partial<PackageTemplateOptions> = {},
): PackageTemplateOptions {
  return {
    packageName: 'test-workflow',
    workflowName: 'Test Workflow',
    workflowDescription: 'A workflow for testing',
    usesLLM: true,
    nodeTypes: ['upload', 'extract', 'output'],
    generatedAt: '2025-01-15T10:30:00Z',
    includeTests: false,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('packageTemplates', () => {
  // ==========================================================================
  // generatePackageJson
  // ==========================================================================

  describe('generatePackageJson', () => {
    it('should generate valid JSON', () => {
      const options = createOptions();
      const result = generatePackageJson(options);

      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should include package name and description', () => {
      const options = createOptions();
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.name).toBe('test-workflow');
      expect(pkg.description).toContain('A workflow for testing');
    });

    it('should set type to module', () => {
      const options = createOptions();
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.type).toBe('module');
    });

    it('should include LangChain core dependency always', () => {
      const options = createOptions({ usesLLM: false });
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.dependencies['@langchain/core']).toBeDefined();
    });

    it('should include OpenAI dependency when usesLLM is true', () => {
      const options = createOptions({ usesLLM: true });
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.dependencies['@langchain/openai']).toBeDefined();
    });

    it('should not include OpenAI dependency when usesLLM is false', () => {
      const options = createOptions({ usesLLM: false });
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.dependencies['@langchain/openai']).toBeUndefined();
    });

    it('should include TypeScript dev dependency', () => {
      const options = createOptions();
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.devDependencies.typescript).toBeDefined();
    });

    it('should include vitest when includeTests is true', () => {
      const options = createOptions({ includeTests: true });
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.devDependencies.vitest).toBeDefined();
      expect(pkg.scripts.test).toBe('vitest run');
    });

    it('should not include vitest when includeTests is false', () => {
      const options = createOptions({ includeTests: false });
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.devDependencies.vitest).toBeUndefined();
      expect(pkg.scripts.test).toBeUndefined();
    });

    it('should include build and start scripts', () => {
      const options = createOptions();
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.scripts.build).toBe('tsc');
      expect(pkg.scripts.start).toBe('tsx src/index.ts');
    });

    it('should require Node >= 22', () => {
      const options = createOptions();
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.engines.node).toBe('>=22');
    });

    it('should use default description if none provided', () => {
      const options = createOptions({ workflowDescription: undefined });
      const pkg = JSON.parse(generatePackageJson(options));

      expect(pkg.description).toContain('Generated LangChain workflow');
    });
  });

  // ==========================================================================
  // generateTsConfig
  // ==========================================================================

  describe('generateTsConfig', () => {
    it('should generate valid JSON', () => {
      const result = generateTsConfig();

      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should enable strict mode', () => {
      const config = JSON.parse(generateTsConfig());

      expect(config.compilerOptions.strict).toBe(true);
    });

    it('should target ES2022', () => {
      const config = JSON.parse(generateTsConfig());

      expect(config.compilerOptions.target).toBe('ES2022');
    });

    it('should use NodeNext module system', () => {
      const config = JSON.parse(generateTsConfig());

      expect(config.compilerOptions.module).toBe('NodeNext');
      expect(config.compilerOptions.moduleResolution).toBe('NodeNext');
    });

    it('should output to build directory', () => {
      const config = JSON.parse(generateTsConfig());

      expect(config.compilerOptions.outDir).toBe('./build');
      expect(config.compilerOptions.rootDir).toBe('./src');
    });

    it('should generate declaration files', () => {
      const config = JSON.parse(generateTsConfig());

      expect(config.compilerOptions.declaration).toBe(true);
      expect(config.compilerOptions.declarationMap).toBe(true);
    });

    it('should include src and exclude node_modules', () => {
      const config = JSON.parse(generateTsConfig());

      expect(config.include).toContain('src/**/*');
      expect(config.exclude).toContain('node_modules');
    });
  });

  // ==========================================================================
  // generateReadme
  // ==========================================================================

  describe('generateReadme', () => {
    it('should include workflow name as title', () => {
      const options = createOptions();
      const readme = generateReadme(options, '// generated code');

      expect(readme).toContain('# Test Workflow');
    });

    it('should include quick start instructions', () => {
      const options = createOptions();
      const readme = generateReadme(options, '// generated code');

      expect(readme).toContain('npm install');
      expect(readme).toContain('npm start');
    });

    it('should include environment variables section when usesLLM', () => {
      const options = createOptions({ usesLLM: true });
      const readme = generateReadme(options, '// generated code');

      expect(readme).toContain('OPENAI_API_KEY');
      expect(readme).toContain('MIMIR_DEFAULT_MODEL');
    });

    it('should not include environment variables section when no LLM', () => {
      const options = createOptions({ usesLLM: false });
      const readme = generateReadme(options, '// generated code');

      expect(readme).not.toContain('OPENAI_API_KEY');
    });

    it('should list node types', () => {
      const options = createOptions({
        nodeTypes: ['upload', 'extract', 'transform', 'output'],
      });
      const readme = generateReadme(options, '// generated code');

      expect(readme).toContain('**Upload**');
      expect(readme).toContain('**Extract**');
      expect(readme).toContain('**Transform**');
      expect(readme).toContain('**Output**');
    });

    it('should include programmatic usage example', () => {
      const options = createOptions();
      const readme = generateReadme(options, '// generated code');

      expect(readme).toContain('runWorkflow');
      expect(readme).toContain('import');
    });

    it('should include test section when includeTests is true', () => {
      const options = createOptions({ includeTests: true });
      const readme = generateReadme(options, '// generated code');

      expect(readme).toContain('npm test');
      expect(readme).toContain('test:watch');
    });

    it('should not include test section when includeTests is false', () => {
      const options = createOptions({ includeTests: false });
      const readme = generateReadme(options, '// generated code');

      expect(readme).not.toContain('npm test');
    });

    it('should include generation timestamp', () => {
      const options = createOptions({ generatedAt: '2025-01-15T10:30:00Z' });
      const readme = generateReadme(options, '// generated code');

      expect(readme).toContain('2025-01-15T10:30:00Z');
    });

    it('should include project structure', () => {
      const options = createOptions();
      const readme = generateReadme(options, '// generated code');

      expect(readme).toContain('src/');
      expect(readme).toContain('index.ts');
      expect(readme).toContain('package.json');
    });
  });

  // ==========================================================================
  // generateTestScaffold
  // ==========================================================================

  describe('generateTestScaffold', () => {
    it('should include describe block with workflow name', () => {
      const options = createOptions();
      const content = generateTestScaffold(options);

      expect(content).toContain("describe('Test Workflow'");
    });

    it('should import from vitest', () => {
      const options = createOptions();
      const content = generateTestScaffold(options);

      expect(content).toContain("from 'vitest'");
      expect(content).toContain('describe');
      expect(content).toContain('it');
      expect(content).toContain('expect');
    });

    it('should import runWorkflow', () => {
      const options = createOptions();
      const content = generateTestScaffold(options);

      expect(content).toContain('runWorkflow');
    });

    it('should include a basic test case', () => {
      const options = createOptions();
      const content = generateTestScaffold(options);

      expect(content).toContain('should export the runWorkflow function');
      expect(content).toContain("typeof runWorkflow").and.toContain("'function'");
    });

    it('should include guidance for mocking LLM', () => {
      const options = createOptions();
      const content = generateTestScaffold(options);

      expect(content).toContain('vi.mock');
      expect(content).toContain('@langchain/openai');
    });
  });
});
