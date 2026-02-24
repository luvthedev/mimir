/**
 * @module components/workflow/WorkflowEditor
 * @description Main container component for the visual workflow editor.
 *
 * Composes the NodePalette, Canvas, and validation panel into a complete
 * workflow editing experience. Manages the workflow state via useWorkflowEditor
 * and coordinates interactions between child components.
 */

import { useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Trash2,
  ArrowLeft,
} from 'lucide-react';

import { useWorkflowEditor } from '../../hooks/useWorkflowEditor';
import { NodePalette } from './NodePalette';
import { Canvas } from './Canvas';
import { EyeOfMimirLogo } from '../EyeOfMimirLogo';

// ============================================================================
// WorkflowEditor Component
// ============================================================================

export function WorkflowEditor() {
  const navigate = useNavigate();
  const editor = useWorkflowEditor();

  // --- Handlers passed to Canvas ---
  const handleAddNode = useCallback(
    (type: Parameters<typeof editor.addNode>[0], position: Parameters<typeof editor.addNode>[1]) => {
      editor.addNode(type, position);
    },
    [editor],
  );

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col bg-norse-night">
        {/* Header */}
        <header className="bg-norse-shadow border-b border-norse-rune px-6 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={() => navigate('/studio')}
              className="flex items-center space-x-2 text-gray-400 hover:text-valhalla-gold transition-colors"
              title="Back to Studio"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <img
              src="/mimir-logo.png"
              alt="Mimir Logo"
              className="h-10 w-auto"
            />
            <div>
              <input
                type="text"
                value={editor.name}
                onChange={(e) => editor.setName(e.target.value)}
                className="text-xl font-bold text-valhalla-gold bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                placeholder="Workflow name..."
              />
              <p className="text-xs text-gray-400">
                {editor.nodes.length} node{editor.nodes.length !== 1 ? 's' : ''} &middot;{' '}
                {editor.connections.length} connection{editor.connections.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Validation badge */}
            {editor.nodes.length > 0 && (
              <div
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                  editor.validation.valid
                    ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                {editor.validation.valid ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Valid</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>{editor.validation.errors.length} issue{editor.validation.errors.length !== 1 ? 's' : ''}</span>
                  </>
                )}
              </div>
            )}

            {/* Clear workflow */}
            <button
              type="button"
              onClick={editor.clearWorkflow}
              disabled={editor.nodes.length === 0}
              className="flex items-center space-x-2 px-3 py-1.5 bg-norse-rune hover:bg-red-500/20 border border-norse-rune hover:border-red-500/50 rounded-lg text-gray-400 hover:text-red-400 transition-all text-sm disabled:opacity-30 disabled:pointer-events-none"
              title="Clear workflow"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear</span>
            </button>

            {/* Back to Studio */}
            <button
              type="button"
              onClick={() => navigate('/studio')}
              className="flex items-center space-x-2 px-4 py-1.5 bg-norse-rune hover:bg-valhalla-gold/20 border border-norse-rune hover:border-valhalla-gold rounded-lg transition-all group"
            >
              <EyeOfMimirLogo size={24} className="group-hover:opacity-80 transition-opacity" />
              <span className="text-gray-300 group-hover:text-valhalla-gold text-sm font-medium">Studio</span>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Node Palette */}
          <aside className="w-72 bg-norse-shadow border-r border-norse-rune flex flex-col overflow-hidden">
            <NodePalette />
          </aside>

          {/* Center - Canvas */}
          <main className="flex-1 overflow-hidden">
            <Canvas
              nodes={editor.nodes}
              connections={editor.connections}
              selectedNodeId={editor.selectedNodeId}
              selectedConnectionId={editor.selectedConnectionId}
              errorNodeIds={editor.errorNodeIds}
              connectionError={editor.connectionError}
              onAddNode={handleAddNode}
              onRemoveNode={editor.removeNode}
              onMoveNode={editor.moveNode}
              onUpdateNodeConfig={editor.updateNodeConfig}
              onUpdateNodeMetadata={editor.updateNodeMetadata}
              onAddConnection={editor.addConnection}
              onRemoveConnection={editor.removeConnection}
              onSelectNode={editor.selectNode}
              onSelectConnection={editor.selectConnection}
              onValidateConnection={editor.validateConnection}
              onSetConnectionError={editor.setConnectionError}
            />
          </main>

          {/* Right Sidebar - Validation / Properties */}
          <aside className="w-80 bg-norse-shadow border-l border-norse-rune overflow-y-auto">
            {/* Selected node properties */}
            {editor.selectedNode && (
              <div className="p-4 border-b border-norse-rune">
                <h3 className="text-sm font-bold text-valhalla-gold uppercase tracking-wide mb-3">
                  Node Properties
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                    <span className="text-sm text-gray-200 capitalize">{editor.selectedNode.type}</span>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Label</label>
                    <input
                      type="text"
                      value={(editor.selectedNode.metadata?.label as string) || ''}
                      onChange={(e) =>
                        editor.updateNodeMetadata(editor.selectedNode!.id, { label: e.target.value })
                      }
                      className="w-full px-2 py-1.5 text-sm bg-norse-stone border border-norse-rune rounded text-gray-200 focus:ring-1 focus:ring-valhalla-gold focus:border-valhalla-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Position</label>
                    <span className="text-xs text-gray-500 font-mono">
                      ({Math.round(editor.selectedNode.position.x)}, {Math.round(editor.selectedNode.position.y)})
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">ID</label>
                    <span className="text-xs text-gray-500 font-mono break-all">
                      {editor.selectedNode.id}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => editor.removeNode(editor.selectedNode!.id)}
                    className="w-full mt-2 flex items-center justify-center space-x-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Node</span>
                  </button>
                </div>
              </div>
            )}

            {/* Validation panel */}
            <div className="p-4">
              <h3 className="text-sm font-bold text-valhalla-gold uppercase tracking-wide mb-3">
                Validation
              </h3>

              {editor.nodes.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Drag nodes from the palette to get started.
                </p>
              ) : editor.validation.valid ? (
                <div className="flex items-center space-x-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-green-400">Workflow is valid</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {editor.validation.errors.map((error, idx) => (
                    <div
                      key={idx}
                      className="flex items-start space-x-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-red-400">{error.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
