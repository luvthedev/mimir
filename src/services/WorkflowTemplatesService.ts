/**
 * @module services/WorkflowTemplatesService
 * @description Service for creating workflows from pre-built templates.
 *
 * Provides template metadata retrieval and workflow instantiation from
 * templates. Works with the WorkflowPersistenceService to persist
 * template-derived workflows.
 */

import type { IGraphManager } from '../types/IGraphManager.js';
import type { Workflow, WorkflowNodeInput, WorkflowConnectionInput } from '../types/workflow.js';
import type { WorkflowNodeType } from '../types/workflow.js';
import { WorkflowPersistenceService } from '../managers/WorkflowPersistenceService.js';

// ============================================================================
// Template Types (backend mirror of frontend types)
// ============================================================================

export type TemplateCategory = 'document-processing' | 'data-pipeline' | 'analysis';

export interface WorkflowTemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  nodes: Array<{
    id: string;
    type: WorkflowNodeType;
    position: { x: number; y: number };
    config: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }>;
  connections: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourcePort: string;
    targetPort: string;
  }>;
  requiredApiKeys: string[];
  estimatedCost: string;
}

// ============================================================================
// Template Definitions
// ============================================================================

const TEMPLATES: WorkflowTemplateDefinition[] = [
  {
    id: 'template-invoice-extraction',
    name: 'Invoice Extraction',
    description:
      'Extract structured data from invoices including vendor, amounts, dates, and line items. Automatically formats currency and date fields for downstream processing.',
    category: 'document-processing',
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
  },
  {
    id: 'template-contract-analysis',
    name: 'Contract Analysis',
    description:
      'Analyze contracts to extract key clauses, parties, dates, and obligations. Performs automated risk assessment and generates a structured summary with flagged concerns.',
    category: 'analysis',
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
  },
  {
    id: 'template-form-processing',
    name: 'Form Processing',
    description:
      'Process form submissions by extracting fields, validating data types, normalizing formats, and producing clean structured output. Handles names, addresses, dates, and custom fields.',
    category: 'document-processing',
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
  },
];

// ============================================================================
// WorkflowTemplatesService
// ============================================================================

/**
 * Service for managing and instantiating workflow templates.
 *
 * Templates are in-memory definitions that can be cloned into real
 * workflows owned by a specific user via the WorkflowPersistenceService.
 */
export class WorkflowTemplatesService {
  private persistenceService: WorkflowPersistenceService;

  constructor(graphManager: IGraphManager) {
    this.persistenceService = new WorkflowPersistenceService(graphManager);
  }

  /**
   * List all available templates.
   */
  listTemplates(): WorkflowTemplateDefinition[] {
    return TEMPLATES;
  }

  /**
   * Get a single template by ID.
   */
  getTemplate(templateId: string): WorkflowTemplateDefinition | null {
    return TEMPLATES.find((t) => t.id === templateId) ?? null;
  }

  /**
   * Create a new workflow from a template definition.
   *
   * Clones the template's nodes and connections into a new workflow
   * owned by the specified user. Node and connection IDs are regenerated
   * to ensure uniqueness.
   *
   * @param templateId - ID of the template to instantiate
   * @param userId - UUID of the user who will own the workflow
   * @returns The newly created Workflow
   * @throws Error if the template ID is invalid
   */
  async createWorkflowFromTemplate(
    templateId: string,
    userId: string,
  ): Promise<Workflow> {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Build a mapping from template node IDs to position in the nodes array
    // so we can remap connection references after nodes are created
    const nodeInputs: WorkflowNodeInput[] = template.nodes.map((tplNode) => ({
      type: tplNode.type,
      position: { ...tplNode.position },
      config: { ...tplNode.config },
      metadata: { ...tplNode.metadata },
    }));

    // We need to create the workflow first with nodes, then add connections
    // since connection sourceNodeId/targetNodeId reference the NEW node IDs.
    // However, WorkflowPersistenceService.createWorkflow creates nodes with
    // fresh IDs, so we first create with nodes only, then read back the
    // node IDs and create connections in an update.
    const workflow = await this.persistenceService.createWorkflow({
      name: template.name,
      description: template.description,
      userId,
      nodes: nodeInputs,
    });

    // Build ID mapping: template node ID -> new workflow node ID
    // Relies on nodes being created in the same order as the input
    const idMap = new Map<string, string>();
    for (let i = 0; i < template.nodes.length; i++) {
      if (workflow.nodes[i]) {
        idMap.set(template.nodes[i].id, workflow.nodes[i].id);
      }
    }

    // Create connections with remapped IDs
    const connectionInputs: WorkflowConnectionInput[] = template.connections.map((tplConn) => ({
      sourceNodeId: idMap.get(tplConn.sourceNodeId) ?? tplConn.sourceNodeId,
      targetNodeId: idMap.get(tplConn.targetNodeId) ?? tplConn.targetNodeId,
      sourcePort: tplConn.sourcePort,
      targetPort: tplConn.targetPort,
    }));

    // Update the workflow with connections
    const updatedWorkflow = await this.persistenceService.updateWorkflow(workflow.id, {
      connections: connectionInputs,
    });

    return updatedWorkflow;
  }
}
