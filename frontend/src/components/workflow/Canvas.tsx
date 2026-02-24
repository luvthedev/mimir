/**
 * @module components/workflow/Canvas
 * @description ReactFlow-based canvas for the workflow editor.
 *
 * Handles node rendering, connection drawing, drag-and-drop from palette,
 * and real-time validation feedback on connections.
 */

import { useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  BackgroundVariant,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { WorkflowNodeMemo, type WorkflowNodeData } from './WorkflowNode';
import { ConnectionLineMemo, type ConnectionLineData } from './ConnectionLine';
import type {
  WorkflowNode as WFNode,
  WorkflowConnection as WFConnection,
  WorkflowNodeType,
  ConnectionValidationState,
} from '../../types/workflow';
import type { ConnectionValidationResult } from '../../utils/workflowValidation';

// ============================================================================
// Props
// ============================================================================

export interface CanvasProps {
  nodes: WFNode[];
  connections: WFConnection[];
  selectedNodeId: string | null;
  selectedConnectionId: string | null;
  errorNodeIds: Set<string>;
  connectionError: string | null;

  // Callbacks
  onAddNode: (type: WorkflowNodeType, position: { x: number; y: number }) => void;
  onRemoveNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onUpdateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onUpdateNodeMetadata: (nodeId: string, metadata: Record<string, unknown>) => void;
  onAddConnection: (sourceId: string, targetId: string, sourcePort: string, targetPort: string) => void;
  onRemoveConnection: (connectionId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
  onSelectConnection: (connectionId: string | null) => void;
  onValidateConnection: (sourceId: string, targetId: string) => ConnectionValidationResult;
  onSetConnectionError: (error: string | null) => void;
}

// ============================================================================
// ReactFlow Node/Edge Type Registrations
// ============================================================================

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNodeMemo,
};

const edgeTypes: EdgeTypes = {
  workflowEdge: ConnectionLineMemo,
};

// ============================================================================
// Canvas Component
// ============================================================================

export function Canvas({
  nodes: wfNodes,
  connections: wfConnections,
  selectedNodeId,
  selectedConnectionId,
  errorNodeIds,
  connectionError,
  onAddNode,
  onRemoveNode,
  onMoveNode,
  onUpdateNodeConfig,
  onUpdateNodeMetadata,
  onAddConnection,
  onRemoveConnection,
  onSelectNode,
  onSelectConnection,
  onValidateConnection,
  onSetConnectionError,
}: CanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  // --- Convert workflow nodes to ReactFlow nodes ---
  const rfNodes: Node<WorkflowNodeData>[] = useMemo(
    () =>
      wfNodes.map((node) => ({
        id: node.id,
        type: 'workflowNode',
        position: node.position,
        selected: node.id === selectedNodeId,
        data: {
          type: node.type,
          label: (node.metadata?.label as string) || `${node.type.charAt(0).toUpperCase() + node.type.slice(1)} Node`,
          config: node.config as Record<string, unknown>,
          hasError: errorNodeIds.has(node.id),
          onDelete: onRemoveNode,
          onConfigChange: onUpdateNodeConfig,
          onLabelChange: (nodeId: string, label: string) =>
            onUpdateNodeMetadata(nodeId, { label }),
        },
      })),
    [wfNodes, selectedNodeId, errorNodeIds, onRemoveNode, onUpdateNodeConfig, onUpdateNodeMetadata],
  );

  // --- Convert workflow connections to ReactFlow edges ---
  const rfEdges: Edge<ConnectionLineData>[] = useMemo(
    () =>
      wfConnections.map((conn) => ({
        id: conn.id,
        source: conn.sourceNodeId,
        target: conn.targetNodeId,
        sourceHandle: conn.sourcePort || null,
        targetHandle: conn.targetPort || null,
        type: 'workflowEdge',
        selected: conn.id === selectedConnectionId,
        data: {
          validationState: 'valid' as ConnectionValidationState,
          onDelete: onRemoveConnection,
        },
      })),
    [wfConnections, selectedConnectionId, onRemoveConnection],
  );

  // --- Handle node position changes ---
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.dragging === false) {
          onMoveNode(change.id, change.position);
        }
      }
    },
    [onMoveNode],
  );

  // --- Handle edge changes ---
  const onEdgesChange: OnEdgesChange = useCallback(
    (_changes) => {
      // Edge removals are handled through the delete button on ConnectionLine
    },
    [],
  );

  // --- Handle new connections ---
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Validate before adding
      const result = onValidateConnection(connection.source, connection.target);
      if (result.valid) {
        onAddConnection(
          connection.source,
          connection.target,
          connection.sourceHandle || 'output',
          connection.targetHandle || 'input',
        );
        onSetConnectionError(null);
      } else {
        onSetConnectionError(result.errors[0] || 'Invalid connection');
        // Auto-clear the error after 3 seconds
        setTimeout(() => onSetConnectionError(null), 3000);
      }
    },
    [onAddConnection, onValidateConnection, onSetConnectionError],
  );

  // --- Connection validation visual feedback ---
  const isValidConnectionCheck = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;
      const result = onValidateConnection(connection.source, connection.target);
      return result.valid;
    },
    [onValidateConnection],
  );

  // --- Handle node clicks ---
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  // --- Handle edge clicks ---
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      onSelectConnection(edge.id);
    },
    [onSelectConnection],
  );

  // --- Handle canvas clicks (deselect) ---
  const onPaneClick = useCallback(() => {
    onSelectNode(null);
    onSelectConnection(null);
  }, [onSelectNode, onSelectConnection]);

  // --- Handle drop from NodePalette ---
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/workflow-node-type') as WorkflowNodeType;
      if (!nodeType) return;

      // Convert screen coordinates to flow coordinates
      if (!reactFlowInstance.current || !reactFlowWrapper.current) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.current.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      onAddNode(nodeType, position);
    },
    [onAddNode],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  // --- Handle keyboard delete ---
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNodeId) {
          onRemoveNode(selectedNodeId);
        } else if (selectedConnectionId) {
          onRemoveConnection(selectedConnectionId);
        }
      }
    },
    [selectedNodeId, selectedConnectionId, onRemoveNode, onRemoveConnection],
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full relative" onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnectionCheck}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onInit={onInit}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        deleteKeyCode={null}
        connectionLineStyle={{ stroke: '#eab308', strokeWidth: 2, strokeDasharray: '8 4' }}
        defaultEdgeOptions={{ type: 'workflowEdge' }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls
          className="!bg-norse-stone !border-norse-rune !shadow-lg [&>button]:!bg-norse-stone [&>button]:!border-norse-rune [&>button]:!text-gray-300 [&>button:hover]:!bg-norse-rune"
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255, 255, 255, 0.05)"
        />
        <MiniMap
          className="!bg-norse-shadow !border-norse-rune"
          nodeColor={(node) => {
            const data = node.data as WorkflowNodeData;
            switch (data?.type) {
              case 'upload': return '#4a9eff';
              case 'extract': return '#d4af37';
              case 'transform': return '#8b5cf6';
              case 'output': return '#22c55e';
              default: return '#4a5568';
            }
          }}
          maskColor="rgba(15, 20, 25, 0.7)"
        />
      </ReactFlow>

      {/* Connection error toast */}
      {connectionError && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm text-sm font-medium flex items-center space-x-2">
            <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse" />
            <span>{connectionError}</span>
          </div>
        </div>
      )}
    </div>
  );
}
