/**
 * @module providers/template-provider
 * @description Provides a VSCode QuickPick interface for browsing and selecting document templates.
 * Shows template name, description, and parameter count for informed selection.
 */

import * as vscode from 'vscode';

/**
 * Minimal template info needed for the quick pick display.
 */
interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: Array<{ name: string; required?: boolean }>;
}

/**
 * QuickPickItem extended with template ID for selection tracking.
 */
interface TemplateQuickPickItem extends vscode.QuickPickItem {
  templateId: string;
}

/**
 * TemplateQuickPickProvider displays available templates in a VSCode QuickPick dialog.
 * Each item shows the template name, description, and parameter count to help
 * developers choose the right template.
 */
export class TemplateQuickPickProvider {
  private templates: TemplateInfo[] = [];

  /**
   * Updates the list of available templates.
   *
   * @param templates - Array of template info objects
   */
  setTemplates(templates: TemplateInfo[]): void {
    this.templates = templates;
  }

  /**
   * Shows a QuickPick dialog with all available templates.
   * Each item displays:
   * - Label: Template name
   * - Description: Parameter count (e.g., "11 parameters")
   * - Detail: Template description and category
   *
   * @returns The selected template ID, or undefined if cancelled
   */
  async showQuickPick(): Promise<string | undefined> {
    if (this.templates.length === 0) {
      vscode.window.showErrorMessage('No templates available. Templates could not be loaded.');
      return undefined;
    }

    const items: TemplateQuickPickItem[] = this.templates.map(template => {
      const requiredCount = template.parameters.filter(p => p.required).length;
      const totalCount = template.parameters.length;

      return {
        label: template.name,
        description: `${totalCount} parameters (${requiredCount} required)`,
        detail: `[${template.category}] ${template.description}`,
        templateId: template.id
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a template to insert at the cursor position',
      matchOnDescription: true,
      matchOnDetail: true
    });

    return selected?.templateId;
  }
}
