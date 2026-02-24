/**
 * @module useWorkflowEditor
 * @description React hook managing workflow editor state with useReducer.
 *
 * Provides CRUD operations for nodes and connections, validation state,
 * undo history, and canvas interaction helpers.  Workflow state lives
 * entirely in React component memory during the editing session.
 */

import { useReducer, useCallback, useMemo } from 'react';
import {
  EditorNode,
  EditorConnection,
  WorkflowNodeType,
  isValidConnection,
  validateWorkflow,
  WorkflowValidationResult,
} from '../utils/workflowValidation';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface WorkflowEditorState {
  /** All nodes currently on the canvas. */
  nodes: EditorNode[];
  /** All connections between nodes. */
  connections: EditorConnection[];
  /** Currently selected node id, if any. */
  selectedNodeId: string | null;
  /** Pending connection: user started dragging from a port. */
  pendingConnection: {
    sourceNodeId: string;
    sourcePort: string;
  } | null;
  /** Per-node validation errors keyed by node id. */
  nodeErrors: Record<string, string[]>;
  /** Latest full-workflow validation result. */
  validationResult: WorkflowValidationResult | null;
  /** Error toast message shown briefly on invalid actions. */
  errorToast: string | null;
  /** Simple undo support: previous states. */
  undoStack: Array<{ nodes: EditorNode[]; connections: EditorConnection[] }>;
}

const MAX_UNDO = 50;

function initialState(): WorkflowEditorState {
  return {
    nodes: [],
    connections: [],
    selectedNodeId: null,
    pendingConnection: null,
    nodeErrors: {},
    validationResult: null,
    errorToast: null,
    undoStack: [],
  };
}

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

