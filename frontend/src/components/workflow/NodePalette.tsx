/**
 * @module NodePalette
 * @description Sidebar palette showing draggable node types.
 *
 * Uses the HTML5 Drag API to allow users to drag node types onto the canvas.
 * Displays node type icons, labels, and descriptions.
 */

import { useCallback } from 'react';
import { Upload, FileSearch, Shuffle, Download, GripVertical } from 'lucide-react';
import type { WorkflowNodeType } from '../../types/workflow';

// ============================================================================
// Types
// ============================================================================

export const DRAG_TYPE_WORKFLOW_NODE = 'workflow-node';

export interface DragNodeData {
  nodeType: WorkflowNodeType;
}

interface NodePaletteItem {
  type: WorkflowNodeType;
  label: string;
  description: string;
  icon: typeof Upload;
  color: string;
  borderColor: string;
}

const PALETTE_ITEMS: NodePaletteItem[] = [
  {
    type: 'upload',
    label: 'Upload',
    description: 'File or data entry point',
    icon: Upload,
    color: 'from-[#1e3a5f] to-[#152a45]',
    borderColor: 'border-frost-ice',
  },
  {
    type: 'extract',
    label: 'Extract',
    description: 'Parse and extract data',
    icon: FileSearch,
    color: 'from-[#2d4a34] to-[#1e3524]',
    borderColor: 'border-yggdrasil-leaf',
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Process and transform data',
    icon: Shuffle,
    color: 'from-[#3d2566] to-[#2d1a4d]',
    borderColor: 'border-magic-rune',
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Export and deliver results',
    icon: Download,
    color: 'from-[#5c3a1e] to-[#4a2e15]',
    borderColor: 'border-valhalla-gold',
  },
];

// ============================================================================
// Component
// ============================================================================

export function NodePalette() {
  const handleDragStart = useCallback(
    (e: React.DragEvent, nodeType: WorkflowNodeType) => {
      const data: DragNodeData = { nodeType };
      e.dataTransfer.setData('application/json', JSON.stringify(data));
      e.dataTransfer.effectAllowed = 'copy';
    },
    [],
  );

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-valhalla-gold mb-3 uppercase tracking-wider">
        Node Types
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Drag nodes onto the canvas to build your workflow.
      </p>
      <div className="space-y-2">
        {PALETTE_ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => handleDragStart(e, item.type)}
              className={`
                flex items-center space-x-3 px-3 py-3
                bg-gradient-to-r ${item.color}
                border ${item.borderColor} border-opacity-40
                rounded-lg cursor-grab active:cursor-grabbing
                hover:border-opacity-80 hover:shadow-lg
                transition-all duration-200
                select-none
              `}
            >
              <GripVertical size={14} className="text-gray-500 flex-shrink-0" />
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                <Icon size={18} className="flex-shrink-0" style={{ color: item.borderColor.includes('frost') ? '#4a9eff' : item.borderColor.includes('yggdrasil') ? '#4a7c59' : item.borderColor.includes('magic') ? '#8b5cf6' : '#d4af37' }} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-100">{item.label}</div>
                  <div className="text-xs text-gray-400 truncate">{item.description}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Help text */}
      <div className="mt-6 p-3 bg-norse-night/50 rounded-lg border border-norse-rune">
        <h4 className="text-xs font-semibold text-gray-300 mb-2">How to use</h4>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>Drag a node onto the canvas</li>
          <li>Draw connections between ports</li>
          <li>Click a connection to remove it</li>
          <li>Double-click a node to configure</li>
          <li>Press Delete to remove selected node</li>
        </ul>
      </div>
    </div>
  );
}
