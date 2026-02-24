/**
 * @module useWorkflowEditor
 * @description React hook managing workflow editor state using useReducer.
 *
 * Handles node CRUD, connection CRUD, selection state, validation,
 * and pending connection state (for drawing connections).
 */

import { useReducer, useCallback, useMemo } from 'react';
import type { WorkflowNodeType } from '../types/workflow';
import type { EditorNode, EditorConnection, ValidationError } from '../utils/workflowValidation';
import { isValidConnection, validateWorkflow } from '../utils/workflowValidation';

// ============================================================================
// State
// ============================================================================

export interface PendingConnection {
  sourceNodeId: string;
  sourcePort: string;
  /** Current mouse position for the in-progress connection line */
  mouseX: number;
  mouseY: number;
}

export interface WorkflowEditorState {
  nodes: EditorNode[];
  connections: EditorConnection[];
  selectedNodeId: string | null;
  pendingConnection: PendingConnection | null;
  validationErrors: ValidationError[];
  connectionError: string | null;
}

const initialState: WorkflowEditorState = {
  nodes: [],
  connections: [],
  selectedNodeId: null,
  pendingConnection: null,
  validationErrors: [],
  connectionError: null,
};

// ============================================================================
// Actions
// ============================================================================

type WorkflowAction =
  | { type: 'ADD_NODE'; payload: { nodeType: WorkflowNodeType; position: { x: number; y: number }; label?: string } }
  | { type: 'REMOVE_NODE'; payload: { nodeId: string } }
  | { type: 'MOVE_NODE'; payload: { nodeId: string; position: { x: number; y: number } } }
  | { type: 'UPDATE_NODE_CONFIG'; payload: { nodeId: string; config: Record<string, any> } }
  | { type: 'SELECT_NODE'; payload: { nodeId: string | null } }
  | { type: 'ADD_CONNECTION'; payload: { sourceNodeId: string; targetNodeId: string; sourcePort: string; targetPort: string } }
  | { type: 'REMOVE_CONNECTION'; payload: { connectionId: string } }
  | { type: 'START_CONNECTION'; payload: { sourceNodeId: string; sourcePort: string; mouseX: number; mouseY: number } }
  | { type: 'UPDATE_PENDING_CONNECTION'; payload: { mouseX: number; mouseY: number } }
  | { type: 'CANCEL_CONNECTION' }
  | { type: 'SET_CONNECTION_ERROR'; payload: { message: string | null } }
  | { type: 'CLEAR_ALL' };

// ============================================================================
// ID Generation
// ============================================================================

let nodeCounter = 0;
let connectionCounter = 0;

function generateNodeId(): string {
  nodeCounter += 1;
  return `node-${Date.now()}-${nodeCounter}`;
}

function generateConnectionId(): string {
  connectionCounter += 1;
  return `conn-${Date.now()}-${connectionCounter}`;
}

// ============================================================================
// Default labels for node types
// ============================================================================

const NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
  upload: 'Upload',
  extract: 'Extract',
  transform: 'Transform',
  output: 'Output',
};

// ============================================================================
// Reducer
// ============================================================================

