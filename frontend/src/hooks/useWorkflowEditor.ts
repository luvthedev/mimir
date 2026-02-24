/**
 * @module hooks/useWorkflowEditor
 * @description Central state management hook for the visual workflow editor.
 *
 * Uses useReducer for complex state transitions involving nodes, connections,
 * selection, and validation. Exposes CRUD actions, drag-and-drop handlers,
 * and real-time validation state.
 */

import { useReducer, useCallback, useMemo } from 'react';
import type { EditorNode, EditorConnection, WorkflowNodeType, ValidationError } from '../types/workflow';
import { NODE_TYPE_CATALOG } from '../types/workflow';
import { isValidConnection, validateWorkflow } from '../utils/workflowValidation';
import type { WorkflowTemplate } from '../types/workflowTemplates';
import { instantiateTemplateNodes, instantiateTemplateConnections } from '../types/workflowTemplates';

// ============================================================================
// State
// ============================================================================

export interface WorkflowEditorState {
  nodes: EditorNode[];
  connections: EditorConnection[];
  selectedNodeId: string | null;
  /** Pending connection while user is drawing from a source port */
  pendingConnection: { sourceNodeId: string; sourcePort: string } | null;
  /** Real-time validation errors */
  validationErrors: ValidationError[];
  /** ID counter for unique ids */
  nextId: number;
}

const initialState: WorkflowEditorState = {
  nodes: [],
  connections: [],
  selectedNodeId: null,
  pendingConnection: null,
  validationErrors: [],
  nextId: 1,
};

// ============================================================================
// Actions
// ============================================================================

type WorkflowAction =
  | { type: 'ADD_NODE'; payload: { nodeType: WorkflowNodeType; position: { x: number; y: number } } }
  | { type: 'UPDATE_NODE_POSITION'; payload: { nodeId: string; position: { x: number; y: number } } }
  | { type: 'UPDATE_NODE_CONFIG'; payload: { nodeId: string; config: Record<string, unknown> } }
  | { type: 'UPDATE_NODE_METADATA'; payload: { nodeId: string; metadata: Record<string, unknown> } }
  | { type: 'DELETE_NODE'; payload: { nodeId: string } }
  | { type: 'SELECT_NODE'; payload: { nodeId: string | null } }
  | { type: 'ADD_CONNECTION'; payload: { sourceNodeId: string; targetNodeId: string; sourcePort: string; targetPort: string } }
  | { type: 'DELETE_CONNECTION'; payload: { connectionId: string } }
  | { type: 'START_CONNECTION'; payload: { sourceNodeId: string; sourcePort: string } }
  | { type: 'CANCEL_CONNECTION' }
  | { type: 'CLEAR_ALL' }
  | { type: 'LOAD_TEMPLATE'; payload: { template: WorkflowTemplate } };

// ============================================================================
// Reducer
// ============================================================================

function generateId(prefix: string, counter: number): string {
  return `${prefix}-${counter}-${Date.now().toString(36)}`;
}

function workflowReducer(state: WorkflowEditorState, action: WorkflowAction): WorkflowEditorState {
  let newState: WorkflowEditorState;

  switch (action.type) {
    case 'ADD_NODE': {
      const { nodeType, position } = action.payload;
      const typeInfo = NODE_TYPE_CATALOG.find((t) => t.type === nodeType);
      const newNode: EditorNode = {
        id: generateId('node', state.nextId),
        type: nodeType,
        position,
        config: {},
        metadata: {
          label: typeInfo?.label ?? nodeType,
        },
      };
      newState = {
        ...state,
        nodes: [...state.nodes, newNode],
        selectedNodeId: newNode.id,
        nextId: state.nextId + 1,
      };
      break;
    }

    case 'UPDATE_NODE_POSITION': {
      const { nodeId, position } = action.payload;
      newState = {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, position } : n,
        ),
      };
      break;
    }

    case 'UPDATE_NODE_CONFIG': {
      const { nodeId, config } = action.payload;
      newState = {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, config: { ...n.config, ...config } } : n,
        ),
      };
      break;
    }

    case 'UPDATE_NODE_METADATA': {
      const { nodeId, metadata } = action.payload;
      newState = {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, metadata: { ...n.metadata, ...metadata } } : n,
        ),
      };
      break;
    }

    case 'DELETE_NODE': {
      const { nodeId } = action.payload;
      newState = {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        connections: state.connections.filter(
          (c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId,
        ),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      };
      break;
    }

    case 'SELECT_NODE': {
      newState = { ...state, selectedNodeId: action.payload.nodeId };
      break;
    }

    case 'ADD_CONNECTION': {
      const { sourceNodeId, targetNodeId, sourcePort, targetPort } = action.payload;
      const newConnection: EditorConnection = {
        id: generateId('conn', state.nextId),
        sourceNodeId,
        targetNodeId,
        sourcePort,
        targetPort,
      };
      newState = {
        ...state,
        connections: [...state.connections, newConnection],
        pendingConnection: null,
        nextId: state.nextId + 1,
      };
      break;
    }

    case 'DELETE_CONNECTION': {
      newState = {
        ...state,
        connections: state.connections.filter((c) => c.id !== action.payload.connectionId),
      };
      break;
    }

    case 'START_CONNECTION': {
      newState = {
        ...state,
        pendingConnection: action.payload,
      };
      break;
    }

    case 'CANCEL_CONNECTION': {
      newState = { ...state, pendingConnection: null };
      break;
    }

    case 'CLEAR_ALL': {
      newState = { ...initialState };
      break;
    }

    case 'LOAD_TEMPLATE': {
      const { template } = action.payload;
      const { nodes: newNodes, idMap } = instantiateTemplateNodes(template);
      const newConnections = instantiateTemplateConnections(template, idMap);
      newState = {
        ...initialState,
        nodes: newNodes,
        connections: newConnections,
        nextId: newNodes.length + newConnections.length + 1,
      };
      break;
    }

    default:
      return state;
  }

  // Re-validate after every state change
  newState.validationErrors = validateWorkflow(newState.nodes, newState.connections);
  return newState;
}

