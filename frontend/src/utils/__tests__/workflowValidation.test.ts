import { describe, it, expect } from 'vitest';
import {
  isValidConnection,
  wouldCreateCycle,
  validateWorkflow,
  getConnectionErrors,
  getValidTargetTypes,
  getValidSourceTypes,
  EditorNode,
  EditorConnection,
} from '../workflowValidation';

// ============================================================================
// Test helpers
// ============================================================================

function makeNode(id: string, type: 'upload' | 'extract' | 'transform' | 'output', label?: string): EditorNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    config: {},
    metadata: { label: label || type },
  };
}

function makeConnection(id: string, sourceNodeId: string, targetNodeId: string): EditorConnection {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    sourcePort: 'output',
    targetPort: 'input',
  };
}

// ============================================================================
// isValidConnection
// ============================================================================

describe('isValidConnection', () => {
  const upload = makeNode('n1', 'upload', 'Upload Files');
  const extract = makeNode('n2', 'extract', 'Extract Data');
  const transform = makeNode('n3', 'transform', 'Transform Data');
  const output = makeNode('n4', 'output', 'Export CSV');
  const allNodes = [upload, extract, transform, output];

  it('allows upload -> extract', () => {
    const result = isValidConnection('n1', 'n2', 'output', 'input', allNodes, []);
    expect(result).toBeNull();
  });

  it('allows upload -> transform', () => {
    const result = isValidConnection('n1', 'n3', 'output', 'input', allNodes, []);
    expect(result).toBeNull();
  });

  it('allows extract -> transform', () => {
    const result = isValidConnection('n2', 'n3', 'output', 'input', allNodes, []);
    expect(result).toBeNull();
  });

  it('allows extract -> output', () => {
    const result = isValidConnection('n2', 'n4', 'output', 'input', allNodes, []);
    expect(result).toBeNull();
  });

  it('allows transform -> output', () => {
    const result = isValidConnection('n3', 'n4', 'output', 'input', allNodes, []);
    expect(result).toBeNull();
  });

  it('allows transform -> transform', () => {
    const t2 = makeNode('n5', 'transform');
    const result = isValidConnection('n3', 'n5', 'output', 'input', [...allNodes, t2], []);
    expect(result).toBeNull();
  });

  it('rejects self-connection', () => {
    const result = isValidConnection('n1', 'n1', 'output', 'input', allNodes, []);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('self_connection');
  });

  it('rejects duplicate connection', () => {
    const existing = [makeConnection('c1', 'n1', 'n2')];
    const result = isValidConnection('n1', 'n2', 'output', 'input', allNodes, existing);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('duplicate_connection');
  });

  it('rejects output -> anything (output cannot be source)', () => {
    const result = isValidConnection('n4', 'n1', 'output', 'input', allNodes, []);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('invalid_connection');
    expect(result!.message).toContain('output node');
  });

  it('rejects anything -> upload (upload cannot be target)', () => {
    const result = isValidConnection('n2', 'n1', 'output', 'input', allNodes, []);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('invalid_connection');
  });

  it('rejects upload -> output (not a valid direct connection)', () => {
    const result = isValidConnection('n1', 'n4', 'output', 'input', allNodes, []);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('invalid_connection');
  });

  it('rejects connection referencing non-existent source', () => {
    const result = isValidConnection('nonexistent', 'n2', 'output', 'input', allNodes, []);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('missing_node');
  });

  it('rejects connection referencing non-existent target', () => {
    const result = isValidConnection('n1', 'nonexistent', 'output', 'input', allNodes, []);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('missing_node');
  });

  it('rejects connection that would create cycle', () => {
    // For this test, we need types that allow the connection:
    // transform -> upload would be invalid by type rules before cycle check
    // So let's use transform -> transform cycle
    const t1 = makeNode('t1', 'transform');
    const t2 = makeNode('t2', 'transform');
    const t3 = makeNode('t3', 'transform');
    const tNodes = [t1, t2, t3];
    const tConns = [
      makeConnection('c1', 't1', 't2'),
      makeConnection('c2', 't2', 't3'),
    ];
    const result = isValidConnection('t3', 't1', 'output', 'input', tNodes, tConns);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('cycle_detected');
  });
});

// ============================================================================
// wouldCreateCycle
// ============================================================================

