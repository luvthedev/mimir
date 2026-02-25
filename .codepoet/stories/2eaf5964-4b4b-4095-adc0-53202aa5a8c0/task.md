# Task: Enable template discovery and insertion via VSCode extension commands

## Description
Expose templates through the VSCode extension as commands and snippets, allowing developers to discover and insert templates directly into their workflows. This makes templates discoverable within the developer's primary IDE.

## Acceptance Criteria
- Three template commands appear in VSCode command palette with 'Mimir: Insert' prefix
- Quick pick shows all available templates with descriptions and parameter counts
- Selecting a template inserts its content at the cursor position in the active editor
- Template snippets trigger with keywords (invoice, pdf-convert, contract-summary) in editor

## Implementation Notes
- Register three VSCode commands in vscode-extension/src/extension.ts: 'mimir.insertInvoiceTemplate', 'mimir.insertPdfTemplate', 'mimir.insertContractTemplate' using vscode.commands.registerCommand()
- Create TemplateCommandHandler in vscode-extension/src/commands/template-commands.ts that calls TemplateService.loadTemplate() and inserts template content at cursor position
- Implement TemplateQuickPickProvider in vscode-extension/src/providers/template-provider.ts using vscode.window.showQuickPick() to list available templates with descriptions
- Add command palette entries in vscode-extension/package.json with titles like 'Mimir: Insert Invoice Extraction Template' and category 'Mimir'
- Create VSCode snippets in vscode-extension/snippets/templates.json with trigger words (invoice, pdf-convert, contract-summary) for quick template insertion
- Implement template preview in quick pick using QuickPickItem.description field showing template purpose and parameter count
- Add error handling in command handlers using vscode.window.showErrorMessage() for template loading failures

## When You're Done
When you have completed all acceptance criteria, create the file `.codepoet/stories/2eaf5964-4b4b-4095-adc0-53202aa5a8c0/done.json` with this exact structure:
```json
{
  "status": "completed",
  "summary": "<brief summary of what you did>",
  "files_changed": ["list", "of", "files"]
}
```
IMPORTANT: The file MUST be at exactly `.codepoet/stories/2eaf5964-4b4b-4095-adc0-53202aa5a8c0/done.json`.
Do NOT create this file until you are fully done.
Do NOT perform any git operations (no git add, commit, or push).