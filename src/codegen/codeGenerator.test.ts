/**
 * Tests for the code generation system.
 *
 * Covers: codeFormatting, nodeTemplates, chainTemplates, codeGenerator
 */

import { describe, it, expect } from 'vitest';
import type { Workflow, WorkflowNode, WorkflowConnection } from '../types/workflow.js';
import {
  formatImports,
  formatVariableName,
  toCamelCase,
  addComment,
  generateHeader,
} from './codeFormatting.js';
import type { ImportStatement } from './codeFormatting.js';
import {
  generateUploadNode,
  generateExtractNode,
  generateTransformNode,
  generateOutputNode,
  generateNodeCode,
} from './nodeTemplates.js';
import { generateChain } from './chainTemplates.js';
import { topologicalSort, validateWorkflow, generateCode } from './codeGenerator.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeNode(overrides: Partial<WorkflowNode> & { id: string; type: WorkflowNode['type'] }): WorkflowNode {
  return {
    position: { x: 0, y: 0 },
    config: {},
    metadata: {},
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeConnection(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
): WorkflowConnection {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    sourcePort: 'output',
    targetPort: 'input',
    createdAt: '2025-01-01T00:00:00Z',
  };
}

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-test-001',
    name: 'Test Workflow',
    description: 'A test workflow',
    nodes: [],
    connections: [],
    userId: 'user-1',
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// codeFormatting tests
// ============================================================================

describe('codeFormatting', () => {
  describe('formatImports', () => {
    it('should deduplicate imports from the same module', () => {
      const imports: ImportStatement[] = [
        { module: '@langchain/openai', namedImports: ['ChatOpenAI'] },
        { module: '@langchain/openai', namedImports: ['ChatOpenAI', 'OpenAIEmbeddings'] },
      ];
      const result = formatImports(imports);
      expect(result).toBe("import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';");
    });

    it('should sort modules with @langchain first', () => {
      const imports: ImportStatement[] = [
        { module: 'fs/promises', namedImports: ['writeFile'] },
        { module: '@langchain/openai', namedImports: ['ChatOpenAI'] },
        { module: '@langchain/core/prompts', namedImports: ['ChatPromptTemplate'] },
      ];
      const result = formatImports(imports);
      const lines = result.split('\n');
      expect(lines[0]).toContain('@langchain/core/prompts');
      expect(lines[1]).toContain('@langchain/openai');
      expect(lines[2]).toContain('fs/promises');
    });

    it('should sort named imports alphabetically', () => {
      const imports: ImportStatement[] = [
        { module: '@langchain/openai', namedImports: ['OpenAIEmbeddings', 'ChatOpenAI'] },
      ];
      const result = formatImports(imports);
      expect(result).toBe("import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';");
    });

    it('should handle type-only imports separately', () => {
      const imports: ImportStatement[] = [
        { module: '@langchain/core/documents', namedImports: ['Document'] },
        { module: '@langchain/core/documents', namedImports: ['DocumentInterface'], isTypeOnly: true },
      ];
      const result = formatImports(imports);
      expect(result).toContain("import { Document } from '@langchain/core/documents';");
      expect(result).toContain("import type { DocumentInterface } from '@langchain/core/documents';");
    });

    it('should return empty string for empty imports', () => {
      expect(formatImports([])).toBe('');
    });
  });

  describe('formatVariableName', () => {
    it('should create a camelCase name from type and index', () => {
      const result = formatVariableName('node-abc123', 'upload', 0);
      expect(result).toBe('uploadNode1');
    });

    it('should handle different types', () => {
      expect(formatVariableName('n1', 'extract', 2)).toBe('extractNode3');
      expect(formatVariableName('n2', 'transform', 0)).toBe('transformNode1');
      expect(formatVariableName('n3', 'output', 1)).toBe('outputNode2');
    });

    it('should handle undefined index', () => {
      expect(formatVariableName('n1', 'upload')).toBe('uploadNode');
    });
  });

  describe('toCamelCase', () => {
    it('should convert hyphenated strings', () => {
      expect(toCamelCase('hello-world')).toBe('helloWorld');
    });

    it('should convert underscored strings', () => {
      expect(toCamelCase('hello_world')).toBe('helloWorld');
    });

    it('should lowercase the first character', () => {
      expect(toCamelCase('HelloWorld')).toBe('helloWorld');
    });

    it('should handle single words', () => {
      expect(toCamelCase('upload')).toBe('upload');
    });
  });

  describe('addComment', () => {
    it('should generate JSDoc with node info', () => {
      const result = addComment('upload', 'node-1', { acceptedFormats: ['pdf'] });
      expect(result).toContain('/**');
      expect(result).toContain('*/');
      expect(result).toContain('@nodeId node-1');
      expect(result).toContain('@nodeType upload');
      expect(result).toContain('Handles file upload');
    });

    it('should include config entries', () => {
      const result = addComment('extract', 'node-2', { prompt: 'Extract data' });
      expect(result).toContain('@config prompt');
    });

    it('should handle empty config', () => {
      const result = addComment('transform', 'node-3', {});
      expect(result).not.toContain('@config');
    });
  });

  describe('generateHeader', () => {
    it('should include workflow ID and name', () => {
      const result = generateHeader('wf-123', 'My Workflow');
      expect(result).toContain('AUTO-GENERATED CODE');
      expect(result).toContain('wf-123');
      expect(result).toContain('My Workflow');
      expect(result).toContain('WARNING');
    });

    it('should include a timestamp', () => {
      const result = generateHeader('wf-123', 'Test');
      expect(result).toContain('Generated at:');
    });
  });
});

