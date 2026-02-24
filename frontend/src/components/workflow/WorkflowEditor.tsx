/**
 * @module components/workflow/WorkflowEditor
 * @description Main container component for the visual workflow editor.
 *
 * Manages overall layout:
 *  - Left sidebar: NodePalette for dragging node types
 *  - Center: Canvas for placing/connecting nodes
 *  - Bottom bar: Validation errors / status
 *
 * Owns the workflow state via useWorkflowEditor hook and passes
 * actions down to child components.
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Trash2, ArrowLeft, Download } from 'lucide-react';
import { useWorkflowEditor } from '../../hooks/useWorkflowEditor';
import { NodePalette } from './NodePalette';
import { Canvas } from './Canvas';
import { ExportDialog } from './ExportDialog';
import { isValidConnection } from '../../utils/workflowValidation';
import { NODE_TYPE_CATALOG } from '../../types/workflow';
import type { EditorNode } from '../../types/workflow';

// ---- Node Config Panel (right sidebar when a node is selected) ----

function NodeConfigPanel({
  node,
  onUpdateMetadata,
  onUpdateConfig,
  onDelete,
  onClose,
}: {
  node: EditorNode;
  onUpdateMetadata: (nodeId: string, metadata: Record<string, unknown>) => void;
  onUpdateConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}) {
  const typeInfo = NODE_TYPE_CATALOG.find((t) => t.type === node.type);

  return (
    <div className="p-4 h-full overflow-y-auto scroll-container">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-valhalla-gold uppercase tracking-wider">
          Node Configuration
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-sm"
        >
          Close
        </button>
      </div>

      {/* Node type badge */}
      <div className="flex items-center space-x-2 mb-4">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: typeInfo?.color }}
        />
        <span className="text-sm text-gray-300 font-medium capitalize">{node.type}</span>
      </div>

      {/* Label */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1 font-medium">Label</label>
        <input
          type="text"
          value={(node.metadata.label as string) ?? ''}
          onChange={(e) =>
            onUpdateMetadata(node.id, { label: e.target.value })
          }
          className="w-full px-3 py-2 bg-norse-stone border border-norse-rune rounded-lg text-sm text-gray-200 focus:border-valhalla-gold focus:outline-none transition-colors"
          placeholder="Node label"
        />
      </div>

      {/* Description */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1 font-medium">Description</label>
        <textarea
          value={(node.metadata.description as string) ?? ''}
          onChange={(e) =>
            onUpdateMetadata(node.id, { description: e.target.value })
          }
          className="w-full px-3 py-2 bg-norse-stone border border-norse-rune rounded-lg text-sm text-gray-200 focus:border-valhalla-gold focus:outline-none transition-colors resize-none"
          rows={3}
          placeholder="Optional description"
        />
      </div>

      {/* Type-specific config fields */}
      {node.type === 'upload' && (
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1 font-medium">File Format</label>
          <select
            value={(node.config.format as string) ?? 'csv'}
            onChange={(e) =>
              onUpdateConfig(node.id, { format: e.target.value })
            }
            className="w-full px-3 py-2 bg-norse-stone border border-norse-rune rounded-lg text-sm text-gray-200 focus:border-valhalla-gold focus:outline-none transition-colors"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="xml">XML</option>
            <option value="parquet">Parquet</option>
          </select>
        </div>
      )}

      {node.type === 'extract' && (
        <>
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1 font-medium">Extraction Pattern</label>
            <input
              type="text"
              value={(node.config.pattern as string) ?? ''}
              onChange={(e) =>
                onUpdateConfig(node.id, { pattern: e.target.value })
              }
              className="w-full px-3 py-2 bg-norse-stone border border-norse-rune rounded-lg text-sm text-gray-200 focus:border-valhalla-gold focus:outline-none transition-colors"
              placeholder="e.g., $.data[*].name"
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1 font-medium">Delimiter</label>
            <input
              type="text"
              value={(node.config.delimiter as string) ?? ','}
              onChange={(e) =>
                onUpdateConfig(node.id, { delimiter: e.target.value })
              }
              className="w-full px-3 py-2 bg-norse-stone border border-norse-rune rounded-lg text-sm text-gray-200 focus:border-valhalla-gold focus:outline-none transition-colors"
              placeholder=","
            />
          </div>
        </>
      )}

      {node.type === 'transform' && (
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1 font-medium">Transform Expression</label>
          <textarea
            value={(node.config.expression as string) ?? ''}
            onChange={(e) =>
              onUpdateConfig(node.id, { expression: e.target.value })
            }
            className="w-full px-3 py-2 bg-norse-stone border border-norse-rune rounded-lg text-sm text-gray-200 font-mono focus:border-valhalla-gold focus:outline-none transition-colors resize-none"
            rows={4}
            placeholder="// JavaScript transform expression"
          />
        </div>
      )}

      {node.type === 'output' && (
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-1 font-medium">Output Format</label>
          <select
            value={(node.config.outputFormat as string) ?? 'json'}
            onChange={(e) =>
              onUpdateConfig(node.id, { outputFormat: e.target.value })
            }
            className="w-full px-3 py-2 bg-norse-stone border border-norse-rune rounded-lg text-sm text-gray-200 focus:border-valhalla-gold focus:outline-none transition-colors"
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="console">Console</option>
            <option value="file">File</option>
          </select>
        </div>
      )}

      {/* Position (read-only) */}
      <div className="mb-4 pt-4 border-t border-norse-rune">
        <label className="block text-xs text-gray-400 mb-1 font-medium">Position</label>
        <div className="text-sm text-gray-500 font-mono">
          x: {Math.round(node.position.x)}, y: {Math.round(node.position.y)}
        </div>
      </div>

      {/* Delete button */}
      <button
        type="button"
        onClick={() => onDelete(node.id)}
        className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 hover:border-red-500/50 transition-all text-sm"
      >
        <Trash2 size={14} />
        <span>Delete Node</span>
      </button>
    </div>
  );
}

