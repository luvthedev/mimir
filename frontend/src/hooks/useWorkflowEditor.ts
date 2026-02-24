/**
 * @module hooks/useWorkflowEditor
 * @description React hook managing workflow editor state using useReducer.
 *
 * Handles node/connection CRUD operations, selection state, validation,
 * and undo/redo-friendly immutable state updates.
 */

import { useReducer, useCallback, useMemo } from 'react';
import type {
  WorkflowNode,
  WorkflowConnection,
  WorkflowNodeType,
  WorkflowNodePosition,
} from '../types/workflow';
import {
  isValidConnection,
  validateWorkflow,
  type WorkflowValidationResult,
  type ConnectionValidationResult,
} from '../utils/workflowValidation';

// ============================================================================
// State
// ============================================================================

export interface WorkflowEditorState {
  /** Unique workflow ID */
  workflowId: string;
  /** Workflow name */
  name: string;
  /** All nodes on the canvas */
  nodes: WorkflowNode[];
  /** All connections between nodes */
  connections: WorkflowConnection[];
  /** Currently selected node ID (if any) */
  selectedNodeId: string | null;
  /** Currently selected connection ID (if any) */
  selectedConnectionId: string | null;
  /** Latest validation result */
  validation: WorkflowValidationResult;
  /** Node IDs with validation errors */
  errorNodeIds: Set<string>;
  /** Connection error tooltip (transient) */
  connectionError: string | null;
}

function createInitialState(): WorkflowEditorState {
  return {
    workflowId: generateId(),
    name: 'Untitled Workflow',
    nodes: [],
    connections: [],
    selectedNodeId: null,
    selectedConnectionId: null,
    validation: { valid: true, errors: [] },
    errorNodeIds: new Set(),
    connectionError: null,
  };
}

// ============================================================================
// Actions
// ============================================================================

type WorkflowAction =
  | { type: 'ADD_NODE'; payload: { nodeType: WorkflowNodeType; position: WorkflowNodePosition; config?: Record<string, unknown>; metadata?: Record<string, unknown> } }
  | { type: 'REMOVE_NODE'; payload: { nodeId: string } }
  | { type: 'MOVE_NODE'; payload: { nodeId: string; position: WorkflowNodePosition } }
  | { type: 'UPDATE_NODE_CONFIG'; payload: { nodeId: string; config: Record<string, unknown> } }
  | { type: 'UPDATE_NODE_METADATA'; payload: { nodeId: string; metadata: Record<string, unknown> } }
  | { type: 'ADD_CONNECTION'; payload: { sourceNodeId: string; targetNodeId: string; sourcePort: string; targetPort: string } }
  | { type: 'REMOVE_CONNECTION'; payload: { connectionId: string } }
  | { type: 'SELECT_NODE'; payload: { nodeId: string | null } }
  | { type: 'SELECT_CONNECTION'; payload: { connectionId: string | null } }
  | { type: 'SET_CONNECTION_ERROR'; payload: { error: string | null } }
  | { type: 'SET_NAME'; payload: { name: string } }
  | { type: 'CLEAR_WORKFLOW' };

// ============================================================================
// Reducer
// ============================================================================

