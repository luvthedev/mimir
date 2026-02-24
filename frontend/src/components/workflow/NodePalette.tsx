/**
 * @module NodePalette
 * @description Sidebar palette of draggable workflow node types.
 *
 * Uses HTML5 Drag API to allow users to drag node types onto the canvas.
 * Each item shows an icon, label, and short description.
 */

import { useCallback } from 'react';
import { Upload, FileSearch, Cog, FileOutput, GripVertical } from 'lucide-react';
import type { WorkflowNodeType } from '../../utils/workflowValidation';

// ---------------------------------------------------------------------------
// Node type descriptors
// ---------------------------------------------------------------------------

interface PaletteItem {
  type: WorkflowNodeType;
  label: string;
  description: string;
  icon: typeof Upload;
  accentColor: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'upload',
    label: 'Upload',
    description: 'Data ingestion / file upload step',
    icon: Upload,
    accentColor: '#4a9eff',
  },
  {
    type: 'extract',
    label: 'Extract',
    description: 'Extract data from a source',
    icon: FileSearch,
    accentColor: '#d4af37',
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Data transformation / processing',
    icon: Cog,
    accentColor: '#8b5cf6',
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Final output / export step',
    icon: FileOutput,
    accentColor: '#22c55e',
  },
];

// ---------------------------------------------------------------------------
// Draggable item
// ---------------------------------------------------------------------------

interface DraggablePaletteItemProps {
  item: PaletteItem;
}

function DraggablePaletteItem({ item }: DraggablePaletteItemProps) {
  const Icon = item.icon;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/workflow-node-type', item.type);
      e.dataTransfer.effectAllowed = 'copy';
    },
    [item.type],
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex items-start gap-3 p-3 bg-norse-stone border border-norse-rune rounded-lg cursor-grab
                 hover:border-valhalla-gold hover:shadow-lg hover:shadow-valhalla-gold/10
                 active:cursor-grabbing transition-all select-none"
      title={`Drag to add a ${item.label} node`}
    >
      <GripVertical size={14} className="text-gray-600 mt-0.5 flex-shrink-0" />
      <div
        className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
        style={{ backgroundColor: `${item.accentColor}20` }}
      >
        <Icon size={18} color={item.accentColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-100">{item.label}</div>
        <div className="text-xs text-gray-400 leading-tight mt-0.5">
          {item.description}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export function NodePalette() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-norse-rune">
        <h2 className="text-base font-bold text-valhalla-gold">Node Palette</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Drag nodes onto the canvas
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {PALETTE_ITEMS.map((item) => (
          <DraggablePaletteItem key={item.type} item={item} />
        ))}
      </div>

      {/* Brief usage hint */}
      <div className="px-4 py-3 border-t border-norse-rune text-[11px] text-gray-500 space-y-1">
        <p>Drag a node type onto the canvas to add it.</p>
        <p>Connect nodes by dragging from an output port to an input port.</p>
        <p>Double-click a node to configure it.</p>
      </div>
    </div>
  );
}
