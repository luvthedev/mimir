/**
 * @module components/workflow/ConnectionLine
 * @description Custom ReactFlow edge component with validation state styling.
 *
 * Renders SVG paths between nodes with color coding:
 * - Green: valid connection
 * - Red: invalid connection
 * - Yellow: pending/in-progress connection
 */

import { memo } from 'react';
import {
  getBezierPath,
  type EdgeProps,
  EdgeLabelRenderer,
} from 'reactflow';
import { X } from 'lucide-react';
import type { ConnectionValidationState } from '../../types/workflow';

// ============================================================================
// Edge Data Interface
// ============================================================================

export interface ConnectionLineData {
  validationState: ConnectionValidationState;
  onDelete?: (edgeId: string) => void;
}

// ============================================================================
// Style Maps
// ============================================================================

const STROKE_COLORS: Record<ConnectionValidationState, string> = {
  valid: '#22c55e',    // green-500
  invalid: '#ef4444',  // red-500
  pending: '#eab308',  // yellow-500
};

const STROKE_WIDTHS: Record<ConnectionValidationState, number> = {
  valid: 2,
  invalid: 2.5,
  pending: 2,
};

const GLOW_COLORS: Record<ConnectionValidationState, string> = {
  valid: 'rgba(34, 197, 94, 0.3)',
  invalid: 'rgba(239, 68, 68, 0.4)',
  pending: 'rgba(234, 179, 8, 0.3)',
};

// ============================================================================
// ConnectionLine Component
// ============================================================================

function ConnectionLineComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<ConnectionLineData>) {
  const validationState = data?.validationState ?? 'valid';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeColor = STROKE_COLORS[validationState];
  const strokeWidth = STROKE_WIDTHS[validationState];
  const glowColor = GLOW_COLORS[validationState];

  return (
    <>
      {/* Glow effect behind the edge */}
      <path
        d={edgePath}
        fill="none"
        stroke={glowColor}
        strokeWidth={strokeWidth + 6}
        className="react-flow__edge-path"
        style={{ filter: 'blur(4px)' }}
      />

      {/* Main edge path */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        className="react-flow__edge-path"
        style={{
          strokeDasharray: validationState === 'pending' ? '8 4' : 'none',
          animation: validationState === 'pending' ? 'dash 1s linear infinite' : 'none',
        }}
      />

      {/* Wider invisible path for easier click targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />

      {/* Delete button (shown when selected or hovered) */}
      {selected && data?.onDelete && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.(id);
              }}
              className="flex items-center justify-center w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full shadow-lg transition-colors"
              title="Remove connection"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Animated flow indicator for valid connections */}
      {validationState === 'valid' && (
        <circle r="3" fill={strokeColor} opacity={0.7}>
          <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
}

export const ConnectionLineMemo = memo(ConnectionLineComponent);