// ============================================================================
// Hook
// ============================================================================

export function useWorkflowEditor() {
  const [state, dispatch] = useReducer(workflowReducer, initialState);

  // ---- Node actions ----

  const addNode = useCallback(
    (nodeType: WorkflowNodeType, position: { x: number; y: number }) => {
      dispatch({ type: 'ADD_NODE', payload: { nodeType, position } });
    },
    [],
  );

  const updateNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      dispatch({ type: 'UPDATE_NODE_POSITION', payload: { nodeId, position } });
    },
    [],
  );

  const updateNodeConfig = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      dispatch({ type: 'UPDATE_NODE_CONFIG', payload: { nodeId, config } });
    },
    [],
  );

  const updateNodeMetadata = useCallback(
    (nodeId: string, metadata: Record<string, unknown>) => {
      dispatch({ type: 'UPDATE_NODE_METADATA', payload: { nodeId, metadata } });
    },
    [],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      dispatch({ type: 'DELETE_NODE', payload: { nodeId } });
    },
    [],
  );

  const selectNode = useCallback(
    (nodeId: string | null) => {
      dispatch({ type: 'SELECT_NODE', payload: { nodeId } });
    },
    [],
  );

  // ---- Connection actions ----

  const tryAddConnection = useCallback(
    (sourceNodeId: string, targetNodeId: string, sourcePort: string, targetPort: string): { valid: boolean; error?: string } => {
      const result = isValidConnection(sourceNodeId, targetNodeId, state.nodes, state.connections);
      if (result.valid) {
        dispatch({ type: 'ADD_CONNECTION', payload: { sourceNodeId, targetNodeId, sourcePort, targetPort } });
      }
      return result;
    },
    [state.nodes, state.connections],
  );

  const deleteConnection = useCallback(
    (connectionId: string) => {
      dispatch({ type: 'DELETE_CONNECTION', payload: { connectionId } });
    },
    [],
  );

  const startConnection = useCallback(
    (sourceNodeId: string, sourcePort: string) => {
      dispatch({ type: 'START_CONNECTION', payload: { sourceNodeId, sourcePort } });
    },
    [],
  );

  const cancelConnection = useCallback(() => {
    dispatch({ type: 'CANCEL_CONNECTION' });
  }, []);

  // ---- Workflow actions ----

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  const loadTemplate = useCallback(
    (template: WorkflowTemplate) => {
      dispatch({ type: 'LOAD_TEMPLATE', payload: { template } });
    },
    [],
  );

  // ---- Derived state ----

  const selectedNode = useMemo(
    () => state.nodes.find((n) => n.id === state.selectedNodeId) ?? null,
    [state.nodes, state.selectedNodeId],
  );

  const isValid = useMemo(
    () => state.validationErrors.length === 0,
    [state.validationErrors],
  );

  const errorMessages = useMemo(
    () => [...new Set(state.validationErrors.map((e) => e.message))],
    [state.validationErrors],
  );

  /** Set of node IDs that have validation errors */
  const errorNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const err of state.validationErrors) {
      if (err.nodeIds) {
        for (const id of err.nodeIds) ids.add(id);
      }
    }
    return ids;
  }, [state.validationErrors]);

  return {
    // State
    nodes: state.nodes,
    connections: state.connections,
    selectedNode,
    selectedNodeId: state.selectedNodeId,
    pendingConnection: state.pendingConnection,
    validationErrors: state.validationErrors,
    isValid,
    errorMessages,
    errorNodeIds,

    // Node actions
    addNode,
    updateNodePosition,
    updateNodeConfig,
    updateNodeMetadata,
    deleteNode,
    selectNode,

    // Connection actions
    tryAddConnection,
    deleteConnection,
    startConnection,
    cancelConnection,

    // Workflow actions
    clearAll,
    loadTemplate,
  };
}