describe('wouldCreateCycle', () => {
  it('returns false for empty graph', () => {
    expect(wouldCreateCycle('a', 'b', [])).toBe(false);
  });

  it('returns false for linear chain (no cycle)', () => {
    const conns = [
      makeConnection('c1', 'a', 'b'),
      makeConnection('c2', 'b', 'c'),
    ];
    expect(wouldCreateCycle('c', 'd', conns)).toBe(false);
  });

  it('returns true when adding edge would create direct cycle', () => {
    const conns = [makeConnection('c1', 'a', 'b')];
    expect(wouldCreateCycle('b', 'a', conns)).toBe(true);
  });

  it('returns true when adding edge would create indirect cycle', () => {
    const conns = [
      makeConnection('c1', 'a', 'b'),
      makeConnection('c2', 'b', 'c'),
      makeConnection('c3', 'c', 'd'),
    ];
    expect(wouldCreateCycle('d', 'a', conns)).toBe(true);
  });

  it('handles branching graph without false positive', () => {
    // a -> b, a -> c, b -> d, c -> d
    const conns = [
      makeConnection('c1', 'a', 'b'),
      makeConnection('c2', 'a', 'c'),
      makeConnection('c3', 'b', 'd'),
      makeConnection('c4', 'c', 'd'),
    ];
    // Adding d -> e should be fine
    expect(wouldCreateCycle('d', 'e', conns)).toBe(false);
    // Adding d -> a would create cycle
    expect(wouldCreateCycle('d', 'a', conns)).toBe(true);
  });
});

// ============================================================================
// validateWorkflow
// ============================================================================

describe('validateWorkflow', () => {
  it('returns no errors for empty workflow', () => {
    const errors = validateWorkflow([], []);
    expect(errors).toHaveLength(0);
  });

  it('reports missing upload node', () => {
    const nodes = [makeNode('n1', 'output')];
    const errors = validateWorkflow(nodes, []);
    expect(errors.some(e => e.type === 'missing_node' && e.message.includes('Upload'))).toBe(true);
  });

  it('reports missing output node', () => {
    const nodes = [makeNode('n1', 'upload')];
    const errors = validateWorkflow(nodes, []);
    expect(errors.some(e => e.type === 'missing_node' && e.message.includes('Output'))).toBe(true);
  });

  it('reports orphaned nodes', () => {
    const nodes = [
      makeNode('n1', 'upload'),
      makeNode('n2', 'extract'),
      makeNode('n3', 'output'),
    ];
    // n1 connected to n2, but n3 is orphan
    const conns = [makeConnection('c1', 'n1', 'n2')];
    const errors = validateWorkflow(nodes, conns);
    expect(errors.some(e => e.type === 'orphan_node' && e.nodeIds?.includes('n3'))).toBe(true);
  });

  it('returns no orphan errors for valid fully-connected workflow', () => {
    const nodes = [
      makeNode('n1', 'upload'),
      makeNode('n2', 'extract'),
      makeNode('n3', 'output'),
    ];
    const conns = [
      makeConnection('c1', 'n1', 'n2'),
      makeConnection('c2', 'n2', 'n3'),
    ];
    const errors = validateWorkflow(nodes, conns);
    expect(errors.filter(e => e.type === 'orphan_node')).toHaveLength(0);
  });

  it('returns no errors for valid linear pipeline', () => {
    const nodes = [
      makeNode('n1', 'upload'),
      makeNode('n2', 'extract'),
      makeNode('n3', 'transform'),
      makeNode('n4', 'output'),
    ];
    const conns = [
      makeConnection('c1', 'n1', 'n2'),
      makeConnection('c2', 'n2', 'n3'),
      makeConnection('c3', 'n3', 'n4'),
    ];
    const errors = validateWorkflow(nodes, conns);
    expect(errors).toHaveLength(0);
  });
});

// ============================================================================
// getConnectionErrors
// ============================================================================

describe('getConnectionErrors', () => {
  it('returns empty array for valid connection', () => {
    const nodes = [makeNode('n1', 'upload'), makeNode('n2', 'extract')];
    const errors = getConnectionErrors('n1', 'n2', nodes, []);
    expect(errors).toHaveLength(0);
  });

  it('returns error messages with suggestions for invalid connection', () => {
    const nodes = [makeNode('n1', 'output'), makeNode('n2', 'extract')];
    const errors = getConnectionErrors('n1', 'n2', nodes, []);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns suggestion for cycle detection', () => {
    const t1 = makeNode('t1', 'transform');
    const t2 = makeNode('t2', 'transform');
    const conns = [makeConnection('c1', 't1', 't2')];
    const errors = getConnectionErrors('t2', 't1', [t1, t2], conns);
    expect(errors.some(msg => msg.includes('cycle'))).toBe(true);
  });
});

// ============================================================================
// getValidTargetTypes / getValidSourceTypes
// ============================================================================

describe('getValidTargetTypes', () => {
  it('returns extract and transform for upload', () => {
    const targets = getValidTargetTypes('upload');
    expect(targets).toContain('extract');
    expect(targets).toContain('transform');
    expect(targets).not.toContain('output');
    expect(targets).not.toContain('upload');
  });

  it('returns empty array for output', () => {
    const targets = getValidTargetTypes('output');
    expect(targets).toHaveLength(0);
  });
});

describe('getValidSourceTypes', () => {
  it('returns empty array for upload (no incoming connections)', () => {
    const sources = getValidSourceTypes('upload');
    expect(sources).toHaveLength(0);
  });

  it('returns extract and transform for output', () => {
    const sources = getValidSourceTypes('output');
    expect(sources).toContain('extract');
    expect(sources).toContain('transform');
  });
});
