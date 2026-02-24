# Task: Accelerate workflow creation with templates and reusable components

## Description
Create a library of pre-built workflow templates for common document processing tasks (invoice extraction, contract analysis, form processing). Enable users to start from templates and customize them.

## Acceptance Criteria
- Template gallery displays at least 3 pre-built workflow templates
- Users can create new workflows from templates in one click
- Template workflows are immediately deployable without modification
- Template workflows produce correct output for their intended document types
- Users can customize templates by adding/removing nodes and connections

## Implementation Notes
- Create TemplateGallery.tsx component displaying available templates with preview, description, and 'Use Template' button
- Implement WorkflowTemplates service with method createWorkflowFromTemplate(templateId: string, userId: string): Promise<Workflow> that clones template and assigns to user
- Define template JSON structure with fields: id, name, description, category, nodes array, connections array, requiredApiKeys, estimatedCost
- Create invoice extraction template with nodes: upload → extract (configured for invoice fields) → transform (format currency, dates) → output (JSON structure)
- Create contract analysis template with nodes: upload → extract (contract clauses, dates, parties) → transform (risk assessment) → output (summary)
- Create form processing template with nodes: upload → extract (form fields) → transform (validation, normalization) → output (structured data)
- Add template preview functionality showing workflow diagram without editing capability

## When You're Done
When you have completed all acceptance criteria, create the file `.codepoet/stories/dda2fd81-77ce-441b-b8b9-5cad142e3db9/done.json` with this exact structure:
```json
{
  "status": "completed",
  "summary": "<brief summary of what you did>",
  "files_changed": ["list", "of", "files"]
}
```
IMPORTANT: The file MUST be at exactly `.codepoet/stories/dda2fd81-77ce-441b-b8b9-5cad142e3db9/done.json`.
Do NOT create this file until you are fully done.
Do NOT perform any git operations (no git add, commit, or push).