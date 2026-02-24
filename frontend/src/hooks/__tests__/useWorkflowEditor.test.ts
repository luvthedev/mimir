import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkflowEditor } from '../useWorkflowEditor';

describe('useWorkflowEditor', () => {
  // ---- Node CRUD ----

  describe('node operations', () => {
    it('starts with empty state', () => {
      const { result } = renderHook(() => useWorkflowEditor());
      expect(result.current.nodes).toEqual([]);
      expect(result.current.connections).toEqual([]);
      expect(result.current.selectedNode).toBeNull();
      expect(result.current.isValid).toBe(true);
    });

    it('adds a node', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 100, y: 200 });
      });

      expect(result.current.nodes.length).toBe(1);
      expect(result.current.nodes[0].type).toBe('upload');
      expect(result.current.nodes[0].position).toEqual({ x: 100, y: 200 });
      // Auto-selects newly added node
      expect(result.current.selectedNodeId).toBe(result.current.nodes[0].id);
    });

    it('updates node position', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('extract', { x: 0, y: 0 });
      });

      const nodeId = result.current.nodes[0].id;

      act(() => {
        result.current.updateNodePosition(nodeId, { x: 300, y: 400 });
      });

      expect(result.current.nodes[0].position).toEqual({ x: 300, y: 400 });
    });

    it('updates node config', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
      });

      const nodeId = result.current.nodes[0].id;

      act(() => {
        result.current.updateNodeConfig(nodeId, { format: 'json' });
      });

      expect(result.current.nodes[0].config).toEqual({ format: 'json' });
    });

    it('updates node metadata', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
      });

      const nodeId = result.current.nodes[0].id;

      act(() => {
        result.current.updateNodeMetadata(nodeId, { label: 'My Upload' });
      });

      expect(result.current.nodes[0].metadata.label).toBe('My Upload');
    });

    it('deletes a node and its connections', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
        result.current.addNode('extract', { x: 200, y: 0 });
      });

      const uploadId = result.current.nodes[0].id;
      const extractId = result.current.nodes[1].id;

      act(() => {
        result.current.tryAddConnection(uploadId, extractId, 'data', 'data');
      });

      expect(result.current.connections.length).toBe(1);

      act(() => {
        result.current.deleteNode(uploadId);
      });

      expect(result.current.nodes.length).toBe(1);
      expect(result.current.connections.length).toBe(0);
    });

    it('selects and deselects nodes', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
      });

      const nodeId = result.current.nodes[0].id;
      expect(result.current.selectedNodeId).toBe(nodeId);

      act(() => {
        result.current.selectNode(null);
      });

      expect(result.current.selectedNodeId).toBeNull();
      expect(result.current.selectedNode).toBeNull();
    });
  });

  // ---- Connection operations ----

  describe('connection operations', () => {
    it('creates a valid connection (upload -> extract)', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
        result.current.addNode('extract', { x: 200, y: 0 });
      });

      const uploadId = result.current.nodes[0].id;
      const extractId = result.current.nodes[1].id;

      let connectionResult: { valid: boolean; error?: string } | undefined;
      act(() => {
        connectionResult = result.current.tryAddConnection(uploadId, extractId, 'data', 'data');
      });

      expect(connectionResult!.valid).toBe(true);
      expect(result.current.connections.length).toBe(1);
      expect(result.current.connections[0].sourceNodeId).toBe(uploadId);
      expect(result.current.connections[0].targetNodeId).toBe(extractId);
    });

    it('rejects an invalid connection (upload -> output)', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
        result.current.addNode('output', { x: 200, y: 0 });
      });

      const uploadId = result.current.nodes[0].id;
      const outputId = result.current.nodes[1].id;

      let connectionResult: { valid: boolean; error?: string } | undefined;
      act(() => {
        connectionResult = result.current.tryAddConnection(uploadId, outputId, 'data', 'data');
      });

      expect(connectionResult!.valid).toBe(false);
      expect(result.current.connections.length).toBe(0);
    });

    it('deletes a connection', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
        result.current.addNode('extract', { x: 200, y: 0 });
      });

      const uploadId = result.current.nodes[0].id;
      const extractId = result.current.nodes[1].id;

      act(() => {
        result.current.tryAddConnection(uploadId, extractId, 'data', 'data');
      });

      const connId = result.current.connections[0].id;

      act(() => {
        result.current.deleteConnection(connId);
      });

      expect(result.current.connections.length).toBe(0);
    });

    it('manages pending connection state', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.startConnection('n1', 'data');
      });

      expect(result.current.pendingConnection).toEqual({
        sourceNodeId: 'n1',
        sourcePort: 'data',
      });

      act(() => {
        result.current.cancelConnection();
      });

      expect(result.current.pendingConnection).toBeNull();
    });
  });

  // ---- Validation ----

  describe('real-time validation', () => {
    it('reports validation errors for orphaned nodes', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
        result.current.addNode('extract', { x: 200, y: 0 });
      });

      // Two unconnected nodes should have validation errors
      expect(result.current.isValid).toBe(false);
      expect(result.current.validationErrors.length).toBeGreaterThan(0);
      expect(result.current.errorNodeIds.size).toBeGreaterThan(0);
    });

    it('becomes valid after connecting nodes properly', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
        result.current.addNode('extract', { x: 200, y: 0 });
        result.current.addNode('output', { x: 400, y: 0 });
      });

      const uploadId = result.current.nodes[0].id;
      const extractId = result.current.nodes[1].id;
      const outputId = result.current.nodes[2].id;

      act(() => {
        result.current.tryAddConnection(uploadId, extractId, 'data', 'data');
        result.current.tryAddConnection(extractId, outputId, 'data', 'data');
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.errorMessages).toEqual([]);
    });

    it('provides error messages as strings', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
        result.current.addNode('extract', { x: 200, y: 0 });
      });

      // errorMessages should contain human-readable strings
      for (const msg of result.current.errorMessages) {
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      }
    });
  });

  // ---- Clear all ----

  describe('clear all', () => {
    it('resets to initial state', () => {
      const { result } = renderHook(() => useWorkflowEditor());

      act(() => {
        result.current.addNode('upload', { x: 0, y: 0 });
        result.current.addNode('extract', { x: 200, y: 0 });
      });

      expect(result.current.nodes.length).toBe(2);

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.nodes.length).toBe(0);
      expect(result.current.connections.length).toBe(0);
      expect(result.current.selectedNodeId).toBeNull();
      expect(result.current.isValid).toBe(true);
    });
  });
});