type Action =
  | { type: 'ADD_NODE'; node: EditorNode }
  | { type: 'UPDATE_NODE'; nodeId: string; updates: Partial<EditorNode> }
  | { type: 'REMOVE_NODE'; nodeId: string }
  | { type: 'MOVE_NODE'; nodeId: string; position: { x: number; y: number } }
  | { type: 'SELECT_NODE'; nodeId: string | null }
  | { type: 'START_CONNECTION'; sourceNodeId: string; sourcePort: string }
  | { type: 'CANCEL_CONNECTION' }
  | {
      type: 'COMPLETE_CONNECTION';
      targetNodeId: string;
      targetPort: string;
    }
  | { type: 'REMOVE_CONNECTION'; connectionId: string }
  | { type: 'VALIDATE' }
  | { type: 'DISMISS_ERROR' }
  | { type: 'UNDO' }
  | { type: 'RESET' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let connectionCounter = 0;

function makeConnectionId(): string {
  connectionCounter += 1;
  return `conn-${Date.now()}-${connectionCounter}`;
}

function pushUndo(
  state: WorkflowEditorState,
): Array<{ nodes: EditorNode[]; connections: EditorConnection[] }> {
  const snapshot = {
    nodes: state.nodes.map((n) => ({ ...n })),
    connections: state.connections.map((c) => ({ ...c })),
  };
  const stack = [...state.undoStack, snapshot];
  if (stack.length > MAX_UNDO) stack.shift();
  return stack;
}

function revalidate(
  nodes: EditorNode[],
  connections: EditorConnection[],
): {
  nodeErrors: Record<string, string[]>;
  validationResult: WorkflowValidationResult;
} {
  const result = validateWorkflow(nodes, connections);
  const nodeErrors: Record<string, string[]> = {};
  result.errors.forEach((err) => {
    if (err.nodeId) {
      if (!nodeErrors[err.nodeId]) nodeErrors[err.nodeId] = [];
      nodeErrors[err.nodeId].push(err.message);
    }
  });
  return { nodeErrors, validationResult: result };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: WorkflowEditorState, action: Action): WorkflowEditorState {
  switch (action.type) {
    // -- Node CRUD -------------------------------------------------------
    case 'ADD_NODE': {
      const undoStack = pushUndo(state);
      const nodes = [...state.nodes, action.node];
      const { nodeErrors, validationResult } = revalidate(nodes, state.connections);
      return { ...state, nodes, undoStack, nodeErrors, validationResult, errorToast: null };
    }

    case 'UPDATE_NODE': {
      const undoStack = pushUndo(state);
      const nodes = state.nodes.map((n) =>
        n.id === action.nodeId ? { ...n, ...action.updates } : n,
      );
      const { nodeErrors, validationResult } = revalidate(nodes, state.connections);
      return { ...state, nodes, undoStack, nodeErrors, validationResult };
    }

    case 'REMOVE_NODE': {
      const undoStack = pushUndo(state);
      const nodes = state.nodes.filter((n) => n.id !== action.nodeId);
      const connections = state.connections.filter(
        (c) => c.sourceNodeId !== action.nodeId && c.targetNodeId !== action.nodeId,
      );
      const selectedNodeId =
        state.selectedNodeId === action.nodeId ? null : state.selectedNodeId;
      const { nodeErrors, validationResult } = revalidate(nodes, connections);
      return { ...state, nodes, connections, selectedNodeId, undoStack, nodeErrors, validationResult };
    }

    case 'MOVE_NODE': {
      // Lightweight – no undo snapshot for every drag tick.
      const nodes = state.nodes.map((n) =>
        n.id === action.nodeId ? { ...n, position: action.position } : n,
      );
      return { ...state, nodes };
    }

    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.nodeId };

    // -- Connection CRUD --------------------------------------------------
    case 'START_CONNECTION':
      return {
        ...state,
        pendingConnection: {
          sourceNodeId: action.sourceNodeId,
          sourcePort: action.sourcePort,
        },
      };

    case 'CANCEL_CONNECTION':
      return { ...state, pendingConnection: null };

    case 'COMPLETE_CONNECTION': {
      if (!state.pendingConnection) return state;

      const { sourceNodeId, sourcePort } = state.pendingConnection;
      const { targetNodeId, targetPort } = action;

      const validation = isValidConnection(
        sourceNodeId,
        targetNodeId,
        state.nodes,
        state.connections,
      );

      if (!validation.valid) {
        return {
          ...state,
          pendingConnection: null,
          errorToast: validation.errors[0] ?? 'Invalid connection.',
        };
      }

      const undoStack = pushUndo(state);
      const newConnection: EditorConnection = {
        id: makeConnectionId(),
        sourceNodeId,
        targetNodeId,
        sourcePort,
        targetPort,
      };
      const connections = [...state.connections, newConnection];
      const { nodeErrors, validationResult } = revalidate(state.nodes, connections);

      return {
        ...state,
        connections,
        pendingConnection: null,
        undoStack,
        nodeErrors,
        validationResult,
        errorToast: null,
      };
    }

    case 'REMOVE_CONNECTION': {
      const undoStack = pushUndo(state);
      const connections = state.connections.filter((c) => c.id !== action.connectionId);
      const { nodeErrors, validationResult } = revalidate(state.nodes, connections);
      return { ...state, connections, undoStack, nodeErrors, validationResult };
    }

    // -- Validation & misc ------------------------------------------------
    case 'VALIDATE': {
      const { nodeErrors, validationResult } = revalidate(state.nodes, state.connections);
      return { ...state, nodeErrors, validationResult };
    }

    case 'DISMISS_ERROR':
      return { ...state, errorToast: null };

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const stack = [...state.undoStack];
      const previous = stack.pop()!;
      const { nodeErrors, validationResult } = revalidate(previous.nodes, previous.connections);
      return {
        ...state,
        nodes: previous.nodes,
        connections: previous.connections,
        undoStack: stack,
        nodeErrors,
        validationResult,
        selectedNodeId: null,
        pendingConnection: null,
      };
    }

    case 'RESET':
      return initialState();

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

let nodeCounter = 0;

export function useWorkflowEditor() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // -- Node actions -------------------------------------------------------

  const addNode = useCallback(
    (type: WorkflowNodeType, position: { x: number; y: number }) => {
      nodeCounter += 1;
      const node: EditorNode = {
        id: `wfn-${type}-${Date.now()}-${nodeCounter}`,
        type,
        position,
        config: {},
        metadata: { label: `${type.charAt(0).toUpperCase()}${type.slice(1)} Node` },
      };
      dispatch({ type: 'ADD_NODE', node });
      return node.id;
    },
    [],
  );

  const updateNode = useCallback(
    (nodeId: string, updates: Partial<EditorNode>) => {
      dispatch({ type: 'UPDATE_NODE', nodeId, updates });
    },
    [],
  );

  const removeNode = useCallback(
    (nodeId: string) => dispatch({ type: 'REMOVE_NODE', nodeId }),
    [],
  );

  const moveNode = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      dispatch({ type: 'MOVE_NODE', nodeId, position });
    },
    [],
  );

  const selectNode = useCallback(
    (nodeId: string | null) => dispatch({ type: 'SELECT_NODE', nodeId }),
    [],
  );

  // -- Connection actions -------------------------------------------------

  const startConnection = useCallback(
    (sourceNodeId: string, sourcePort: string) => {
      dispatch({ type: 'START_CONNECTION', sourceNodeId, sourcePort });
    },
    [],
  );

  const cancelConnection = useCallback(
    () => dispatch({ type: 'CANCEL_CONNECTION' }),
    [],
  );

  const completeConnection = useCallback(
    (targetNodeId: string, targetPort: string) => {
      dispatch({ type: 'COMPLETE_CONNECTION', targetNodeId, targetPort });
    },
    [],
  );

  const removeConnection = useCallback(
    (connectionId: string) => dispatch({ type: 'REMOVE_CONNECTION', connectionId }),
    [],
  );

  // -- General actions ----------------------------------------------------

  const validate = useCallback(() => dispatch({ type: 'VALIDATE' }), []);
  const dismissError = useCallback(() => dispatch({ type: 'DISMISS_ERROR' }), []);
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  // -- Derived data -------------------------------------------------------

  const selectedNode = useMemo(
    () => state.nodes.find((n) => n.id === state.selectedNodeId) ?? null,
    [state.nodes, state.selectedNodeId],
  );

  return {
    // State
    nodes: state.nodes,
    connections: state.connections,
    selectedNodeId: state.selectedNodeId,
    selectedNode,
    pendingConnection: state.pendingConnection,
    nodeErrors: state.nodeErrors,
    validationResult: state.validationResult,
    errorToast: state.errorToast,
    canUndo: state.undoStack.length > 0,

    // Node actions
    addNode,
    updateNode,
    removeNode,
    moveNode,
    selectNode,

    // Connection actions
    startConnection,
    cancelConnection,
    completeConnection,
    removeConnection,

    // General
    validate,
    dismissError,
    undo,
    reset,
  };
}
