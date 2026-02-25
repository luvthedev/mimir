/**
 * @module commands/template-commands
 * @description Handles VSCode commands for inserting document templates at the cursor position.
 * Loads template data from bundled JSON files and integrates with the TemplateQuickPickProvider.
 */

import * as vscode from 'vscode';
import { TemplateQuickPickProvider } from '../providers/template-provider';

/**
 * Represents a loaded template with its content and metadata.
 */
interface TemplateData {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  content: string;
  parameters: Array<{
    name: string;
    type: string;
    description?: string;
    required?: boolean;
    default?: string | number | boolean;
  }>;
}

/**
 * TemplateCommandHandler manages template insertion commands for the VSCode extension.
 * It loads template definitions and inserts their content at the active editor's cursor position.
 */
export class TemplateCommandHandler {
  private templates: Map<string, TemplateData> = new Map();
  private quickPickProvider: TemplateQuickPickProvider;

  constructor(private context: vscode.ExtensionContext) {
    this.quickPickProvider = new TemplateQuickPickProvider();
    this.loadTemplates();
  }

  /**
   * Loads template JSON files from the extension's bundled templates directory.
   * Falls back to embedded template data if files cannot be read.
   */
  private loadTemplates(): void {
    const templates: TemplateData[] = [
      {
        id: 'invoice-standard',
        name: 'Standard Invoice',
        description: 'A standard invoice template for billing clients with itemized line items',
        category: 'invoice',
        version: '1.0.0',
        content: 'INVOICE\n\nFrom: {{companyName}}\nTo: {{clientName}}\nDate: {{invoiceDate}}\nInvoice #: {{invoiceNumber}}\nDue Date: {{dueDate}}\n\nDescription: {{description}}\n\nAmount: ${{amount}}\nTax Rate: {{taxRate}}%\nTotal: ${{totalAmount}}\n\nPayment Terms: {{paymentTerms}}\n\nNotes: {{notes}}',
        parameters: [
          { name: 'companyName', type: 'string', description: 'Name of the issuing company', required: true },
          { name: 'clientName', type: 'string', description: 'Name of the client being billed', required: true },
          { name: 'invoiceDate', type: 'date', description: 'Date the invoice was issued', required: true },
          { name: 'invoiceNumber', type: 'string', description: 'Unique invoice identifier', required: true },
          { name: 'dueDate', type: 'date', description: 'Payment due date', required: true },
          { name: 'description', type: 'string', description: 'Description of services or goods', required: true },
          { name: 'amount', type: 'number', description: 'Subtotal amount before tax', required: true },
          { name: 'taxRate', type: 'number', description: 'Tax rate percentage', required: false, default: 0 },
          { name: 'totalAmount', type: 'number', description: 'Total amount including tax', required: true },
          { name: 'paymentTerms', type: 'enum', description: 'Payment terms', required: false, default: 'Net 30' },
          { name: 'notes', type: 'string', description: 'Additional notes', required: false, default: '' }
        ]
      },
      {
        id: 'pdf-conversion-basic',
        name: 'Basic PDF Conversion',
        description: 'Template for converting documents to PDF format with configurable options',
        category: 'pdf-conversion',
        version: '1.0.0',
        content: 'PDF Conversion Request\n\nSource Document: {{sourceFile}}\nOutput Format: PDF\nPage Size: {{pageSize}}\nOrientation: {{orientation}}\nMargins: {{margins}}\n\nHeader: {{headerText}}\nFooter: {{footerText}}\n\nInclude Table of Contents: {{includeToc}}\nPage Numbers: {{includePageNumbers}}',
        parameters: [
          { name: 'sourceFile', type: 'string', description: 'Path or name of the source document to convert', required: true },
          { name: 'pageSize', type: 'enum', description: 'Output page size', required: false, default: 'A4' },
          { name: 'orientation', type: 'enum', description: 'Page orientation', required: false, default: 'portrait' },
          { name: 'margins', type: 'string', description: 'Page margins (e.g., 1in or 2.5cm)', required: false, default: '1in' },
          { name: 'headerText', type: 'string', description: 'Text to display in the page header', required: false, default: '' },
          { name: 'footerText', type: 'string', description: 'Text to display in the page footer', required: false, default: '' },
          { name: 'includeToc', type: 'boolean', description: 'Whether to include a table of contents', required: false, default: false },
          { name: 'includePageNumbers', type: 'boolean', description: 'Whether to include page numbers', required: false, default: true }
        ]
      },
      {
        id: 'contract-summarization-standard',
        name: 'Standard Contract Summarization',
        description: 'Template for generating structured summaries of legal contracts',
        category: 'contract-summarization',
        version: '1.0.0',
        content: 'CONTRACT SUMMARY\n\nContract Title: {{contractTitle}}\nParties: {{partyA}} and {{partyB}}\nEffective Date: {{effectiveDate}}\nExpiration Date: {{expirationDate}}\n\nSummary Type: {{summaryType}}\nMax Length: {{maxLength}} words\n\nKey Focus Areas: {{focusAreas}}\n\nInclude Obligations: {{includeObligations}}\nInclude Financial Terms: {{includeFinancialTerms}}\nInclude Termination Clauses: {{includeTermination}}',
        parameters: [
          { name: 'contractTitle', type: 'string', description: 'Title of the contract being summarized', required: true },
          { name: 'partyA', type: 'string', description: 'First party in the contract', required: true },
          { name: 'partyB', type: 'string', description: 'Second party in the contract', required: true },
          { name: 'effectiveDate', type: 'date', description: 'Contract effective date', required: true },
          { name: 'expirationDate', type: 'date', description: 'Contract expiration date', required: false },
          { name: 'summaryType', type: 'enum', description: 'Type of summary to generate', required: false, default: 'comprehensive' },
          { name: 'maxLength', type: 'number', description: 'Maximum summary length in words', required: false, default: 500 },
          { name: 'focusAreas', type: 'string', description: 'Comma-separated list of areas to focus on', required: false, default: 'all' },
          { name: 'includeObligations', type: 'boolean', description: 'Whether to include party obligations in summary', required: false, default: true },
          { name: 'includeFinancialTerms', type: 'boolean', description: 'Whether to include financial terms in summary', required: false, default: true },
          { name: 'includeTermination', type: 'boolean', description: 'Whether to include termination clauses in summary', required: false, default: true }
        ]
      }
    ];

    for (const template of templates) {
      this.templates.set(template.id, template);
    }

    this.quickPickProvider.setTemplates(templates);
  }

