/**
 * @module components/workflow/TemplatePreview
 * @description Read-only preview of a workflow template's node diagram.
 *
 * Renders a miniature, non-interactive view of the template's nodes and
 * connections using SVG. Used in the TemplateGallery to give users a
 * visual preview before using a template.
 */

import { useMemo } from 'react';
import { NODE_TYPE_CATALOG } from '../../types/workflow';
import type { WorkflowTemplate } from '../../types/workflowTemplates';

// ---- Constants ----

/** Scale factor to fit template coordinates into the preview */
const SCALE = 0.28;
const NODE_WIDTH = 140;
const NODE_HEIGHT = 48;
const PADDING = 16;

// ---- Props ----

interface TemplatePreviewProps {
  template: WorkflowTemplate;
  className?: string;
}

// ---- Component ----

export function TemplatePreview({ template, className = '' }: TemplatePreviewProps) {
  const { scaledNodes, scaledConnections, viewBox } = useMemo(() => {
    // Compute bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of template.nodes) {
      const x = node.position.x * SCALE;
      const y = node.position.y * SCALE;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + NODE_WIDTH * SCALE);
      maxY = Math.max(maxY, y + NODE_HEIGHT * SCALE);
    }

    // Normalize positions relative to bounding box
    const offsetX = minX - PADDING;
    const offsetY = minY - PADDING;

    const nodes = template.nodes.map((n) => ({
      ...n,
      scaledX: n.position.x * SCALE - offsetX,
      scaledY: n.position.y * SCALE - offsetY,
      scaledW: NODE_WIDTH * SCALE,
      scaledH: NODE_HEIGHT * SCALE,
    }));

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const connections = template.connections.map((c) => {
      const source = nodeMap.get(c.sourceNodeId);
      const target = nodeMap.get(c.targetNodeId);
      return {
        id: c.id,
        x1: source ? source.scaledX + source.scaledW : 0,
        y1: source ? source.scaledY + source.scaledH / 2 : 0,
        x2: target ? target.scaledX : 0,
        y2: target ? target.scaledY + target.scaledH / 2 : 0,
      };
    });

    const width = maxX - minX + PADDING * 2;
    const height = maxY - minY + PADDING * 2;

    return {
      scaledNodes: nodes,
      scaledConnections: connections,
      viewBox: `0 0 ${width} ${height}`,
    };
  }, [template]);

  return (
    <svg
      className={`w-full ${className}`}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxHeight: 120 }}
    >
      {/* Connections */}
      {scaledConnections.map((conn) => {
        const midX = (conn.x1 + conn.x2) / 2;
        return (
          <path
            key={conn.id}
            d={`M ${conn.x1} ${conn.y1} C ${midX} ${conn.y1}, ${midX} ${conn.y2}, ${conn.x2} ${conn.y2}`}
            fill="none"
            stroke="rgba(212, 175, 55, 0.4)"
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        );
      })}

      {/* Nodes */}
      {scaledNodes.map((node) => {
        const typeInfo = NODE_TYPE_CATALOG.find((t) => t.type === node.type);
        const color = typeInfo?.color ?? '#666';

        return (
          <g key={node.id}>
            {/* Node background */}
            <rect
              x={node.scaledX}
              y={node.scaledY}
              width={node.scaledW}
              height={node.scaledH}
              rx={4}
              fill="#1e1e2a"
              stroke={color}
              strokeWidth={1.2}
              opacity={0.9}
            />

            {/* Color accent bar */}
            <rect
              x={node.scaledX}
              y={node.scaledY}
              width={3}
              height={node.scaledH}
              rx={1.5}
              fill={color}
            />

            {/* Icon (rendered as a circle with color) */}
            <circle
              cx={node.scaledX + 14}
              cy={node.scaledY + node.scaledH / 2}
              r={5}
              fill={`${color}30`}
              stroke={color}
              strokeWidth={0.5}
            />

            {/* Label */}
            <text
              x={node.scaledX + 24}
              y={node.scaledY + node.scaledH / 2 + 1}
              fill="#e0e0e0"
              fontSize={7}
              fontFamily="system-ui, sans-serif"
              dominantBaseline="middle"
            >
              {((node.metadata.label as string) ?? node.type).slice(0, 18)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
