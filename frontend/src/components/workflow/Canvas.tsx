/**
 * @module Canvas
 * @description SVG canvas for rendering workflow nodes and connections.
 *
 * Handles:
 *  - Pan & zoom via mouse wheel / middle-click drag
 *  - Node dragging (position updates)
 *  - Drop target for NodePalette items (HTML5 Drag API)
 *  - Connection drawing between ports
 *  - Real-time validation feedback during connection drawing
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { WorkflowNode, NODE_WIDTH, NODE_HEIGHT, PORT_RADIUS } from './WorkflowNode';
import { ConnectionLine, PendingConnectionLine } from './ConnectionLine';
import type { ConnectionState } from './ConnectionLine';
import type { EditorNode, EditorConnection, WorkflowNodeType } from '../../utils/workflowValidation';
import { isValidConnection } from '../../utils/workflowValidation';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CanvasProps {
  nodes: EditorNode[];
  connections: EditorConnection[];
  selectedNodeId: string | null;
  nodeErrors: Record<string, string[]>;
  pendingConnection: {
    sourceNodeId: string;
    sourcePort: string;
  } | null;
  onAddNode: (type: WorkflowNodeType, position: { x: number; y: number }) => string;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onSelectNode: (nodeId: string | null) => void;
  onRemoveNode: (nodeId: string) => void;
  onStartConnection: (sourceNodeId: string, sourcePort: string) => void;
  onCompleteConnection: (targetNodeId: string, targetPort: string) => void;
  onCancelConnection: () => void;
  onRemoveConnection: (connectionId: string) => void;
  onDoubleClickNode: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const GRID_SIZE = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Canvas({
  nodes,
  connections,
  selectedNodeId,
  nodeErrors,
  pendingConnection,
  onAddNode,
  onMoveNode,
  onSelectNode,
  onRemoveNode,
  onStartConnection,
  onCompleteConnection,
  onCancelConnection,
  onRemoveConnection,
  onDoubleClickNode,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // -- Viewport state (pan + zoom) ----------------------------------------
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // -- Drag state ---------------------------------------------------------
  const [dragging, setDragging] = useState<{
    nodeId: string;
    startMouse: { x: number; y: number };
    startPosition: { x: number; y: number };
  } | null>(null);

  // -- Pan state ----------------------------------------------------------
  const [panning, setPanning] = useState<{
    startMouse: { x: number; y: number };
    startOffset: { x: number; y: number };
  } | null>(null);

  // -- Connection drawing mouse position ----------------------------------
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // -----------------------------------------------------------------------
  // Coordinate helpers
  // -----------------------------------------------------------------------

  /** Convert client (screen) coordinates to SVG canvas coordinates. */
  const clientToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: (clientX - rect.left - viewOffset.x) / zoom,
        y: (clientY - rect.top - viewOffset.y) / zoom,
      };
    },
    [viewOffset, zoom],
  );

  // -----------------------------------------------------------------------
  // Node drag handlers
  // -----------------------------------------------------------------------

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (e.button !== 0) return; // left-click only
      e.stopPropagation();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      onSelectNode(nodeId);
      setDragging({
        nodeId,
        startMouse: { x: e.clientX, y: e.clientY },
        startPosition: { ...node.position },
      });
    },
    [nodes, onSelectNode],
  );

  // -----------------------------------------------------------------------
  // Port interaction handlers
  // -----------------------------------------------------------------------

  const handlePortMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string, port: 'input' | 'output') => {
      e.stopPropagation();
      e.preventDefault();
      // Start connection from output ports; for input ports we could reverse,
      // but the standard UX is output -> input.
      if (port === 'output') {
        onStartConnection(nodeId, 'output');
      }
    },
    [onStartConnection],
  );

  const handlePortMouseUp = useCallback(
    (e: React.MouseEvent, nodeId: string, port: 'input' | 'output') => {
      e.stopPropagation();
      if (pendingConnection && port === 'input') {
        onCompleteConnection(nodeId, 'input');
      }
    },
    [pendingConnection, onCompleteConnection],
  );

  // -----------------------------------------------------------------------
  // Canvas-level mouse handlers
  // -----------------------------------------------------------------------

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Left click on empty canvas -> deselect
      if (e.button === 0) {
        onSelectNode(null);
        if (pendingConnection) {
          onCancelConnection();
        }
      }
      // Middle click or left+space -> pan start
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        setPanning({
          startMouse: { x: e.clientX, y: e.clientY },
          startOffset: { ...viewOffset },
        });
      }
    },
    [viewOffset, onSelectNode, pendingConnection, onCancelConnection],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Track mouse for pending connection line
      if (pendingConnection) {
        setMousePos(clientToCanvas(e.clientX, e.clientY));
      }

      // Node dragging
      if (dragging) {
        const dx = (e.clientX - dragging.startMouse.x) / zoom;
        const dy = (e.clientY - dragging.startMouse.y) / zoom;
        onMoveNode(dragging.nodeId, {
          x: dragging.startPosition.x + dx,
          y: dragging.startPosition.y + dy,
        });
        return;
      }

      // Panning
      if (panning) {
        setViewOffset({
          x: panning.startOffset.x + (e.clientX - panning.startMouse.x),
          y: panning.startOffset.y + (e.clientY - panning.startMouse.y),
        });
      }
    },
    [dragging, panning, pendingConnection, clientToCanvas, zoom, onMoveNode],
  );

  const handleMouseUp = useCallback(() => {
    if (dragging) setDragging(null);
    if (panning) setPanning(null);
    if (pendingConnection) {
      // If mouse up on empty canvas, cancel the connection
      onCancelConnection();
    }
  }, [dragging, panning, pendingConnection, onCancelConnection]);

  // -----------------------------------------------------------------------
  // Zoom via wheel
  // -----------------------------------------------------------------------

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      setZoom((prev) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + direction * ZOOM_STEP));
        // Zoom toward cursor position
        const svg = svgRef.current;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const scale = next / prev;
          setViewOffset((vo) => ({
            x: mx - scale * (mx - vo.x),
            y: my - scale * (my - vo.y),
          }));
        }
        return next;
      });
    },
    [],
  );

  // -----------------------------------------------------------------------
  // HTML5 drop target (from NodePalette)
  // -----------------------------------------------------------------------

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
      const pos = clientToCanvas(e.clientX, e.clientY);
      // Center the new node on the drop point
      onAddNode(nodeType, {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      });
    },
    [clientToCanvas, onAddNode],
  );

  // -----------------------------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Delete selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        onRemoveNode(selectedNodeId);
      }

      // Undo placeholder (actual undo dispatched by parent)
      // Escape cancels pending connection
      if (e.key === 'Escape' && pendingConnection) {
        onCancelConnection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, pendingConnection, onRemoveNode, onCancelConnection]);

  // -----------------------------------------------------------------------
  // Zoom controls
  // -----------------------------------------------------------------------

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP * 2));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP * 2));
  }, []);

  const fitView = useCallback(() => {
    if (nodes.length === 0) {
      setViewOffset({ x: 0, y: 0 });
      setZoom(1);
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + NODE_WIDTH + 40;
    const maxY = Math.max(...ys) + NODE_HEIGHT + 40;

    const contentW = maxX - minX;
    const contentH = maxY - minY;

    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;
    const newZoom = Math.min(Math.max(MIN_ZOOM, Math.min(scaleX, scaleY, 1.5)), MAX_ZOOM);

    setZoom(newZoom);
    setViewOffset({
      x: (rect.width - contentW * newZoom) / 2 - minX * newZoom,
      y: (rect.height - contentH * newZoom) / 2 - minY * newZoom,
    });
  }, [nodes]);

  // -----------------------------------------------------------------------
  // Derive connection validation state for rendering
  // -----------------------------------------------------------------------

  const getConnectionState = useCallback(
    (conn: EditorConnection): ConnectionState => {
      const result = isValidConnection(
        conn.sourceNodeId,
        conn.targetNodeId,
        nodes,
        connections.filter((c) => c.id !== conn.id),
      );
      return result.valid ? 'valid' : 'invalid';
    },
    [nodes, connections],
  );

  /** Validation state of the pending connection (while drawing). */
  const pendingState: ConnectionState = (() => {
    if (!pendingConnection) return 'pending';
    // Check if mouse is near any input port to preview validity
    const hoverNode = nodes.find((n) => {
      const px = n.position.x + NODE_WIDTH / 2;
      const py = n.position.y;
      const dist = Math.hypot(mousePos.x - px, mousePos.y - py);
      return dist < PORT_RADIUS * 3;
    });

    if (!hoverNode) return 'pending';

    const result = isValidConnection(
      pendingConnection.sourceNodeId,
      hoverNode.id,
      nodes,
      connections,
    );
    return result.valid ? 'valid' : 'invalid';
  })();

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="relative w-full h-full overflow-hidden bg-norse-night rounded-lg border border-norse-rune">
      <svg
        ref={svgRef}
        className="w-full h-full"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ cursor: panning ? 'grabbing' : 'default' }}
      >
        {/* Background grid */}
        <defs>
          <pattern
            id="canvas-grid"
            width={GRID_SIZE}
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewOffset.x % (GRID_SIZE * zoom)}, ${viewOffset.y % (GRID_SIZE * zoom)}) scale(${zoom})`}
          >
            <circle cx={GRID_SIZE / 2} cy={GRID_SIZE / 2} r={0.8} fill="#374151" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-grid)" />

        {/* Transformed canvas group */}
        <g transform={`translate(${viewOffset.x}, ${viewOffset.y}) scale(${zoom})`}>
          {/* Connections (rendered below nodes) */}
          {connections.map((conn) => (
            <ConnectionLine
              key={conn.id}
              connection={conn}
              nodes={nodes}
              state={getConnectionState(conn)}
              onRemove={onRemoveConnection}
            />
          ))}

          {/* Pending connection */}
          {pendingConnection && (() => {
            const sourceNode = nodes.find((n) => n.id === pendingConnection.sourceNodeId);
            if (!sourceNode) return null;
            return (
              <PendingConnectionLine
                sourceNode={sourceNode}
                sourcePort={pendingConnection.sourcePort as 'input' | 'output'}
                mousePosition={mousePos}
                state={pendingState}
              />
            );
          })()}

          {/* Nodes */}
          {nodes.map((node) => (
            <WorkflowNode
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              errors={nodeErrors[node.id] ?? []}
              onMouseDown={handleNodeMouseDown}
              onPortMouseDown={handlePortMouseDown}
              onPortMouseUp={handlePortMouseUp}
              onDoubleClick={onDoubleClickNode}
            />
          ))}
        </g>
      </svg>

      {/* Zoom controls overlay */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          type="button"
          onClick={zoomIn}
          className="w-8 h-8 bg-norse-shadow/90 border border-norse-rune rounded-md flex items-center justify-center text-gray-300 hover:text-white hover:bg-norse-stone transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={zoomOut}
          className="w-8 h-8 bg-norse-shadow/90 border border-norse-rune rounded-md flex items-center justify-center text-gray-300 hover:text-white hover:bg-norse-stone transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={fitView}
          className="w-8 h-8 bg-norse-shadow/90 border border-norse-rune rounded-md flex items-center justify-center text-gray-300 hover:text-white hover:bg-norse-stone transition-colors"
          title="Fit to view"
        >
          <Maximize2 size={16} />
        </button>
        <div className="text-center text-[10px] text-gray-500 mt-1">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-3 opacity-30">&#x2B22;</div>
            <p className="text-sm font-medium text-gray-400">
              Drag nodes from the palette to get started
            </p>
            <p className="text-xs text-gray-500 mt-1">
              or Alt+drag to pan the canvas
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
