/**
 * @module templates/parameterizer
 * @description Substitutes template parameters with user-provided values,
 * validating against parameter constraints before application.
 */

import type {
  IDocumentTemplate,
  ITemplateParameter,
  IParameterizedTemplate,
  IParameterValidationResult
} from '../types/index.js';

type ParameterValue = string | number | boolean;

/**
 * Validates a single parameter value against its definition and constraints.
 *
 * @param param - The parameter definition
 * @param value - The value to validate
 * @returns Error message if invalid, null if valid
 */
function validateParameterValue(param: ITemplateParameter, value: ParameterValue): string | null {
  const { name, type, constraints } = param;

  // Type validation
  switch (type) {
    case 'string': {
      if (typeof value !== 'string') {
        return `Parameter "${name}" must be a string`;
      }
      if (constraints?.minLength !== undefined && value.length < constraints.minLength) {
        return `Parameter "${name}" must be at least ${constraints.minLength} characters`;
      }
      if (constraints?.maxLength !== undefined && value.length > constraints.maxLength) {
        return `Parameter "${name}" must be at most ${constraints.maxLength} characters`;
      }
      if (constraints?.pattern) {
        const regex = new RegExp(constraints.pattern);
        if (!regex.test(value)) {
          return `Parameter "${name}" must match pattern: ${constraints.pattern}`;
        }
      }
      break;
    }

    case 'number': {
      const numValue = typeof value === 'number' ? value : Number(value);
      if (isNaN(numValue)) {
        return `Parameter "${name}" must be a valid number`;
      }
      if (constraints?.min !== undefined && numValue < constraints.min) {
        return `Parameter "${name}" must be at least ${constraints.min}`;
      }
      if (constraints?.max !== undefined && numValue > constraints.max) {
        return `Parameter "${name}" must be at most ${constraints.max}`;
      }
      break;
    }

    case 'date': {
      if (typeof value !== 'string') {
        return `Parameter "${name}" must be a date string`;
      }
      const dateValue = new Date(value);
      if (isNaN(dateValue.getTime())) {
        return `Parameter "${name}" must be a valid date`;
      }
      break;
    }

    case 'boolean': {
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        return `Parameter "${name}" must be a boolean`;
      }
      break;
    }

    case 'enum': {
      const strValue = String(value);
      if (constraints?.enum && !constraints.enum.includes(strValue)) {
        return `Parameter "${name}" must be one of: ${constraints.enum.join(', ')}`;
      }
      break;
    }

    default:
      return `Parameter "${name}" has unsupported type: ${type}`;
  }

  return null;
}

/**
 * Validates all provided parameter values against the template's parameter definitions.
 *
 * @param template - The template with parameter definitions
 * @param params - User-provided parameter values
 * @returns Validation result with errors keyed by parameter name
 */
export function validateParameters(
  template: IDocumentTemplate,
  params: Record<string, ParameterValue>
): IParameterValidationResult {
  const errors: Record<string, string> = {};

  for (const paramDef of template.parameters) {
    const value = params[paramDef.name];

    // Check required parameters
    if (paramDef.required && value === undefined && paramDef.default === undefined) {
      errors[paramDef.name] = `Required parameter "${paramDef.name}" is missing`;
      continue;
    }

    // Skip validation for undefined optional parameters with defaults
    if (value === undefined) {
      continue;
    }

    // Validate the value
    const error = validateParameterValue(paramDef, value);
    if (error) {
      errors[paramDef.name] = error;
    }
  }

  // Check for unknown parameters
  const definedNames = new Set(template.parameters.map(p => p.name));
  for (const key of Object.keys(params)) {
    if (!definedNames.has(key)) {
      errors[key] = `Unknown parameter "${key}" is not defined in this template`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Applies parameter values to a template, substituting all {{paramName}} placeholders.
 * Validates parameters before substitution and throws if validation fails.
 *
 * @param template - The template to parameterize
 * @param params - User-provided parameter values
 * @returns The parameterized template with substituted content
 * @throws Error if parameter validation fails
 */
export function applyParameters(
  template: IDocumentTemplate,
  params: Record<string, ParameterValue>
): IParameterizedTemplate {
  // Validate parameters first
  const validation = validateParameters(template, params);
  if (!validation.valid) {
    const errorMessages = Object.entries(validation.errors)
      .map(([key, msg]) => `  ${key}: ${msg}`)
      .join('\n');
    throw new Error(`Parameter validation failed:\n${errorMessages}`);
  }

  // Build the complete parameter map with defaults
  const resolvedParams: Record<string, ParameterValue> = {};
  for (const paramDef of template.parameters) {
    if (params[paramDef.name] !== undefined) {
      resolvedParams[paramDef.name] = params[paramDef.name];
    } else if (paramDef.default !== undefined) {
      resolvedParams[paramDef.name] = paramDef.default;
    }
  }

  // Substitute all {{paramName}} placeholders
  let content = template.content;
  for (const [name, value] of Object.entries(resolvedParams)) {
    const placeholder = `{{${name}}}`;
    content = content.split(placeholder).join(String(value));
  }

  return {
    templateId: template.id,
    content,
    appliedParameters: resolvedParams
  };
}
