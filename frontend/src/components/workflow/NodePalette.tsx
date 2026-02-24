/**
 * @module components/workflow/NodePalette
 * @description Sidebar palette displaying draggable node types.
 *
 * Users drag nodes from this palette onto the canvas. Uses the HTML5
 * native drag API (not react-dnd) to keep this component simple and
 * to avoid conflicts with the existing react-dnd setup in Studio.
 *
 * Node types: upload, extract, transform, output — sourced from NODE_TYPE_CATALOG.
 */

import { useCallback } from 'react';
import { Upload, FileSearch, Shuffle, Download, GripVertical } from 'lucide-react';
import type { WorkflowNodeType } from '../../types/workflow';
import { NODE_TYPE_CATALOG } from '../../types/workflow';

// ---- Icon map ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Upload,
  FileSearch,
  Shuffle,
  Download,
};

// ---- Component ----

interface NodePaletteProps {
  /** Called when user drops a node type onto the canvas (handled via drop event) */
  className?: string;
}

export function NodePalette({ className = '' }: NodePaletteProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent, nodeType: WorkflowNodeType) => {
      e.dataTransfer.setData('application/workflow-node-type', nodeType);
      e.dataTransfer.effectAllowed = 'copy';
    },
    [],
  );

  return (
    <div className={`p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-valhalla-gold uppercase tracking-wider mb-3">
        Node Types
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Drag nodes onto the canvas to build your workflow
      </p>

      <div className="space-y-2">
        {NODE_TYPE_CATALOG.map((nodeType) => {
          const Icon = ICON_MAP[nodeType.icon] ?? Upload;

          return (
            <div
              key={nodeType.type}
              draggable
              onDragStart={(e) => handleDragStart(e, nodeType.type)}
              className="
                flex items-center space-x-3 p-3
                bg-norse-stone border border-norse-rune rounded-lg
                hover:border-valhalla-gold/50 hover:bg-norse-shadow
                cursor-grab active:cursor-grabbing
                transition-all duration-200
                group
              "
            >
              <GripVertical size={14} className="text-gray-600 group-hover:text-gray-400 flex-shrink-0" />

              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${nodeType.color}20` }}
              >
                <Icon size={18} style={{ color: nodeType.color }} />
              </div>

              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-200 group-hover:text-gray-100">
                  {nodeType.label}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {nodeType.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-norse-rune">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Connection Rules
        </h4>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>Upload &rarr; Extract</li>
          <li>Extract &rarr; Transform, Output</li>
          <li>Transform &rarr; Transform, Output</li>
          <li>Output &rarr; (terminal)</li>
        </ul>
      </div>
    </div>
  );
}