// ============================================================================
// nodeTemplates tests
// ============================================================================

describe('nodeTemplates', () => {
  describe('generateUploadNode', () => {
    it('should generate code with TextLoader', () => {
      const node = makeNode({ id: 'n1', type: 'upload', config: { sourcePath: './data' } });
      const result = generateUploadNode(node, 0);

      expect(result.code).toContain('TextLoader');
      expect(result.code).toContain('./data');
      expect(result.code).toContain('try {');
      expect(result.code).toContain('catch (error');
      expect(result.outputVariable).toContain('Result');
      expect(result.imports.length).toBeGreaterThan(0);
    });

    it('should use default sourcePath if not configured', () => {
      const node = makeNode({ id: 'n1', type: 'upload' });
      const result = generateUploadNode(node, 0);
      expect(result.code).toContain('./uploads');
    });
  });

  describe('generateExtractNode', () => {
    it('should generate code with ChatOpenAI and prompt chain', () => {
      const node = makeNode({ id: 'n2', type: 'extract', config: { prompt: 'Extract key data' } });
      const result = generateExtractNode(node, 0, 'uploadNode1Result');

      expect(result.code).toContain('ChatOpenAI');
      expect(result.code).toContain('ChatPromptTemplate');
      expect(result.code).toContain('StringOutputParser');
      expect(result.code).toContain('.pipe(');
      expect(result.code).toContain('uploadNode1Result');
      expect(result.code).toContain('try {');
    });

    it('should use configured model', () => {
      const node = makeNode({ id: 'n2', type: 'extract', config: { model: 'gpt-3.5-turbo' } });
      const result = generateExtractNode(node, 0, 'input');
      expect(result.code).toContain('gpt-3.5-turbo');
    });
  });

  describe('generateTransformNode', () => {
    it('should generate LLM-based transform by default', () => {
      const node = makeNode({ id: 'n3', type: 'transform' });
      const result = generateTransformNode(node, 0, 'input');

      expect(result.code).toContain('ChatOpenAI');
      expect(result.code).toContain('.pipe(');
      expect(result.code).toContain('try {');
    });

    it('should generate RunnableLambda for custom operations', () => {
      const node = makeNode({
        id: 'n3',
        type: 'transform',
        config: { operation: 'custom', expression: 'data.toUpperCase()' },
      });
      const result = generateTransformNode(node, 0, 'input');

      expect(result.code).toContain('RunnableLambda');
      expect(result.imports.some(i => i.namedImports.includes('RunnableLambda'))).toBe(true);
    });
  });

  describe('generateOutputNode', () => {
    it('should generate console output by default', () => {
      const node = makeNode({ id: 'n4', type: 'output' });
      const result = generateOutputNode(node, 0, 'input');

      expect(result.code).toContain('console.log');
      expect(result.code).toContain('try {');
    });

    it('should generate file output when configured', () => {
      const node = makeNode({
        id: 'n4',
        type: 'output',
        config: { destination: 'file', filePath: './out/result.json' },
      });
      const result = generateOutputNode(node, 0, 'input');

      expect(result.code).toContain('writeFile');
      expect(result.code).toContain('./out/result.json');
    });
  });

  describe('generateNodeCode', () => {
    it('should dispatch to correct template by type', () => {
      const uploadNode = makeNode({ id: 'n1', type: 'upload' });
      expect(generateNodeCode(uploadNode, 0, '').code).toContain('TextLoader');

      const extractNode = makeNode({ id: 'n2', type: 'extract' });
      expect(generateNodeCode(extractNode, 0, 'input').code).toContain('ChatOpenAI');

      const transformNode = makeNode({ id: 'n3', type: 'transform' });
      expect(generateNodeCode(transformNode, 0, 'input').code).toContain('ChatOpenAI');

      const outputNode = makeNode({ id: 'n4', type: 'output' });
      expect(generateNodeCode(outputNode, 0, 'input').code).toContain('console.log');
    });

    it('should throw for unknown node types', () => {
      const badNode = makeNode({ id: 'n1', type: 'unknown' as any });
      expect(() => generateNodeCode(badNode, 0, '')).toThrow('Unknown node type');
    });
  });
});