  /**
   * Registers all template commands with the VSCode extension context.
   * Returns disposables for cleanup.
   */
  registerCommands(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Register individual template insertion commands
    disposables.push(
      vscode.commands.registerCommand('mimir.insertInvoiceTemplate', () => {
        this.insertTemplate('invoice-standard');
      })
    );

    disposables.push(
      vscode.commands.registerCommand('mimir.insertPdfTemplate', () => {
        this.insertTemplate('pdf-conversion-basic');
      })
    );

    disposables.push(
      vscode.commands.registerCommand('mimir.insertContractTemplate', () => {
        this.insertTemplate('contract-summarization-standard');
      })
    );

    // Register quick pick command for browsing all templates
    disposables.push(
      vscode.commands.registerCommand('mimir.insertTemplate', () => {
        this.showTemplatePicker();
      })
    );

    return disposables;
  }

  /**
   * Inserts a template's content at the cursor position in the active editor.
   *
   * @param templateId - The ID of the template to insert
   */
  private async insertTemplate(templateId: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor. Open a file first to insert a template.');
      return;
    }

    const template = this.templates.get(templateId);
    if (!template) {
      vscode.window.showErrorMessage(`Template not found: "${templateId}". The template may not be available.`);
      return;
    }

    try {
      await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, template.content);
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to insert template: ${error.message}`);
    }
  }

  /**
   * Shows the quick pick dialog to browse and select a template for insertion.
   */
  private async showTemplatePicker(): Promise<void> {
    const selectedTemplateId = await this.quickPickProvider.showQuickPick();
    if (selectedTemplateId) {
      await this.insertTemplate(selectedTemplateId);
    }
  }
}
