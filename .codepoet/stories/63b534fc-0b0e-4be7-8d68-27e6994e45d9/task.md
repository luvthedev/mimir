# Task: Enable developers to export and use generated code externally

## Description
Add ability to export generated code as a standalone TypeScript file or npm package. Include configuration for export format, dependencies, and optional scaffolding for immediate execution.

## Acceptance Criteria
- Generated code can be exported as a single TypeScript file with all dependencies listed
- Exported code is immediately executable without additional configuration
- Package export includes package.json, tsconfig.json, and README with usage instructions
- Exported files can be imported into external TypeScript projects without modification
- Export process completes in under 2 seconds for typical workflows

## Implementation Notes
- Create ExportDialog.tsx component with options: export format (single file, npm package, GitHub gist), include dependencies checkbox, include tests checkbox, custom package name input
- Implement CodeExporter service with methods: exportAsFile (returns Blob), exportAsPackage (generates package.json, tsconfig.json, src/index.ts), exportAsGist (posts to GitHub API if token provided)
- Create packageTemplates.ts with functions: generatePackageJson (includes LangChain and required dependencies), generateTsConfig (strict TypeScript settings), generateReadme (documents generated workflow and usage)
- Implement file download using Blob and URL.createObjectURL, triggering browser download with appropriate filename (workflow-name-YYYY-MM-DD.ts or .zip)
- Add validation before export: check that workflow is valid, code generates without errors, all required dependencies are specified
- Include optional test scaffold generation with Vitest setup matching existing testing patterns from src/
- Add export history tracking: store export metadata (timestamp, format, filename) in workflow record for audit trail

## When You're Done
When you have completed all acceptance criteria, create the file `.codepoet/stories/63b534fc-0b0e-4be7-8d68-27e6994e45d9/done.json` with this exact structure:
```json
{
  "status": "completed",
  "summary": "<brief summary of what you did>",
  "files_changed": ["list", "of", "files"]
}
```
IMPORTANT: The file MUST be at exactly `.codepoet/stories/63b534fc-0b0e-4be7-8d68-27e6994e45d9/done.json`.
Do NOT create this file until you are fully done.
Do NOT perform any git operations (no git add, commit, or push).