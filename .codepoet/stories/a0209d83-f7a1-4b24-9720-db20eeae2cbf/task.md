# Task: Build interactive drag-and-drop canvas for workflow construction

## Description
Create the React-based visual editor UI with drag-and-drop node placement, connection drawing, and real-time validation. Implement node palette, canvas rendering, and connection validation logic.

## Acceptance Criteria
- Users can drag nodes from the palette onto the canvas and position them freely
- Nodes can be connected by drawing lines between ports, with visual feedback for valid/invalid connections
- Invalid connections (e.g., output to upload, cycles) are prevented with clear error messages
- The canvas remains responsive with 20+ nodes without noticeable lag
- Workflow state persists in React component memory during editing session

## Implementation Notes
- Create WorkflowEditor.tsx as main container component managing workflow state, canvas interactions, and node/connection updates using useState and useCallback
- Implement Canvas.tsx using SVG for rendering nodes and connections with mouse event handlers for drag-start, drag-over, drop, and connection drawing
- Create NodePalette.tsx displaying draggable node types (upload, extract, transform, output) with icons and descriptions, using HTML5 drag API
- Implement WorkflowNode.tsx as draggable component with position state, config panel toggle, and visual feedback for selection and validation errors
- Create ConnectionLine.tsx rendering SVG paths between nodes with validation state styling (valid=green, invalid=red, pending=yellow)
- Implement useWorkflowEditor hook managing workflow state, node/connection CRUD operations, and validation state using useReducer for complex state management
- Create workflowValidation.ts utility with functions: isValidConnection (checks node types, prevents cycles), validateWorkflow (ensures all nodes connected, no orphans), getConnectionErrors (returns user-friendly error messages)
- Add real-time validation on every node placement and connection attempt, preventing invalid states before they occur

## When You're Done
When you have completed all acceptance criteria, create the file `.codepoet/stories/a0209d83-f7a1-4b24-9720-db20eeae2cbf/done.json` with this exact structure:
```json
{
  "status": "completed",
  "summary": "<brief summary of what you did>",
  "files_changed": ["list", "of", "files"]
}
```
IMPORTANT: The file MUST be at exactly `.codepoet/stories/a0209d83-f7a1-4b24-9720-db20eeae2cbf/done.json`.
Do NOT create this file until you are fully done.
Do NOT perform any git operations (no git add, commit, or push).