/**
 * @module types/workflowTemplates
 * @description Type definitions and pre-built template data for workflow templates.
 *
 * Provides a library of reusable workflow templates for common document
 * processing tasks. Each template defines a complete workflow with nodes,
 * connections, and metadata that can be instantiated in the editor.
 */

import type { EditorNode, EditorConnection, WorkflowNodeType } from './workflow';

// ============================================================================
// Template Types
// ============================================================================

/**
 * Category of a workflow template.
 */
export type TemplateCategory = 'document-processing' | 'data-pipeline' | 'analysis';

/**
 * A node definition within a template (positions are pre-defined).
 */
export interface TemplateNode {
  /** Stable ID used for connection references within the template */
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/**
 * A connection definition within a template.
 */
export interface TemplateConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
}

/**
 * A complete workflow template definition.
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Nodes pre-configured for the template's purpose */
  nodes: TemplateNode[];
  /** Connections linking the template nodes */
  connections: TemplateConnection[];
  /** API keys the template requires at runtime */
  requiredApiKeys: string[];
  /** Estimated cost per execution (informational) */
  estimatedCost: string;
  /** Icon name from lucide-react */
  icon: string;
}

// ============================================================================
// Template Definitions
// ============================================================================

/**
 * Invoice Extraction Template
 *
 * Workflow: upload -> extract (invoice fields) -> transform (format currency, dates) -> output (JSON)
 */
const invoiceExtractionTemplate: WorkflowTemplate = {
  id: 'template-invoice-extraction',
  name: 'Invoice Extraction',
  description:
    'Extract structured data from invoices including vendor, amounts, dates, and line items. Automatically formats currency and date fields for downstream processing.',
  category: 'document-processing',
  icon: 'Receipt',
  requiredApiKeys: ['OPENAI_API_KEY'],
  estimatedCost: '~$0.03 per invoice',
  nodes: [
    {
      id: 'tpl-inv-upload',
      type: 'upload',
      position: { x: 80, y: 200 },
      config: { format: 'csv', source: 'invoice-file' },
      metadata: { label: 'Upload Invoice', description: 'Accepts PDF, image, or text invoice files' },
    },
    {
      id: 'tpl-inv-extract',
      type: 'extract',
      position: { x: 380, y: 200 },
      config: {
        pattern: '$.invoice',
        format: 'structured',
        prompt:
          'Extract the following fields from this invoice: vendor_name, invoice_number, invoice_date, due_date, line_items (description, quantity, unit_price, amount), subtotal, tax, total_amount, currency, payment_terms',
      },
      metadata: { label: 'Extract Invoice Fields', description: 'Extracts vendor, amounts, dates, and line items' },
    },
    {
      id: 'tpl-inv-transform',
      type: 'transform',
      position: { x: 680, y: 200 },
      config: {
        operation: 'format',
        expression: '// Format currency and date fields',
        prompt:
          'Format the extracted invoice data: 1) Normalize all currency amounts to two decimal places with currency symbol. 2) Convert all dates to ISO 8601 format (YYYY-MM-DD). 3) Ensure line item amounts equal quantity * unit_price. 4) Validate that subtotal + tax = total_amount. Return the cleaned, validated JSON.',
      },
      metadata: { label: 'Format Currency & Dates', description: 'Normalizes currency and date formats' },
    },
    {
      id: 'tpl-inv-output',
      type: 'output',
      position: { x: 980, y: 200 },
      config: { outputFormat: 'json', destination: 'stdout' },
      metadata: { label: 'JSON Output', description: 'Structured invoice JSON with validated fields' },
    },
  ],
  connections: [
    { id: 'tpl-inv-conn-1', sourceNodeId: 'tpl-inv-upload', targetNodeId: 'tpl-inv-extract', sourcePort: 'data', targetPort: 'data' },
    { id: 'tpl-inv-conn-2', sourceNodeId: 'tpl-inv-extract', targetNodeId: 'tpl-inv-transform', sourcePort: 'data', targetPort: 'data' },
    { id: 'tpl-inv-conn-3', sourceNodeId: 'tpl-inv-transform', targetNodeId: 'tpl-inv-output', sourcePort: 'data', targetPort: 'data' },
  ],
};

