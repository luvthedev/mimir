/**
 * @module services
 * @description Service layer exports for Mimir
 *
 * This module exports singleton service instances and their classes:
 *
 * - **TemplateService**: Template discovery, loading, validation, and parameterization
 *
 * @example
 * ```typescript
 * import { templateService, TemplateService } from './services/index.js';
 *
 * // Use the singleton instance
 * await templateService.initialize();
 * const templates = templateService.listTemplates('invoice');
 *
 * // Or create a custom instance
 * const customService = new TemplateService('/path/to/templates');
 * await customService.initialize();
 * ```
 */

import { TemplateService } from './template.service.js';

export { TemplateService };

/**
 * Singleton TemplateService instance
 *
 * Pre-configured to load templates from the default templates/ directory.
 * Call `templateService.initialize()` once at startup to load and cache templates.
 */
export const templateService = new TemplateService();
