/**
 * @module WorkflowNode
 * @description Draggable workflow node component rendered on the SVG canvas.
 *
 * Each node displays its type icon, label, input/output ports, and
 * visual feedback for selection and validation errors.
 */

import { useCallback, useRef } from 'react';
import { Upload, FileSearch, Shuffle, Download, AlertCircle } from 'lucide-react';
import type { WorkflowNodeType } from '../../types/workflow';
import type { EditorNode, ValidationError } from '../../utils/workflowValidation';

// ============================================================================
// Constants
// ============================================================================

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 80;
export const PORT_RADIUS = 8;

/** Port positions relative to the node's top-left corner */
export const INPUT_PORT_OFFSET = { x: NODE_WIDTH / 2, y: 0 };
export const OUTPUT_PORT_OFFSET = { x: NODE_WIDTH / 2, y: NODE_HEIGHT };

// ============================================================================
// Node type configuration
// ============================================================================

interface NodeTypeConfig {
  icon: typeof Upload;
  color: string;       // Primary fill color
  borderColor: string; // Border color
  portColor: string;   // Port circle color
  label: string;
  description: string;
}

export const NODE_TYPE_CONFIG: Record<WorkflowNodeType, NodeTypeConfig> = {
  upload: {
    icon: Upload,
    color: '#1e3a5f',
    borderColor: '#4a9eff',
    portColor: '#4a9eff',
    label: 'Upload',
    description: 'File or data upload entry point',
  },
  extract: {
    icon: FileSearch,
    color: '#2d4a34',
    borderColor: '#4a7c59',
    portColor: '#4a7c59',
    label: 'Extract',
    description: 'Data extraction / parsing step',
  },
  transform: {
    icon: Shuffle,
    color: '#3d2566',
    borderColor: '#8b5cf6',
    portColor: '#8b5cf6',
    label: 'Transform',
    description: 'Data transformation / processing',
  },
  output: {
    icon: Download,
    color: '#5c3a1e',
    borderColor: '#d4af37',
    portColor: '#d4af37',
    label: 'Output',
    description: 'Final output / export step',
  },
};

// ============================================================================
// Props
// ============================================================================

interface WorkflowNodeProps {
  node: EditorNode;
  isSelected: boolean;
  validationErrors: ValidationError[];
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onPortMouseDown: (e: React.MouseEvent, nodeId: string, portType: 'input' | 'output') => void;
  onPortMouseUp: (e: React.MouseEvent, nodeId: string, portType: 'input' | 'output') => void;
  onDoubleClick: (nodeId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function WorkflowNode({
  node,
  isSelected,
  validationErrors,
  isDragging,
  onMouseDown,
  onPortMouseDown,
  onPortMouseUp,
  onDoubleClick,
}: WorkflowNodeProps) {
  const config = NODE_TYPE_CONFIG[node.type];
  const Icon = config.icon;
  const hasErrors = validationErrors.length > 0;
  const nodeRef = useRef<SVGGElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMouseDown(e, node.id);
    },
    [onMouseDown, node.id],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick(node.id);
    },
    [onDoubleClick, node.id],
  );

  const handleOutputPortMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPortMouseDown(e, node.id, 'output');
    },
    [onPortMouseDown, node.id],
  );

  const handleInputPortMouseUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPortMouseUp(e, node.id, 'input');
    },
    [onPortMouseUp, node.id],
  );

  const label = node.metadata.label || config.label;

  // Determine border/glow
  const borderStroke = hasErrors
    ? '#ef4444'
    : isSelected
    ? '#d4af37'
    : config.borderColor;

  const glowFilter = isSelected ? 'url(#glow-selected)' : hasErrors ? 'url(#glow-error)' : undefined;

  return (
    <g
      ref={nodeRef}
      transform={`translate(${node.position.x}, ${node.position.y})`}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.85 : 1,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Node body */}
      <rect
        x={0}
        y={0}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        ry={8}
        fill={config.color}
        stroke={borderStroke}
        strokeWidth={isSelected || hasErrors ? 2.5 : 1.5}
        filter={glowFilter}
      />

      {/* Icon */}
      <foreignObject x={12} y={NODE_HEIGHT / 2 - 12} width={24} height={24}>
        <Icon
          size={20}
          color={config.borderColor}
          style={{ display: 'block', margin: '2px' }}
        />
      </foreignObject>

      {/* Label */}
      <text
        x={44}
        y={NODE_HEIGHT / 2 - 6}
        fill="#e5e7eb"
        fontSize={13}
        fontWeight={600}
        fontFamily="system-ui, sans-serif"
      >
        {label}
      </text>

      {/* Type subtitle */}
      <text
        x={44}
        y={NODE_HEIGHT / 2 + 12}
        fill="#9ca3af"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
      >
        {config.description}
      </text>

      {/* Validation error indicator */}
      {hasErrors && (
        <foreignObject x={NODE_WIDTH - 28} y={4} width={24} height={24}>
          <div title={validationErrors.map(e => e.message).join('\n')}>
            <AlertCircle size={18} color="#ef4444" />
          </div>
        </foreignObject>
      )}

      {/* Input port (top center) - not for upload nodes */}
      {node.type !== 'upload' && (
        <circle
          cx={INPUT_PORT_OFFSET.x}
          cy={INPUT_PORT_OFFSET.y}
          r={PORT_RADIUS}
          fill="#1a1f2e"
          stroke={config.portColor}
          strokeWidth={2}
          style={{ cursor: 'crosshair' }}
          onMouseUp={handleInputPortMouseUp}
          onMouseDown={(e) => e.stopPropagation()}
        />
      )}

      {/* Output port (bottom center) - not for output nodes */}
      {node.type !== 'output' && (
        <circle
          cx={OUTPUT_PORT_OFFSET.x}
          cy={OUTPUT_PORT_OFFSET.y}
          r={PORT_RADIUS}
          fill="#1a1f2e"
          stroke={config.portColor}
          strokeWidth={2}
          style={{ cursor: 'crosshair' }}
          onMouseDown={handleOutputPortMouseDown}
        />
      )}
    </g>
  );
}
