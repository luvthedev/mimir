# Task: Generate valid LangChain TypeScript code from visual workflows

## Description
Build the code generation system that converts visual workflows into executable LangChain TypeScript code. Implement template-based generation for each node type and connection validation before code output.

## Acceptance Criteria
- Generated code compiles without TypeScript errors
- Generated code includes all necessary LangChain imports and configurations
- Node execution order in generated chain matches visual connection order
- Generated code includes error handling and logging for debugging
- Code generation completes in under 500ms for workflows with 50+ nodes

## Implementation Notes
- Create CodeGenerator service with method generateCode(workflow: Workflow): Promise<string> that validates workflow, generates imports, node code, and chain assembly
- Implement nodeTemplates.ts with template functions for each node type: generateUploadNode, generateExtractNode, generateTransformNode, generateOutputNode, each returning TypeScript code string
- Create chainTemplates.ts with function generateChain(nodes: WorkflowNode[], connections: WorkflowConnection[]): string that assembles nodes into LangChain chain using .pipe() or .chain() based on connection order
- Implement topological sort in codeGenerator to order nodes correctly for chain assembly, detecting cycles and throwing validation errors
- Add codeFormatting utility with functions: formatImports (deduplicates and sorts), formatVariableNames (converts node IDs to camelCase), addComments (inserts JSDoc for each node)
- Generate code with proper error handling: try-catch blocks around LLM calls, logging for debugging, following existing error handling patterns from src/
- Include generated code header with timestamp, workflow ID, and warning that manual edits break visual sync

## When You're Done
When you have completed all acceptance criteria, create the file `.codepoet/stories/edb4fca9-bbfe-4a1b-a325-282afb3125b9/done.json` with this exact structure:
```json
{
  "status": "completed",
  "summary": "<brief summary of what you did>",
  "files_changed": ["list", "of", "files"]
}
```
IMPORTANT: The file MUST be at exactly `.codepoet/stories/edb4fca9-bbfe-4a1b-a325-282afb3125b9/done.json`.
Do NOT create this file until you are fully done.
Do NOT perform any git operations (no git add, commit, or push).