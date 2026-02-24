/**
 * @module components/workflow/WorkflowNode
 * @description Custom ReactFlow node component for the workflow editor.
 *
 * Renders a draggable node with input/output port handles, type-specific
 * styling, selection highlighting, and validation error indicators.
 */

import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Upload, FileSearch, ArrowRightLeft, FileOutput, Settings, X } from 'lucide-react';
import type { WorkflowNodeType } from '../../types/workflow';

// ============================================================================
// Node Data Interface
// ============================================================================

export interface WorkflowNodeData {
  type: WorkflowNodeType;
  label: string;
  config: Record<string, unknown>;
  hasError: boolean;
  onDelete?: (nodeId: string) => void;
  onConfigChange?: (nodeId: string, config: Record<string, unknown>) => void;
  onLabelChange?: (nodeId: string, label: string) => void;
}

// ============================================================================
// Node Type Styling
// ============================================================================

const NODE_STYLES: Record<WorkflowNodeType, {
  icon: typeof Upload;
  borderColor: string;
  bgColor: string;
  iconColor: string;
  headerBg: string;
}> = {
  upload: {
    icon: Upload,
    borderColor: 'border-frost-ice',
    bgColor: 'bg-norse-shadow',
    iconColor: 'text-frost-ice',
    headerBg: 'bg-frost-ice/10',
  },
  extract: {
    icon: FileSearch,
    borderColor: 'border-valhalla-gold',
    bgColor: 'bg-norse-shadow',
    iconColor: 'text-valhalla-gold',
    headerBg: 'bg-valhalla-gold/10',
  },
  transform: {
    icon: ArrowRightLeft,
    borderColor: 'border-magic-rune',
    bgColor: 'bg-norse-shadow',
    iconColor: 'text-magic-rune',
    headerBg: 'bg-magic-rune/10',
  },
  output: {
    icon: FileOutput,
    borderColor: 'border-green-500',
    bgColor: 'bg-norse-shadow',
    iconColor: 'text-green-500',
    headerBg: 'bg-green-500/10',
  },
};

// ============================================================================
// Config Panel
// ============================================================================

interface ConfigPanelProps {
  nodeType: WorkflowNodeType;
  config: Record<string, unknown>;
  label: string;
  onConfigChange: (config: Record<string, unknown>) => void;
  onLabelChange: (label: string) => void;
  onClose: () => void;
}

function ConfigPanel({ nodeType, config, label, onConfigChange, onLabelChange, onClose }: ConfigPanelProps) {
  return (
    <div className="absolute top-full left-0 mt-2 w-64 bg-norse-stone border-2 border-norse-rune rounded-lg shadow-xl z-50 p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">Configure</span>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Label */}
      <div className="mb-3">
        <label className="block text-xs text-gray-400 mb-1">Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-norse-night border border-norse-rune rounded text-gray-200 focus:ring-1 focus:ring-valhalla-gold focus:border-valhalla-gold"
        />
      </div>

      {/* Type-specific fields */}
      {nodeType === 'upload' && (
        <div className="mb-3">
          <label className="block text-xs text-gray-400 mb-1">Source</label>
          <select
            value={(config.source as string) || 'file'}
            onChange={(e) => onConfigChange({ ...config, source: e.target.value })}
            className="w-full px-2 py-1.5 text-sm bg-norse-night border border-norse-rune rounded text-gray-200 focus:ring-1 focus:ring-valhalla-gold"
          >
            <option value="file">File Upload</option>
            <option value="api">API Endpoint</option>
            <option value="database">Database</option>
          </select>
        </div>
      )}

      {nodeType === 'extract' && (
        <div className="mb-3">
          <label className="block text-xs text-gray-400 mb-1">Format</label>
          <select
            value={(config.format as string) || 'csv'}
            onChange={(e) => onConfigChange({ ...config, format: e.target.value })}
            className="w-full px-2 py-1.5 text-sm bg-norse-night border border-norse-rune rounded text-gray-200 focus:ring-1 focus:ring-valhalla-gold"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="xml">XML</option>
            <option value="text">Plain Text</option>
          </select>
        </div>
      )}

      {nodeType === 'transform' && (
        <div className="mb-3">
          <label className="block text-xs text-gray-400 mb-1">Operation</label>
          <select
            value={(config.operation as string) || 'filter'}
            onChange={(e) => onConfigChange({ ...config, operation: e.target.value })}
            className="w-full px-2 py-1.5 text-sm bg-norse-night border border-norse-rune rounded text-gray-200 focus:ring-1 focus:ring-valhalla-gold"
          >
            <option value="filter">Filter</option>
            <option value="map">Map/Transform</option>
            <option value="aggregate">Aggregate</option>
            <option value="sort">Sort</option>
            <option value="merge">Merge</option>
          </select>
        </div>
      )}

      {nodeType === 'output' && (
        <div className="mb-3">
          <label className="block text-xs text-gray-400 mb-1">Destination</label>
          <select
            value={(config.destination as string) || 'file'}
            onChange={(e) => onConfigChange({ ...config, destination: e.target.value })}
            className="w-full px-2 py-1.5 text-sm bg-norse-night border border-norse-rune rounded text-gray-200 focus:ring-1 focus:ring-valhalla-gold"
          >
            <option value="file">File Download</option>
            <option value="api">API Response</option>
            <option value="database">Database</option>
            <option value="display">Display</option>
          </select>
        </div>
      )}

      {/* Description */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <textarea
          value={(config.description as string) || ''}
          onChange={(e) => onConfigChange({ ...config, description: e.target.value })}
          rows={2}
          className="w-full px-2 py-1.5 text-sm bg-norse-night border border-norse-rune rounded text-gray-200 focus:ring-1 focus:ring-valhalla-gold resize-none"
          placeholder="Optional description..."
        />
      </div>
    </div>
  );
}

