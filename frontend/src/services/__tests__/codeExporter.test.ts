/**
 * Tests for the CodeExporter service.
 *
 * Covers: validateForExport, exportAsFile, exportAsPackage, exportAsGist,
 *         generateFilename, extractDependencies, createZipBlob
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateForExport,
  exportAsFile,
  exportAsPackage,
  exportAsGist,
  generateFilename,
  extractDependencies,
  createZipBlob,
} from '../codeExporter';
import type { ExportOptions } from '../codeExporter';

// ============================================================================
// Mock browser APIs
// ============================================================================

const mockCreateObjectURL = vi.fn(() => 'blob:http://localhost/mock-url');
const mockRevokeObjectURL = vi.fn();
const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();

beforeEach(() => {
  // Mock URL APIs
  globalThis.URL.createObjectURL = mockCreateObjectURL;
  globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

  // Mock document.createElement
  vi.spyOn(document, 'createElement').mockReturnValue({
    href: '',
    download: '',
    click: mockClick,
    set style(_v: string) {},
  } as any);

  vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
  vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Test data
// ============================================================================

const VALID_CODE = `/**
 * AUTO-GENERATED CODE - DO NOT EDIT MANUALLY
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

export async function executeTestWorkflow(): Promise<any> {
  const model = new ChatOpenAI({ modelName: 'gpt-4' });
  const prompt = ChatPromptTemplate.fromMessages([['human', '{input}']]);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  return await chain.invoke({ input: 'test' });
}
`;

function makeOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    format: 'file',
    workflowName: 'Test Workflow',
    workflowDescription: 'A test workflow',
    code: VALID_CODE,
    includeDependencies: true,
    includeTests: false,
    ...overrides,
  };
}

// ============================================================================
// validateForExport
// ============================================================================

describe('validateForExport', () => {
  it('should pass for valid code', () => {
    const result = validateForExport(VALID_CODE);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for empty code', () => {
    const result = validateForExport('');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('No code'))).toBe(true);
  });

  it('should fail for whitespace-only code', () => {
    const result = validateForExport('   \n\n  ');
    expect(result.valid).toBe(false);
  });

  it('should fail for code without export function', () => {
    const result = validateForExport('import { x } from "y";\nconst a = 1;');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('exported function'))).toBe(true);
  });

  it('should fail for code without imports', () => {
    const result = validateForExport('export async function test() { return 1; }');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('imports'))).toBe(true);
  });
});

// ============================================================================
// extractDependencies
// ============================================================================

describe('extractDependencies', () => {
  it('should extract scoped packages', () => {
    const deps = extractDependencies(VALID_CODE);
    expect(deps).toContain('@langchain/openai');
    expect(deps).toContain('@langchain/core');
  });

  it('should deduplicate packages', () => {
    const code = `
import { a } from '@langchain/core/prompts';
import { b } from '@langchain/core/output_parsers';
`;
    const deps = extractDependencies(code);
    const coreCount = deps.filter(d => d === '@langchain/core').length;
    expect(coreCount).toBe(1);
  });

  it('should ignore relative imports', () => {
    const code = `
import { a } from './local';
import { b } from '../parent';
import { c } from '@langchain/openai';
`;
    const deps = extractDependencies(code);
    expect(deps).toEqual(['@langchain/openai']);
  });

  it('should sort dependencies alphabetically', () => {
    const code = `
import { z } from 'zod';
import { a } from '@langchain/openai';
import { b } from '@langchain/core/prompts';
`;
    const deps = extractDependencies(code);
    expect(deps).toEqual(['@langchain/core', '@langchain/openai', 'zod']);
  });

  it('should return empty array for code with no imports', () => {
    const deps = extractDependencies('const a = 1;');
    expect(deps).toEqual([]);
  });
});

// ============================================================================
// generateFilename
// ============================================================================

describe('generateFilename', () => {
  it('should include sanitized name', () => {
    const filename = generateFilename('Test Workflow', 'ts');
    expect(filename).toContain('test-workflow');
  });

  it('should include date stamp', () => {
    const filename = generateFilename('test', 'ts');
    // Should match pattern: test-YYYY-MM-DD.ts
    expect(filename).toMatch(/test-\d{4}-\d{2}-\d{2}\.ts/);
  });

  it('should use the correct extension', () => {
    expect(generateFilename('test', 'ts')).toMatch(/\.ts$/);
    expect(generateFilename('test', 'zip')).toMatch(/\.zip$/);
  });
});

// ============================================================================
// exportAsFile
// ============================================================================

describe('exportAsFile', () => {
  it('should trigger a download with correct filename', () => {
    const result = exportAsFile(makeOptions());

    expect(result.success).toBe(true);
    expect(result.format).toBe('file');
    expect(result.filename).toContain('test-workflow');
    expect(result.filename).toMatch(/\.ts$/);
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });

  it('should include dependency comments when enabled', () => {
    const blobSpy = vi.fn();
    const OrigBlob = globalThis.Blob;
    globalThis.Blob = class MockBlob extends OrigBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (parts) blobSpy(parts[0]);
      }
    } as any;

    exportAsFile(makeOptions({ includeDependencies: true }));

    const content = blobSpy.mock.calls[0]?.[0] || '';
    expect(content).toContain('Required Dependencies');
    expect(content).toContain('npm install');

    globalThis.Blob = OrigBlob;
  });

  it('should return success with timestamp', () => {
    const result = exportAsFile(makeOptions());
    expect(result.success).toBe(true);
    expect(result.timestamp).toBeTruthy();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });
});

// ============================================================================
// exportAsPackage
// ============================================================================

describe('exportAsPackage', () => {
  it('should create a ZIP blob and trigger download', () => {
    const result = exportAsPackage(makeOptions({ format: 'package' }));

    expect(result.success).toBe(true);
    expect(result.format).toBe('package');
    expect(result.filename).toMatch(/\.zip$/);
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });

  it('should use custom package name when provided', () => {
    const result = exportAsPackage(makeOptions({
      format: 'package',
      customPackageName: 'my-custom-pkg',
    }));

    expect(result.filename).toContain('my-custom-pkg');
  });

  it('should return success even without tests', () => {
    const result = exportAsPackage(makeOptions({
      format: 'package',
      includeTests: false,
    }));

    expect(result.success).toBe(true);
  });

  it('should return success with tests included', () => {
    const result = exportAsPackage(makeOptions({
      format: 'package',
      includeTests: true,
    }));

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// exportAsGist
// ============================================================================

describe('exportAsGist', () => {
  it('should fail without a GitHub token', async () => {
    const result = await exportAsGist(makeOptions({
      format: 'gist',
      githubToken: undefined,
    }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('token');
  });

  it('should fail with empty GitHub token', async () => {
    const result = await exportAsGist(makeOptions({
      format: 'gist',
      githubToken: '',
    }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('token');
  });

  it('should call GitHub API with correct payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ html_url: 'https://gist.github.com/test/123' }),
    });
    globalThis.fetch = mockFetch;

    const result = await exportAsGist(makeOptions({
      format: 'gist',
      githubToken: 'ghp_test_token',
      gistPublic: false,
    }));

    expect(result.success).toBe(true);
    expect(result.gistUrl).toBe('https://gist.github.com/test/123');

    // Verify the fetch call
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/gists',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'token ghp_test_token',
        }),
      })
    );
  });

  it('should handle GitHub API errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ message: 'Bad credentials' }),
    });
    globalThis.fetch = mockFetch;

    const result = await exportAsGist(makeOptions({
      format: 'gist',
      githubToken: 'ghp_bad_token',
    }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('should handle network errors', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));
    globalThis.fetch = mockFetch;

    const result = await exportAsGist(makeOptions({
      format: 'gist',
      githubToken: 'ghp_test',
    }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network failure');
  });
});

// ============================================================================
// createZipBlob
// ============================================================================

describe('createZipBlob', () => {
  it('should create a Blob with zip type', () => {
    const blob = createZipBlob({ 'test.txt': 'hello world' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
  });

  it('should handle multiple files', () => {
    const blob = createZipBlob({
      'package.json': '{}',
      'tsconfig.json': '{}',
      'src/index.ts': 'export const x = 1;',
    });

    expect(blob.size).toBeGreaterThan(0);
  });

  it('should handle empty file content', () => {
    const blob = createZipBlob({ 'empty.txt': '' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('should produce larger blobs for more content', () => {
    const small = createZipBlob({ 'a.txt': 'small' });
    const large = createZipBlob({
      'a.txt': 'x'.repeat(10000),
      'b.txt': 'y'.repeat(10000),
    });

    expect(large.size).toBeGreaterThan(small.size);
  });

  it('should handle files in subdirectories', () => {
    const blob = createZipBlob({
      'src/index.ts': 'export default 1;',
      'src/__tests__/index.test.ts': 'test("works", () => {});',
    });

    expect(blob.size).toBeGreaterThan(0);
  });
});
