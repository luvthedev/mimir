# Task: Implement template service with discovery, validation, and parameter resolution

## Description
Create a service layer that manages template discovery, loading, validation, and parameterization. This service will be the central point for accessing templates throughout the application.

## Acceptance Criteria
- TemplateService successfully loads and caches all templates on startup
- listTemplates() returns templates filtered by category (invoice, pdf-conversion, contract-summarization)
- applyParameters() validates user inputs against parameter constraints and rejects invalid values
- Service handles missing templates gracefully with descriptive error messages

## Implementation Notes
- Create TemplateService class in src/services/template.service.ts with methods: loadTemplate(id), listTemplates(category?), getTemplateMetadata(id), and applyParameters(template, params)
- Implement loadTemplate() using existing template loader, with try-catch error handling and console.error logging for missing templates
- Add listTemplates() method returning filtered array of templates by optional category, supporting discovery by use case
- Create validateTemplate() function in src/templates/validator.ts using JSON Schema validation against templates/schema.json
- Implement applyParameters() in src/templates/parameterizer.ts that substitutes template parameters with user-provided values, validating against parameter constraints
- Add caching layer in TemplateService using Map<string, IDocumentTemplate> to avoid repeated file reads during runtime
- Export TemplateService singleton instance from src/services/index.ts following existing service export pattern

## When You're Done
When you have completed all acceptance criteria, create the file `.codepoet/stories/1f6e0f72-f19c-4d17-813a-287c1fac054a/done.json` with this exact structure:
```json
{
  "status": "completed",
  "summary": "<brief summary of what you did>",
  "files_changed": ["list", "of", "files"]
}
```
IMPORTANT: The file MUST be at exactly `.codepoet/stories/1f6e0f72-f19c-4d17-813a-287c1fac054a/done.json`.
Do NOT create this file until you are fully done.
Do NOT perform any git operations (no git add, commit, or push).