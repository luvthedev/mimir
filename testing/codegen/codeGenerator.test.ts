/**
 * Tests for the code generation system that converts visual workflows
 * into executable LangChain TypeScript code.
 */
import { describe, it, expect } from 'vitest';
import {
  CodeGenerator,
  validateWorkflow,
  topologicalSort,
  formatImports,
  formatVariableNames,
  addComments,
  generateFileHeader,
  generateNodeCode,
  generateUploadNode,
  generateExtractNode,
  generateTransformNode,
  generateOutputNode,
} from '../../src/codegen/index.js';
import type { Workflow, WorkflowNode, WorkflowConnection } from '../../src/types/workflow.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeNode(overrides: Partial<WorkflowNode> & { id: string; type: WorkflowNode['type'] }): WorkflowNode {
  return {
    workflowId: 'wf-test',
    position: { x: 0, y: 0 },
    config: {},
    metadata: {},
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeConnection(
  id: string,
  sourceNodeId: string,
  targetNodeId: string
): WorkflowConnection {
  return {
    id,
    workflowId: 'wf-test',
    sourceNodeId,
    targetNodeId,
    sourcePort: 'output',
    targetPort: 'input',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function makeWorkflow(
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
  overrides: Partial<Workflow> = {}
): Workflow {
  return {
    id: 'wf-test-1',
    name: 'Test Workflow',
    description: 'A test workflow',
    nodes,
    connections,
    userId: 'user-1',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// codeFormatting tests
// ============================================================================

describe('codeFormatting', () => {
  describe('formatImports', () => {
    it('should deduplicate identical imports', () => {
      const imports = [
        'import { ChatOpenAI } from "@langchain/openai";',
        'import { ChatOpenAI } from "@langchain/openai";',
        'import * as fs from "node:fs/promises";',
      ];
      const result = formatImports(imports);
      expect(result).toHaveLength(2);
    });

    it('should sort node builtins before @langchain', () => {
      const imports = [
        'import { ChatOpenAI } from "@langchain/openai";',
        'import * as fs from "node:fs/promises";',
      ];
      const result = formatImports(imports);
      expect(result[0]).toContain('node:fs');
      expect(result[1]).toContain('@langchain');
    });

    it('should sort @langchain before third-party', () => {
      const imports = [
        'import { something } from "other-pkg";',
        'import { ChatOpenAI } from "@langchain/openai";',
      ];
      const result = formatImports(imports);
      expect(result[0]).toContain('@langchain');
      expect(result[1]).toContain('other-pkg');
    });

    it('should handle empty array', () => {
      expect(formatImports([])).toEqual([]);
    });
  });

  describe('formatVariableNames', () => {
    it('should strip wfn- prefix and convert to camelCase', () => {
      expect(formatVariableNames('wfn-upload-1')).toBe('upload1');
    });

    it('should strip node- prefix', () => {
      expect(formatVariableNames('node-extract-data')).toBe('extractData');
    });

    it('should convert underscores to camelCase', () => {
      expect(formatVariableNames('my_transform')).toBe('myTransform');
    });

    it('should handle IDs starting with digits', () => {
      const result = formatVariableNames('123-node');
      expect(result).not.toMatch(/^\d/);
    });

    it('should handle simple IDs', () => {
      expect(formatVariableNames('upload')).toBe('upload');
    });
  });

  describe('addComments', () => {
    it('should add a header comment block', () => {
      const result = addComments('My Node', 'extract', 'wfn-1', 'const x = 1;');
      expect(result).toContain('Node: My Node');
      expect(result).toContain('Type: extract');
      expect(result).toContain('ID:   wfn-1');
      expect(result).toContain('const x = 1;');
    });
  });

  describe('generateFileHeader', () => {
    it('should include workflow ID and name', () => {
      const header = generateFileHeader('wf-123', 'My Pipeline');
      expect(header).toContain('wf-123');
      expect(header).toContain('My Pipeline');
    });

    it('should include manual-edit warning', () => {
      const header = generateFileHeader('wf-1', 'Test');
      expect(header).toContain('WARNING');
      expect(header).toContain('Manual edits');
    });

    it('should include a timestamp', () => {
      const header = generateFileHeader('wf-1', 'Test');
      // ISO 8601 date pattern
      expect(header).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

// ============================================================================
// nodeTemplates tests
// ============================================================================

describe('nodeTemplates', () => {
  describe('generateUploadNode', () => {
    it('should generate code with fs import', () => {
      const node = makeNode({ id: 'wfn-upload-1', type: 'upload' });
      const result = generateUploadNode('upload1', node);
      expect(result.imports).toContain('import * as fs from "node:fs/promises";');
      expect(result.code).toContain('upload1Run');
      expect(result.code).toContain('upload1Output');
      expect(result.outputVariable).toBe('upload1Output');
    });

    it('should use config values', () => {
      const node = makeNode({
        id: 'wfn-upload-1',
        type: 'upload',
        config: { source: 'api', format: 'json', filePath: '/data/input.json' },
      });
      const result = generateUploadNode('upload1', node);
      expect(result.code).toContain('/data/input.json');
    });
  });

  describe('generateExtractNode', () => {
    it('should generate code with LLM imports', () => {
      const node = makeNode({ id: 'wfn-extract-1', type: 'extract' });
      const result = generateExtractNode('extract1', node, 'prevOutput');
      expect(result.imports.some((i) => i.includes('ChatOpenAI'))).toBe(true);
      expect(result.code).toContain('extract1Run');
      expect(result.code).toContain('prevOutput');
    });

    it('should use custom model from config', () => {
      const node = makeNode({
        id: 'wfn-extract-1',
        type: 'extract',
        config: { model: 'gpt-3.5-turbo' },
      });
      const result = generateExtractNode('extract1', node);
      expect(result.code).toContain('gpt-3.5-turbo');
    });
  });

  describe('generateTransformNode', () => {
    it('should generate transform code', () => {
      const node = makeNode({ id: 'wfn-transform-1', type: 'transform' });
      const result = generateTransformNode('transform1', node, 'input');
      expect(result.code).toContain('transform1Run');
      expect(result.code).toContain('input');
    });
  });

  describe('generateOutputNode', () => {
    it('should generate file output code', () => {
      const node = makeNode({
        id: 'wfn-output-1',
        type: 'output',
        config: { destination: 'file', filePath: './result.txt' },
      });
      const result = generateOutputNode('output1', node, 'input');
      expect(result.code).toContain('output1Run');
      expect(result.code).toContain('./result.txt');
    });

    it('should generate stdout output code', () => {
      const node = makeNode({
        id: 'wfn-output-1',
        type: 'output',
        config: { destination: 'stdout' },
      });
      const result = generateOutputNode('output1', node, 'input');
      expect(result.code).toContain('console.log(output)');
    });
  });

  describe('generateNodeCode', () => {
    it('should dispatch to correct template', () => {
      const node = makeNode({ id: 'n1', type: 'upload' });
      const result = generateNodeCode('n1', node);
      expect(result.code).toContain('n1Run');
    });

    it('should throw for unsupported type', () => {
      const node = makeNode({ id: 'n1', type: 'unknown' as any });
      expect(() => generateNodeCode('n1', node)).toThrow('Unsupported workflow node type');
    });
  });
});

// ============================================================================
// chainTemplates tests
// ============================================================================

describe('chainTemplates', () => {
  describe('topologicalSort', () => {
    it('should sort a linear chain correctly', () => {
      const nodes = [
        makeNode({ id: 'c', type: 'output' }),
        makeNode({ id: 'a', type: 'upload' }),
        makeNode({ id: 'b', type: 'extract' }),
      ];
      const connections = [
        makeConnection('c1', 'a', 'b'),
        makeConnection('c2', 'b', 'c'),
      ];

      const sorted = topologicalSort(nodes, connections);
      const ids = sorted.map((n) => n.id);
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
    });

    it('should handle a diamond-shaped DAG', () => {
      const nodes = [
        makeNode({ id: 'a', type: 'upload' }),
        makeNode({ id: 'b', type: 'extract' }),
        makeNode({ id: 'c', type: 'transform' }),
        makeNode({ id: 'd', type: 'output' }),
      ];
      const connections = [
        makeConnection('c1', 'a', 'b'),
        makeConnection('c2', 'a', 'c'),
        makeConnection('c3', 'b', 'd'),
        makeConnection('c4', 'c', 'd'),
      ];

      const sorted = topologicalSort(nodes, connections);
      const ids = sorted.map((n) => n.id);
      expect(ids[0]).toBe('a');
      expect(ids[ids.length - 1]).toBe('d');
    });

    it('should detect cycles and throw', () => {
      const nodes = [
        makeNode({ id: 'a', type: 'upload' }),
        makeNode({ id: 'b', type: 'extract' }),
      ];
      const connections = [
        makeConnection('c1', 'a', 'b'),
        makeConnection('c2', 'b', 'a'),
      ];

      expect(() => topologicalSort(nodes, connections)).toThrow('cycle');
    });

    it('should handle disconnected nodes', () => {
      const nodes = [
        makeNode({ id: 'a', type: 'upload' }),
        makeNode({ id: 'b', type: 'extract' }),
      ];

      const sorted = topologicalSort(nodes, []);
      expect(sorted).toHaveLength(2);
    });

    it('should handle single node', () => {
      const nodes = [makeNode({ id: 'a', type: 'upload' })];
      const sorted = topologicalSort(nodes, []);
      expect(sorted).toEqual(nodes);
    });
  });
});

// ============================================================================
// Validation tests
// ============================================================================

describe('validateWorkflow', () => {
  it('should pass for a valid workflow', () => {
    const nodes = [
      makeNode({ id: 'a', type: 'upload' }),
      makeNode({ id: 'b', type: 'output' }),
    ];
    const connections = [makeConnection('c1', 'a', 'b')];
    const workflow = makeWorkflow(nodes, connections);

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for empty workflow', () => {
    const workflow = makeWorkflow([], []);
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('at least one node');
  });

  it('should fail for connection referencing non-existent source', () => {
    const nodes = [makeNode({ id: 'a', type: 'upload' })];
    const connections = [makeConnection('c1', 'missing', 'a')];
    const workflow = makeWorkflow(nodes, connections);

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('non-existent source'))).toBe(true);
  });

  it('should fail for connection referencing non-existent target', () => {
    const nodes = [makeNode({ id: 'a', type: 'upload' })];
    const connections = [makeConnection('c1', 'a', 'missing')];
    const workflow = makeWorkflow(nodes, connections);

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('non-existent target'))).toBe(true);
  });

  it('should fail for self-loops', () => {
    const nodes = [makeNode({ id: 'a', type: 'upload' })];
    const connections = [makeConnection('c1', 'a', 'a')];
    const workflow = makeWorkflow(nodes, connections);

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('self-loop'))).toBe(true);
  });

  it('should fail for duplicate connections', () => {
    const nodes = [
      makeNode({ id: 'a', type: 'upload' }),
      makeNode({ id: 'b', type: 'output' }),
    ];
    const connections = [
      makeConnection('c1', 'a', 'b'),
      makeConnection('c2', 'a', 'b'),
    ];
    const workflow = makeWorkflow(nodes, connections);

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('should fail for unsupported node type', () => {
    const nodes = [makeNode({ id: 'a', type: 'unknown' as any })];
    const workflow = makeWorkflow(nodes, []);

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('unsupported type'))).toBe(true);
  });
});

// ============================================================================
// CodeGenerator integration tests
// ============================================================================

describe('CodeGenerator', () => {
  const generator = new CodeGenerator();

  it('should generate code for a simple linear workflow', async () => {
    const nodes = [
      makeNode({ id: 'upload-1', type: 'upload', metadata: { label: 'File Upload' } }),
      makeNode({ id: 'extract-1', type: 'extract', metadata: { label: 'Extract Data' } }),
      makeNode({ id: 'output-1', type: 'output', metadata: { label: 'Save Results' } }),
    ];
    const connections = [
      makeConnection('c1', 'upload-1', 'extract-1'),
      makeConnection('c2', 'extract-1', 'output-1'),
    ];
    const workflow = makeWorkflow(nodes, connections, { name: 'Simple Pipeline' });

    const code = await generator.generateCode(workflow);

    // Should have file header
    expect(code).toContain('Generated LangChain Workflow: Simple Pipeline');
    expect(code).toContain('WARNING');

    // Should have imports
    expect(code).toContain('import');
    expect(code).toContain('@langchain');

    // Should have main function
    expect(code).toContain('async function main()');

    // Should have error handling
    expect(code).toContain('try {');
    expect(code).toContain('catch (error)');

    // Should have logging
    expect(code).toContain('console.log');
    expect(code).toContain('console.error');
  });

  it('should include all necessary LangChain imports', async () => {
    const nodes = [
      makeNode({ id: 'upload-1', type: 'upload' }),
      makeNode({ id: 'extract-1', type: 'extract' }),
      makeNode({ id: 'transform-1', type: 'transform' }),
      makeNode({ id: 'output-1', type: 'output' }),
    ];
    const connections = [
      makeConnection('c1', 'upload-1', 'extract-1'),
      makeConnection('c2', 'extract-1', 'transform-1'),
      makeConnection('c3', 'transform-1', 'output-1'),
    ];
    const workflow = makeWorkflow(nodes, connections);

    const code = await generator.generateCode(workflow);

    expect(code).toContain('import * as fs from "node:fs/promises"');
    expect(code).toContain('import { ChatOpenAI } from "@langchain/openai"');
    expect(code).toContain('import { Document } from "@langchain/core/documents"');
    expect(code).toContain('import { HumanMessage, SystemMessage } from "@langchain/core/messages"');
  });

  it('should respect node execution order from connections', async () => {
    const nodes = [
      makeNode({ id: 'output-1', type: 'output' }),
      makeNode({ id: 'upload-1', type: 'upload' }),
      makeNode({ id: 'extract-1', type: 'extract' }),
    ];
    const connections = [
      makeConnection('c1', 'upload-1', 'extract-1'),
      makeConnection('c2', 'extract-1', 'output-1'),
    ];
    const workflow = makeWorkflow(nodes, connections);

    const code = await generator.generateCode(workflow);

    // upload should appear before extract, extract before output
    const uploadIdx = code.indexOf('upload1Run');
    const extractIdx = code.indexOf('extract1Run');
    const outputIdx = code.indexOf('output1Run');

    expect(uploadIdx).toBeLessThan(extractIdx);
    expect(extractIdx).toBeLessThan(outputIdx);
  });

  it('should include error handling and logging', async () => {
    const nodes = [makeNode({ id: 'upload-1', type: 'upload' })];
    const workflow = makeWorkflow(nodes, []);

    const code = await generator.generateCode(workflow);

    // Top-level try/catch
    expect(code).toContain('try {');
    expect(code).toContain('catch (error)');
    expect(code).toContain('console.error');

    // Node-level error handling
    expect(code).toContain('Upload failed');
  });

  it('should throw for invalid workflow', async () => {
    const workflow = makeWorkflow([], []);
    await expect(generator.generateCode(workflow)).rejects.toThrow('validation failed');
  });

  it('should throw for cyclic workflow', async () => {
    const nodes = [
      makeNode({ id: 'a', type: 'extract' }),
      makeNode({ id: 'b', type: 'transform' }),
    ];
    const connections = [
      makeConnection('c1', 'a', 'b'),
      makeConnection('c2', 'b', 'a'),
    ];
    const workflow = makeWorkflow(nodes, connections);

    await expect(generator.generateCode(workflow)).rejects.toThrow('cycle');
  });

  it('should generate code in under 500ms for 50+ nodes', async () => {
    // Build a chain of 55 nodes
    const nodes: WorkflowNode[] = [];
    const connections: WorkflowConnection[] = [];

    // First node is always upload
    nodes.push(makeNode({ id: 'node-0', type: 'upload' }));

    // Middle nodes alternate between extract and transform
    for (let i = 1; i < 54; i++) {
      const type = i % 2 === 0 ? 'extract' : 'transform';
      nodes.push(makeNode({ id: `node-${i}`, type }));
      connections.push(makeConnection(`c-${i}`, `node-${i - 1}`, `node-${i}`));
    }

    // Last node is output
    nodes.push(makeNode({ id: 'node-54', type: 'output' }));
    connections.push(makeConnection('c-54', 'node-53', 'node-54'));

    const workflow = makeWorkflow(nodes, connections, { name: 'Large Workflow' });

    const start = performance.now();
    const code = await generator.generateCode(workflow);
    const elapsed = performance.now() - start;

    expect(code).toBeTruthy();
    expect(code.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });

  it('should handle a single-node workflow', async () => {
    const nodes = [makeNode({ id: 'upload-1', type: 'upload' })];
    const workflow = makeWorkflow(nodes, []);

    const code = await generator.generateCode(workflow);
    expect(code).toContain('upload1Run');
    expect(code).toContain('async function main()');
  });

  it('should deduplicate imports across multiple nodes', async () => {
    const nodes = [
      makeNode({ id: 'extract-1', type: 'extract' }),
      makeNode({ id: 'extract-2', type: 'extract' }),
    ];
    const connections = [makeConnection('c1', 'extract-1', 'extract-2')];
    const workflow = makeWorkflow(nodes, connections);

    const code = await generator.generateCode(workflow);

    // ChatOpenAI import should appear only once
    const matches = code.match(/import \{ ChatOpenAI \}/g);
    expect(matches).toHaveLength(1);
  });

  it('should include workflow ID in generated header', async () => {
    const nodes = [makeNode({ id: 'upload-1', type: 'upload' })];
    const workflow = makeWorkflow(nodes, [], { id: 'wf-unique-id' });

    const code = await generator.generateCode(workflow);
    expect(code).toContain('wf-unique-id');
  });
});
