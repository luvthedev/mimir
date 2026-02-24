/**
 * @module WorkflowEditor
 * @description Main container component for the visual workflow editor.
 *
 * Composes the NodePalette, Canvas, and validation UI into a cohesive
 * editing experience. Manages workflow state via the useWorkflowEditor hook.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Trash2, X, ArrowLeft, Info } from 'lucide-react';
import { Canvas } from './Canvas';
import { NodePalette } from './NodePalette';
import { useWorkflowEditor } from '../../hooks/useWorkflowEditor';
import { NODE_TYPE_CONFIG } from './WorkflowNode';

// ============================================================================
// Component
// ============================================================================

export function WorkflowEditor() {
  const navigate = useNavigate();
  const {
    nodes,
    connections,
    selectedNodeId,
    selectedNode,
    pendingConnection,
    validationErrors,
    connectionError,
    isWorkflowValid,

    addNode,
    removeNode,
    moveNode,
    selectNode,
    addConnection,
    removeConnection,
    startConnection,
    updatePendingConnection,
    cancelConnection,
    clearAll,
    dismissConnectionError,
  } = useWorkflowEditor();

  const handleRemoveSelected = useCallback(() => {
    if (selectedNodeId) {
      removeNode(selectedNodeId);
    }
  }, [selectedNodeId, removeNode]);

  return (
    <div className="h-screen flex flex-col bg-norse-night">
      {/* Header */}
      <header className="bg-norse-shadow border-b border-norse-rune px-6 py-3 flex items-center justify-between shadow-lg flex-shrink-0">
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => navigate('/studio')}
            className="flex items-center space-x-2 px-3 py-1.5 text-gray-400 hover:text-valhalla-gold transition-colors rounded-lg hover:bg-norse-rune/50"
          >
            <ArrowLeft size={16} />
            <span className="text-sm">Studio</span>
          </button>
          <div className="h-6 w-px bg-norse-rune" />
          <div>
            <h1 className="text-lg font-bold text-valhalla-gold">Workflow Editor</h1>
            <p className="text-xs text-gray-500">Visual pipeline builder</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Workflow status indicator */}
          {nodes.length > 0 && (
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs ${
              isWorkflowValid
                ? 'bg-green-900/30 text-green-400 border border-green-700/50'
                : 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/50'
            }`}>
              {isWorkflowValid ? (
                <>
                  <CheckCircle size={14} />
                  <span>Valid workflow</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={14} />
                  <span>{validationErrors.length} issue{validationErrors.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>
          )}

          {/* Node count */}
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-norse-stone rounded-lg text-xs text-gray-400">
            <span>{nodes.length} node{nodes.length !== 1 ? 's' : ''}</span>
            <span className="text-norse-rune">|</span>
            <span>{connections.length} connection{connections.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Clear all button */}
          {nodes.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center space-x-1 px-3 py-1.5 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20 text-xs"
              title="Clear all nodes and connections"
            >
              <Trash2 size={14} />
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
        <main className="flex-1 relative overflow-hidden">
          <Canvas
            nodes={nodes}
            connections={connections}
            selectedNodeId={selectedNodeId}
            pendingConnection={pendingConnection}
            validationErrors={validationErrors}
            onAddNode={addNode}
            onMoveNode={moveNode}
            onSelectNode={selectNode}
            onRemoveNode={removeNode}
            onAddConnection={addConnection}
            onRemoveConnection={removeConnection}
            onStartConnection={startConnection}
            onUpdatePendingConnection={updatePendingConnection}
            onCancelConnection={cancelConnection}
          />

          {/* Connection error toast */}
          {connectionError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-2 bg-red-900/90 text-red-200 px-4 py-2 rounded-lg border border-red-700 shadow-lg max-w-md">
              <AlertTriangle size={16} className="flex-shrink-0 text-red-400" />
              <span className="text-sm">{connectionError}</span>
              <button
                type="button"
                onClick={dismissConnectionError}
                className="ml-2 text-red-400 hover:text-red-200"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Zoom/pan hint */}
          <div className="absolute bottom-4 left-4 text-xs text-gray-600 pointer-events-none">
            Scroll to zoom &middot; Drag canvas to pan
          </div>
        </main>

        {/* Right sidebar - Node details / Validation */}
        <aside className="w-72 bg-norse-shadow border-l border-norse-rune overflow-y-auto scroll-container flex-shrink-0">
          {selectedNode ? (
            /* Selected node details */
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-valhalla-gold uppercase tracking-wider">
                  Node Details
                </h3>
                <button
                  type="button"
                  onClick={() => selectNode(null)}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Node type */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Type</label>
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: NODE_TYPE_CONFIG[selectedNode.type].borderColor }}
                    />
                    <span className="text-sm text-gray-200 capitalize">{selectedNode.type}</span>
                  </div>
                </div>

                {/* Label */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Label</label>
                  <span className="text-sm text-gray-200">
                    {selectedNode.metadata.label || NODE_TYPE_CONFIG[selectedNode.type].label}
                  </span>
                </div>

                {/* Position */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Position</label>
                  <span className="text-xs text-gray-400 font-mono">
                    x: {Math.round(selectedNode.position.x)}, y: {Math.round(selectedNode.position.y)}
                  </span>
                </div>

                {/* Connections from/to this node */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Connections</label>
                  <div className="space-y-1">
                    {connections.filter(c => c.sourceNodeId === selectedNodeId || c.targetNodeId === selectedNodeId).length === 0 ? (
                      <span className="text-xs text-gray-600 italic">No connections</span>
                    ) : (
                      connections
                        .filter(c => c.sourceNodeId === selectedNodeId || c.targetNodeId === selectedNodeId)
                        .map(conn => {
                          const isSource = conn.sourceNodeId === selectedNodeId;
                          const otherNodeId = isSource ? conn.targetNodeId : conn.sourceNodeId;
                          const otherNode = nodes.find(n => n.id === otherNodeId);
                          return (
                            <div key={conn.id} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">
                                {isSource ? 'To' : 'From'}: {otherNode?.metadata.label || otherNode?.type || 'unknown'}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeConnection(conn.id)}
                                className="text-gray-600 hover:text-red-400 transition-colors"
                                title="Remove connection"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Node errors */}
                {validationErrors.filter(e => e.nodeIds?.includes(selectedNodeId!)).length > 0 && (
                  <div>
                    <label className="text-xs text-red-400 block mb-1">Issues</label>
                    <div className="space-y-1">
                      {validationErrors
                        .filter(e => e.nodeIds?.includes(selectedNodeId!))
                        .map((err, i) => (
                          <div key={i} className="text-xs text-red-300 bg-red-900/20 px-2 py-1 rounded">
                            {err.message}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={handleRemoveSelected}
                  className="w-full flex items-center justify-center space-x-2 px-3 py-2 mt-4 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg transition-colors text-sm border border-red-800/30"
                >
                  <Trash2 size={14} />
                  <span>Delete Node</span>
                </button>
              </div>
            </div>
          ) : (
            /* Validation summary */
            <div className="p-4">
              <h3 className="text-sm font-semibold text-valhalla-gold mb-3 uppercase tracking-wider">
                Validation
              </h3>

              {nodes.length === 0 ? (
                <div className="flex flex-col items-center text-center py-8">
                  <Info size={32} className="text-gray-600 mb-3" />
                  <p className="text-sm text-gray-500">
                    Add nodes to start building your workflow pipeline.
                  </p>
                </div>
              ) : validationErrors.length === 0 ? (
                <div className="flex items-center space-x-2 text-green-400 bg-green-900/20 px-3 py-2 rounded-lg border border-green-800/30">
                  <CheckCircle size={16} />
                  <span className="text-sm">Workflow is valid</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {validationErrors.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start space-x-2 bg-red-900/20 px-3 py-2 rounded-lg border border-red-800/30"
                    >
                      <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-red-300">{err.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