// ============================================================================
// chainTemplates tests
// ============================================================================

describe('chainTemplates', () => {
  describe('generateChain', () => {
    it('should wire nodes together based on connections', () => {
      const nodes: WorkflowNode[] = [
        makeNode({ id: 'n1', type: 'upload' }),
        makeNode({ id: 'n2', type: 'extract' }),
        makeNode({ id: 'n3', type: 'output' }),
      ];
      const connections: WorkflowConnection[] = [
        makeConnection('c1', 'n1', 'n2'),
        makeConnection('c2', 'n2', 'n3'),
      ];

      const result = generateChain(nodes, connections);

      expect(result.nodeCode).toContain('TextLoader'); // upload node
      expect(result.nodeCode).toContain('ChatOpenAI'); // extract node
      expect(result.imports.length).toBeGreaterThan(0);
      expect(result.finalOutputVariable).toBeTruthy();
    });

    it('should return empty comment for empty workflow', () => {
      const result = generateChain([], []);
      expect(result.nodeCode).toContain('Empty workflow');
      expect(result.finalOutputVariable).toBe('');
    });

    it('should handle multiple inputs to a single node', () => {
      const nodes: WorkflowNode[] = [
        makeNode({ id: 'n1', type: 'upload' }),
        makeNode({ id: 'n2', type: 'upload' }),
        makeNode({ id: 'n3', type: 'extract' }),
      ];
      const connections: WorkflowConnection[] = [
        makeConnection('c1', 'n1', 'n3'),
        makeConnection('c2', 'n2', 'n3'),
      ];

      const result = generateChain(nodes, connections);

      // Should contain a combined input variable
      expect(result.nodeCode).toContain('combined_');
    });
  });
});

// ============================================================================
// codeGenerator tests
// ============================================================================

