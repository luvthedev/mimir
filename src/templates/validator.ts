/**
 * @module templates/validator
 * @description Template validation using JSON Schema rules from templates/schema.json
 *
 * Validates IDocumentTemplate objects against the template schema,
 * checking structure, required fields, value constraints, and
 * cross-field consistency (e.g. metadata.id matches top-level id).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IDocumentTemplate, TemplateCategory, ParameterType } from '../types/template.types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Valid template categories from the schema */
const VALID_CATEGORIES: TemplateCategory[] = ['invoice', 'pdf-conversion', 'contract-summarization'];

/** Valid parameter types from the schema */
const VALID_PARAMETER_TYPES: ParameterType[] = ['string', 'number', 'date', 'boolean', 'enum'];

/** Semantic version pattern */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** Kebab-case identifier pattern */
const KEBAB_CASE_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/** Parameter name pattern (camelCase identifiers) */
const PARAM_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** ISO 8601 date-time rough pattern */
const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Validation error with path information
 */
export interface ValidationError {
  /** JSON path to the invalid field */
  path: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Result of template validation
 */
export interface ValidationResult {
  /** Whether the template is valid */
  valid: boolean;
  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
}

/**
 * Load and cache the JSON schema for reference
 *
 * The schema is loaded from templates/schema.json at the project root.
 * This is primarily for documentation; the actual validation logic
 * is implemented programmatically for type safety.
 */
let _schemaCache: Record<string, unknown> | null = null;

export function loadSchema(): Record<string, unknown> {
  if (!_schemaCache) {
    const schemaPath = resolve(__dirname, '..', '..', 'templates', 'schema.json');
    const raw = readFileSync(schemaPath, 'utf-8');
    _schemaCache = JSON.parse(raw) as Record<string, unknown>;
  }
  return _schemaCache;
}

/**
 * Validate a document template against the JSON Schema rules
 *
 * Performs comprehensive validation including:
 * - Required field presence
 * - Type checking on all fields
 * - Pattern matching (ids, version strings)
 * - Cross-field consistency (metadata.id === id)
 * - Parameter constraint validation
 *
 * @param template - The template object to validate
 * @returns Validation result with detailed errors
 *
 * @example
 * ```typescript
 * import { validateTemplate } from './templates/validator.js';
 *
 * const result = validateTemplate(myTemplate);
 * if (!result.valid) {
 *   console.error('Template errors:', result.errors);
 * }
 * ```
 */
export function validateTemplate(template: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!template || typeof template !== 'object') {
    return { valid: false, errors: [{ path: '$', message: 'Template must be a non-null object' }] };
  }

  const t = template as Record<string, unknown>;

  // Validate top-level required fields
  validateRequiredString(t, 'id', errors);
  if (typeof t.id === 'string' && !KEBAB_CASE_PATTERN.test(t.id)) {
    errors.push({ path: '$.id', message: `Template id must be kebab-case (got "${t.id}")` });
  }

  if (typeof t.content !== 'string' || t.content.length === 0) {
    errors.push({ path: '$.content', message: 'Template content must be a non-empty string' });
  }

  // Validate metadata
  if (!t.metadata || typeof t.metadata !== 'object') {
    errors.push({ path: '$.metadata', message: 'Template must have a metadata object' });
  } else {
    validateMetadata(t.metadata as Record<string, unknown>, t.id as string, errors);
  }

