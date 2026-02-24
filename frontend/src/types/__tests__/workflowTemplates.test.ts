import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
  instantiateTemplateNodes,
  instantiateTemplateConnections,
} from '../workflowTemplates';
import { validateWorkflow } from '../../utils/workflowValidation';

// ============================================================================
// Template Registry
// ============================================================================

describe('WORKFLOW_TEMPLATES', () => {
  it('contains at least 3 templates', () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  it('each template has a unique id', () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each template has required fields', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.category).toBeTruthy();
      expect(template.nodes.length).toBeGreaterThan(0);
      expect(template.connections.length).toBeGreaterThan(0);
      expect(template.requiredApiKeys).toBeInstanceOf(Array);
      expect(template.estimatedCost).toBeTruthy();
      expect(template.icon).toBeTruthy();
    }
  });

  it('each template follows upload -> extract -> transform -> output pattern', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const types = template.nodes.map((n) => n.type);
      expect(types[0]).toBe('upload');
      expect(types[types.length - 1]).toBe('output');
      expect(types).toContain('extract');
      expect(types).toContain('transform');
    }
  });

  it('each template has valid internal connection references', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const nodeIds = new Set(template.nodes.map((n) => n.id));
      for (const conn of template.connections) {
        expect(nodeIds.has(conn.sourceNodeId)).toBe(true);
        expect(nodeIds.has(conn.targetNodeId)).toBe(true);
      }
    }
  });

  it('includes invoice extraction template', () => {
    const invoiceTemplate = WORKFLOW_TEMPLATES.find((t) => t.id === 'template-invoice-extraction');
    expect(invoiceTemplate).toBeDefined();
    expect(invoiceTemplate!.name).toBe('Invoice Extraction');
  });

  it('includes contract analysis template', () => {
    const contractTemplate = WORKFLOW_TEMPLATES.find((t) => t.id === 'template-contract-analysis');
    expect(contractTemplate).toBeDefined();
    expect(contractTemplate!.name).toBe('Contract Analysis');
  });

  it('includes form processing template', () => {
    const formTemplate = WORKFLOW_TEMPLATES.find((t) => t.id === 'template-form-processing');
    expect(formTemplate).toBeDefined();
    expect(formTemplate!.name).toBe('Form Processing');
  });
});

// ============================================================================
// getTemplateById
// ============================================================================

describe('getTemplateById', () => {
  it('returns a template by its id', () => {
    const template = getTemplateById('template-invoice-extraction');
    expect(template).toBeDefined();
    expect(template!.name).toBe('Invoice Extraction');
  });

  it('returns undefined for unknown id', () => {
    const template = getTemplateById('nonexistent-id');
    expect(template).toBeUndefined();
  });
});

// ============================================================================
// getTemplatesByCategory
// ============================================================================

describe('getTemplatesByCategory', () => {
  it('returns templates in the document-processing category', () => {
    const templates = getTemplatesByCategory('document-processing');
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) {
      expect(t.category).toBe('document-processing');
    }
  });

  it('returns templates in the analysis category', () => {
    const templates = getTemplatesByCategory('analysis');
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) {
      expect(t.category).toBe('analysis');
    }
  });

  it('returns empty array for category with no templates', () => {
    const templates = getTemplatesByCategory('data-pipeline');
    expect(templates).toEqual([]);
  });
});

// ============================================================================
// instantiateTemplateNodes
// ============================================================================

describe('instantiateTemplateNodes', () => {
  it('creates nodes with fresh IDs', () => {
    const template = WORKFLOW_TEMPLATES[0];
    const { nodes, idMap } = instantiateTemplateNodes(template);

    expect(nodes.length).toBe(template.nodes.length);
    expect(idMap.size).toBe(template.nodes.length);

    // All new IDs should be different from template IDs
    for (const node of nodes) {
      expect(node.id).not.toBe(template.nodes.find((n) => n.type === node.type)?.id);
    }
  });

  it('preserves node types and positions', () => {
    const template = WORKFLOW_TEMPLATES[0];
    const { nodes } = instantiateTemplateNodes(template);

    for (let i = 0; i < template.nodes.length; i++) {
      expect(nodes[i].type).toBe(template.nodes[i].type);
      expect(nodes[i].position).toEqual(template.nodes[i].position);
    }
  });

  it('preserves node config and metadata', () => {
    const template = WORKFLOW_TEMPLATES[0];
    const { nodes } = instantiateTemplateNodes(template);

    for (let i = 0; i < template.nodes.length; i++) {
      // Config and metadata should be copies, not references
      expect(nodes[i].config).toEqual(template.nodes[i].config);
      expect(nodes[i].metadata).toEqual(template.nodes[i].metadata);
    }
  });

  it('provides a valid ID mapping from old to new IDs', () => {
    const template = WORKFLOW_TEMPLATES[0];
    const { nodes, idMap } = instantiateTemplateNodes(template);

    for (let i = 0; i < template.nodes.length; i++) {
      const oldId = template.nodes[i].id;
      const newId = idMap.get(oldId);
      expect(newId).toBe(nodes[i].id);
    }
  });
});

// ============================================================================
// instantiateTemplateConnections
// ============================================================================

describe('instantiateTemplateConnections', () => {
  it('creates connections with remapped node IDs', () => {
    const template = WORKFLOW_TEMPLATES[0];
    const { idMap } = instantiateTemplateNodes(template);
    const connections = instantiateTemplateConnections(template, idMap);

    expect(connections.length).toBe(template.connections.length);

    for (let i = 0; i < template.connections.length; i++) {
      const tplConn = template.connections[i];
      const conn = connections[i];

      // Should use NEW IDs, not template IDs
      expect(conn.sourceNodeId).toBe(idMap.get(tplConn.sourceNodeId));
      expect(conn.targetNodeId).toBe(idMap.get(tplConn.targetNodeId));
      expect(conn.sourcePort).toBe(tplConn.sourcePort);
      expect(conn.targetPort).toBe(tplConn.targetPort);
    }
  });

  it('creates connections with fresh IDs (not template connection IDs)', () => {
    const template = WORKFLOW_TEMPLATES[0];
    const { idMap } = instantiateTemplateNodes(template);
    const connections = instantiateTemplateConnections(template, idMap);

    for (let i = 0; i < template.connections.length; i++) {
      expect(connections[i].id).not.toBe(template.connections[i].id);
    }
  });
});

// ============================================================================
// Template Validation (instantiated templates produce valid workflows)
// ============================================================================

describe('template workflow validation', () => {
  it('each template produces a valid workflow when instantiated', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const { nodes, idMap } = instantiateTemplateNodes(template);
      const connections = instantiateTemplateConnections(template, idMap);

      const errors = validateWorkflow(nodes, connections);
      expect(errors).toEqual([]);
    }
  });
});