// ---- Main WorkflowEditor ----

export function WorkflowEditor() {
  const navigate = useNavigate();
  const [showExportDialog, setShowExportDialog] = useState(false);
  const {
    nodes,
    connections,
    selectedNode,
    selectedNodeId,
    pendingConnection,
    validationErrors,
    isValid,
    errorMessages,
    errorNodeIds,
    addNode,
    updateNodePosition,
    updateNodeConfig,
    updateNodeMetadata,
    deleteNode,
    selectNode,
    tryAddConnection,
    deleteConnection,
    startConnection,
    cancelConnection,
    clearAll,
  } = useWorkflowEditor();

  // Wrap tryAddConnection for the Canvas to use for real-time validation preview
  const tryValidateConnection = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      return isValidConnection(sourceNodeId, targetNodeId, nodes, connections);
    },
    [nodes, connections],
  );

  // When a connection is completed (mouse released on target port)
  const handleCompleteConnection = useCallback(
    (targetNodeId: string, targetPort: string) => {
      if (!pendingConnection) return;
      const result = tryAddConnection(
        pendingConnection.sourceNodeId,
        targetNodeId,
        pendingConnection.sourcePort,
        targetPort,
      );
      if (!result.valid) {
        // Show a brief toast-like notification for invalid connections
        console.warn('Invalid connection:', result.error);
      }
    },
    [pendingConnection, tryAddConnection],
  );

  const handleBackToPortal = useCallback(() => {
    navigate('/portal');
  }, [navigate]);

  return (
    <div className="h-screen flex flex-col bg-norse-night">
      {/* Header */}
      <header className="bg-norse-shadow border-b border-norse-rune px-6 py-3 flex items-center justify-between shadow-lg flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleBackToPortal}
            className="p-2 rounded-lg hover:bg-norse-stone text-gray-400 hover:text-valhalla-gold transition-colors"
            title="Back to Portal"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-valhalla-gold">Workflow Editor</h1>
            <p className="text-xs text-gray-500">Visual data pipeline builder</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Node count */}
          <span className="text-xs text-gray-500">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} &middot; {connections.length} connection{connections.length !== 1 ? 's' : ''}
          </span>

          {/* Validation status */}
          {nodes.length > 0 && (
            <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${
              isValid
                ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}>
              {isValid ? (
                <>
                  <CheckCircle size={12} />
                  <span>Valid</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={12} />
                  <span>{validationErrors.length} issue{validationErrors.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>
          )}

          {/* Export */}
          {nodes.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExportDialog(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-valhalla-gold/10 hover:bg-valhalla-gold/20 border border-valhalla-gold/30 hover:border-valhalla-gold/50 rounded-lg text-valhalla-gold transition-all text-xs"
              title="Export generated code"
            >
              <Download size={12} />
              <span>Export</span>
            </button>
          )}

          {/* Clear all */}
          {nodes.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center space-x-1 px-3 py-1.5 bg-norse-rune hover:bg-red-500/20 border border-norse-rune hover:border-red-500/30 rounded-lg text-gray-400 hover:text-red-400 transition-all text-xs"
              title="Clear all nodes and connections"
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Node Palette */}
        <aside className="w-64 bg-norse-shadow border-r border-norse-rune overflow-y-auto scroll-container flex-shrink-0">
          <NodePalette />
        </aside>

        {/* Center - Canvas */}
        <main className="flex-1 overflow-hidden relative">
          <Canvas
            nodes={nodes}
            connections={connections}
            selectedNodeId={selectedNodeId}
            errorNodeIds={errorNodeIds}
            pendingConnection={pendingConnection}
            onAddNode={addNode}
            onUpdateNodePosition={updateNodePosition}
            onSelectNode={selectNode}
            onDeleteNode={deleteNode}
            onStartConnection={startConnection}
            onCompleteConnection={handleCompleteConnection}
            onCancelConnection={cancelConnection}
            onDeleteConnection={deleteConnection}
            tryValidateConnection={tryValidateConnection}
          />
        </main>

        {/* Right sidebar - Node Config (only when selected) */}
        {selectedNode && (
          <aside className="w-80 bg-norse-shadow border-l border-norse-rune flex-shrink-0">
            <NodeConfigPanel
              node={selectedNode}
              onUpdateMetadata={updateNodeMetadata}
              onUpdateConfig={updateNodeConfig}
              onDelete={deleteNode}
              onClose={() => selectNode(null)}
            />
          </aside>
        )}
      </div>

      {/* Bottom validation bar */}
      {errorMessages.length > 0 && (
        <div className="bg-norse-shadow border-t border-norse-rune px-6 py-2 flex-shrink-0">
          <div className="flex items-start space-x-2">
            <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-2">
              {errorMessages.slice(0, 5).map((msg, i) => (
                <span key={i} className="text-xs text-yellow-400/80 bg-yellow-500/10 px-2 py-0.5 rounded">
                  {msg}
                </span>
              ))}
              {errorMessages.length > 5 && (
                <span className="text-xs text-gray-500">
                  +{errorMessages.length - 5} more
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        nodes={nodes}
        connections={connections}
        workflowName="Untitled Workflow"
        isValid={isValid}
        validationErrors={errorMessages}
      />
    </div>
  );
}
