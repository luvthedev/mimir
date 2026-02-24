# Task: Define workflow schema and persistence layer for visual editor state

## Description
Establish the core data structures for representing visual workflows, including node definitions, connections, and metadata. Create database schema and TypeScript interfaces to persist and retrieve workflow configurations.

## Acceptance Criteria
- Workflows can be created, retrieved, updated, and deleted from the database with all metadata preserved
- Workflow nodes and connections are stored with their positions, types, and configurations intact
- TypeScript interfaces enforce type safety for workflow objects throughout the codebase
- Database queries for retrieving workflows by user and workflow ID execute in under 100ms

## Implementation Notes
- Create WorkflowNode interface with id, type (upload|extract|transform|output), position (x, y), config object, and metadata fields in src/types/workflow.ts
- Create WorkflowConnection interface with sourceNodeId, targetNodeId, sourcePort, targetPort for edge validation
- Create Workflow interface with id, name, description, nodes array, connections array, createdAt, updatedAt, userId
- Add workflows table with columns: id (uuid), userId (uuid), name (text), description (text), createdAt (timestamptz), updatedAt (timestamptz), isActive (boolean default true)
- Add workflow_nodes table with columns: id (uuid), workflowId (uuid FK), nodeType (text), position (jsonb), config (jsonb), metadata (jsonb), createdAt (timestamptz)
- Add workflow_connections table with columns: id (uuid), workflowId (uuid FK), sourceNodeId (uuid), targetNodeId (uuid), sourcePort (text), targetPort (text), createdAt (timestamptz)
- Implement WorkflowPersistenceService with async methods: createWorkflow, updateWorkflow, getWorkflowById, listWorkflows, deleteWorkflow using existing database connection pattern
- Add composite index on (workflowId, nodeType) in workflow_nodes and (workflowId, sourceNodeId, targetNodeId) in workflow_connections for query performance

## When You're Done
When you have completed all acceptance criteria, create the file `.codepoet/stories/a1a9abcb-95da-4664-8937-1beda45b563d/done.json` with this exact structure:
```json
{
  "status": "completed",
  "summary": "<brief summary of what you did>",
  "files_changed": ["list", "of", "files"]
}
```
IMPORTANT: The file MUST be at exactly `.codepoet/stories/a1a9abcb-95da-4664-8937-1beda45b563d/done.json`.
Do NOT create this file until you are fully done.
Do NOT perform any git operations (no git add, commit, or push).