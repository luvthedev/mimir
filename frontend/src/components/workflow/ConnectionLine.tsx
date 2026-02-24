/**
 * @module components/workflow/ConnectionLine
 * @description SVG path connecting two workflow nodes.
 *
 * Renders a cubic bezier between source and target ports with styling
 * that reflects connection validation state:
 *   - valid   = green stroke
 *   - invalid = red stroke
 *   - pending = yellow/gold dashed stroke (while drawing)
 *
 * Each line also has an invisible wider hit-area for easier click-to-delete.
 */

import { useCallback } from 'react';
import type { EditorNode, EditorConnection } from '../../types/workflow';

// ---- Geometry helpers ----

/** Width of a rendered node on canvas (matches WorkflowNode styling) */
const NODE_WIDTH = 220;
/** Height of a rendered node on canvas */
const NODE_HEIGHT = 80;

/**
 * Compute the center-right point of a node (output port location).
 */
function getSourcePoint(node: EditorNode) {
  return {
    x: node.position.x + NODE_WIDTH,
    y: node.position.y + NODE_HEIGHT / 2,
  };
}

/**
 * Compute the center-left point of a node (input port location).
 */
function getTargetPoint(node: EditorNode) {
  return {
    x: node.position.x,
    y: node.position.y + NODE_HEIGHT / 2,
  };
}

/**
 * Build a smooth cubic bezier SVG `d` attribute between two points.
 */
function buildPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): string {
  const dx = Math.abs(tx - sx);
  const offset = Math.max(dx * 0.5, 50);
  return `M ${sx} ${sy} C ${sx + offset} ${sy}, ${tx - offset} ${ty}, ${tx} ${ty}`;
}

// ---- Component ----

interface ConnectionLineProps {
  connection: EditorConnection;
  nodes: EditorNode[];
  isValid?: boolean;
  onDelete?: (connectionId: string) => void;
}

export function ConnectionLine({ connection, nodes, isValid = true, onDelete }: ConnectionLineProps) {
  const sourceNode = nodes.find((n) => n.id === connection.sourceNodeId);
  const targetNode = nodes.find((n) => n.id === connection.targetNodeId);

  if (!sourceNode || !targetNode) return null;

  const src = getSourcePoint(sourceNode);
  const tgt = getTargetPoint(targetNode);
  const d = buildPath(src.x, src.y, tgt.x, tgt.y);

  const strokeColor = isValid ? '#10b981' : '#ef4444'; // green / red

  const handleClick = useCallback(() => {
    onDelete?.(connection.id);
  }, [connection.id, onDelete]);

  return (
    <g className="workflow-connection group">
      {/* Invisible wider hit area for easier clicking */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
      />
      {/* Visible path */}
      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        className="transition-colors duration-200"
        style={{ pointerEvents: 'none' }}
      />
      {/* Animated flow indicator (small circle along path) */}
      {isValid && (
        <circle r={3} fill={strokeColor} opacity={0.6}>
          <animateMotion dur="2s" repeatCount="indefinite" path={d} />
        </circle>
      )}
    </g>
  );
}

// ---- Pending connection line (while user is drawing) ----

interface PendingConnectionLineProps {
  sourceNode: EditorNode;
  mousePosition: { x: number; y: number };
  isValidTarget: boolean | null; // null = not over a target
}

export function PendingConnectionLine({
  sourceNode,
  mousePosition,
  isValidTarget,
}: PendingConnectionLineProps) {
  const src = getSourcePoint(sourceNode);
  const d = buildPath(src.x, src.y, mousePosition.x, mousePosition.y);

  const strokeColor =
    isValidTarget === null
      ? '#d4af37' // gold while dragging
      : isValidTarget
        ? '#10b981' // green if valid target
        : '#ef4444'; // red if invalid target

  return (
    <path
      d={d}
      fill="none"
      stroke={strokeColor}
      strokeWidth={2}
      strokeDasharray="8 4"
      strokeLinecap="round"
      opacity={0.8}
      style={{ pointerEvents: 'none' }}
    />
  );
}

export { NODE_WIDTH, NODE_HEIGHT, getSourcePoint, getTargetPoint };
