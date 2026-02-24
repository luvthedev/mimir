import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkflowEditor } from '../useWorkflowEditor';
import { WORKFLOW_TEMPLATES } from '../../types/workflowTemplates';

describe('useWorkflowEditor - loadTemplate', () => {
  it('loads a template and populates nodes and connections', () => {
    const { result } = renderHook(() => useWorkflowEditor());
    const template = WORKFLOW_TEMPLATES[0]; // Invoice Extraction

    act(() => {
      result.current.loadTemplate(template);
    });

    expect(result.current.nodes.length).toBe(template.nodes.length);
    expect(result.current.connections.length).toBe(template.connections.length);
  });

  it('creates fresh IDs for nodes (not template IDs)', () => {
    const { result } = renderHook(() => useWorkflowEditor());
    const template = WORKFLOW_TEMPLATES[0];

    act(() => {
      result.current.loadTemplate(template);
    });

    const templateNodeIds = new Set(template.nodes.map((n) => n.id));
    for (const node of result.current.nodes) {
      expect(templateNodeIds.has(node.id)).toBe(false);
    }
  });

  it('preserves node types from the template', () => {
    const { result } = renderHook(() => useWorkflowEditor());
    const template = WORKFLOW_TEMPLATES[0];

    act(() => {
      result.current.loadTemplate(template);
    });

    for (let i = 0; i < template.nodes.length; i++) {
      expect(result.current.nodes[i].type).toBe(template.nodes[i].type);
    }
  });

  it('preserves node positions from the template', () => {
    const { result } = renderHook(() => useWorkflowEditor());
    const template = WORKFLOW_TEMPLATES[0];

    act(() => {
      result.current.loadTemplate(template);
    });

    for (let i = 0; i < template.nodes.length; i++) {
      expect(result.current.nodes[i].position).toEqual(template.nodes[i].position);
    }
  });

  it('preserves node config from the template', () => {
    const { result } = renderHook(() => useWorkflowEditor());
    const template = WORKFLOW_TEMPLATES[0];

    act(() => {
      result.current.loadTemplate(template);
    });

    for (let i = 0; i < template.nodes.length; i++) {
      expect(result.current.nodes[i].config).toEqual(template.nodes[i].config);
    }
  });

  it('connections reference new node IDs (not template IDs)', () => {
    const { result } = renderHook(() => useWorkflowEditor());
    const template = WORKFLOW_TEMPLATES[0];

    act(() => {
      result.current.loadTemplate(template);
    });

    const nodeIds = new Set(result.current.nodes.map((n) => n.id));
    for (const conn of result.current.connections) {
      expect(nodeIds.has(conn.sourceNodeId)).toBe(true);
      expect(nodeIds.has(conn.targetNodeId)).toBe(true);
    }
  });

  it('loaded template workflow passes validation', () => {
    const { result } = renderHook(() => useWorkflowEditor());

    for (const template of WORKFLOW_TEMPLATES) {
      act(() => {
        result.current.loadTemplate(template);
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.validationErrors).toEqual([]);
      expect(result.current.errorMessages).toEqual([]);
    }
  });

  it('clears existing workflow when loading a template', () => {
    const { result } = renderHook(() => useWorkflowEditor());

    // Add some nodes first
    act(() => {
      result.current.addNode('upload', { x: 0, y: 0 });
      result.current.addNode('extract', { x: 200, y: 0 });
    });

    expect(result.current.nodes.length).toBe(2);

    // Load template - should replace existing nodes
    const template = WORKFLOW_TEMPLATES[0];
    act(() => {
      result.current.loadTemplate(template);
    });

    expect(result.current.nodes.length).toBe(template.nodes.length);
  });

  it('resets selection when loading a template', () => {
    const { result } = renderHook(() => useWorkflowEditor());

    act(() => {
      result.current.addNode('upload', { x: 0, y: 0 });
    });

    expect(result.current.selectedNodeId).not.toBeNull();

    const template = WORKFLOW_TEMPLATES[0];
    act(() => {
      result.current.loadTemplate(template);
    });

    expect(result.current.selectedNodeId).toBeNull();
  });

  it('allows customization after loading a template', () => {
    const { result } = renderHook(() => useWorkflowEditor());
    const template = WORKFLOW_TEMPLATES[0];

    act(() => {
      result.current.loadTemplate(template);
    });

    const initialNodeCount = result.current.nodes.length;

    // User can add a new node
    act(() => {
      result.current.addNode('transform', { x: 500, y: 400 });
    });

    expect(result.current.nodes.length).toBe(initialNodeCount + 1);

    // User can delete a node
    const nodeToDelete = result.current.nodes[0].id;
    act(() => {
      result.current.deleteNode(nodeToDelete);
    });

    expect(result.current.nodes.length).toBe(initialNodeCount);
  });

  it('allows adding connections after loading a template', () => {
    const { result } = renderHook(() => useWorkflowEditor());
    const template = WORKFLOW_TEMPLATES[0];

    act(() => {
      result.current.loadTemplate(template);
    });

    const initialConnCount = result.current.connections.length;

    // Add a new transform node and connect it
    act(() => {
      result.current.addNode('transform', { x: 500, y: 400 });
    });

    // The new node should be connectable from an existing extract node
    const extractNode = result.current.nodes.find((n) => n.type === 'extract');
    const newNode = result.current.nodes[result.current.nodes.length - 1];

    if (extractNode) {
      act(() => {
        result.current.tryAddConnection(extractNode.id, newNode.id, 'data', 'data');
      });

      expect(result.current.connections.length).toBe(initialConnCount + 1);
    }
  });
});
