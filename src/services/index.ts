/**
 * @module services
 * @description Service layer exports for Mimir
 *
 * Exports: TemplateService (singleton instance)
 */

import { TemplateService } from './template.service.js';

export { TemplateService };

/**
 * Singleton instance of the TemplateService.
 *
 * Usage:
 * ```typescript
 * import { templateService } from './services/index.js';
 *
 * // Initialize on startup
 * await templateService.initialize();
 *
 * // Use throughout the application
 * const templates = templateService.listTemplates('invoice');
 * ```
 */
export const templateService = new TemplateService();
