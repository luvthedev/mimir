/**
 * @module components/workflow/NodePalette
 * @description Sidebar palette displaying draggable node types for the workflow editor.
 *
 * Uses the HTML5 Drag API to allow users to drag node types onto the canvas.
 * Each node type shows an icon, name, and brief description.
 */

import { Upload, FileSearch, ArrowRightLeft, FileOutput } from 'lucide-react';
import type { WorkflowNodeType, WorkflowNodeTypeInfo } from '../../types/workflow';

// ============================================================================
// Node Type Definitions
// ============================================================================

export const NODE_TYPES: WorkflowNodeTypeInfo[] = [
  {
    type: 'upload',
    label: 'Upload',
    description: 'Ingest data from files, APIs, or databases',
    icon: 'Upload',
    color: 'text-frost-ice',
    borderColor: 'border-frost-ice',
    bgColor: 'bg-frost-ice/10',
    maxIncoming: 0,
    maxOutgoing: 5,
  },
  {
    type: 'extract',
    label: 'Extract',
    description: 'Parse and extract structured data from sources',
    icon: 'FileSearch',
    color: 'text-valhalla-gold',
    borderColor: 'border-valhalla-gold',
    bgColor: 'bg-valhalla-gold/10',
    maxIncoming: 3,
    maxOutgoing: 5,
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Filter, map, aggregate, or reshape data',
    icon: 'ArrowRightLeft',
    color: 'text-magic-rune',
    borderColor: 'border-magic-rune',
    bgColor: 'bg-magic-rune/10',
    maxIncoming: 5,
    maxOutgoing: 5,
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Export results to files, APIs, or display',
    icon: 'FileOutput',
    color: 'text-green-500',
    borderColor: 'border-green-500',
    bgColor: 'bg-green-500/10',
    maxIncoming: 5,
    maxOutgoing: 0,
  },
];

const ICON_MAP = {
  Upload,
  FileSearch,
  ArrowRightLeft,
  FileOutput,
} as const;

// ============================================================================
// Draggable Node Item
// ============================================================================

interface DraggableNodeItemProps {
  nodeType: WorkflowNodeTypeInfo;
}

function DraggableNodeItem({ nodeType }: DraggableNodeItemProps) {
  const Icon = ICON_MAP[nodeType.icon as keyof typeof ICON_MAP];

  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/workflow-node-type', nodeType.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`p-3 rounded-lg border-2 ${nodeType.borderColor} border-opacity-40 ${nodeType.bgColor} hover:border-opacity-100 hover:shadow-lg transition-all cursor-grab active:cursor-grabbing select-none`}
    >
      <div className="flex items-center space-x-3">
        <div className={`flex-shrink-0 p-2 rounded-md bg-norse-stone ${nodeType.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className={`text-sm font-semibold ${nodeType.color}`}>
            {nodeType.label}
          </h3>
          <p className="text-xs text-gray-400 line-clamp-1">
            {nodeType.description}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NodePalette Component
// ============================================================================

export function NodePalette() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-norse-rune">
        <h2 className="text-lg font-bold text-valhalla-gold">Node Types</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Drag nodes onto the canvas to build your workflow
        </p>
      </div>

      {/* Node type list */}
      <div className="p-4 space-y-3 overflow-y-auto flex-1">
        {NODE_TYPES.map((nodeType) => (
          <DraggableNodeItem key={nodeType.type} nodeType={nodeType} />
        ))}
      </div>

      {/* Help text */}
      <div className="p-4 border-t border-norse-rune">
        <p className="text-xs text-gray-500">
          Connect nodes by dragging from an output port (right) to an input port (left).
        </p>
      </div>
    </div>
  );
}

/**
 * Helper to get node type info by type string.
 */
export function getNodeTypeInfo(type: WorkflowNodeType): WorkflowNodeTypeInfo | undefined {
  return NODE_TYPES.find((nt) => nt.type === type);
}
