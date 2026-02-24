/**
 * @module Canvas
 * @description SVG canvas for rendering workflow nodes and connections.
 *
 * Handles:
 * - Drop events for adding new nodes from the palette
 * - Pan and zoom via mouse drag and scroll
 * - Node dragging to reposition
 * - Connection drawing between ports
 * - Node selection and deletion
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { WorkflowNode, NODE_WIDTH, NODE_HEIGHT, OUTPUT_PORT_OFFSET, INPUT_PORT_OFFSET } from './WorkflowNode';
import { ConnectionLine } from './ConnectionLine';
import type { ConnectionState } from './ConnectionLine';
import type { DragNodeData } from './NodePalette';
import type { EditorNode, EditorConnection, ValidationError } from '../../utils/workflowValidation';
import type { PendingConnection } from '../../hooks/useWorkflowEditor';
import type { WorkflowNodeType } from '../../types/workflow';

// ============================================================================
// Types
// ============================================================================

interface CanvasProps {
  nodes: EditorNode[];
  connections: EditorConnection[];
  selectedNodeId: string | null;
  pendingConnection: PendingConnection | null;
  validationErrors: ValidationError[];

  onAddNode: (nodeType: WorkflowNodeType, position: { x: number; y: number }) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onSelectNode: (nodeId: string | null) => void;
  onRemoveNode: (nodeId: string) => void;
  onAddConnection: (sourceNodeId: string, targetNodeId: string, sourcePort: string, targetPort: string) => void;
  onRemoveConnection: (connectionId: string) => void;
  onStartConnection: (sourceNodeId: string, sourcePort: string, mouseX: number, mouseY: number) => void;
  onUpdatePendingConnection: (mouseX: number, mouseY: number) => void;
  onCancelConnection: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function Canvas({
  nodes,
  connections,
  selectedNodeId,
  pendingConnection,
  validationErrors,
  onAddNode,
  onMoveNode,
  onSelectNode,
  onRemoveNode,
  onAddConnection,
  onRemoveConnection,
  onStartConnection,
  onUpdatePendingConnection,
  onCancelConnection,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Pan & zoom state
  const [viewBox, setViewBox] = useState({ x: -200, y: -100, w: 1200, h: 800 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, vbX: 0, vbY: 0 });

  // Node drag state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // ============================================================================
  // Coordinate conversion
  // ============================================================================

  const screenToSVG = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      return {
        x: (clientX - rect.left) * scaleX + viewBox.x,
        y: (clientY - rect.top) * scaleY + viewBox.y,
      };
    },
    [viewBox],
  );

  // ============================================================================
  // Drop handling (new nodes from palette)
  // ============================================================================

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (!raw) return;
        const data: DragNodeData = JSON.parse(raw);
        if (!data.nodeType) return;

        const pos = screenToSVG(e.clientX, e.clientY);
        // Center the node at drop position
        onAddNode(data.nodeType, {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        });
      } catch {
        // Invalid drag data
      }
    },
    [screenToSVG, onAddNode],
  );

  // ============================================================================
  // Pan handling
  // ============================================================================

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only pan on direct canvas click (not on nodes)
      if (e.target === svgRef.current || (e.target as SVGElement).classList?.contains('canvas-bg')) {
        setIsPanning(true);
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          vbX: viewBox.x,
          vbY: viewBox.y,
        };
        onSelectNode(null); // Deselect on canvas click
        if (pendingConnection) {
          onCancelConnection();
        }
      }
    },
    [viewBox, onSelectNode, pendingConnection, onCancelConnection],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Pan
      if (isPanning) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const scaleX = viewBox.w / rect.width;
        const scaleY = viewBox.h / rect.height;
        setViewBox(prev => ({
          ...prev,
          x: panStart.current.vbX - (e.clientX - panStart.current.x) * scaleX,
          y: panStart.current.vbY - (e.clientY - panStart.current.y) * scaleY,
        }));
        return;
      }

      // Node drag
      if (draggingNodeId) {
        const pos = screenToSVG(e.clientX, e.clientY);
        onMoveNode(draggingNodeId, {
          x: pos.x - dragOffset.current.x,
          y: pos.y - dragOffset.current.y,
        });
        return;
      }

      // Pending connection update
      if (pendingConnection) {
        const pos = screenToSVG(e.clientX, e.clientY);
        onUpdatePendingConnection(pos.x, pos.y);
      }
    },
    [isPanning, draggingNodeId, pendingConnection, viewBox, screenToSVG, onMoveNode, onUpdatePendingConnection],
  );

  const handleMouseUp = useCallback(
    () => {
      if (isPanning) {
        setIsPanning(false);
      }
      if (draggingNodeId) {
        setDraggingNodeId(null);
      }
      if (pendingConnection) {
        // Dropped on empty space - cancel
        onCancelConnection();
      }
    },
    [isPanning, draggingNodeId, pendingConnection, onCancelConnection],
  );

  // ============================================================================
  // Zoom handling
  // ============================================================================

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      const mousePos = screenToSVG(e.clientX, e.clientY);

      setViewBox(prev => {
        const newW = prev.w * zoomFactor;
        const newH = prev.h * zoomFactor;
        // Keep the mouse position fixed during zoom
        const newX = mousePos.x - (mousePos.x - prev.x) * zoomFactor;
        const newY = mousePos.y - (mousePos.y - prev.y) * zoomFactor;

        // Clamp zoom
        if (newW < 200 || newW > 8000) return prev;

        return { x: newX, y: newY, w: newW, h: newH };
      });
    },
    [screenToSVG],
  );

  // ============================================================================
  // Node interactions
  // ============================================================================

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      onSelectNode(nodeId);
      if (pendingConnection) return; // Don't start drag during connection drawing

      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const pos = screenToSVG(e.clientX, e.clientY);
      dragOffset.current = {
        x: pos.x - node.position.x,
        y: pos.y - node.position.y,
      };
      setDraggingNodeId(nodeId);
    },
    [nodes, screenToSVG, onSelectNode, pendingConnection],
  );

  const handleNodeDoubleClick = useCallback(
    (_nodeId: string) => {
      // Could open a config panel in the future
    },
    [],
  );

  // ============================================================================
  // Port interactions (connection drawing)
  // ============================================================================

  const handlePortMouseDown = useCallback(
    (_e: React.MouseEvent, nodeId: string, portType: 'input' | 'output') => {
      if (portType !== 'output') return; // Only start connections from output ports

      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const sourceX = node.position.x + OUTPUT_PORT_OFFSET.x;
      const sourceY = node.position.y + OUTPUT_PORT_OFFSET.y;

      onStartConnection(nodeId, 'output', sourceX, sourceY);
    },
    [nodes, onStartConnection],
  );

  const handlePortMouseUp = useCallback(
    (_e: React.MouseEvent, nodeId: string, portType: 'input' | 'output') => {
      if (!pendingConnection || portType !== 'input') return;

      onAddConnection(
        pendingConnection.sourceNodeId,
        nodeId,
        pendingConnection.sourcePort,
        'input',
      );
    },
    [pendingConnection, onAddConnection],
  );

  // ============================================================================
  // Keyboard handling
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        onRemoveNode(selectedNodeId);
      }

      if (e.key === 'Escape') {
        if (pendingConnection) {
          onCancelConnection();
        } else {
          onSelectNode(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, pendingConnection, onRemoveNode, onSelectNode, onCancelConnection]);

  // ============================================================================
  // Connection rendering helpers
  // ============================================================================

  const getConnectionEndpoints = useCallback(
    (conn: EditorConnection) => {
      const sourceNode = nodes.find(n => n.id === conn.sourceNodeId);
      const targetNode = nodes.find(n => n.id === conn.targetNodeId);
      if (!sourceNode || !targetNode) return null;

      return {
        sourceX: sourceNode.position.x + OUTPUT_PORT_OFFSET.x,
        sourceY: sourceNode.position.y + OUTPUT_PORT_OFFSET.y,
        targetX: targetNode.position.x + INPUT_PORT_OFFSET.x,
        targetY: targetNode.position.y + INPUT_PORT_OFFSET.y,
      };
    },
    [nodes],
  );

  const getConnectionState = useCallback(
    (conn: EditorConnection): ConnectionState => {
      // Check if this connection has validation errors
      const hasError = validationErrors.some(
        err => err.connectionId === conn.id,
      );
      if (hasError) return 'invalid';
      return 'valid';
    },
    [validationErrors],
  );

  // Pending connection line state (check validity as cursor moves over potential targets)
  const getPendingConnectionState = useCallback((): ConnectionState => {
    if (!pendingConnection) return 'pending';
    return 'pending';
  }, [pendingConnection]);

  // Get pending connection source position
  const getPendingSourcePos = useCallback(() => {
    if (!pendingConnection) return null;
    const sourceNode = nodes.find(n => n.id === pendingConnection.sourceNodeId);
    if (!sourceNode) return null;
    return {
      x: sourceNode.position.x + OUTPUT_PORT_OFFSET.x,
      y: sourceNode.position.y + OUTPUT_PORT_OFFSET.y,
    };
  }, [pendingConnection, nodes]);

  // ============================================================================
  // Get validation errors for a specific node
  // ============================================================================

  const getNodeErrors = useCallback(
    (nodeId: string): ValidationError[] => {
      return validationErrors.filter(
        e => e.nodeIds?.includes(nodeId),
      );
    },
    [validationErrors],
  );

  // ============================================================================
  // Render
  // ============================================================================

  const pendingSourcePos = getPendingSourcePos();

  return (
    <svg
      ref={svgRef}
      className="w-full h-full"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        cursor: isPanning ? 'grabbing' : pendingConnection ? 'crosshair' : 'default',
        backgroundColor: '#0f1419',
      }}
    >
      {/* Defs: filters and patterns */}
      <defs>
        {/* Grid pattern */}
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.05)" />
        </pattern>

        {/* Selection glow */}
        <filter id="glow-selected" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#d4af37" floodOpacity="0.4" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Error glow */}
        <filter id="glow-error" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#ef4444" floodOpacity="0.4" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background grid */}
      <rect
        className="canvas-bg"
        x={viewBox.x - 1000}
        y={viewBox.y - 1000}
        width={viewBox.w + 2000}
        height={viewBox.h + 2000}
        fill="url(#grid)"
      />

      {/* Connections layer (rendered below nodes) */}
      <g className="connections-layer">
        {connections.map(conn => {
          const endpoints = getConnectionEndpoints(conn);
          if (!endpoints) return null;
          return (
            <ConnectionLine
              key={conn.id}
              id={conn.id}
              sourceX={endpoints.sourceX}
              sourceY={endpoints.sourceY}
              targetX={endpoints.targetX}
              targetY={endpoints.targetY}
              state={getConnectionState(conn)}
              onRemove={onRemoveConnection}
            />
          );
        })}

        {/* Pending connection being drawn */}
        {pendingConnection && pendingSourcePos && (
          <ConnectionLine
            id="pending"
            sourceX={pendingSourcePos.x}
            sourceY={pendingSourcePos.y}
            targetX={pendingConnection.mouseX}
            targetY={pendingConnection.mouseY}
            state={getPendingConnectionState()}
            isTemporary
          />
        )}
      </g>

      {/* Nodes layer */}
      <g className="nodes-layer">
        {nodes.map(node => (
          <WorkflowNode
            key={node.id}
            node={node}
            isSelected={node.id === selectedNodeId}
            validationErrors={getNodeErrors(node.id)}
            isDragging={node.id === draggingNodeId}
            onMouseDown={handleNodeMouseDown}
            onPortMouseDown={handlePortMouseDown}
            onPortMouseUp={handlePortMouseUp}
            onDoubleClick={handleNodeDoubleClick}
          />
        ))}
      </g>

      {/* Empty state */}
      {nodes.length === 0 && (
        <text
          x={viewBox.x + viewBox.w / 2}
          y={viewBox.y + viewBox.h / 2}
          textAnchor="middle"
          fill="#4a5568"
          fontSize={16}
          fontFamily="system-ui, sans-serif"
        >
          Drag nodes from the palette to start building your workflow
        </text>
      )}
    </svg>
  );
}
