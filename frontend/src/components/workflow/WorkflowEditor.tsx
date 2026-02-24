/**
 * @module WorkflowEditor
 * @description Main container component for the visual workflow editor.
 *
 * Composes NodePalette + Canvas + validation status panel.
 * Manages workflow state via the useWorkflowEditor hook and wires all
 * callbacks from child components through to the reducer.
 */

import { useCallback, useEffect, useState } from 'react';
import { useWorkflowEditor } from '../../hooks/useWorkflowEditor';
import { NodePalette } from './NodePalette';
import { Canvas } from './Canvas';
import {
  Undo2,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  X,
  Settings,
  Info,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Node config panel (shown on double-click)
// ---------------------------------------------------------------------------

interface NodeConfigPanelProps {
  node: NonNullable<ReturnType<typeof useWorkflowEditor>['selectedNode']>;
  onUpdate: (nodeId: string, updates: { metadata?: Record<string, unknown>; config?: Record<string, unknown> }) => void;
  onClose: () => void;
  onRemove: (nodeId: string) => void;
}

function NodeConfigPanel({ node, onUpdate, onClose, onRemove }: NodeConfigPanelProps) {
  const [label, setLabel] = useState((node.metadata?.label as string) ?? '');

  useEffect(() => {
    setLabel((node.metadata?.label as string) ?? '');
  }, [node.id, node.metadata?.label]);

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value);
    onUpdate(node.id, {
      metadata: { ...node.metadata, label: e.target.value },
    });
  };

  return (
    <div className="absolute right-4 top-4 w-72 bg-norse-shadow border border-norse-rune rounded-lg shadow-xl z-20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-norse-rune">
        <div className="flex items-center gap-2">
          <Settings size={14} className="text-valhalla-gold" />
          <span className="text-sm font-semibold text-gray-100">Node Settings</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Type (read-only) */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Type</label>
          <div className="text-sm text-gray-200 capitalize">{node.type}</div>
        </div>

        {/* ID (read-only) */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">ID</label>
          <div className="text-xs text-gray-500 font-mono break-all">{node.id}</div>
        </div>

        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={handleLabelChange}
            className="w-full px-3 py-1.5 text-sm bg-norse-stone border border-norse-rune rounded-md text-gray-100 focus:ring-1 focus:ring-valhalla-gold focus:border-valhalla-gold"
          />
        </div>

        {/* Position (read-only) */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 mb-1">X</label>
            <div className="text-sm text-gray-300">{Math.round(node.position.x)}</div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 mb-1">Y</label>
            <div className="text-sm text-gray-300">{Math.round(node.position.y)}</div>
          </div>
        </div>

        {/* Delete button */}
        <button
          type="button"
          onClick={() => onRemove(node.id)}
          className="w-full py-2 text-sm font-medium text-red-400 border border-red-400/30 rounded-md hover:bg-red-400/10 transition-colors"
        >
          Remove Node
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export function WorkflowEditor() {
  const editor = useWorkflowEditor();
  const [showConfig, setShowConfig] = useState(false);

  // Double-click opens config panel
  const handleDoubleClickNode = useCallback(
    (nodeId: string) => {
      editor.selectNode(nodeId);
      setShowConfig(true);
    },
    [editor],
  );

  const handleCloseConfig = useCallback(() => {
    setShowConfig(false);
  }, []);

  // Auto-dismiss error toast after 4s
  useEffect(() => {
    if (editor.errorToast) {
      const timer = setTimeout(() => editor.dismissError(), 4000);
      return () => clearTimeout(timer);
    }
  }, [editor.errorToast, editor.dismissError]);

  // Keyboard shortcut for undo (Ctrl/Cmd+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        editor.undo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor.undo]);

  // Derive validation summary
  const validationResult = editor.validationResult;
  const errorCount = validationResult?.errors.length ?? 0;
  const warningCount = validationResult?.warnings.length ?? 0;

  return (
    <div className="flex h-full bg-norse-night text-gray-100">
      {/* Left sidebar: Node Palette */}
      <div className="w-64 flex-shrink-0 border-r border-norse-rune bg-norse-shadow overflow-y-auto">
        <NodePalette />
      </div>

      {/* Center: Canvas + toolbar */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-norse-rune bg-norse-shadow/50">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-valhalla-gold">Workflow Editor</h1>
            <span className="text-xs text-gray-500">
              {editor.nodes.length} node{editor.nodes.length !== 1 ? 's' : ''}
              {' / '}
              {editor.connections.length} connection{editor.connections.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Validation summary */}
            {validationResult && editor.nodes.length > 0 && (
              <div className="flex items-center gap-2 mr-3 text-xs">
                {errorCount === 0 && warningCount === 0 && (
                  <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle size={14} /> Valid
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-red-400">
                    <AlertCircle size={14} /> {errorCount} error{errorCount !== 1 ? 's' : ''}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="flex items-center gap-1 text-yellow-400">
                    <AlertTriangle size={14} /> {warningCount} warning{warningCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Undo */}
            <button
              type="button"
              onClick={editor.undo}
              disabled={!editor.canUndo}
              className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>

            {/* Reset */}
            <button
              type="button"
              onClick={() => {
                if (editor.nodes.length === 0 || window.confirm('Clear all nodes and connections?')) {
                  editor.reset();
                  setShowConfig(false);
                }
              }}
              disabled={editor.nodes.length === 0}
              className="p-1.5 text-gray-400 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Reset workflow"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 min-h-0 relative">
          <Canvas
            nodes={editor.nodes}
            connections={editor.connections}
            selectedNodeId={editor.selectedNodeId}
            nodeErrors={editor.nodeErrors}
            pendingConnection={editor.pendingConnection}
            onAddNode={editor.addNode}
            onMoveNode={editor.moveNode}
            onSelectNode={editor.selectNode}
            onRemoveNode={editor.removeNode}
            onStartConnection={editor.startConnection}
            onCompleteConnection={editor.completeConnection}
            onCancelConnection={editor.cancelConnection}
            onRemoveConnection={editor.removeConnection}
            onDoubleClickNode={handleDoubleClickNode}
          />

          {/* Node config panel */}
          {showConfig && editor.selectedNode && (
            <NodeConfigPanel
              node={editor.selectedNode}
              onUpdate={editor.updateNode}
              onClose={handleCloseConfig}
              onRemove={(nodeId) => {
                editor.removeNode(nodeId);
                setShowConfig(false);
              }}
            />
          )}
        </div>

        {/* Error toast */}
        {editor.errorToast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2.5 bg-red-900/90 border border-red-500/50 rounded-lg shadow-lg text-sm text-red-200 backdrop-blur-sm animate-pulse">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{editor.errorToast}</span>
            <button
              type="button"
              onClick={editor.dismissError}
              className="ml-2 p-0.5 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Validation details panel (bottom) */}
        {validationResult && (errorCount > 0 || warningCount > 0) && (
          <div className="absolute bottom-4 left-4 max-w-sm bg-norse-shadow/95 backdrop-blur-sm border border-norse-rune rounded-lg shadow-lg z-10 text-xs overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-norse-rune">
              <Info size={12} className="text-valhalla-gold" />
              <span className="font-semibold text-gray-200">Validation Issues</span>
            </div>
            <div className="max-h-40 overflow-y-auto p-2 space-y-1">
              {validationResult.errors.map((err, i) => (
                <div key={`err-${i}`} className="flex items-start gap-1.5 text-red-300">
                  <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
                  <span>{err.message}</span>
                </div>
              ))}
              {validationResult.warnings.map((warn, i) => (
                <div key={`warn-${i}`} className="flex items-start gap-1.5 text-yellow-300">
                  <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
