/**
 * @module template.types
 * @description Type definitions for the document template system
 */

/**
 * Supported template categories for filtering and discovery
 */
export type TemplateCategory = 'invoice' | 'pdf-conversion' | 'contract-summarization';

/**
 * Supported parameter types for template parameters
 */
export type TemplateParameterType = 'string' | 'number' | 'date' | 'boolean' | 'enum';

/**
 * Validation constraints for a template parameter value
 */
export interface ParameterConstraints {
  /** Minimum string length */
  minLength?: number;
  /** Maximum string length */
  maxLength?: number;
  /** Minimum numeric value */
  min?: number;
  /** Maximum numeric value */
  max?: number;
  /** Regex pattern the value must match */
  pattern?: string;
  /** Allowed values for enum parameters */
  enum?: string[];
}

/**
 * A parameter definition within a document template
 */
export interface ITemplateParameter {
  /** Parameter name matching {{paramName}} in template content */
  name: string;
  /** Data type of the parameter */
  type: TemplateParameterType;
  /** Human-readable description of the parameter */
  description?: string;
  /** Whether the parameter must be provided */
  required?: boolean;
  /** Default value if not provided */
  default?: string | number | boolean;
  /** Validation constraints */
  constraints?: ParameterConstraints;
}

/**
 * Optional metadata associated with a template
 */
export interface ITemplateMetadata {
  /** Template author */
  author?: string;
  /** Searchable tags */
  tags?: string[];
  /** ISO timestamp of creation */
  createdAt?: string;
  /** ISO timestamp of last update */
  updatedAt?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * A document template that can be loaded, validated, and parameterized
 */
export interface IDocumentTemplate {
  /** Unique identifier for the template */
  id: string;
  /** Human-readable template name */
  name: string;
  /** Description of the template's purpose */
  description?: string;
  /** Category for filtering and discovery */
  category: TemplateCategory;
  /** Semantic version string */
  version: string;
  /** Template content with {{paramName}} placeholders */
  content: string;
  /** Parameter definitions for substitution */
  parameters: ITemplateParameter[];
  /** Optional metadata */
  metadata?: ITemplateMetadata;
}

/**
 * Result of applying parameters to a template
 */
export interface IParameterizedTemplate {
  /** The template that was parameterized */
  templateId: string;
  /** The resulting content with parameters substituted */
  content: string;
  /** Parameters that were applied */
  appliedParameters: Record<string, string | number | boolean>;
}

/**
 * Validation result for a template
 */
export interface ITemplateValidationResult {
  /** Whether the template is valid */
  valid: boolean;
  /** Validation errors if invalid */
  errors: string[];
}

/**
 * Validation result for parameter values
 */
export interface IParameterValidationResult {
  /** Whether all parameter values are valid */
  valid: boolean;
  /** Validation errors keyed by parameter name */
  errors: Record<string, string>;
}
