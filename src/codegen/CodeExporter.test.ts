/**
 * @module codegen/CodeExporter.test
 * @description Tests for the CodeExporter service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeExporter } from './CodeExporter.js';
import { CodeGenerator } from './CodeGenerator.js';
import type { Workflow } from '../types/workflow.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-test-123',
    name: 'Test Workflow',
    description: 'A test workflow for export',
    nodes: [
      {
        id: 'node-1',
        workflowId: 'wf-test-123',
        type: 'upload',
        position: { x: 0, y: 0 },
        config: { format: 'csv' },
        metadata: { label: 'CSV Upload' },
        createdAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'node-2',
        workflowId: 'wf-test-123',
        type: 'extract',
        position: { x: 200, y: 0 },
        config: {},
        metadata: { label: 'Extract Data' },
        createdAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'node-3',
        workflowId: 'wf-test-123',
        type: 'output',
        position: { x: 400, y: 0 },
        config: {},
        metadata: { label: 'Output' },
        createdAt: '2025-01-01T00:00:00Z',
      },
    ],
    connections: [
      {
        id: 'conn-1',
        workflowId: 'wf-test-123',
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
        sourcePort: 'data',
        targetPort: 'data',
        createdAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'conn-2',
        workflowId: 'wf-test-123',
        sourceNodeId: 'node-2',
        targetNodeId: 'node-3',
        sourcePort: 'data',
        targetPort: 'data',
        createdAt: '2025-01-01T00:00:00Z',
      },
    ],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    userId: 'user-1',
    isActive: true,
    ...overrides,
  };
}

function createSimpleWorkflow(): Workflow {
  return createTestWorkflow({
    nodes: [
      {
        id: 'node-1',
        workflowId: 'wf-test-123',
        type: 'upload',
        position: { x: 0, y: 0 },
        config: {},
        metadata: { label: 'Upload' },
        createdAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'node-2',
        workflowId: 'wf-test-123',
        type: 'output',
        position: { x: 200, y: 0 },
        config: {},
        metadata: { label: 'Output' },
        createdAt: '2025-01-01T00:00:00Z',
      },
    ],
    connections: [
      {
        id: 'conn-1',
        workflowId: 'wf-test-123',
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
        sourcePort: 'data',
        targetPort: 'data',
        createdAt: '2025-01-01T00:00:00Z',
      },
    ],
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('CodeExporter', () => {
  let exporter: CodeExporter;

  beforeEach(() => {
    exporter = new CodeExporter();
  });

  // ==========================================================================
  // exportAsFile
  // ==========================================================================

  describe('exportAsFile', () => {
    it('should generate a TypeScript file with valid code', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsFile(workflow);

      expect(result.content).toContain('AUTO-GENERATED CODE');
      expect(result.content).toContain('Test Workflow');
      expect(result.mimeType).toBe('text/typescript');
      expect(result.filename).toMatch(/test-workflow-\d{4}-\d{2}-\d{2}\.ts/);
    });

    it('should include dependency comment when includeDependencies is true', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsFile(workflow, {
        includeDependencies: true,
      });

      expect(result.content).toContain('Required Dependencies');
      expect(result.content).toContain('@langchain/core');
    });

    it('should include LLM dependencies when workflow uses extract/transform', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsFile(workflow);

      expect(result.dependencies).toHaveProperty('@langchain/openai');
      expect(result.dependencies).toHaveProperty('@langchain/core');
    });

    it('should not include LLM dependencies for upload-only workflows', async () => {
      const workflow = createSimpleWorkflow();
      const result = await exporter.exportAsFile(workflow);

      expect(result.dependencies).not.toHaveProperty('@langchain/openai');
      expect(result.dependencies).toHaveProperty('@langchain/core');
    });

    it('should generate correct filename format', async () => {
      const workflow = createTestWorkflow({ name: 'My Cool Workflow' });
      const result = await exporter.exportAsFile(workflow);

      expect(result.filename).toMatch(/^my-cool-workflow-\d{4}-\d{2}-\d{2}\.ts$/);
    });

    it('should record export in history', async () => {
      const workflow = createTestWorkflow();
      await exporter.exportAsFile(workflow);

      const history = exporter.getExportHistory();
      expect(history).toHaveLength(1);
      expect(history[0].format).toBe('single-file');
      expect(history[0].workflowId).toBe('wf-test-123');
      expect(history[0].workflowName).toBe('Test Workflow');
    });
  });

  // ==========================================================================
  // exportAsPackage
  // ==========================================================================

  describe('exportAsPackage', () => {
    it('should generate all required package files', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsPackage(workflow);

      const paths = result.files.map((f) => f.path);
      expect(paths).toContain('package.json');
      expect(paths).toContain('tsconfig.json');
      expect(paths).toContain('README.md');
      expect(paths).toContain('src/index.ts');
    });

    it('should include .env.example when workflow uses LLM', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsPackage(workflow);

      const paths = result.files.map((f) => f.path);
      expect(paths).toContain('.env.example');

      const envFile = result.files.find((f) => f.path === '.env.example')!;
      expect(envFile.content).toContain('OPENAI_API_KEY');
    });

    it('should not include .env.example for non-LLM workflows', async () => {
      const workflow = createSimpleWorkflow();
      const result = await exporter.exportAsPackage(workflow);

      const paths = result.files.map((f) => f.path);
      expect(paths).not.toContain('.env.example');
    });

    it('should include test files when includeTests is true', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsPackage(workflow, {
        includeTests: true,
      });

      const paths = result.files.map((f) => f.path);
      expect(paths).toContain('src/__tests__/workflow.test.ts');

      const pkgJson = JSON.parse(
        result.files.find((f) => f.path === 'package.json')!.content,
      );
      expect(pkgJson.devDependencies).toHaveProperty('vitest');
      expect(pkgJson.scripts).toHaveProperty('test');
    });

    it('should use custom package name when provided', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsPackage(workflow, {
        packageName: 'my-custom-pkg',
      });

      expect(result.packageName).toBe('my-custom-pkg');

      const pkgJson = JSON.parse(
        result.files.find((f) => f.path === 'package.json')!.content,
      );
      expect(pkgJson.name).toBe('my-custom-pkg');
    });

    it('should sanitize package name', async () => {
      const workflow = createTestWorkflow({ name: 'My Awesome Workflow!!!' });
      const result = await exporter.exportAsPackage(workflow);

      expect(result.packageName).toMatch(/^[a-z0-9-]+$/);
    });

    it('should generate valid package.json', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsPackage(workflow);

      const pkgJson = JSON.parse(
        result.files.find((f) => f.path === 'package.json')!.content,
      );
      expect(pkgJson.type).toBe('module');
      expect(pkgJson.dependencies).toHaveProperty('@langchain/core');
      expect(pkgJson.devDependencies).toHaveProperty('typescript');
      expect(pkgJson.scripts).toHaveProperty('build');
      expect(pkgJson.scripts).toHaveProperty('start');
    });

    it('should generate valid tsconfig.json', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsPackage(workflow);

      const tsconfig = JSON.parse(
        result.files.find((f) => f.path === 'tsconfig.json')!.content,
      );
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.target).toBe('ES2022');
      expect(tsconfig.compilerOptions.module).toBe('NodeNext');
    });

    it('should generate README with workflow information', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.exportAsPackage(workflow);

      const readme = result.files.find((f) => f.path === 'README.md')!.content;
      expect(readme).toContain('Test Workflow');
      expect(readme).toContain('npm install');
      expect(readme).toContain('runWorkflow');
    });

    it('should record export in history', async () => {
      const workflow = createTestWorkflow();
      await exporter.exportAsPackage(workflow);

      const history = exporter.getExportHistory();
      expect(history).toHaveLength(1);
      expect(history[0].format).toBe('npm-package');
    });
  });

  // ==========================================================================
  // exportAsGist
  // ==========================================================================

  describe('exportAsGist', () => {
    it('should throw if no GitHub token is provided', async () => {
      const workflow = createTestWorkflow();

      await expect(
        exporter.exportAsGist(workflow, { githubToken: '' }),
      ).rejects.toThrow('GitHub personal access token is required');
    });

    it('should call GitHub API with correct payload', async () => {
      const workflow = createTestWorkflow();

      // Mock fetch
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'gist-123',
          html_url: 'https://gist.github.com/gist-123',
          files: {
            'test-workflow-2025-01-01.ts': {
              raw_url: 'https://gist.githubusercontent.com/raw/...',
            },
          },
        }),
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      try {
        const result = await exporter.exportAsGist(workflow, {
          githubToken: 'ghp_test123',
          gistPublic: false,
        });

        expect(globalThis.fetch).toHaveBeenCalledWith(
          'https://api.github.com/gists',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer ghp_test123',
            }),
          }),
        );

        expect(result.gistId).toBe('gist-123');
        expect(result.url).toBe('https://gist.github.com/gist-123');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should throw on API error', async () => {
      const workflow = createTestWorkflow();

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      try {
        await expect(
          exporter.exportAsGist(workflow, { githubToken: 'bad-token' }),
        ).rejects.toThrow('GitHub Gist API error (401)');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ==========================================================================
  // validateForExport
  // ==========================================================================

  describe('validateForExport', () => {
    it('should pass for valid workflows', async () => {
      const workflow = createTestWorkflow();
      const result = await exporter.validateForExport(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for empty workflows', async () => {
      const workflow = createTestWorkflow({ nodes: [] });
      const result = await exporter.validateForExport(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workflow must contain at least one node.');
    });

    it('should fail for unnamed workflows', async () => {
      const workflow = createTestWorkflow({ name: '' });
      const result = await exporter.validateForExport(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workflow must have a name.');
    });

    it('should fail if code generation fails (e.g., cycle)', async () => {
      const workflow = createTestWorkflow({
        connections: [
          {
            id: 'conn-1',
            workflowId: 'wf-test-123',
            sourceNodeId: 'node-1',
            targetNodeId: 'node-2',
            sourcePort: 'data',
            targetPort: 'data',
            createdAt: '2025-01-01T00:00:00Z',
          },
          {
            id: 'conn-2',
            workflowId: 'wf-test-123',
            sourceNodeId: 'node-2',
            targetNodeId: 'node-1',
            sourcePort: 'data',
            targetPort: 'data',
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      });

      const result = await exporter.validateForExport(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Code generation failed'))).toBe(true);
    });
  });

  // ==========================================================================
  // Export History
  // ==========================================================================

  describe('export history', () => {
    it('should track multiple exports', async () => {
      const workflow = createTestWorkflow();

      await exporter.exportAsFile(workflow);
      await exporter.exportAsPackage(workflow);

      const history = exporter.getExportHistory();
      expect(history).toHaveLength(2);
      expect(history[0].format).toBe('single-file');
      expect(history[1].format).toBe('npm-package');
    });

    it('should clear history', async () => {
      const workflow = createTestWorkflow();

      await exporter.exportAsFile(workflow);
      expect(exporter.getExportHistory()).toHaveLength(1);

      exporter.clearExportHistory();
      expect(exporter.getExportHistory()).toHaveLength(0);
    });

    it('should include timestamps in history entries', async () => {
      const workflow = createTestWorkflow();
      await exporter.exportAsFile(workflow);

      const entry = exporter.getExportHistory()[0];
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return a copy of history (not reference)', async () => {
      const workflow = createTestWorkflow();
      await exporter.exportAsFile(workflow);

      const history1 = exporter.getExportHistory();
      const history2 = exporter.getExportHistory();
      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  // ==========================================================================
  // Performance
  // ==========================================================================

  describe('performance', () => {
    it('should complete file export in under 2 seconds', async () => {
      const workflow = createTestWorkflow();
      const start = Date.now();

      await exporter.exportAsFile(workflow);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    });

    it('should complete package export in under 2 seconds', async () => {
      const workflow = createTestWorkflow();
      const start = Date.now();

      await exporter.exportAsPackage(workflow, { includeTests: true });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    });
  });
});
