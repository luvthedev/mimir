/**
 * @module components/workflow/TemplateGallery
 * @description Gallery view of pre-built workflow templates.
 *
 * Displays available workflow templates as cards with:
 *  - Visual preview diagram (read-only)
 *  - Template name, description, and metadata
 *  - "Use Template" button to load into the workflow editor
 *  - Category badges and cost indicators
 *
 * Users can browse templates and load one into the editor with a single click.
 */

import { useCallback, useState } from 'react';
import {
  Receipt,
  Scale,
  ClipboardList,
  ArrowRight,
  Layers,
  Key,
  DollarSign,
  X,
  Eye,
} from 'lucide-react';
import type { WorkflowTemplate } from '../../types/workflowTemplates';
import { WORKFLOW_TEMPLATES } from '../../types/workflowTemplates';
import { TemplatePreview } from './TemplatePreview';

// ---- Icon map for template icons ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TEMPLATE_ICON_MAP: Record<string, React.ComponentType<any>> = {
  Receipt,
  Scale,
  ClipboardList,
};

// ---- Category labels ----

const CATEGORY_LABELS: Record<string, string> = {
  'document-processing': 'Document Processing',
  'data-pipeline': 'Data Pipeline',
  'analysis': 'Analysis',
};

const CATEGORY_COLORS: Record<string, string> = {
  'document-processing': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  'data-pipeline': 'bg-green-500/10 text-green-400 border-green-500/30',
  'analysis': 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

// ---- Props ----

interface TemplateGalleryProps {
  onSelectTemplate: (template: WorkflowTemplate) => void;
  onClose?: () => void;
}

// ---- Detail Modal ----

function TemplateDetailModal({
  template,
  onUse,
  onClose,
}: {
  template: WorkflowTemplate;
  onUse: () => void;
  onClose: () => void;
}) {
  const Icon = TEMPLATE_ICON_MAP[template.icon] ?? Layers;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="relative bg-norse-shadow border border-norse-rune rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto scroll-container"
        role="dialog"
        aria-modal="true"
        aria-label={`${template.name} template details`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-norse-rune">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-valhalla-gold/10 flex items-center justify-center">
              <Icon size={20} className="text-valhalla-gold" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-valhalla-gold">
                {template.name}
              </h2>
              <span
                className={`inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full border ${
                  CATEGORY_COLORS[template.category] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                }`}
              >
                {CATEGORY_LABELS[template.category] ?? template.category}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-norse-stone text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        <div className="px-6 py-4 border-b border-norse-rune bg-norse-night/50">
          <label className="block text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">
            Workflow Preview
          </label>
          <div className="bg-norse-night rounded-lg border border-norse-rune p-4">
            <TemplatePreview template={template} />
          </div>
        </div>

        {/* Details */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium uppercase tracking-wider">
              Description
            </label>
            <p className="text-sm text-gray-300 leading-relaxed">
              {template.description}
            </p>
          </div>

          {/* Nodes summary */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">
              Pipeline Steps ({template.nodes.length})
            </label>
            <div className="space-y-1.5">
              {template.nodes.map((node, index) => (
                <div key={node.id} className="flex items-center space-x-2 text-sm">
                  <span className="text-gray-500 font-mono text-xs w-5 text-right">{index + 1}.</span>
                  <span className="text-gray-200 font-medium">
                    {(node.metadata.label as string) ?? node.type}
                  </span>
                  <span className="text-gray-500">-</span>
                  <span className="text-gray-400 text-xs">
                    {(node.metadata.description as string) ?? ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex items-center space-x-4 pt-2">
            <div className="flex items-center space-x-1.5 text-xs text-gray-400">
              <Key size={12} />
              <span>Requires: {template.requiredApiKeys.join(', ')}</span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-gray-400">
              <DollarSign size={12} />
              <span>{template.estimatedCost}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-norse-rune">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-norse-stone transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onUse}
            className="flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium bg-valhalla-gold text-norse-night hover:bg-valhalla-gold/90 shadow-lg shadow-valhalla-gold/20 transition-all"
          >
            <span>Use Template</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main Gallery Component ----

export function TemplateGallery({ onSelectTemplate, onClose }: TemplateGalleryProps) {
  const [detailTemplate, setDetailTemplate] = useState<WorkflowTemplate | null>(null);

  const handleUseTemplate = useCallback(
    (template: WorkflowTemplate) => {
      setDetailTemplate(null);
      onSelectTemplate(template);
    },
    [onSelectTemplate],
  );

  return (
    <div className="p-4 h-full overflow-y-auto scroll-container">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-valhalla-gold uppercase tracking-wider">
          Templates
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Close
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Start from a pre-built workflow template and customize it
      </p>

      <div className="space-y-3">
        {WORKFLOW_TEMPLATES.map((template) => {
          const Icon = TEMPLATE_ICON_MAP[template.icon] ?? Layers;

          return (
            <div
              key={template.id}
              className="bg-norse-stone border border-norse-rune rounded-lg hover:border-valhalla-gold/40 transition-all group"
            >
              {/* Preview area */}
              <div className="px-3 pt-3 pb-1 border-b border-norse-rune/50 bg-norse-night/30 rounded-t-lg">
                <TemplatePreview template={template} className="opacity-80 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <Icon size={14} className="text-valhalla-gold flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-200 group-hover:text-gray-100 truncate">
                    {template.name}
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                  {template.description}
                </p>

                {/* Metadata */}
                <div className="flex items-center space-x-2 mb-3">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                      CATEGORY_COLORS[template.category] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                    }`}
                  >
                    {CATEGORY_LABELS[template.category] ?? template.category}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {template.nodes.length} nodes
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setDetailTemplate(template)}
                    className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-norse-shadow border border-norse-rune rounded-lg hover:border-gray-500 transition-all"
                  >
                    <Eye size={12} />
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUseTemplate(template)}
                    className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 text-xs font-medium text-valhalla-gold bg-valhalla-gold/10 border border-valhalla-gold/30 rounded-lg hover:bg-valhalla-gold/20 hover:border-valhalla-gold/50 transition-all"
                  >
                    <span>Use Template</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail modal */}
      {detailTemplate && (
        <TemplateDetailModal
          template={detailTemplate}
          onUse={() => handleUseTemplate(detailTemplate)}
          onClose={() => setDetailTemplate(null)}
        />
      )}
    </div>
  );
}
