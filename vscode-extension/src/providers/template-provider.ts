import * as vscode from 'vscode';
import { TemplateCommandHandler } from '../commands/template-commands';

/**
 * TemplateQuickPickProvider - Shows a quick pick list of available templates
 *
 * Uses vscode.window.showQuickPick() to present all available templates
 * with descriptions and parameter counts. Selecting a template inserts
 * its content at the cursor position in the active editor.
 */
export class TemplateQuickPickProvider {
  private handler: TemplateCommandHandler;

  constructor(handler: TemplateCommandHandler) {
    this.handler = handler;
  }

  /**
   * Show the template quick pick and insert the selected template.
   */
  async showTemplatePicker(): Promise<void> {
    const templates = this.handler.listTemplates();

    if (templates.length === 0) {
      vscode.window.showWarningMessage(
        'No templates found. Ensure your workspace has a templates/ directory with template JSON files.'
      );
      return;
    }

    const items: vscode.QuickPickItem[] = templates.map(template => {
      const requiredCount = template.parameters.filter(p => p.required).length;
      const totalCount = template.parameters.length;
      return {
        label: template.metadata.name,
        description: `${totalCount} params (${requiredCount} required)`,
        detail: template.metadata.description,
        // Store the template ID for lookup after selection
        _templateId: template.id
      } as vscode.QuickPickItem & { _templateId: string };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a template to insert',
      matchOnDescription: true,
      matchOnDetail: true
    }) as (vscode.QuickPickItem & { _templateId?: string }) | undefined;

    if (selected && selected._templateId) {
      await this.handler.insertTemplateAtCursor(selected._templateId);
    }
  }

  /**
   * Register the quick pick command with VSCode.
   * Returns a disposable to add to the extension context.
   */
  registerCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('mimir.browseTemplates', () => {
      this.showTemplatePicker();
    });
  }
}