function workflowReducer(state: WorkflowEditorState, action: WorkflowAction): WorkflowEditorState {
  switch (action.type) {
    case 'ADD_NODE': {
      const newNode: WorkflowNode = {
        id: generateId(),
        workflowId: state.workflowId,
        type: action.payload.nodeType,
        position: action.payload.position,
        config: action.payload.config ?? {},
        metadata: action.payload.metadata ?? { label: `${formatNodeType(action.payload.nodeType)} Node` },
        createdAt: new Date().toISOString(),
      };
      const nodes = [...state.nodes, newNode];
      const validation = validateWorkflow(nodes, state.connections);
      return {
        ...state,
        nodes,
        validation,
        errorNodeIds: getErrorNodeIds(validation),
        selectedNodeId: newNode.id,
        selectedConnectionId: null,
      };
    }

    case 'REMOVE_NODE': {
      const nodes = state.nodes.filter((n) => n.id !== action.payload.nodeId);
      // Also remove any connections involving this node
      const connections = state.connections.filter(
        (c) => c.sourceNodeId !== action.payload.nodeId && c.targetNodeId !== action.payload.nodeId,
      );
      const validation = validateWorkflow(nodes, connections);
      return {
        ...state,
        nodes,
        connections,
        validation,
        errorNodeIds: getErrorNodeIds(validation),
        selectedNodeId: state.selectedNodeId === action.payload.nodeId ? null : state.selectedNodeId,
      };
    }

    case 'MOVE_NODE': {
      const nodes = state.nodes.map((n) =>
        n.id === action.payload.nodeId ? { ...n, position: action.payload.position } : n,
      );
      return { ...state, nodes };
    }

    case 'UPDATE_NODE_CONFIG': {
      const nodes = state.nodes.map((n) =>
        n.id === action.payload.nodeId ? { ...n, config: { ...n.config, ...action.payload.config } } : n,
      );
      return { ...state, nodes };
    }

    case 'UPDATE_NODE_METADATA': {
      const nodes = state.nodes.map((n) =>
        n.id === action.payload.nodeId ? { ...n, metadata: { ...n.metadata, ...action.payload.metadata } } : n,
      );
      return { ...state, nodes };
    }

    case 'ADD_CONNECTION': {
      const sourceNode = state.nodes.find((n) => n.id === action.payload.sourceNodeId);
      const targetNode = state.nodes.find((n) => n.id === action.payload.targetNodeId);

      if (!sourceNode || !targetNode) return state;

      // Validate the connection
      const validationResult = isValidConnection(sourceNode, targetNode, state.connections, state.nodes);
      if (!validationResult.valid) {
        return {
          ...state,
          connectionError: validationResult.errors[0] || 'Invalid connection',
        };
      }

      const newConnection: WorkflowConnection = {
        id: generateId(),
        workflowId: state.workflowId,
        sourceNodeId: action.payload.sourceNodeId,
        targetNodeId: action.payload.targetNodeId,
        sourcePort: action.payload.sourcePort,
        targetPort: action.payload.targetPort,
        createdAt: new Date().toISOString(),
      };
      const connections = [...state.connections, newConnection];
      const workflowValidation = validateWorkflow(state.nodes, connections);
      return {
        ...state,
        connections,
        validation: workflowValidation,
        errorNodeIds: getErrorNodeIds(workflowValidation),
        connectionError: null,
      };
    }

    case 'REMOVE_CONNECTION': {
      const connections = state.connections.filter((c) => c.id !== action.payload.connectionId);
      const validation = validateWorkflow(state.nodes, connections);
      return {
        ...state,
        connections,
        validation,
        errorNodeIds: getErrorNodeIds(validation),
        selectedConnectionId: state.selectedConnectionId === action.payload.connectionId ? null : state.selectedConnectionId,
      };
    }

    case 'SELECT_NODE':
      return {
        ...state,
        selectedNodeId: action.payload.nodeId,
        selectedConnectionId: null,
      };

    case 'SELECT_CONNECTION':
      return {
        ...state,
        selectedConnectionId: action.payload.connectionId,
        selectedNodeId: null,
      };

    case 'SET_CONNECTION_ERROR':
      return { ...state, connectionError: action.payload.error };

    case 'SET_NAME':
      return { ...state, name: action.payload.name };

    case 'CLEAR_WORKFLOW':
      return createInitialState();

    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useWorkflowEditor() {
  const [state, dispatch] = useReducer(workflowReducer, undefined, createInitialState);

  // --- Node Operations ---

  const addNode = useCallback(
    (nodeType: WorkflowNodeType, position: WorkflowNodePosition, config?: Record<string, unknown>, metadata?: Record<string, unknown>) => {
      dispatch({ type: 'ADD_NODE', payload: { nodeType, position, config, metadata } });
    },
    [],
  );

  const removeNode = useCallback((nodeId: string) => {
    dispatch({ type: 'REMOVE_NODE', payload: { nodeId } });
  }, []);

  const moveNode = useCallback((nodeId: string, position: WorkflowNodePosition) => {
    dispatch({ type: 'MOVE_NODE', payload: { nodeId, position } });
  }, []);

  const updateNodeConfig = useCallback((nodeId: string, config: Record<string, unknown>) => {
    dispatch({ type: 'UPDATE_NODE_CONFIG', payload: { nodeId, config } });
  }, []);

  const updateNodeMetadata = useCallback((nodeId: string, metadata: Record<string, unknown>) => {
    dispatch({ type: 'UPDATE_NODE_METADATA', payload: { nodeId, metadata } });
  }, []);

  // --- Connection Operations ---

  const addConnection = useCallback(
    (sourceNodeId: string, targetNodeId: string, sourcePort = 'output', targetPort = 'input') => {
      dispatch({ type: 'ADD_CONNECTION', payload: { sourceNodeId, targetNodeId, sourcePort, targetPort } });
    },
    [],
  );

  const removeConnection = useCallback((connectionId: string) => {
    dispatch({ type: 'REMOVE_CONNECTION', payload: { connectionId } });
  }, []);

  // --- Selection ---

  const selectNode = useCallback((nodeId: string | null) => {
    dispatch({ type: 'SELECT_NODE', payload: { nodeId } });
  }, []);

  const selectConnection = useCallback((connectionId: string | null) => {
    dispatch({ type: 'SELECT_CONNECTION', payload: { connectionId } });
  }, []);

  // --- Misc ---

  const setConnectionError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_CONNECTION_ERROR', payload: { error } });
  }, []);

  const setName = useCallback((name: string) => {
    dispatch({ type: 'SET_NAME', payload: { name } });
  }, []);

  const clearWorkflow = useCallback(() => {
    dispatch({ type: 'CLEAR_WORKFLOW' });
  }, []);

  // --- Validate a proposed connection without applying it ---

  const validateConnection = useCallback(
    (sourceNodeId: string, targetNodeId: string): ConnectionValidationResult => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      const targetNode = state.nodes.find((n) => n.id === targetNodeId);
      if (!sourceNode || !targetNode) {
        return { valid: false, errors: ['Node not found.'] };
      }
      return isValidConnection(sourceNode, targetNode, state.connections, state.nodes);
    },
    [state.nodes, state.connections],
  );

  // --- Derived data ---

  const selectedNode = useMemo(
    () => state.nodes.find((n) => n.id === state.selectedNodeId) ?? null,
    [state.nodes, state.selectedNodeId],
  );

  const selectedConnection = useMemo(
    () => state.connections.find((c) => c.id === state.selectedConnectionId) ?? null,
    [state.connections, state.selectedConnectionId],
  );

  return {
    // State
    ...state,
    selectedNode,
    selectedConnection,

    // Node ops
    addNode,
    removeNode,
    moveNode,
    updateNodeConfig,
    updateNodeMetadata,

    // Connection ops
    addConnection,
    removeConnection,
    validateConnection,

    // Selection
    selectNode,
    selectConnection,

    // Misc
    setConnectionError,
    setName,
    clearWorkflow,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return crypto.randomUUID();
}

function formatNodeType(type: WorkflowNodeType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getErrorNodeIds(validation: WorkflowValidationResult): Set<string> {
  const ids = new Set<string>();
  for (const error of validation.errors) {
    if (error.nodeIds) {
      for (const id of error.nodeIds) {
        ids.add(id);
      }
    }
  }
  return ids;
}
