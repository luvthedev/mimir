/**
 * @module templates/validator
 * @description Validates document templates against the JSON schema definition
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { IDocumentTemplate, ITemplateValidationResult, TemplateCategory, TemplateParameterType } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Valid template categories */
const VALID_CATEGORIES: TemplateCategory[] = ['invoice', 'pdf-conversion', 'contract-summarization'];

/** Valid parameter types */
const VALID_PARAMETER_TYPES: TemplateParameterType[] = ['string', 'number', 'date', 'boolean', 'enum'];

/** Semantic version pattern */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** Valid template ID pattern */
const ID_PATTERN = /^[a-z0-9-]+$/;

/** Valid parameter name pattern */
const PARAM_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Load and parse the JSON schema for templates.
 * Returns the parsed schema object.
 */
export async function loadSchema(): Promise<Record<string, unknown>> {
  const schemaPath = resolve(__dirname, '../../templates/schema.json');
  const schemaContent = await readFile(schemaPath, 'utf-8');
  return JSON.parse(schemaContent) as Record<string, unknown>;
}

/**
 * Validates a document template against the schema constraints.
 * Performs structural and semantic validation without requiring
 * external JSON Schema validation libraries.
 *
 * @param template - The template object to validate
 * @returns Validation result with any errors found
 */
export function validateTemplate(template: unknown): ITemplateValidationResult {
  const errors: string[] = [];

  if (!template || typeof template !== 'object') {
    return { valid: false, errors: ['Template must be a non-null object'] };
  }

  const t = template as Record<string, unknown>;

  // Required fields
  const requiredFields = ['id', 'name', 'category', 'version', 'content', 'parameters'];
  for (const field of requiredFields) {
    if (t[field] === undefined || t[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // If critical fields are missing, return early
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Validate id
  if (typeof t.id !== 'string' || !ID_PATTERN.test(t.id)) {
    errors.push('Field "id" must be a string matching pattern ^[a-z0-9-]+$');
  }

  // Validate name
  if (typeof t.name !== 'string' || t.name.length < 1 || t.name.length > 200) {
    errors.push('Field "name" must be a string between 1 and 200 characters');
  }

  // Validate description (optional)
  if (t.description !== undefined && typeof t.description !== 'string') {
    errors.push('Field "description" must be a string if provided');
  }

  // Validate category
  if (typeof t.category !== 'string' || !VALID_CATEGORIES.includes(t.category as TemplateCategory)) {
    errors.push(`Field "category" must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  // Validate version
  if (typeof t.version !== 'string' || !SEMVER_PATTERN.test(t.version)) {
    errors.push('Field "version" must be a semantic version string (e.g., "1.0.0")');
  }

  // Validate content
  if (typeof t.content !== 'string' || t.content.length < 1) {
    errors.push('Field "content" must be a non-empty string');
  }

  // Validate parameters
  if (!Array.isArray(t.parameters)) {
    errors.push('Field "parameters" must be an array');
  } else {
    const paramNames = new Set<string>();
    for (let i = 0; i < t.parameters.length; i++) {
      const param = t.parameters[i] as Record<string, unknown>;
      const prefix = `parameters[${i}]`;

      if (!param || typeof param !== 'object') {
        errors.push(`${prefix}: must be an object`);
        continue;
      }

      // Validate parameter name
      if (typeof param.name !== 'string' || !PARAM_NAME_PATTERN.test(param.name)) {
        errors.push(`${prefix}: "name" must match pattern ^[a-zA-Z][a-zA-Z0-9_]*$`);
      } else {
        if (paramNames.has(param.name)) {
          errors.push(`${prefix}: duplicate parameter name "${param.name}"`);
        }
        paramNames.add(param.name);
      }

      // Validate parameter type
      if (typeof param.type !== 'string' || !VALID_PARAMETER_TYPES.includes(param.type as TemplateParameterType)) {
        errors.push(`${prefix}: "type" must be one of: ${VALID_PARAMETER_TYPES.join(', ')}`);
      }

      // Validate constraints if present
      if (param.constraints !== undefined) {
        if (typeof param.constraints !== 'object' || param.constraints === null) {
          errors.push(`${prefix}: "constraints" must be an object if provided`);
        } else {
          const constraints = param.constraints as Record<string, unknown>;

          if (constraints.minLength !== undefined && typeof constraints.minLength !== 'number') {
            errors.push(`${prefix}.constraints: "minLength" must be a number`);
          }
          if (constraints.maxLength !== undefined && typeof constraints.maxLength !== 'number') {
            errors.push(`${prefix}.constraints: "maxLength" must be a number`);
          }
          if (constraints.min !== undefined && typeof constraints.min !== 'number') {
            errors.push(`${prefix}.constraints: "min" must be a number`);
          }
          if (constraints.max !== undefined && typeof constraints.max !== 'number') {
            errors.push(`${prefix}.constraints: "max" must be a number`);
          }
          if (constraints.pattern !== undefined && typeof constraints.pattern !== 'string') {
            errors.push(`${prefix}.constraints: "pattern" must be a string`);
          }
          if (constraints.enum !== undefined) {
            if (!Array.isArray(constraints.enum) || !constraints.enum.every((v: unknown) => typeof v === 'string')) {
              errors.push(`${prefix}.constraints: "enum" must be an array of strings`);
            }
          }

          // Enum parameter type must have enum constraint
          if (param.type === 'enum' && (!constraints.enum || !Array.isArray(constraints.enum))) {
            errors.push(`${prefix}: enum type parameter must have "constraints.enum" array`);
          }
        }
      } else if (param.type === 'enum') {
        errors.push(`${prefix}: enum type parameter must have "constraints.enum" array`);
      }
    }

    // Cross-validate: check that all {{paramName}} placeholders in content have matching parameter definitions
    if (typeof t.content === 'string') {
      const placeholders = t.content.match(/\{\{(\w+)\}\}/g);
      if (placeholders) {
        const placeholderNames = placeholders.map((p: string) => p.replace(/\{\{|\}\}/g, ''));
        for (const name of placeholderNames) {
          if (!paramNames.has(name)) {
            errors.push(`Content placeholder "{{${name}}}" has no matching parameter definition`);
          }
        }
      }
    }
  }

  // Validate metadata (optional)
  if (t.metadata !== undefined) {
    if (typeof t.metadata !== 'object' || t.metadata === null) {
      errors.push('Field "metadata" must be an object if provided');
    } else {
      const meta = t.metadata as Record<string, unknown>;
      if (meta.author !== undefined && typeof meta.author !== 'string') {
        errors.push('metadata.author must be a string');
      }
      if (meta.tags !== undefined) {
        if (!Array.isArray(meta.tags) || !meta.tags.every((t: unknown) => typeof t === 'string')) {
          errors.push('metadata.tags must be an array of strings');
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
