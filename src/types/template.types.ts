/**
 * @module template.types
 * @description Type definitions for document templates
 *
 * Defines the core interfaces for the template system including:
 * - **IDocumentTemplate**: Full template definition with metadata, content, and parameters
 * - **ITemplateParameter**: Parameter definitions with validation constraints
 * - **ITemplateMetadata**: Template metadata for discovery and categorization
 * - **TemplateCategory**: Supported template categories
 */

/**
 * Supported template categories for filtering and discovery
 */
export type TemplateCategory = 'invoice' | 'pdf-conversion' | 'contract-summarization';

/**
 * Parameter types supported in templates
 */
export type ParameterType = 'string' | 'number' | 'date' | 'boolean' | 'enum';

/**
 * Constraint definitions for template parameters
 */
export interface IParameterConstraints {
  /** Minimum length for string values or minimum value for numbers */
  min?: number;
  /** Maximum length for string values or maximum value for numbers */
  max?: number;
  /** Regular expression pattern for string validation */
  pattern?: string;
  /** Allowed values for enum parameters */
  allowedValues?: string[];
  /** Date format string (e.g. 'YYYY-MM-DD') */
  dateFormat?: string;
}

/**
 * Template parameter definition
 *
 * Defines a single parameter that can be substituted into a template,
 * including its type, default value, and validation constraints.
 */
export interface ITemplateParameter {
  /** Unique parameter name used as placeholder key in template content */
  name: string;
  /** Human-readable label for the parameter */
  label: string;
  /** Description of the parameter's purpose */
  description: string;
  /** Data type of the parameter */
  type: ParameterType;
  /** Whether this parameter must be provided */
  required: boolean;
  /** Default value if not provided */
  defaultValue?: string | number | boolean;
  /** Validation constraints for the parameter value */
  constraints?: IParameterConstraints;
}

/**
 * Template metadata for discovery and categorization
 */
export interface ITemplateMetadata {
  /** Unique template identifier */
  id: string;
  /** Human-readable template name */
  name: string;
  /** Detailed description of the template's purpose */
  description: string;
  /** Template category for filtering */
  category: TemplateCategory;
  /** Semantic version of the template */
  version: string;
  /** Template author */
  author?: string;
  /** Tags for additional categorization */
  tags?: string[];
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last update timestamp */
  updatedAt: string;
}

/**
 * Complete document template definition
 *
 * Represents a full template including metadata, content with parameter
 * placeholders, and parameter definitions with validation constraints.
 *
 * @example
 * ```typescript
 * const invoiceTemplate: IDocumentTemplate = {
 *   id: 'invoice-standard',
 *   metadata: {
 *     id: 'invoice-standard',
 *     name: 'Standard Invoice',
 *     description: 'A standard invoice template',
 *     category: 'invoice',
 *     version: '1.0.0',
 *     createdAt: '2024-01-01T00:00:00Z',
 *     updatedAt: '2024-01-01T00:00:00Z'
 *   },
 *   content: 'Invoice for {{clientName}}, Amount: {{amount}}',
 *   parameters: [
 *     { name: 'clientName', label: 'Client Name', description: 'Name of the client', type: 'string', required: true },
 *     { name: 'amount', label: 'Amount', description: 'Invoice amount', type: 'number', required: true }
 *   ]
 * };
 * ```
 */
export interface IDocumentTemplate {
  /** Unique template identifier */
  id: string;
  /** Template metadata */
  metadata: ITemplateMetadata;
  /** Template content with {{parameterName}} placeholders */
  content: string;
  /** Parameter definitions for this template */
  parameters: ITemplateParameter[];
}
