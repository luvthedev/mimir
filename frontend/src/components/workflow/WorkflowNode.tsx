/**
 * @module WorkflowNode
 * @description Draggable workflow node rendered on the SVG canvas.
 *
 * Visual feedback:
 *  - Selected: gold border
 *  - Validation errors: red border + pulsing dot
 *  - Default: subtle rune border
 *
 * Exposes input (top) and output (bottom) ports for connection drawing.
 */

import { useCallback, useRef } from 'react';
import { Upload, FileSearch, Cog, FileOutput, AlertCircle } from 'lucide-react';
import type { EditorNode, WorkflowNodeType } from '../../utils/workflowValidation';

// ---------------------------------------------------------------------------
// Port configuration
// ---------------------------------------------------------------------------

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 96;
export const PORT_RADIUS = 7;

export function getInputPortPosition(node: EditorNode) {
  return { x: node.position.x + NODE_WIDTH / 2, y: node.position.y };
}

export function getOutputPortPosition(node: EditorNode) {
  return { x: node.position.x + NODE_WIDTH / 2, y: node.position.y + NODE_HEIGHT };
}

// ---------------------------------------------------------------------------
// Visual config per type
// ---------------------------------------------------------------------------

interface NodeTypeConfig {
  label: string;
  icon: typeof Upload;
  accent: string;      // tailwind fill / stroke
  bgClass: string;     // hex fill for the node body
  headerBg: string;    // hex fill for the header band
}

const NODE_CONFIG: Record<WorkflowNodeType, NodeTypeConfig> = {
  upload: {
    label: 'Upload',
    icon: Upload,
    accent: '#4a9eff',   // frost-ice
    bgClass: '#252d3d',  // norse-stone
    headerBg: '#1a3a5c',
  },
  extract: {
    label: 'Extract',
    icon: FileSearch,
    accent: '#d4af37',   // valhalla-gold
    bgClass: '#252d3d',
    headerBg: '#3d3520',
  },
  transform: {
    label: 'Transform',
    icon: Cog,
    accent: '#8b5cf6',   // magic-rune
    bgClass: '#252d3d',
    headerBg: '#2d2050',
  },
  output: {
    label: 'Output',
    icon: FileOutput,
    accent: '#22c55e',   // green
    bgClass: '#252d3d',
    headerBg: '#1a3d26',
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkflowNodeProps {
  node: EditorNode;
  selected: boolean;
  errors: string[];
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onPortMouseDown: (e: React.MouseEvent, nodeId: string, port: 'input' | 'output') => void;
  onPortMouseUp: (e: React.MouseEvent, nodeId: string, port: 'input' | 'output') => void;
  onDoubleClick: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkflowNode({
  node,
  selected,
  errors,
  onMouseDown,
  onPortMouseDown,
  onPortMouseUp,
  onDoubleClick,
}: WorkflowNodeProps) {
  const config = NODE_CONFIG[node.type];
  const Icon = config.icon;
  const hasErrors = errors.length > 0;
  const nodeRef = useRef<SVGGElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Ignore if clicking a port
      if ((e.target as SVGElement).dataset.port) return;
      onMouseDown(e, node.id);
    },
    [node.id, onMouseDown],
  );

  const handleDblClick = useCallback(
    () => onDoubleClick(node.id),
    [node.id, onDoubleClick],
  );

  const borderColor = hasErrors
    ? '#ef4444'
    : selected
    ? '#d4af37'
    : '#3d4556';

  const label =
    (node.metadata?.label as string) ?? config.label;

  return (
    <g
      ref={nodeRef}
      transform={`translate(${node.position.x}, ${node.position.y})`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDblClick}
      style={{ cursor: 'grab' }}
      role="button"
      tabIndex={0}
      aria-label={`${config.label} node: ${label}`}
    >
      {/* Shadow */}
      <rect
        x={2}
        y={2}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        ry={8}
        fill="rgba(0,0,0,0.3)"
      />

      {/* Body */}
      <rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        ry={8}
        fill={config.bgClass}
        stroke={borderColor}
        strokeWidth={selected || hasErrors ? 2.5 : 1.5}
      />

      {/* Header band */}
      <rect
        width={NODE_WIDTH}
        height={32}
        rx={8}
        ry={8}
        fill={config.headerBg}
      />
      {/* Clip bottom corners of header */}
      <rect
        y={24}
        width={NODE_WIDTH}
        height={8}
        fill={config.headerBg}
      />

      {/* Icon (foreignObject for Lucide icon) */}
      <foreignObject x={10} y={6} width={20} height={20}>
        <Icon
          size={16}
          color={config.accent}
          style={{ display: 'block' }}
        />
      </foreignObject>

      {/* Type label */}
      <text
        x={36}
        y={20}
        fill={config.accent}
        fontSize={12}
        fontWeight={600}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {config.label.toUpperCase()}
      </text>

      {/* Node label */}
      <text
        x={NODE_WIDTH / 2}
        y={58}
        fill="#e5e7eb"
        fontSize={13}
        fontWeight={500}
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {label.length > 22 ? `${label.slice(0, 20)}...` : label}
      </text>

      {/* Node id (small) */}
      <text
        x={NODE_WIDTH / 2}
        y={80}
        fill="#6b7280"
        fontSize={9}
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {node.id.length > 28 ? `${node.id.slice(0, 26)}...` : node.id}
      </text>

      {/* Error indicator */}
      {hasErrors && (
        <foreignObject x={NODE_WIDTH - 28} y={6} width={20} height={20}>
          <AlertCircle
            size={16}
            color="#ef4444"
            style={{ display: 'block' }}
          />
        </foreignObject>
      )}

      {/* --- Input port (top center) --- */}
      {node.type !== 'upload' && (
        <circle
          cx={NODE_WIDTH / 2}
          cy={0}
          r={PORT_RADIUS}
          fill="#1a1f2e"
          stroke={config.accent}
          strokeWidth={2}
          data-port="input"
          style={{ cursor: 'crosshair' }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onPortMouseDown(e, node.id, 'input');
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            onPortMouseUp(e, node.id, 'input');
          }}
        />
      )}

      {/* --- Output port (bottom center) --- */}
      {node.type !== 'output' && (
        <circle
          cx={NODE_WIDTH / 2}
          cy={NODE_HEIGHT}
          r={PORT_RADIUS}
          fill="#1a1f2e"
          stroke={config.accent}
          strokeWidth={2}
          data-port="output"
          style={{ cursor: 'crosshair' }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onPortMouseDown(e, node.id, 'output');
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            onPortMouseUp(e, node.id, 'output');
          }}
        />
      )}
    </g>
  );
}
