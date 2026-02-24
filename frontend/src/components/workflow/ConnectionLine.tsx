/**
 * @module ConnectionLine
 * @description SVG path rendering a connection between two workflow nodes.
 *
 * Styling states:
 *  - valid   (green)   : connection passes all validation rules
 *  - invalid (red)     : connection violates a validation rule
 *  - pending (yellow)  : connection is being drawn and not yet committed
 */

import type { EditorConnection, EditorNode } from '../../utils/workflowValidation';
import {
  getInputPortPosition,
  getOutputPortPosition,
} from './WorkflowNode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionState = 'valid' | 'invalid' | 'pending';

interface ConnectionLineProps {
  connection: EditorConnection;
  nodes: EditorNode[];
  state: ConnectionState;
  onRemove?: (connectionId: string) => void;
}

interface PendingConnectionLineProps {
  sourceNode: EditorNode;
  sourcePort: 'input' | 'output';
  mousePosition: { x: number; y: number };
  state: ConnectionState;
}

// ---------------------------------------------------------------------------
// Colour map
// ---------------------------------------------------------------------------

const STATE_COLORS: Record<ConnectionState, { stroke: string; glow: string }> = {
  valid: { stroke: '#22c55e', glow: 'rgba(34,197,94,0.25)' },
  invalid: { stroke: '#ef4444', glow: 'rgba(239,68,68,0.25)' },
  pending: { stroke: '#eab308', glow: 'rgba(234,179,8,0.25)' },
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Build a smooth cubic bezier path between two points, biasing the
 * control points vertically so connections arc downward naturally.
 */
function buildPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const dy = Math.abs(y2 - y1);
  const cpOffset = Math.max(40, dy * 0.4);
  return `M ${x1} ${y1} C ${x1} ${y1 + cpOffset}, ${x2} ${y2 - cpOffset}, ${x2} ${y2}`;
}

// ---------------------------------------------------------------------------
// Committed connection
// ---------------------------------------------------------------------------

export function ConnectionLine({
  connection,
  nodes,
  state,
  onRemove,
}: ConnectionLineProps) {
  const sourceNode = nodes.find((n) => n.id === connection.sourceNodeId);
  const targetNode = nodes.find((n) => n.id === connection.targetNodeId);

  if (!sourceNode || !targetNode) return null;

  const from = getOutputPortPosition(sourceNode);
  const to = getInputPortPosition(targetNode);
  const d = buildPath(from.x, from.y, to.x, to.y);
  const colors = STATE_COLORS[state];

  return (
    <g className="connection-line" role="img" aria-label={`Connection from ${connection.sourceNodeId} to ${connection.targetNodeId}`}>
      {/* Glow underlay */}
      <path
        d={d}
        fill="none"
        stroke={colors.glow}
        strokeWidth={8}
        strokeLinecap="round"
        pointerEvents="none"
      />

      {/* Main path */}
      <path
        d={d}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={state === 'pending' ? '6 4' : undefined}
        style={{ cursor: onRemove ? 'pointer' : 'default' }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove?.(connection.id);
        }}
      />

      {/* Arrow head */}
      <polygon
        points={`${to.x},${to.y - 2} ${to.x - 5},${to.y - 10} ${to.x + 5},${to.y - 10}`}
        fill={colors.stroke}
      />

      {/* Invisible wider hit area for click-to-remove */}
      {onRemove && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          strokeLinecap="round"
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(connection.id);
          }}
        />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Pending (in-progress) connection line following the mouse
// ---------------------------------------------------------------------------

export function PendingConnectionLine({
  sourceNode,
  sourcePort,
  mousePosition,
  state,
}: PendingConnectionLineProps) {
  const from =
    sourcePort === 'output'
      ? getOutputPortPosition(sourceNode)
      : getInputPortPosition(sourceNode);

  const d = buildPath(from.x, from.y, mousePosition.x, mousePosition.y);
  const colors = STATE_COLORS[state];

  return (
    <g className="pending-connection" pointerEvents="none">
      <path
        d={d}
        fill="none"
        stroke={colors.glow}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="6 4"
      />
    </g>
  );
}
