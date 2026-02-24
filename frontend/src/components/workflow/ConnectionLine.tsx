/**
 * @module ConnectionLine
 * @description SVG path component for connections between workflow nodes.
 *
 * Renders a smooth bezier curve between two points with color-coded
 * validation state: valid=green, invalid=red, pending=yellow.
 */

import { useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ConnectionState = 'valid' | 'invalid' | 'pending' | 'default';

interface ConnectionLineProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  state: ConnectionState;
  /** Whether this is a temporary line being drawn (pending connection) */
  isTemporary?: boolean;
  onRemove?: (connectionId: string) => void;
}

// ============================================================================
// Color mapping
// ============================================================================

const STATE_COLORS: Record<ConnectionState, string> = {
  valid: '#22c55e',    // green
  invalid: '#ef4444',  // red
  pending: '#eab308',  // yellow
  default: '#6b7280',  // gray
};

const STATE_DASH: Record<ConnectionState, string> = {
  valid: 'none',
  invalid: '6 4',
  pending: '4 4',
  default: 'none',
};

// ============================================================================
// Component
// ============================================================================

export function ConnectionLine({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  state,
  isTemporary = false,
  onRemove,
}: ConnectionLineProps) {
  const color = STATE_COLORS[state];
  const dash = STATE_DASH[state];

  // Calculate bezier control points for a smooth vertical curve
  const deltaY = targetY - sourceY;
  const curvature = Math.min(Math.abs(deltaY) * 0.5, 100);
  const controlPointOffset = Math.max(curvature, 50);

  const path = `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + controlPointOffset}, ${targetX} ${targetY - controlPointOffset}, ${targetX} ${targetY}`;

  // Calculate midpoint for the delete button
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isTemporary && onRemove) {
        e.stopPropagation();
        onRemove(id);
      }
    },
    [id, isTemporary, onRemove],
  );

  return (
    <g className="connection-line" style={{ pointerEvents: isTemporary ? 'none' : 'auto' }}>
      {/* Invisible wider path for easier clicking */}
      {!isTemporary && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          style={{ cursor: 'pointer' }}
          onClick={handleClick}
        />
      )}

      {/* Visible path */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dash}
        strokeLinecap="round"
        style={{
          transition: isTemporary ? 'none' : 'stroke 0.2s, stroke-dasharray 0.2s',
          pointerEvents: 'none',
        }}
      />

      {/* Arrow head at target */}
      <polygon
        points={`${targetX},${targetY} ${targetX - 5},${targetY - 8} ${targetX + 5},${targetY - 8}`}
        fill={color}
        style={{
          transition: isTemporary ? 'none' : 'fill 0.2s',
          pointerEvents: 'none',
        }}
      />

      {/* Delete indicator on hover (for established connections) */}
      {!isTemporary && onRemove && (
        <g
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
          className="connection-delete-btn"
        >
          <circle
            cx={midX}
            cy={midY}
            r={10}
            fill="#1a1f2e"
            stroke="#ef4444"
            strokeWidth={1.5}
            opacity={0}
            className="connection-delete-circle"
          />
          <text
            x={midX}
            y={midY + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#ef4444"
            fontSize={14}
            fontWeight={700}
            opacity={0}
            className="connection-delete-text"
            style={{ pointerEvents: 'none' }}
          >
            x
          </text>
        </g>
      )}
    </g>
  );
}
