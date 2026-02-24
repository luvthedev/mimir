/**
 * @module components/workflow/Canvas
 * @description Main canvas area for the visual workflow editor.
 *
 * Renders:
 *  - SVG layer for connection lines (below nodes)
 *  - HTML layer for nodes (positioned absolutely)
 *  - Handles drop events for new nodes from the NodePalette
 *  - Handles connection drawing (pending connection line follows mouse)
 *  - Panning via scroll / grid background
 */

import { useCallback, useRef, useState } from 'react';
import type { EditorNode, EditorConnection, WorkflowNodeType } from '../../types/workflow';
import { WorkflowNode } from './WorkflowNode';
import { ConnectionLine, PendingConnectionLine } from './ConnectionLine';
import { isValidConnection } from '../../utils/workflowValidation';

// ---- Props ----

interface CanvasProps {
  nodes: EditorNode[];
  connections: EditorConnection[];
  selectedNodeId: string | null;
  errorNodeIds: Set<string>;
  pendingConnection: { sourceNodeId: string; sourcePort: string } | null;

  onAddNode: (nodeType: WorkflowNodeType, position: { x: number; y: number }) => void;
  onUpdateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  onSelectNode: (nodeId: string | null) => void;
  onDeleteNode: (nodeId: string) => void;
  onStartConnection: (sourceNodeId: string, sourcePort: string) => void;
  onCompleteConnection: (targetNodeId: string, targetPort: string) => void;
  onCancelConnection: () => void;
  onDeleteConnection: (connectionId: string) => void;

  /** For validating pending connections in real-time */
  tryValidateConnection: (sourceNodeId: string, targetNodeId: string) => { valid: boolean; error?: string };
}

// ---- Component ----

export function Canvas({
  nodes,
  connections,
  selectedNodeId,
  errorNodeIds,
  pendingConnection,
  onAddNode,
  onUpdateNodePosition,
  onSelectNode,
  onDeleteNode,
  onStartConnection,
  onCompleteConnection,
  onCancelConnection,
  onDeleteConnection,
  tryValidateConnection,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // ---- Drop handler for new nodes from palette ----

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/workflow-node-type')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('application/workflow-node-type') as WorkflowNodeType;
      if (!nodeType) return;

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      // Account for scroll offset
      const scrollLeft = canvasRef.current?.scrollLeft ?? 0;
      const scrollTop = canvasRef.current?.scrollTop ?? 0;

      const position = {
        x: e.clientX - canvasRect.left + scrollLeft - 110, // center the node under cursor
        y: e.clientY - canvasRect.top + scrollTop - 40,
      };

      onAddNode(nodeType, position);
    },
    [onAddNode],
  );

  // ---- Connection drawing: track mouse for pending connection ----

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!pendingConnection) return;
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      const scrollLeft = canvasRef.current?.scrollLeft ?? 0;
      const scrollTop = canvasRef.current?.scrollTop ?? 0;

      setMousePosition({
        x: e.clientX - canvasRect.left + scrollLeft,
        y: e.clientY - canvasRect.top + scrollTop,
      });

      // Check if hovering over a node's input port
      const element = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = element?.closest('[data-node-id]');
      if (nodeEl) {
        const nodeId = nodeEl.getAttribute('data-node-id');
        setHoveredNodeId(nodeId);
      } else {
        setHoveredNodeId(null);
      }
    },
    [pendingConnection],
  );

  const handleMouseUp = useCallback(() => {
    if (pendingConnection) {
      onCancelConnection();
      setHoveredNodeId(null);
    }
  }, [pendingConnection, onCancelConnection]);

  // ---- Canvas click deselects ----

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if clicking on the canvas background
      if (e.target === canvasRef.current || e.target === canvasRef.current?.querySelector('.canvas-background')) {
        onSelectNode(null);
      }
    },
    [onSelectNode],
  );

  // ---- Compute pending connection validity ----

  const pendingSourceNode = pendingConnection
    ? nodes.find((n) => n.id === pendingConnection.sourceNodeId) ?? null
    : null;

  const pendingTargetValidity: boolean | null =
    pendingConnection && hoveredNodeId && hoveredNodeId !== pendingConnection.sourceNodeId
      ? tryValidateConnection(pendingConnection.sourceNodeId, hoveredNodeId).valid
      : null;

  // ---- Determine which connections are valid ----

  const connectionValidity = new Map<string, boolean>();
  for (const conn of connections) {
    // A connection that exists is assumed valid (it passed validation when created).
    // Mark invalid only if nodes were deleted or rules changed (re-validate).
    const result = isValidConnection(
      conn.sourceNodeId,
      conn.targetNodeId,
      nodes,
      connections.filter((c) => c.id !== conn.id),
    );
    connectionValidity.set(conn.id, result.valid);
  }

  // ---- Compute SVG dimensions to fit all nodes + padding ----

  const svgWidth = Math.max(
    2000,
    ...nodes.map((n) => n.position.x + 300),
  );
  const svgHeight = Math.max(
    2000,
    ...nodes.map((n) => n.position.y + 200),
  );

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-full overflow-auto bg-norse-night"
      style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
        backgroundSize: '40px 40px',
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleCanvasClick}
    >
      {/* SVG layer for connections */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={svgWidth}
        height={svgHeight}
        style={{ pointerEvents: 'none' }}
      >
        <g style={{ pointerEvents: 'auto' }}>
          {connections.map((conn) => (
            <ConnectionLine
              key={conn.id}
              connection={conn}
              nodes={nodes}
              isValid={connectionValidity.get(conn.id) ?? true}
              onDelete={onDeleteConnection}
            />
          ))}

          {/* Pending connection line */}
          {pendingSourceNode && (
            <PendingConnectionLine
              sourceNode={pendingSourceNode}
              mousePosition={mousePosition}
              isValidTarget={pendingTargetValidity}
            />
          )}
        </g>
      </svg>

      {/* Node layer */}
      <div className="canvas-background" style={{ width: svgWidth, height: svgHeight, position: 'relative' }}>
        {nodes.map((node) => (
          <WorkflowNode
            key={node.id}
            node={node}
            isSelected={node.id === selectedNodeId}
            hasError={errorNodeIds.has(node.id)}
            onStartConnection={onStartConnection}
            onCompleteConnection={(nodeId, port) => {
              if (pendingConnection) {
                onCompleteConnection(nodeId, port);
              }
            }}
            onPositionChange={onUpdateNodePosition}
            onSelect={onSelectNode}
            onDelete={onDeleteNode}
          />
        ))}
      </div>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-6xl mb-4 opacity-20">&#x2B2C;</div>
            <p className="text-gray-500 text-lg">Drag nodes from the palette to get started</p>
            <p className="text-gray-600 text-sm mt-1">Connect them to build your data pipeline</p>
          </div>
        </div>
      )}
    </div>
  );
}