  // Validate parameters array
  if (!Array.isArray(t.parameters)) {
    errors.push({ path: '$.parameters', message: 'Template must have a parameters array' });
  } else {
    for (let i = 0; i < t.parameters.length; i++) {
      validateParameter(t.parameters[i], i, errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateRequiredString(
  obj: Record<string, unknown>,
  field: string,
  errors: ValidationError[],
  pathPrefix = '$'
): void {
  if (typeof obj[field] !== 'string' || obj[field] === '') {
    errors.push({ path: `${pathPrefix}.${field}`, message: `${field} must be a non-empty string` });
  }
}

function validateMetadata(
  meta: Record<string, unknown>,
  topLevelId: string,
  errors: ValidationError[]
): void {
  const prefix = '$.metadata';

  validateRequiredString(meta, 'id', errors, prefix);
  validateRequiredString(meta, 'name', errors, prefix);
  validateRequiredString(meta, 'description', errors, prefix);
  validateRequiredString(meta, 'version', errors, prefix);
  validateRequiredString(meta, 'createdAt', errors, prefix);
  validateRequiredString(meta, 'updatedAt', errors, prefix);

  // Cross-field: metadata.id must match top-level id
  if (typeof meta.id === 'string' && typeof topLevelId === 'string' && meta.id !== topLevelId) {
    errors.push({
      path: `${prefix}.id`,
      message: `metadata.id ("${meta.id}") must match top-level id ("${topLevelId}")`
    });
  }

  // Category validation
  if (typeof meta.category !== 'string' || !VALID_CATEGORIES.includes(meta.category as TemplateCategory)) {
    errors.push({
      path: `${prefix}.category`,
      message: `category must be one of: ${VALID_CATEGORIES.join(', ')}`
    });
  }

  // Version format
  if (typeof meta.version === 'string' && !SEMVER_PATTERN.test(meta.version)) {
    errors.push({
      path: `${prefix}.version`,
      message: `version must follow semantic versioning (e.g. "1.0.0")`
    });
  }

  // Name length
  if (typeof meta.name === 'string' && meta.name.length > 200) {
    errors.push({ path: `${prefix}.name`, message: 'name must be at most 200 characters' });
  }

  // Description length
  if (typeof meta.description === 'string' && meta.description.length > 2000) {
    errors.push({ path: `${prefix}.description`, message: 'description must be at most 2000 characters' });
  }

  // Timestamp format
  if (typeof meta.createdAt === 'string' && !ISO_DATETIME_PATTERN.test(meta.createdAt)) {
    errors.push({ path: `${prefix}.createdAt`, message: 'createdAt must be an ISO 8601 date-time string' });
  }
  if (typeof meta.updatedAt === 'string' && !ISO_DATETIME_PATTERN.test(meta.updatedAt)) {
    errors.push({ path: `${prefix}.updatedAt`, message: 'updatedAt must be an ISO 8601 date-time string' });
  }

  // Optional: tags
  if (meta.tags !== undefined) {
    if (!Array.isArray(meta.tags)) {
      errors.push({ path: `${prefix}.tags`, message: 'tags must be an array of strings' });
    } else {
      for (let i = 0; i < meta.tags.length; i++) {
        if (typeof meta.tags[i] !== 'string' || meta.tags[i].length === 0) {
          errors.push({ path: `${prefix}.tags[${i}]`, message: 'Each tag must be a non-empty string' });
        }
        if (typeof meta.tags[i] === 'string' && meta.tags[i].length > 50) {
          errors.push({ path: `${prefix}.tags[${i}]`, message: 'Each tag must be at most 50 characters' });
        }
      }
    }
  }

  // Optional: author
  if (meta.author !== undefined) {
    if (typeof meta.author !== 'string') {
      errors.push({ path: `${prefix}.author`, message: 'author must be a string' });
    } else if (meta.author.length > 200) {
      errors.push({ path: `${prefix}.author`, message: 'author must be at most 200 characters' });
    }
  }
}

function validateParameter(
  param: unknown,
  index: number,
  errors: ValidationError[]
): void {
  const prefix = `$.parameters[${index}]`;

  if (!param || typeof param !== 'object') {
    errors.push({ path: prefix, message: 'Parameter must be a non-null object' });
    return;
  }

  const p = param as Record<string, unknown>;

  validateRequiredString(p, 'name', errors, prefix);
  validateRequiredString(p, 'label', errors, prefix);
  validateRequiredString(p, 'description', errors, prefix);

  // Name pattern
  if (typeof p.name === 'string' && !PARAM_NAME_PATTERN.test(p.name)) {
    errors.push({
      path: `${prefix}.name`,
      message: `Parameter name must start with a letter and contain only letters, digits, and underscores`
    });
  }

  // Type validation
  if (typeof p.type !== 'string' || !VALID_PARAMETER_TYPES.includes(p.type as ParameterType)) {
    errors.push({
      path: `${prefix}.type`,
      message: `Parameter type must be one of: ${VALID_PARAMETER_TYPES.join(', ')}`
    });
  }

  // Required field
  if (typeof p.required !== 'boolean') {
    errors.push({ path: `${prefix}.required`, message: 'Parameter required must be a boolean' });
  }

  // defaultValue type check
  if (p.defaultValue !== undefined) {
    const dvType = typeof p.defaultValue;
    if (dvType !== 'string' && dvType !== 'number' && dvType !== 'boolean') {
      errors.push({
        path: `${prefix}.defaultValue`,
        message: 'defaultValue must be a string, number, or boolean'
      });
    }
  }

  // Constraints validation
  if (p.constraints !== undefined) {
    if (!p.constraints || typeof p.constraints !== 'object' || Array.isArray(p.constraints)) {
      errors.push({ path: `${prefix}.constraints`, message: 'constraints must be an object' });
    } else {
      validateConstraints(p.constraints as Record<string, unknown>, prefix, errors);
    }
  }
}

function validateConstraints(
  constraints: Record<string, unknown>,
  paramPrefix: string,
  errors: ValidationError[]
): void {
  const prefix = `${paramPrefix}.constraints`;

  if (constraints.min !== undefined && typeof constraints.min !== 'number') {
    errors.push({ path: `${prefix}.min`, message: 'min must be a number' });
  }
  if (constraints.max !== undefined && typeof constraints.max !== 'number') {
    errors.push({ path: `${prefix}.max`, message: 'max must be a number' });
  }
  if (constraints.pattern !== undefined && typeof constraints.pattern !== 'string') {
    errors.push({ path: `${prefix}.pattern`, message: 'pattern must be a string' });
  }
  if (constraints.pattern !== undefined && typeof constraints.pattern === 'string') {
    try {
      new RegExp(constraints.pattern);
    } catch {
      errors.push({ path: `${prefix}.pattern`, message: 'pattern must be a valid regular expression' });
    }
  }
  if (constraints.dateFormat !== undefined && typeof constraints.dateFormat !== 'string') {
    errors.push({ path: `${prefix}.dateFormat`, message: 'dateFormat must be a string' });
  }
  if (constraints.allowedValues !== undefined) {
    if (!Array.isArray(constraints.allowedValues)) {
      errors.push({ path: `${prefix}.allowedValues`, message: 'allowedValues must be an array' });
    } else {
      for (let i = 0; i < constraints.allowedValues.length; i++) {
        if (typeof constraints.allowedValues[i] !== 'string') {
          errors.push({
            path: `${prefix}.allowedValues[${i}]`,
            message: 'Each allowed value must be a string'
          });
        }
      }
    }
  }
}