function workflowReducer(state: WorkflowEditorState, action: WorkflowAction): WorkflowEditorState {
  switch (action.type) {
    case 'ADD_NODE': {
      const { nodeType, position, label } = action.payload;
      const newNode: EditorNode = {
        id: generateNodeId(),
        type: nodeType,
        position,
        config: {},
        metadata: { label: label || NODE_TYPE_LABELS[nodeType] },
      };
      const newNodes = [...state.nodes, newNode];
      return {
        ...state,
        nodes: newNodes,
        validationErrors: validateWorkflow(newNodes, state.connections),
      };
    }

    case 'REMOVE_NODE': {
      const { nodeId } = action.payload;
      const newNodes = state.nodes.filter(n => n.id !== nodeId);
      // Also remove any connections involving this node
      const newConnections = state.connections.filter(
        c => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId,
      );
      return {
        ...state,
        nodes: newNodes,
        connections: newConnections,
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        validationErrors: validateWorkflow(newNodes, newConnections),
      };
    }

    case 'MOVE_NODE': {
      const { nodeId, position } = action.payload;
      const newNodes = state.nodes.map(n =>
        n.id === nodeId ? { ...n, position } : n,
      );
      return {
        ...state,
        nodes: newNodes,
      };
    }

    case 'UPDATE_NODE_CONFIG': {
      const { nodeId, config } = action.payload;
      const newNodes = state.nodes.map(n =>
        n.id === nodeId ? { ...n, config: { ...n.config, ...config } } : n,
      );
      return {
        ...state,
        nodes: newNodes,
      };
    }

    case 'SELECT_NODE': {
      return {
        ...state,
        selectedNodeId: action.payload.nodeId,
      };
    }

    case 'ADD_CONNECTION': {
      const { sourceNodeId, targetNodeId, sourcePort, targetPort } = action.payload;

      // Validate before adding
      const error = isValidConnection(
        sourceNodeId,
        targetNodeId,
        sourcePort,
        targetPort,
        state.nodes,
        state.connections,
      );

      if (error) {
        return {
          ...state,
          pendingConnection: null,
          connectionError: error.message,
        };
      }

      const newConnection: EditorConnection = {
        id: generateConnectionId(),
        sourceNodeId,
        targetNodeId,
        sourcePort,
        targetPort,
      };
      const newConnections = [...state.connections, newConnection];
      return {
        ...state,
        connections: newConnections,
        pendingConnection: null,
        connectionError: null,
        validationErrors: validateWorkflow(state.nodes, newConnections),
      };
    }

    case 'REMOVE_CONNECTION': {
      const { connectionId } = action.payload;
      const newConnections = state.connections.filter(c => c.id !== connectionId);
      return {
        ...state,
        connections: newConnections,
        validationErrors: validateWorkflow(state.nodes, newConnections),
      };
    }

    case 'START_CONNECTION': {
      return {
        ...state,
        pendingConnection: {
          sourceNodeId: action.payload.sourceNodeId,
          sourcePort: action.payload.sourcePort,
          mouseX: action.payload.mouseX,
          mouseY: action.payload.mouseY,
        },
        connectionError: null,
      };
    }

    case 'UPDATE_PENDING_CONNECTION': {
      if (!state.pendingConnection) return state;
      return {
        ...state,
        pendingConnection: {
          ...state.pendingConnection,
          mouseX: action.payload.mouseX,
          mouseY: action.payload.mouseY,
        },
      };
    }

    case 'CANCEL_CONNECTION': {
      return {
        ...state,
        pendingConnection: null,
        connectionError: null,
      };
    }

    case 'SET_CONNECTION_ERROR': {
      return {
        ...state,
        connectionError: action.payload.message,
      };
    }

    case 'CLEAR_ALL': {
      return {
        ...initialState,
      };
    }

    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useWorkflowEditor() {
  const [state, dispatch] = useReducer(workflowReducer, initialState);

  const addNode = useCallback(
    (nodeType: WorkflowNodeType, position: { x: number; y: number }, label?: string) => {
      dispatch({ type: 'ADD_NODE', payload: { nodeType, position, label } });
    },
    [],
  );

  const removeNode = useCallback((nodeId: string) => {
    dispatch({ type: 'REMOVE_NODE', payload: { nodeId } });
  }, []);

  const moveNode = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      dispatch({ type: 'MOVE_NODE', payload: { nodeId, position } });
    },
    [],
  );

  const updateNodeConfig = useCallback(
    (nodeId: string, config: Record<string, any>) => {
      dispatch({ type: 'UPDATE_NODE_CONFIG', payload: { nodeId, config } });
    },
    [],
  );

  const selectNode = useCallback((nodeId: string | null) => {
    dispatch({ type: 'SELECT_NODE', payload: { nodeId } });
  }, []);

  const addConnection = useCallback(
    (sourceNodeId: string, targetNodeId: string, sourcePort: string = 'output', targetPort: string = 'input') => {
      dispatch({
        type: 'ADD_CONNECTION',
        payload: { sourceNodeId, targetNodeId, sourcePort, targetPort },
      });
    },
    [],
  );

  const removeConnection = useCallback((connectionId: string) => {
    dispatch({ type: 'REMOVE_CONNECTION', payload: { connectionId } });
  }, []);

  const startConnection = useCallback(
    (sourceNodeId: string, sourcePort: string, mouseX: number, mouseY: number) => {
      dispatch({
        type: 'START_CONNECTION',
        payload: { sourceNodeId, sourcePort, mouseX, mouseY },
      });
    },
    [],
  );

  const updatePendingConnection = useCallback(
    (mouseX: number, mouseY: number) => {
      dispatch({ type: 'UPDATE_PENDING_CONNECTION', payload: { mouseX, mouseY } });
    },
    [],
  );

  const cancelConnection = useCallback(() => {
    dispatch({ type: 'CANCEL_CONNECTION' });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  const dismissConnectionError = useCallback(() => {
    dispatch({ type: 'SET_CONNECTION_ERROR', payload: { message: null } });
  }, []);

  const selectedNode = useMemo(
    () => state.nodes.find(n => n.id === state.selectedNodeId) || null,
    [state.nodes, state.selectedNodeId],
  );

  const isWorkflowValid = useMemo(
    () => state.validationErrors.length === 0 && state.nodes.length > 0,
    [state.validationErrors, state.nodes],
  );

  return {
    // State
    nodes: state.nodes,
    connections: state.connections,
    selectedNodeId: state.selectedNodeId,
    selectedNode,
    pendingConnection: state.pendingConnection,
    validationErrors: state.validationErrors,
    connectionError: state.connectionError,
    isWorkflowValid,

    // Actions
    addNode,
    removeNode,
    moveNode,
    updateNodeConfig,
    selectNode,
    addConnection,
    removeConnection,
    startConnection,
    updatePendingConnection,
    cancelConnection,
    clearAll,
    dismissConnectionError,
  };
}