describe('codeGenerator', () => {
  describe('topologicalSort', () => {
    it('should sort a linear chain correctly', () => {
      const nodes: WorkflowNode[] = [
        makeNode({ id: 'n3', type: 'output' }),
        makeNode({ id: 'n1', type: 'upload' }),
        makeNode({ id: 'n2', type: 'extract' }),
      ];
      const connections: WorkflowConnection[] = [
        makeConnection('c1', 'n1', 'n2'),
        makeConnection('c2', 'n2', 'n3'),
      ];

      const sorted = topologicalSort(nodes, connections);
      const ids = sorted.map(n => n.id);

      expect(ids.indexOf('n1')).toBeLessThan(ids.indexOf('n2'));
      expect(ids.indexOf('n2')).toBeLessThan(ids.indexOf('n3'));
    });

    it('should sort a branching workflow correctly', () => {
      const nodes: WorkflowNode[] = [
        makeNode({ id: 'n1', type: 'upload' }),
        makeNode({ id: 'n2', type: 'extract' }),
        makeNode({ id: 'n3', type: 'transform' }),
        makeNode({ id: 'n4', type: 'output' }),
      ];
      const connections: WorkflowConnection[] = [
        makeConnection('c1', 'n1', 'n2'),
        makeConnection('c2', 'n1', 'n3'),
        makeConnection('c3', 'n2', 'n4'),
        makeConnection('c4', 'n3', 'n4'),
      ];

      const sorted = topologicalSort(nodes, connections);
      const ids = sorted.map(n => n.id);

      // n1 must come before n2, n3; n2 and n3 must come before n4
      expect(ids.indexOf('n1')).toBeLessThan(ids.indexOf('n2'));
      expect(ids.indexOf('n1')).toBeLessThan(ids.indexOf('n3'));
      expect(ids.indexOf('n2')).toBeLessThan(ids.indexOf('n4'));
      expect(ids.indexOf('n3')).toBeLessThan(ids.indexOf('n4'));
    });

    it('should detect cycles and throw', () => {
      const nodes: WorkflowNode[] = [
        makeNode({ id: 'n1', type: 'upload' }),
        makeNode({ id: 'n2', type: 'extract' }),
        makeNode({ id: 'n3', type: 'transform' }),
      ];
      const connections: WorkflowConnection[] = [
        makeConnection('c1', 'n1', 'n2'),
        makeConnection('c2', 'n2', 'n3'),
        makeConnection('c3', 'n3', 'n2'), // Cycle: n2 -> n3 -> n2
      ];

      expect(() => topologicalSort(nodes, connections)).toThrow('Cycle detected');
    });

    it('should handle single-node workflows', () => {
      const nodes: WorkflowNode[] = [
        makeNode({ id: 'n1', type: 'upload' }),
      ];
      const sorted = topologicalSort(nodes, []);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].id).toBe('n1');
    });

    it('should handle disconnected nodes', () => {
      const nodes: WorkflowNode[] = [
        makeNode({ id: 'n1', type: 'upload' }),
        makeNode({ id: 'n2', type: 'output' }),
      ];
      const sorted = topologicalSort(nodes, []);
      expect(sorted).toHaveLength(2);
    });
  });

  describe('validateWorkflow', () => {
    it('should pass a valid workflow', () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({ id: 'n1', type: 'upload' }),
          makeNode({ id: 'n2', type: 'extract' }),
          makeNode({ id: 'n3', type: 'output' }),
        ],
        connections: [
          makeConnection('c1', 'n1', 'n2'),
          makeConnection('c2', 'n2', 'n3'),
        ],
      });

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty workflows', () => {
      const workflow = makeWorkflow({ nodes: [] });
      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('no nodes');
    });

    it('should reject workflows without upload nodes', () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({ id: 'n1', type: 'extract' }),
          makeNode({ id: 'n2', type: 'output' }),
        ],
        connections: [makeConnection('c1', 'n1', 'n2')],
      });

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('upload'))).toBe(true);
    });

    it('should reject workflows without output nodes', () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({ id: 'n1', type: 'upload' }),
          makeNode({ id: 'n2', type: 'extract' }),
        ],
        connections: [makeConnection('c1', 'n1', 'n2')],
      });

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('output'))).toBe(true);
    });

    it('should reject connections referencing non-existent nodes', () => {
      const workflow = makeWorkflow({
        nodes: [makeNode({ id: 'n1', type: 'upload' })],
        connections: [makeConnection('c1', 'n1', 'n99')],
      });

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('non-existent'))).toBe(true);
    });

    it('should detect cycles', () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({ id: 'n1', type: 'upload' }),
          makeNode({ id: 'n2', type: 'extract' }),
          makeNode({ id: 'n3', type: 'output' }),
        ],
        connections: [
          makeConnection('c1', 'n1', 'n2'),
          makeConnection('c2', 'n2', 'n3'),
          makeConnection('c3', 'n3', 'n2'), // cycle
        ],
      });

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Cycle'))).toBe(true);
    });
  });

  describe('generateCode', () => {
    it('should generate valid code for a simple workflow', async () => {
      const workflow = makeWorkflow({
        name: 'Simple Pipeline',
        nodes: [
          makeNode({ id: 'n1', type: 'upload', config: { sourcePath: './data' } }),
          makeNode({ id: 'n2', type: 'extract', config: { prompt: 'Extract info' } }),
          makeNode({ id: 'n3', type: 'output', config: { format: 'json' } }),
        ],
        connections: [
          makeConnection('c1', 'n1', 'n2'),
          makeConnection('c2', 'n2', 'n3'),
        ],
      });

      const result = await generateCode(workflow);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Check the generated code structure
      expect(result.code).toContain('AUTO-GENERATED CODE');
      expect(result.code).toContain('wf-test-001');
      expect(result.code).toContain('import');
      expect(result.code).toContain('export async function');
      expect(result.code).toContain('TextLoader');
      expect(result.code).toContain('ChatOpenAI');
      expect(result.code).toContain('try {');
      expect(result.code).toContain('catch (error');
      expect(result.code).toContain('console.log');
      expect(result.code).toContain('console.error');
    });

    it('should return errors for invalid workflows', async () => {
      const workflow = makeWorkflow({ nodes: [] });
      const result = await generateCode(workflow);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.code).toBe('');
    });

    it('should include all necessary LangChain imports', async () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({ id: 'n1', type: 'upload' }),
          makeNode({ id: 'n2', type: 'extract' }),
          makeNode({ id: 'n3', type: 'transform' }),
          makeNode({ id: 'n4', type: 'output' }),
        ],
        connections: [
          makeConnection('c1', 'n1', 'n2'),
          makeConnection('c2', 'n2', 'n3'),
          makeConnection('c3', 'n3', 'n4'),
        ],
      });

      const result = await generateCode(workflow);
      expect(result.success).toBe(true);
      expect(result.code).toContain('@langchain/openai');
      expect(result.code).toContain('@langchain/core/prompts');
      expect(result.code).toContain('@langchain/core/output_parsers');
      expect(result.code).toContain('@langchain/core/documents');
    });

    it('should match visual connection order in generated chain', async () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({ id: 'n3', type: 'output' }), // Intentionally out of order
          makeNode({ id: 'n1', type: 'upload' }),
          makeNode({ id: 'n2', type: 'extract' }),
        ],
        connections: [
          makeConnection('c1', 'n1', 'n2'),
          makeConnection('c2', 'n2', 'n3'),
        ],
      });

      const result = await generateCode(workflow);
      expect(result.success).toBe(true);

      // Node execution code should appear in topological order.
      // Use log messages unique to each node type as markers (not import names).
      const uploadIndex = result.code.indexOf('Loading documents from');
      const extractIndex = result.code.indexOf('Extracting data');
      const outputIndex = result.code.indexOf('Preparing');

      expect(uploadIndex).toBeGreaterThan(-1);
      expect(extractIndex).toBeGreaterThan(-1);
      expect(outputIndex).toBeGreaterThan(-1);
      expect(uploadIndex).toBeLessThan(extractIndex);
      expect(extractIndex).toBeLessThan(outputIndex);
    });

    it('should include error handling for each node', async () => {
      const workflow = makeWorkflow({
        nodes: [
          makeNode({ id: 'n1', type: 'upload' }),
          makeNode({ id: 'n2', type: 'extract' }),
          makeNode({ id: 'n3', type: 'output' }),
        ],
        connections: [
          makeConnection('c1', 'n1', 'n2'),
          makeConnection('c2', 'n2', 'n3'),
        ],
      });

      const result = await generateCode(workflow);
      expect(result.success).toBe(true);

      // Each node should have try-catch
      const tryCount = (result.code.match(/try \{/g) || []).length;
      const catchCount = (result.code.match(/catch \(error/g) || []).length;

      expect(tryCount).toBe(3); // One per node
      expect(catchCount).toBe(3);
    });

    it('should complete in under 500ms for 50+ nodes', async () => {
      // Create a workflow with 50+ nodes in a chain
      const nodes: WorkflowNode[] = [];
      const connections: WorkflowConnection[] = [];

      // 1 upload + 25 extract + 25 transform + 1 output = 52 nodes
      nodes.push(makeNode({ id: 'upload-0', type: 'upload' }));

      for (let i = 0; i < 25; i++) {
        nodes.push(makeNode({ id: `extract-${i}`, type: 'extract' }));
      }
      for (let i = 0; i < 25; i++) {
        nodes.push(makeNode({ id: `transform-${i}`, type: 'transform' }));
      }
      nodes.push(makeNode({ id: 'output-0', type: 'output' }));

      // Chain: upload -> extract-0 -> ... -> extract-24 -> transform-0 -> ... -> transform-24 -> output
      connections.push(makeConnection('c0', 'upload-0', 'extract-0'));
      for (let i = 0; i < 24; i++) {
        connections.push(makeConnection(`ce-${i}`, `extract-${i}`, `extract-${i + 1}`));
      }
      connections.push(makeConnection('c-bridge', 'extract-24', 'transform-0'));
      for (let i = 0; i < 24; i++) {
        connections.push(makeConnection(`ct-${i}`, `transform-${i}`, `transform-${i + 1}`));
      }
      connections.push(makeConnection('c-final', 'transform-24', 'output-0'));

      const workflow = makeWorkflow({ nodes, connections });

      const result = await generateCode(workflow);
      expect(result.success).toBe(true);
      expect(result.durationMs).toBeLessThan(500);
      expect(result.code.length).toBeGreaterThan(0);
    });

    it('should generate a header with workflow metadata', async () => {
      const workflow = makeWorkflow({
        id: 'wf-header-test',
        name: 'Header Test',
        nodes: [
          makeNode({ id: 'n1', type: 'upload' }),
          makeNode({ id: 'n2', type: 'output' }),
        ],
        connections: [makeConnection('c1', 'n1', 'n2')],
      });

      const result = await generateCode(workflow);
      expect(result.success).toBe(true);
      expect(result.code).toContain('AUTO-GENERATED CODE - DO NOT EDIT MANUALLY');
      expect(result.code).toContain('wf-header-test');
      expect(result.code).toContain('Header Test');
      expect(result.code).toContain('Manual edits to this file will break visual editor sync');
    });

    it('should generate a named function based on workflow name', async () => {
      const workflow = makeWorkflow({
        name: 'Document Processing',
        nodes: [
          makeNode({ id: 'n1', type: 'upload' }),
          makeNode({ id: 'n2', type: 'output' }),
        ],
        connections: [makeConnection('c1', 'n1', 'n2')],
      });

      const result = await generateCode(workflow);
      expect(result.success).toBe(true);
      expect(result.code).toContain('executeDocumentProcessingWorkflow');
    });
  });
});
