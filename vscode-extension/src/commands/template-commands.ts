import * as vscode from 'vscode';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Template definition matching the structure in templates/*.json
 */
interface TemplateParameter {
  name: string;
  label: string;
  description: string;
  type: string;
  required: boolean;
  defaultValue?: string | number | boolean;
  constraints?: Record<string, unknown>;
}

interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

interface DocumentTemplate {
  id: string;
  metadata: TemplateMetadata;
  content: string;
  parameters: TemplateParameter[];
}

/**
 * Known template IDs and their corresponding file names
 */
const TEMPLATE_MAP: Record<string, string> = {
  'invoice-standard': 'invoice-standard.json',
  'pdf-conversion-basic': 'pdf-conversion-basic.json',
  'contract-summarization-standard': 'contract-summarization-standard.json'
};

/**
 * TemplateCommandHandler - Loads templates from disk and inserts content into the active editor
 *
 * Reads template JSON files from the templates/ directory at the workspace root
 * and provides methods to load individual templates or list all available templates.
 */
export class TemplateCommandHandler {
  private templatesDir: string | undefined;
  private cache: Map<string, DocumentTemplate> = new Map();

  /**
   * Resolve the templates directory from the workspace root.
   * Returns undefined if no workspace folder is open.
   */
  private resolveTemplatesDir(): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return undefined;
    }
    return join(workspaceFolder.uri.fsPath, 'templates');
  }

  /**
   * Load a single template by ID from the templates directory.
   * Caches the result for subsequent calls.
   */
  loadTemplate(id: string): DocumentTemplate {
    // Return cached template if available
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    const templatesDir = this.resolveTemplatesDir();
    if (!templatesDir || !existsSync(templatesDir)) {
      throw new Error('Templates directory not found. Ensure a workspace with a templates/ folder is open.');
    }

    const filename = TEMPLATE_MAP[id];
    if (!filename) {
      throw new Error(`Unknown template ID: "${id}". Available: ${Object.keys(TEMPLATE_MAP).join(', ')}`);
    }

    const filePath = join(templatesDir, filename);
    if (!existsSync(filePath)) {
      throw new Error(`Template file not found: ${filename}`);
    }

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const template = JSON.parse(raw) as DocumentTemplate;
      this.cache.set(id, template);
      return template;
    } catch (err: any) {
      throw new Error(`Failed to load template "${id}": ${err.message}`);
    }
  }

  /**
   * List all available templates from the templates directory.
   */
  listTemplates(): DocumentTemplate[] {
    const templates: DocumentTemplate[] = [];

    for (const id of Object.keys(TEMPLATE_MAP)) {
      try {
        templates.push(this.loadTemplate(id));
      } catch {
        // Skip templates that fail to load
      }
    }

    return templates;
  }

  /**
   * Insert a template's content at the cursor position in the active editor.
   */
  async insertTemplateAtCursor(templateId: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor. Open a file to insert a template.');
      return;
    }

    try {
      const template = this.loadTemplate(templateId);
      await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, template.content);
      });
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to insert template: ${err.message}`);
    }
  }

  /**
   * Register all template insertion commands with VSCode.
   * Returns an array of disposables to add to the extension context.
   */
  registerCommands(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      vscode.commands.registerCommand('mimir.insertInvoiceTemplate', () => {
        this.insertTemplateAtCursor('invoice-standard');
      })
    );

    disposables.push(
      vscode.commands.registerCommand('mimir.insertPdfTemplate', () => {
        this.insertTemplateAtCursor('pdf-conversion-basic');
      })
    );

    disposables.push(
      vscode.commands.registerCommand('mimir.insertContractTemplate', () => {
        this.insertTemplateAtCursor('contract-summarization-standard');
      })
    );

    return disposables;
  }
}
