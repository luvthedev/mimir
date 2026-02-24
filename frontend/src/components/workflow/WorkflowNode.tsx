/**
 * @module components/workflow/WorkflowNode
 * @description Draggable workflow node rendered on the canvas.
 *
 * Features:
 *  - Draggable positioning via mouse events
 *  - Input/output port circles for connection drawing
 *  - Visual feedback: selected highlight, validation error glow
 *  - Config panel toggle (click to select, shows details in sidebar)
 *  - Node type color coding matching NODE_TYPE_CATALOG
 */

import { useCallback, useRef, useState } from 'react';
import { Upload, FileSearch, Shuffle, Download, Trash2 } from 'lucide-react';
import type { EditorNode } from '../../types/workflow';
import { NODE_TYPE_CATALOG } from '../../types/workflow';
import { NODE_WIDTH, NODE_HEIGHT } from './ConnectionLine';

// ---- Icon map ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Upload,
  FileSearch,
  Shuffle,
  Download,
};

// ---- Component ----

interface WorkflowNodeProps {
  node: EditorNode;
  isSelected: boolean;
  hasError: boolean;
  /** Called when the user starts dragging from an output port */
  onStartConnection: (nodeId: string, port: string) => void;
  /** Called when the user drops onto an input port */
  onCompleteConnection: (nodeId: string, port: string) => void;
  /** Called when node position changes via drag */
  onPositionChange: (nodeId: string, position: { x: number; y: number }) => void;
  /** Called when node is clicked (selects it) */
  onSelect: (nodeId: string) => void;
  /** Called to delete the node */
  onDelete: (nodeId: string) => void;
}

export function WorkflowNode({
  node,
  isSelected,
  hasError,
  onStartConnection,
  onCompleteConnection,
  onPositionChange,
  onSelect,
  onDelete,
}: WorkflowNodeProps) {
  const typeInfo = NODE_TYPE_CATALOG.find((t) => t.type === node.type);
  const Icon = typeInfo ? ICON_MAP[typeInfo.icon] : Upload;
  const color = typeInfo?.color ?? '#4a9eff';
  const hasInputPort = typeInfo ? typeInfo.ports.inputs.length > 0 : false;
  const hasOutputPort = typeInfo ? typeInfo.ports.outputs.length > 0 : false;

  const nodeRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null);

  // ---- Node drag handlers ----

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only drag on left-click, ignore port clicks
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('[data-port]')) return;
      if ((e.target as HTMLElement).closest('button')) return;

      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        nodeX: node.position.x,
        nodeY: node.position.y,
      };
      onSelect(node.id);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current) return;
        const dx = moveEvent.clientX - dragStartRef.current.mouseX;
        const dy = moveEvent.clientY - dragStartRef.current.mouseY;
        onPositionChange(node.id, {
          x: Math.max(0, dragStartRef.current.nodeX + dx),
          y: Math.max(0, dragStartRef.current.nodeY + dy),
        });
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        dragStartRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [node.id, node.position, onPositionChange, onSelect],
  );

  // ---- Port interaction handlers ----

  const handleOutputPortMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onStartConnection(node.id, 'data');
    },
    [node.id, onStartConnection],
  );

  const handleInputPortMouseUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCompleteConnection(node.id, 'data');
    },
    [node.id, onCompleteConnection],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-port]')) return;
      if ((e.target as HTMLElement).closest('button')) return;
      onSelect(node.id);
    },
    [node.id, onSelect],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(node.id);
    },
    [node.id, onDelete],
  );

  // ---- Styles ----

  const borderColor = hasError
    ? 'border-red-500 shadow-red-500/30 shadow-md'
    : isSelected
      ? 'border-valhalla-gold shadow-valhalla-gold/30 shadow-md'
      : 'border-norse-rune hover:border-norse-mist';

  return (
    <div
      ref={nodeRef}
      className={`absolute select-none ${isDragging ? 'cursor-grabbing z-20' : 'cursor-grab z-10'}`}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: NODE_WIDTH,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      data-node-id={node.id}
    >
      <div
        className={`
          bg-norse-shadow border-2 rounded-xl p-3
          transition-all duration-200
          ${borderColor}
        `}
        style={{ minHeight: NODE_HEIGHT }}
      >
        {/* Header with icon, label, and delete button */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${color}20` }}
            >
              {Icon && <Icon size={16} className="text-current" style={{ color }} />}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-100">
                {(node.metadata.label as string) || typeInfo?.label || node.type}
              </div>
              <div className="text-xs text-gray-500">{typeInfo?.description}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
            title="Delete node"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Ports */}
        {/* Input port (left side) */}
        {hasInputPort && (
          <div
            data-port="input"
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 bg-norse-night border-norse-rune hover:border-valhalla-gold hover:bg-norse-shadow cursor-crosshair transition-all z-30"
            onMouseUp={handleInputPortMouseUp}
            title="Input port - drop connection here"
          />
        )}

        {/* Output port (right side) */}
        {hasOutputPort && (
          <div
            data-port="output"
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 bg-norse-night border-norse-rune hover:border-valhalla-gold hover:bg-norse-shadow cursor-crosshair transition-all z-30"
            onMouseDown={handleOutputPortMouseDown}
            title="Output port - drag to connect"
          />
        )}
      </div>
    </div>
  );
}
