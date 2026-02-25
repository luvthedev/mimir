/**
 * @module services/template.service
 * @description Central service for template discovery, loading, validation, and parameterization.
 * Manages document templates with caching, category-based filtering, and parameter resolution.
 */

import { readFile, readdir } from 'fs/promises';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import type {
  IDocumentTemplate,
  IParameterizedTemplate,
  ITemplateMetadata,
  ITemplateValidationResult,
  TemplateCategory
} from '../types/index.js';
import { validateTemplate } from '../templates/validator.js';
import { applyParameters, validateParameters } from '../templates/parameterizer.js';
import type { IParameterValidationResult } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * TemplateService manages the lifecycle of document templates including
 * discovery, loading, validation, caching, and parameter resolution.
 *
 * @example
 * ```typescript
 * import { templateService } from './services/index.js';
 *
 * // Initialize and load all templates
 * await templateService.initialize();
 *
 * // List templates by category
 * const invoiceTemplates = templateService.listTemplates('invoice');
 *
 * // Load a specific template
 * const template = templateService.loadTemplate('invoice-standard');
 *
 * // Apply parameters to a template
 * const result = templateService.applyParameters(template, {
 *   companyName: 'Acme Corp',
 *   clientName: 'Widget Inc',
 *   invoiceDate: '2025-01-15',
 *   invoiceNumber: 'INV-001',
 *   dueDate: '2025-02-15',
 *   description: 'Consulting services',
 *   amount: 5000,
 *   totalAmount: 5000
 * });
 * ```
 */
export class TemplateService {
  /** In-memory cache of loaded templates */
  private cache: Map<string, IDocumentTemplate> = new Map();

  /** Path to the templates directory */
  private templatesDir: string;

  /** Whether the service has been initialized */
  private initialized = false;

  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir ?? resolve(__dirname, '../../templates');
  }

  /**
   * Initializes the service by discovering and loading all templates
   * from the templates directory. Validates each template and caches
   * valid ones. Invalid templates are logged and skipped.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const files = await readdir(this.templatesDir);
      const jsonFiles = files.filter(f => extname(f) === '.json' && f !== 'schema.json');

      for (const file of jsonFiles) {
        try {
          const filePath = resolve(this.templatesDir, file);
          const content = await readFile(filePath, 'utf-8');
          const templateData = JSON.parse(content) as unknown;

          // Validate the template against the schema
          const validation = validateTemplate(templateData);
          if (!validation.valid) {
            console.error(`Template "${file}" failed validation: ${validation.errors.join(', ')}`);
            continue;
          }

          const template = templateData as IDocumentTemplate;
          this.cache.set(template.id, template);
        } catch (err) {
          console.error(`Failed to load template "${file}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      this.initialized = true;
      console.log(`TemplateService initialized: ${this.cache.size} template(s) loaded`);
    } catch (err) {
      console.error(`Failed to initialize TemplateService: ${err instanceof Error ? err.message : String(err)}`);
      throw new Error(`Template service initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Loads a template by its unique ID from the cache.
   *
   * @param id - The template identifier
   * @returns The template if found, null otherwise
   */
  loadTemplate(id: string): IDocumentTemplate | null {
    const template = this.cache.get(id);
    if (!template) {
      console.error(`Template not found: "${id}". Available templates: ${Array.from(this.cache.keys()).join(', ') || 'none'}`);
      return null;
    }
    return template;
  }

  /**
   * Returns a list of templates, optionally filtered by category.
   * Supports discovery of templates by use case.
   *
   * @param category - Optional category to filter by
   * @returns Array of templates matching the filter
   */
  listTemplates(category?: TemplateCategory): IDocumentTemplate[] {
    const templates = Array.from(this.cache.values());

    if (category) {
      return templates.filter(t => t.category === category);
    }

    return templates;
  }

  /**
   * Returns metadata for a specific template without exposing
   * the full template content.
   *
   * @param id - The template identifier
   * @returns Template metadata or null if not found
   */
  getTemplateMetadata(id: string): (ITemplateMetadata & { id: string; name: string; category: TemplateCategory; version: string; description?: string }) | null {
    const template = this.cache.get(id);
    if (!template) {
      console.error(`Template not found for metadata: "${id}"`);
      return null;
    }

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      version: template.version,
      ...template.metadata
    };
  }

  /**
   * Applies user-provided parameters to a template, substituting
   * all placeholders with validated values. Validates parameters
   * against their constraints before applying.
   *
   * @param template - The template to parameterize
   * @param params - User-provided parameter values
   * @returns The parameterized template result
   * @throws Error if parameter validation fails
   */
  applyParameters(
    template: IDocumentTemplate,
    params: Record<string, string | number | boolean>
  ): IParameterizedTemplate {
    return applyParameters(template, params);
  }

  /**
   * Validates parameter values against a template's parameter definitions
   * without applying them. Useful for pre-validation in forms/UIs.
   *
   * @param template - The template with parameter definitions
   * @param params - Parameter values to validate
   * @returns Validation result
   */
  validateParameters(
    template: IDocumentTemplate,
    params: Record<string, string | number | boolean>
  ): IParameterValidationResult {
    return validateParameters(template, params);
  }

  /**
   * Validates a raw template object against the schema.
   *
   * @param template - The template data to validate
   * @returns Validation result with any errors
   */
  validateTemplate(template: unknown): ITemplateValidationResult {
    return validateTemplate(template);
  }

  /**
   * Returns the number of cached templates.
   */
  get templateCount(): number {
    return this.cache.size;
  }

  /**
   * Returns whether the service has been initialized.
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Clears the template cache. The service will need to be
   * re-initialized to load templates again.
   */
  clearCache(): void {
    this.cache.clear();
    this.initialized = false;
  }
}
