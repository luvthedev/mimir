/**
 * @module templates/parameterizer
 * @description Template parameter substitution and validation
 *
 * Substitutes {{parameterName}} placeholders in template content with
 * user-provided values, after validating each value against the
 * parameter's type and constraints.
 */

import type {
  IDocumentTemplate,
  ITemplateParameter,
  IParameterConstraints
} from '../types/template.types.js';

/**
 * Error details for a parameter validation failure
 */
export interface ParameterError {
  /** Parameter name that failed validation */
  parameter: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Result of applying parameters to a template
 */
export interface ApplyParametersResult {
  /** Whether all parameters were valid and substitution succeeded */
  success: boolean;
  /** The rendered content with parameters substituted (undefined on failure) */
  content?: string;
  /** List of validation errors (empty on success) */
  errors: ParameterError[];
}

/**
 * Apply user-provided parameters to a template
 *
 * Performs the following steps:
 * 1. Validates that all required parameters are provided
 * 2. Applies default values for optional parameters not provided
 * 3. Validates each value against the parameter's type and constraints
 * 4. Substitutes {{parameterName}} placeholders in the template content
 *
 * @param template - The document template to apply parameters to
 * @param params - Map of parameter names to user-provided values
 * @returns Result containing rendered content or validation errors
 *
 * @example
 * ```typescript
 * import { applyParameters } from './templates/parameterizer.js';
 *
 * const result = applyParameters(invoiceTemplate, {
 *   clientName: 'Acme Corp',
 *   amount: 1500,
 *   dueDate: '2024-12-31'
 * });
 *
 * if (result.success) {
 *   console.log(result.content);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */
export function applyParameters(
  template: IDocumentTemplate,
  params: Record<string, string | number | boolean>
): ApplyParametersResult {
  const errors: ParameterError[] = [];
  const resolvedParams = new Map<string, string>();

  for (const paramDef of template.parameters) {
    const userValue = params[paramDef.name];

    // Check required parameters
    if (userValue === undefined || userValue === null || userValue === '') {
      if (paramDef.required && paramDef.defaultValue === undefined) {
        errors.push({
          parameter: paramDef.name,
          message: `Required parameter "${paramDef.label}" is missing`
        });
        continue;
      }

      // Use default value if available
      if (paramDef.defaultValue !== undefined) {
        resolvedParams.set(paramDef.name, String(paramDef.defaultValue));
        continue;
      }

      // Optional parameter with no default - substitute with empty string
      resolvedParams.set(paramDef.name, '');
      continue;
    }

    // Validate the value against type and constraints
    const typeErrors = validateParameterValue(paramDef, userValue);
    if (typeErrors.length > 0) {
      errors.push(...typeErrors);
      continue;
    }

    resolvedParams.set(paramDef.name, String(userValue));
  }

  // Check for unknown parameters
  const definedNames = new Set(template.parameters.map(p => p.name));
  for (const key of Object.keys(params)) {
    if (!definedNames.has(key)) {
      errors.push({
        parameter: key,
        message: `Unknown parameter "${key}" is not defined in this template`
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Perform substitution
  let content = template.content;
  for (const [name, value] of resolvedParams) {
    const placeholder = `{{${name}}}`;
    content = content.split(placeholder).join(value);
  }

  return { success: true, content, errors: [] };
}

/**
 * Validate a single parameter value against its definition
 */
function validateParameterValue(
  paramDef: ITemplateParameter,
  value: string | number | boolean
): ParameterError[] {
  const errors: ParameterError[] = [];
  const { name, label, type, constraints } = paramDef;

  switch (type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push({ parameter: name, message: `"${label}" must be a string` });
        return errors;
      }
      if (constraints) {
        validateStringConstraints(name, label, value, constraints, errors);
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push({ parameter: name, message: `"${label}" must be a valid number` });
        return errors;
      }
      if (constraints) {
        validateNumberConstraints(name, label, value, constraints, errors);
      }
      break;

    case 'date':
      if (typeof value !== 'string') {
        errors.push({ parameter: name, message: `"${label}" must be a date string` });
        return errors;
      }
      // Basic date validation
      if (isNaN(Date.parse(value))) {
        errors.push({ parameter: name, message: `"${label}" must be a valid date` });
        return errors;
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push({ parameter: name, message: `"${label}" must be a boolean` });
      }
      break;

    case 'enum':
      if (typeof value !== 'string') {
        errors.push({ parameter: name, message: `"${label}" must be a string for enum type` });
        return errors;
      }
      if (constraints?.allowedValues && !constraints.allowedValues.includes(value)) {
        errors.push({
          parameter: name,
          message: `"${label}" must be one of: ${constraints.allowedValues.join(', ')}`
        });
      }
      break;

    default:
      errors.push({ parameter: name, message: `Unknown parameter type "${type}"` });
  }

  return errors;
}

/**
 * Validate string-specific constraints
 */
function validateStringConstraints(
  name: string,
  label: string,
  value: string,
  constraints: IParameterConstraints,
  errors: ParameterError[]
): void {
  if (constraints.min !== undefined && value.length < constraints.min) {
    errors.push({
      parameter: name,
      message: `"${label}" must be at least ${constraints.min} characters`
    });
  }
  if (constraints.max !== undefined && value.length > constraints.max) {
    errors.push({
      parameter: name,
      message: `"${label}" must be at most ${constraints.max} characters`
    });
  }
  if (constraints.pattern) {
    try {
      const re = new RegExp(constraints.pattern);
      if (!re.test(value)) {
        errors.push({
          parameter: name,
          message: `"${label}" does not match required pattern`
        });
      }
    } catch {
      errors.push({
        parameter: name,
        message: `"${label}" has an invalid constraint pattern`
      });
    }
  }
}

/**
 * Validate number-specific constraints
 */
function validateNumberConstraints(
  name: string,
  label: string,
  value: number,
  constraints: IParameterConstraints,
  errors: ParameterError[]
): void {
  if (constraints.min !== undefined && value < constraints.min) {
    errors.push({
      parameter: name,
      message: `"${label}" must be at least ${constraints.min}`
    });
  }
  if (constraints.max !== undefined && value > constraints.max) {
    errors.push({
      parameter: name,
      message: `"${label}" must be at most ${constraints.max}`
    });
  }
}
