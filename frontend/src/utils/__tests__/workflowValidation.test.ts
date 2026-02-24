import { describe, it, expect } from 'vitest';
import {
  isValidConnection,
  validateWorkflow,
  getConnectionErrors,
} from '../workflowValidation';
import type { EditorNode, EditorConnection } from '../../types/workflow';

// ============================================================================
// Test helpers
// ============================================================================

function makeNode(id: string, type: EditorNode['type'], x = 0, y = 0): EditorNode {
  return {
    id,
    type,
    position: { x, y },
    config: {},
    metadata: { label: `${type}-${id}` },
  };
}

function makeConn(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
): EditorConnection {
  return { id, sourceNodeId, targetNodeId, sourcePort: 'data', targetPort: 'data' };
}

// ============================================================================
// isValidConnection
// ============================================================================

describe('isValidConnection', () => {
  const upload = makeNode('n1', 'upload');
  const extract = makeNode('n2', 'extract');
  const transform = makeNode('n3', 'transform');
  const output = makeNode('n4', 'output');
  const nodes = [upload, extract, transform, output];

  it('allows upload -> extract', () => {
    const result = isValidConnection('n1', 'n2', nodes, []);
    expect(result.valid).toBe(true);
  });

  it('allows extract -> transform', () => {
    const result = isValidConnection('n2', 'n3', nodes, []);
    expect(result.valid).toBe(true);
  });

  it('allows extract -> output', () => {
    const result = isValidConnection('n2', 'n4', nodes, []);
    expect(result.valid).toBe(true);
  });

  it('allows transform -> output', () => {
    const result = isValidConnection('n3', 'n4', nodes, []);
    expect(result.valid).toBe(true);
  });

  it('allows transform -> transform', () => {
    const t2 = makeNode('n5', 'transform');
    const result = isValidConnection('n3', 'n5', [...nodes, t2], []);
    expect(result.valid).toBe(true);
  });

  it('rejects self-connection', () => {
    const result = isValidConnection('n1', 'n1', nodes, []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot connect to itself');
  });

  it('rejects upload -> output (type incompatible)', () => {
    const result = isValidConnection('n1', 'n4', nodes, []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot connect upload to output');
  });

  it('rejects output -> anything (terminal node)', () => {
    const result = isValidConnection('n4', 'n1', nodes, []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('nothing (terminal node)');
  });

  it('rejects connecting to upload (0 incoming)', () => {
    const result = isValidConnection('n3', 'n1', nodes, []);
    expect(result.valid).toBe(false);
    // Should fail on type compatibility (transform cannot connect to upload)
  });

  it('rejects duplicate connections', () => {
    const existing = [makeConn('c1', 'n1', 'n2')];
    const result = isValidConnection('n1', 'n2', nodes, existing);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('rejects connections that create cycles', () => {
    // Use transform -> transform chain since those types allow chaining
    const t1 = makeNode('t1', 'transform');
    const t2 = makeNode('t2', 'transform');
    const t3 = makeNode('t3', 'transform');
    const tNodes = [t1, t2, t3];
    const tConns = [
      makeConn('tc1', 't1', 't2'),
      makeConn('tc2', 't2', 't3'),
    ];
    // t3 -> t1 would create cycle
    const result = isValidConnection('t3', 't1', tNodes, tConns);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cycle');
  });

  it('rejects connection to non-existent nodes', () => {
    const result = isValidConnection('n1', 'n99', nodes, []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('do not exist');
  });

  it('respects max incoming limit on extract (1 incoming)', () => {
    const upload2 = makeNode('n5', 'upload');
    const allNodes = [...nodes, upload2];
    const existing = [makeConn('c1', 'n1', 'n2')]; // extract already has 1 incoming
    const result = isValidConnection('n5', 'n2', allNodes, existing);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at most 1');
  });
});

// ============================================================================
// validateWorkflow
// ============================================================================

describe('validateWorkflow', () => {
  it('returns no errors for an empty workflow', () => {
    const errors = validateWorkflow([], []);
    expect(errors).toEqual([]);
  });

  it('returns no errors for a single node', () => {
    const nodes = [makeNode('n1', 'upload')];
    const errors = validateWorkflow(nodes, []);
    expect(errors).toEqual([]);
  });

  it('detects orphaned nodes', () => {
    const nodes = [makeNode('n1', 'upload'), makeNode('n2', 'extract'), makeNode('n3', 'transform')];
    const conns = [makeConn('c1', 'n1', 'n2')];
    const errors = validateWorkflow(nodes, conns);
    const orphanErrors = errors.filter((e) => e.type === 'orphan');
    expect(orphanErrors.length).toBeGreaterThan(0);
    expect(orphanErrors[0].nodeIds).toContain('n3');
  });

  it('detects missing incoming connections for non-upload nodes', () => {
    const nodes = [makeNode('n1', 'upload'), makeNode('n2', 'extract')];
    const errors = validateWorkflow(nodes, []); // no connections
    const missingErrors = errors.filter(
      (e) => e.type === 'missing_connection' || e.type === 'orphan',
    );
    expect(missingErrors.length).toBeGreaterThan(0);
  });

  it('detects missing outgoing connections for non-output nodes', () => {
    const nodes = [makeNode('n1', 'upload'), makeNode('n2', 'output')];
    const conns: EditorConnection[] = []; // upload has no outgoing
    const errors = validateWorkflow(nodes, conns);
    const missingErrors = errors.filter((e) => e.type === 'missing_connection');
    expect(missingErrors.some((e) => e.nodeIds?.includes('n1'))).toBe(true);
  });

  it('returns no errors for a valid pipeline: upload -> extract -> output', () => {
    const nodes = [
      makeNode('n1', 'upload'),
      makeNode('n2', 'extract'),
      makeNode('n3', 'output'),
    ];
    const conns = [
      makeConn('c1', 'n1', 'n2'),
      makeConn('c2', 'n2', 'n3'),
    ];
    const errors = validateWorkflow(nodes, conns);
    expect(errors).toEqual([]);
  });

  it('returns no errors for a valid pipeline: upload -> extract -> transform -> output', () => {
    const nodes = [
      makeNode('n1', 'upload'),
      makeNode('n2', 'extract'),
      makeNode('n3', 'transform'),
      makeNode('n4', 'output'),
    ];
    const conns = [
      makeConn('c1', 'n1', 'n2'),
      makeConn('c2', 'n2', 'n3'),
      makeConn('c3', 'n3', 'n4'),
    ];
    const errors = validateWorkflow(nodes, conns);
    expect(errors).toEqual([]);
  });
});

// ============================================================================
// getConnectionErrors
// ============================================================================

describe('getConnectionErrors', () => {
  it('returns empty array for valid workflow', () => {
    const nodes = [
      makeNode('n1', 'upload'),
      makeNode('n2', 'extract'),
      makeNode('n3', 'output'),
    ];
    const conns = [
      makeConn('c1', 'n1', 'n2'),
      makeConn('c2', 'n2', 'n3'),
    ];
    expect(getConnectionErrors(nodes, conns)).toEqual([]);
  });

  it('returns deduplicated error messages', () => {
    const nodes = [makeNode('n1', 'upload'), makeNode('n2', 'extract')];
    const errors = getConnectionErrors(nodes, []);
    // Check it returns strings
    for (const msg of errors) {
      expect(typeof msg).toBe('string');
    }
    // No duplicates
    expect(errors.length).toBe(new Set(errors).size);
  });
});