/**
 * Contract Analysis Template
 *
 * Workflow: upload -> extract (clauses, dates, parties) -> transform (risk assessment) -> output (summary)
 */
const contractAnalysisTemplate: WorkflowTemplate = {
  id: 'template-contract-analysis',
  name: 'Contract Analysis',
  description:
    'Analyze contracts to extract key clauses, parties, dates, and obligations. Performs automated risk assessment and generates a structured summary with flagged concerns.',
  category: 'analysis',
  icon: 'Scale',
  requiredApiKeys: ['OPENAI_API_KEY'],
  estimatedCost: '~$0.05 per contract',
  nodes: [
    {
      id: 'tpl-ctr-upload',
      type: 'upload',
      position: { x: 80, y: 200 },
      config: { format: 'csv', source: 'contract-file' },
      metadata: { label: 'Upload Contract', description: 'Accepts PDF or text contract documents' },
    },
    {
      id: 'tpl-ctr-extract',
      type: 'extract',
      position: { x: 380, y: 200 },
      config: {
        pattern: '$.contract',
        format: 'structured',
        prompt:
          'Extract the following from this contract: parties (name, role, address), effective_date, expiration_date, renewal_terms, key_clauses (clause_type, text, section_reference) including termination, liability, indemnification, confidentiality, and non-compete clauses, payment_terms, obligations (party, description, deadline), governing_law',
      },
      metadata: { label: 'Extract Clauses & Parties', description: 'Identifies parties, dates, and key clauses' },
    },
    {
      id: 'tpl-ctr-transform',
      type: 'transform',
      position: { x: 680, y: 200 },
      config: {
        operation: 'analyze',
        expression: '// Risk assessment',
        prompt:
          'Perform a risk assessment on the extracted contract data: 1) Flag unusual or one-sided clauses. 2) Identify missing standard clauses (e.g., force majeure, dispute resolution). 3) Assess liability exposure (low/medium/high). 4) Check for auto-renewal traps. 5) Highlight approaching deadlines. Return a risk_summary with overall_risk_level, flagged_items array, missing_clauses array, and recommendations array.',
      },
      metadata: { label: 'Risk Assessment', description: 'Analyzes clauses for risks and missing terms' },
    },
    {
      id: 'tpl-ctr-output',
      type: 'output',
      position: { x: 980, y: 200 },
      config: { outputFormat: 'json', destination: 'stdout' },
      metadata: { label: 'Analysis Summary', description: 'Risk-assessed contract summary with recommendations' },
    },
  ],
  connections: [
    { id: 'tpl-ctr-conn-1', sourceNodeId: 'tpl-ctr-upload', targetNodeId: 'tpl-ctr-extract', sourcePort: 'data', targetPort: 'data' },
    { id: 'tpl-ctr-conn-2', sourceNodeId: 'tpl-ctr-extract', targetNodeId: 'tpl-ctr-transform', sourcePort: 'data', targetPort: 'data' },
    { id: 'tpl-ctr-conn-3', sourceNodeId: 'tpl-ctr-transform', targetNodeId: 'tpl-ctr-output', sourcePort: 'data', targetPort: 'data' },
  ],
};

/**
 * Form Processing Template
 *
 * Workflow: upload -> extract (form fields) -> transform (validation, normalization) -> output (structured data)
 */