// ============================================================================
// WorkflowNode Component
// ============================================================================

function WorkflowNodeComponent({ id, data, selected }: NodeProps<WorkflowNodeData>) {
  const [showConfig, setShowConfig] = useState(false);
  const style = NODE_STYLES[data.type];
  const Icon = style.icon;

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      data.onDelete?.(id);
    },
    [id, data],
  );

  const handleConfigChange = useCallback(
    (config: Record<string, unknown>) => {
      data.onConfigChange?.(id, config);
    },
    [id, data],
  );

  const handleLabelChange = useCallback(
    (label: string) => {
      data.onLabelChange?.(id, label);
    },
    [id, data],
  );

  // Determine if this node type has input/output ports
  const hasInputPort = data.type !== 'upload';
  const hasOutputPort = data.type !== 'output';

  return (
    <div className="relative">
      {/* Input handle (left side) */}
      {hasInputPort && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-norse-rune !border-2 !border-gray-400 hover:!border-frost-ice hover:!bg-frost-ice/30 transition-colors"
        />
      )}

      {/* Node body */}
      <div
        className={`min-w-[180px] rounded-lg border-2 ${style.bgColor} ${
          data.hasError
            ? 'border-red-500 shadow-lg shadow-red-500/30'
            : selected
            ? `${style.borderColor} shadow-lg shadow-valhalla-gold/20 ring-2 ring-valhalla-gold/30`
            : `${style.borderColor} border-opacity-50 hover:border-opacity-100`
        } transition-all duration-200`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-3 py-2 ${style.headerBg} rounded-t-md`}>
          <div className="flex items-center space-x-2">
            <Icon className={`w-4 h-4 ${style.iconColor}`} />
            <span className="text-sm font-semibold text-gray-100">{data.label}</span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              title="Configure"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1 text-gray-500 hover:text-red-400 transition-colors"
              title="Delete node"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-3 py-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.iconColor} bg-norse-stone`}>
            {data.type}
          </span>
          {typeof data.config.description === 'string' && data.config.description && (
            <p className="mt-1.5 text-xs text-gray-400 line-clamp-2">
              {data.config.description}
            </p>
          )}
        </div>

        {/* Validation error indicator */}
        {data.hasError && (
          <div className="px-3 py-1.5 bg-red-500/10 border-t border-red-500/30 rounded-b-md">
            <span className="text-xs text-red-400">Validation error</span>
          </div>
        )}
      </div>

      {/* Output handle (right side) */}
      {hasOutputPort && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-norse-rune !border-2 !border-gray-400 hover:!border-valhalla-gold hover:!bg-valhalla-gold/30 transition-colors"
        />
      )}

      {/* Config panel popover */}
      {showConfig && (
        <ConfigPanel
          nodeType={data.type}
          config={data.config}
          label={data.label}
          onConfigChange={handleConfigChange}
          onLabelChange={handleLabelChange}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}

export const WorkflowNodeMemo = memo(WorkflowNodeComponent);
