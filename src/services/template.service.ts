/**
 * @module services/template.service
 * @description Central service for template discovery, loading, validation, and parameterization
 *
 * TemplateService is the main entry point for all template operations:
 * - **loadTemplate(id)**: Load a template by ID with caching
 * - **listTemplates(category?)**: List templates filtered by optional category
 * - **getTemplateMetadata(id)**: Get metadata for a specific template
 * - **applyParameters(template, params)**: Substitute parameters into a template
 *
 * Templates are loaded from JSON files in the templates/ directory and
 * cached in memory using a Map<string, IDocumentTemplate> to avoid
 * repeated file reads during runtime.
 *
 * @example
 * ```typescript
 * import { templateService } from './services/index.js';
 *
 * // Initialize and cache all templates
 * await templateService.initialize();
 *
 * // List invoice templates
 * const invoices = templateService.listTemplates('invoice');
 *
 * // Load and parameterize a template
 * const template = templateService.loadTemplate('invoice-standard');
 * const result = templateService.applyParameters(template, { clientName: 'Acme' });
 * ```
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  IDocumentTemplate,
  ITemplateMetadata,
  TemplateCategory
} from '../types/template.types.js';
import { validateTemplate } from '../templates/validator.js';
import {
  applyParameters as applyParametersImpl,
  type ApplyParametersResult
} from '../templates/parameterizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Default templates directory path (project root / templates)
 */
const DEFAULT_TEMPLATES_DIR = resolve(__dirname, '..', '..', 'templates');

/**
 * TemplateService - Central service for template management
 *
 * Provides template discovery, loading with caching, validation,
 * and parameter substitution. Designed as a singleton service
 * exported from src/services/index.ts.
 */
export class TemplateService {
  /** In-memory cache of loaded templates */
  private cache: Map<string, IDocumentTemplate> = new Map();

  /** Directory containing template JSON files */
  private templatesDir: string;

  /** Whether the service has been initialized */
  private initialized = false;

  /**
   * Create a new TemplateService
   *
   * @param templatesDir - Path to the directory containing template JSON files.
   *                       Defaults to the templates/ directory at project root.
   */
  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir ?? DEFAULT_TEMPLATES_DIR;
  }

  /**
   * Initialize the service by loading and caching all templates from disk
   *
   * Scans the templates directory for .json files (excluding schema.json),
   * validates each one, and caches valid templates. Invalid templates are
   * logged but do not prevent initialization.
   *
   * @returns Number of templates successfully loaded
   */
  async initialize(): Promise<number> {
    this.cache.clear();

    if (!existsSync(this.templatesDir)) {
      console.error(`TemplateService: Templates directory not found: ${this.templatesDir}`);
      this.initialized = true;
      return 0;
    }

    const files = readdirSync(this.templatesDir).filter(
      f => f.endsWith('.json') && f !== 'schema.json'
    );

    let loaded = 0;
    for (const file of files) {
      try {
        const filePath = join(this.templatesDir, file);
        const raw = readFileSync(filePath, 'utf-8');
        const templateData = JSON.parse(raw) as unknown;

        const validationResult = validateTemplate(templateData);
        if (!validationResult.valid) {
          console.error(
            `TemplateService: Invalid template in ${file}:`,
            validationResult.errors.map(e => `${e.path}: ${e.message}`).join('; ')
          );
          continue;
        }

        const template = templateData as IDocumentTemplate;
        this.cache.set(template.id, template);
        loaded++;
      } catch (err) {
        console.error(`TemplateService: Failed to load template from ${file}:`, err);
      }
    }

    this.initialized = true;
    console.log(`TemplateService: Loaded ${loaded} template(s) from ${this.templatesDir}`);
    return loaded;
  }

  /**
   * Load a template by its unique ID
   *
   * Returns the cached template if available. If the service has not been
   * initialized, it will be initialized automatically.
   *
   * @param id - The unique template identifier
   * @returns The loaded template
   * @throws {Error} If the template is not found
   *
   * @example
   * ```typescript
   * try {
   *   const template = templateService.loadTemplate('invoice-standard');
   *   console.log(template.metadata.name);
   * } catch (err) {
   *   console.error('Template not found:', err.message);
   * }
   * ```
   */
  loadTemplate(id: string): IDocumentTemplate {
    if (!this.initialized) {
      throw new Error(
        'TemplateService has not been initialized. Call initialize() before using the service.'
      );
    }

    const template = this.cache.get(id);
    if (!template) {
      throw new Error(
        `Template not found: "${id}". Available templates: ${[...this.cache.keys()].join(', ') || '(none)'}`
      );
    }

    return template;
  }

  /**
   * List templates, optionally filtered by category
   *
   * Returns all cached templates, or only those matching the specified category.
   * Supports the three template categories: invoice, pdf-conversion, contract-summarization.
   *
   * @param category - Optional category filter
   * @returns Array of matching templates
   *
   * @example
   * ```typescript
   * // List all templates
   * const allTemplates = templateService.listTemplates();
   *
   * // List only invoice templates
   * const invoices = templateService.listTemplates('invoice');
   * ```
   */
  listTemplates(category?: TemplateCategory): IDocumentTemplate[] {
    const templates = [...this.cache.values()];

    if (category) {
      return templates.filter(t => t.metadata.category === category);
    }

    return templates;
  }

  /**
   * Get metadata for a specific template by ID
   *
   * Returns just the metadata portion of a template, useful for
   * discovery without loading the full content.
   *
   * @param id - The unique template identifier
   * @returns Template metadata
   * @throws {Error} If the template is not found
   */
  getTemplateMetadata(id: string): ITemplateMetadata {
    const template = this.loadTemplate(id);
    return template.metadata;
  }

  /**
   * Apply user-provided parameters to a template
   *
   * Validates parameter values against the template's parameter constraints
   * and performs {{placeholder}} substitution. Returns an error result with
   * detailed messages if any parameter fails validation.
   *
   * @param template - The template to apply parameters to
   * @param params - Map of parameter names to values
   * @returns Result with rendered content or validation errors
   *
   * @example
   * ```typescript
   * const template = templateService.loadTemplate('invoice-standard');
   * const result = templateService.applyParameters(template, {
   *   clientName: 'Acme Corp',
   *   amount: 1500
   * });
   *
   * if (result.success) {
   *   console.log(result.content);
   * } else {
   *   result.errors.forEach(e => console.error(`${e.parameter}: ${e.message}`));
   * }
   * ```
   */
  applyParameters(
    template: IDocumentTemplate,
    params: Record<string, string | number | boolean>
  ): ApplyParametersResult {
    return applyParametersImpl(template, params);
  }

  /**
   * Check if a template with the given ID exists in the cache
   *
   * @param id - The template identifier to check
   * @returns true if the template exists
   */
  hasTemplate(id: string): boolean {
    return this.cache.has(id);
  }

  /**
   * Get the number of cached templates
   */
  get templateCount(): number {
    return this.cache.size;
  }

  /**
   * Check if the service has been initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }
}