const formProcessingTemplate: WorkflowTemplate = {
  id: 'template-form-processing',
  name: 'Form Processing',
  description:
    'Process form submissions by extracting fields, validating data types, normalizing formats, and producing clean structured output. Handles names, addresses, dates, and custom fields.',
  category: 'document-processing',
  icon: 'ClipboardList',
  requiredApiKeys: ['OPENAI_API_KEY'],
  estimatedCost: '~$0.02 per form',
  nodes: [
    {
      id: 'tpl-frm-upload',
      type: 'upload',
      position: { x: 80, y: 200 },
      config: { format: 'csv', source: 'form-submission' },
      metadata: { label: 'Upload Form', description: 'Accepts scanned forms, PDFs, or digital submissions' },
    },
    {
      id: 'tpl-frm-extract',
      type: 'extract',
      position: { x: 380, y: 200 },
      config: {
        pattern: '$.form',
        format: 'structured',
        prompt:
          'Extract all form fields from this document. For each field identify: field_name, field_value, field_type (text, number, date, email, phone, address, checkbox, select), confidence_score (0-1), and bounding_box if applicable. Group related fields (e.g., first_name + last_name = full_name). Preserve the original field order.',
      },
      metadata: { label: 'Extract Form Fields', description: 'Identifies and extracts all form field values' },
    },
    {
      id: 'tpl-frm-transform',
      type: 'transform',
      position: { x: 680, y: 200 },
      config: {
        operation: 'validate',
        expression: '// Validate and normalize',
        prompt:
          'Validate and normalize the extracted form data: 1) Validate email formats. 2) Normalize phone numbers to E.164 format. 3) Standardize dates to ISO 8601. 4) Normalize addresses (capitalize city, validate state/zip). 5) Trim whitespace from all text fields. 6) Flag fields with confidence_score below 0.8 for review. Return normalized_fields array and a validation_report with any errors or warnings.',
      },
      metadata: { label: 'Validate & Normalize', description: 'Validates types and normalizes field formats' },
    },
    {
      id: 'tpl-frm-output',
      type: 'output',
      position: { x: 980, y: 200 },
      config: { outputFormat: 'json', destination: 'stdout' },
      metadata: { label: 'Structured Data', description: 'Clean, validated form data with confidence scores' },
    },
  ],
  connections: [
    { id: 'tpl-frm-conn-1', sourceNodeId: 'tpl-frm-upload', targetNodeId: 'tpl-frm-extract', sourcePort: 'data', targetPort: 'data' },
    { id: 'tpl-frm-conn-2', sourceNodeId: 'tpl-frm-extract', targetNodeId: 'tpl-frm-transform', sourcePort: 'data', targetPort: 'data' },
    { id: 'tpl-frm-conn-3', sourceNodeId: 'tpl-frm-transform', targetNodeId: 'tpl-frm-output', sourcePort: 'data', targetPort: 'data' },
  ],
};

// ============================================================================
// Template Registry
// ============================================================================

/**
 * All available workflow templates.
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  invoiceExtractionTemplate,
  contractAnalysisTemplate,
  formProcessingTemplate,
];

/**
 * Look up a template by ID.
 */
export function getTemplateById(templateId: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Filter templates by category.
 */
export function getTemplatesByCategory(category: TemplateCategory): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Convert a template's nodes into EditorNode format with fresh IDs.
 *
 * Returns a map from old template node IDs to new editor node IDs so
 * connections can be remapped.
 */
export function instantiateTemplateNodes(
  template: WorkflowTemplate,
): { nodes: EditorNode[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const now = Date.now().toString(36);

  const nodes: EditorNode[] = template.nodes.map((tplNode, index) => {
    const newId = `node-${index + 1}-${now}`;
    idMap.set(tplNode.id, newId);
    return {
      id: newId,
      type: tplNode.type,
      position: { ...tplNode.position },
      config: { ...tplNode.config },
      metadata: { ...tplNode.metadata },
    };
  });

  return { nodes, idMap };
}

/**
 * Convert a template's connections into EditorConnection format using
 * the provided ID mapping from instantiateTemplateNodes.
 */
export function instantiateTemplateConnections(
  template: WorkflowTemplate,
  idMap: Map<string, string>,
): EditorConnection[] {
  const now = Date.now().toString(36);

  return template.connections.map((tplConn, index) => ({
    id: `conn-${index + 1}-${now}`,
    sourceNodeId: idMap.get(tplConn.sourceNodeId) ?? tplConn.sourceNodeId,
    targetNodeId: idMap.get(tplConn.targetNodeId) ?? tplConn.targetNodeId,
    sourcePort: tplConn.sourcePort,
    targetPort: tplConn.targetPort,
  }));
}
