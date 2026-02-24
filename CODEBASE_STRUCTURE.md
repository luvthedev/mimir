# Codebase Structure & Analysis Summary

## 1. PROJECT TYPE & TECH STACK

### Project: Mimir - Agent Orchestration Platform
- **Description**: A comprehensive multi-agent task execution framework with visual workflow editor and Neo4j persistence
- **Type**: Monorepo with Node.js backend (MCP Server), React frontend, and VSCode extension

### Core Tech Stack:
- **Backend**: Node.js + TypeScript (ES2022, module system)
- **Frontend**: React 18.3.1 + TypeScript + Vite
- **UI Framework**: 
  - TailwindCSS 3.4.13 for styling
  - ReactFlow 11.11.4 for workflow visualization
  - React DnD 16.0.1 for drag-and-drop
  - Zustand 4.5.2 for state management
- **Database**: Neo4j (graph database via neo4j-driver 6.0.0)
- **APIs**: 
  - Express 5.1.0 for REST/HTTP server
  - @modelcontextprotocol/sdk for MCP server integration
  - LangChain for agent orchestration
- **Testing**: Vitest 3.2.4 with coverage
- **Build Tools**: Vite 7.2.2, TypeScript 5.x, esbuild
- **Dependency Management**: npm workspaces (frontend, vscode-extension)

---

## 2. DIRECTORY STRUCTURE

### Root Level
```
/
├── bin/                      # CLI scripts & binaries
├── config/                   # Configuration files (RBAC, etc.)
├── deliverables/             # Output artifacts directory
├── docker/                   # Docker service definitions
├── docs/                     # Documentation
├── examples/                 # Example workflows & JSON files
├── frontend/                 # React frontend (workspace)
├── generated-agents/         # Auto-generated agent templates
├── nornicdb/                 # Custom graph database implementation
├── pipelines/                # Data processing pipelines
├── scripts/                  # Utility & setup scripts
├── src/                      # Backend source code
├── testing/                  # Test suites & benchmarks
├── tools/                    # Utility tools
├── vscode-extension/         # VSCode Extension (workspace)
├── package.json              # Root workspace config
├── tsconfig.json             # Root TypeScript config
├── vite.config.ts            # Backend build config
├── vitest.config.ts          # Test configuration
└── docker-compose.yml        # Service orchestration
```

### Backend: /src Directory
```
/src/
├── api/
│   ├── orchestration/        # Workflow execution APIs
│   │   ├── workflow-executor.ts    # Main execution engine
│   │   ├── persistence.ts          # Neo4j persistence helpers
│   │   └── sse.js                  # Server-sent events
│   └── ...
├── config/                   # Configuration management
├── indexing/                 # File indexing system
├── managers/
│   ├── WorkflowPersistenceService.ts    # CRUD for visual workflows
│   └── ...
├── middleware/               # Express middleware
├── orchestrator/             # Task execution & orchestration
│   ├── task-executor.ts      # Agent task execution
│   ├── lambda-executor.ts    # Lambda/transformer execution
│   ├── cancellation.ts       # Execution cancellation tokens
│   └── ...
├── tools/                    # Tool definitions & graph tools
├── types/
│   ├── workflow.ts           # Workflow schema types
│   ├── index.ts              # Type exports
│   └── ...
├── utils/                    # Utility functions
├── http-server.ts            # HTTP server entry point
└── index.ts                  # MCP server entry point
```

### Frontend: /frontend/src Directory
```
/frontend/src/
├── components/               # React components
│   ├── WorkflowGraph.tsx     # ReactFlow visualization component
│   ├── TaskCanvas.tsx        # Canvas for task arrangement
│   ├── TaskCard.tsx          # Individual task display
│   ├── TaskEditor.tsx        # Task editing panel
│   ├── AgentPalette.tsx      # Agent template palette (drag-source)
│   ├── LambdaPalette.tsx     # Lambda palette (drag-source)
│   ├── ImportWorkflowModal.tsx       # Workflow import dialog
│   ├── CreateAgentModal.tsx  # Agent creation dialog
│   ├── ParallelGroupContainer.tsx    # Parallel group UI
│   └── ...
├── pages/                    # Page components
│   ├── Portal.tsx            # Landing/dashboard page
│   ├── Studio.tsx            # Main orchestration UI
│   └── Login.tsx             # Authentication page
├── store/
│   └── planStore.ts          # Zustand state management
├── types/
│   └── task.ts               # Frontend task type definitions
├── utils/
│   └── api.ts                # API client with error handling
├── App.tsx                   # Router & app structure
├── main.tsx                  # React entry point
└── index.css                 # Global styles
```

---

## 3. DEPENDENCIES & PACKAGE.JSON

### Root Package.json Key Scripts
```json
{
  "scripts": {
    "build": "tsc",                         // Build backend
    "build:frontend": "npm run build --workspace=frontend",
    "build:vscode": "npm run compile --workspace=vscode-extension",
    "build:all": "npm run build && npm run build:frontend && npm run build:vscode",
    "start": "node ./scripts/start.js up --force-recreate",
    "start:mcp": "node build/index.js",
    "start:http": "node build/http-server.js",
    "workflow": "node --env-file=.env bin/run-workflow.mjs",
    "test": "npx vitest run",
    "test:coverage": "npx vitest run --coverage"
  },
  "dependencies": {
    "@langchain/community": "^1.0.3",
    "@langchain/langgraph": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.20.1",
    "neo4j-driver": "^6.0.0",
    "express": "^5.1.0",
    "graphology": "^0.26.0",
    "zod": "^4.1.12"
  },
  "workspaces": ["frontend", "vscode-extension"]
}
```

### Frontend Package.json Key Dependencies
```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.9.6",
    "reactflow": "^11.11.4",
    "react-dnd": "^16.0.1",
    "zustand": "^4.5.2",
    "tailwindcss": "^3.4.13",
    "lucide-react": "^0.446.0",
    "clsx": "^2.1.1"
  }
}
```

---

## 4. EXISTING WORKFLOW-RELATED CODE

### Backend Workflow Schema (src/types/workflow.ts)
```typescript
// Core types for visual editor state persistence
- Workflow: Complete workflow with id, userId, name, description, nodes, connections
- WorkflowNode: Individual processing step (upload, extract, transform, output)
- WorkflowConnection: Edge between nodes with source/target ports
- Input Types: CreateWorkflowInput, UpdateWorkflowInput for CRUD operations
```

**Key Features**:
- UUID-based identifiers for all entities
- Soft-delete support (isActive flag)
- Timestamps (createdAt, updatedAt)
- Generic config/metadata objects for extensibility
- Port-based connection system

### Backend Persistence Layer (src/managers/WorkflowPersistenceService.ts)
```typescript
// Neo4j-backed CRUD operations
- createWorkflow(input): Create workflow with nodes/connections
- getWorkflowById(id): Fetch complete workflow
- listWorkflows(userId): List user's workflows
- updateWorkflow(id, input): Update with full replacement strategy
- deleteWorkflow(id): Soft-delete
```

**Neo4j Schema**:
- Labels: Workflow, WorkflowNode, WorkflowConnection
- Relationships: HAS_NODE, HAS_CONNECTION (parent → child)
- Properties: Stored as JSON strings for complex objects

### Workflow Execution Engine (src/api/orchestration/workflow-executor.ts)
```typescript
// Main orchestration function
- executeWorkflowFromJSON(uiTasks, executionId, graphManager)
  - Converts UI tasks to TaskDefinition format
  - Generates agent preambles (worker + QC)
  - Groups tasks by parallel execution
  - Executes with rate limiting & SSE updates
  - Persists execution to Neo4j
  - Collects deliverables

// Task Execution
- executeAgentTask(): Run LLM agent with QC verification
- executeTransformerTask(): Execute Lambda/transformer scripts
- executeTaskGroup(): Run tasks in parallel

// Features
- Parallel task execution with rate limiting
- Dependency injection (prev task output → next task input)
- QC verification loops with retry logic
- Real-time SSE updates to frontend
- Cancellation token support
- Neo4j execution tracking
```

---

## 5. TYPESCRIPT/JAVASCRIPT CONFIGURATION

### Backend tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "**/*.example.ts"]
}
```

### Frontend tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src"]
}
```

---

## 6. EXISTING COMPONENT PATTERNS

### Frontend Component Patterns

#### 1. **State Management Pattern (Zustand Store)**
- Located in: `frontend/src/store/planStore.ts`
- Manages: Tasks, parallel groups, agents, lambdas, execution state
- Persists to: SessionStorage with keys WORKFLOW_STATE, EXECUTION_STATE
- Methods: updateTask(), addTask(), deleteTask(), setSelectedTask(), etc.

#### 2. **React Flow Visualization Pattern (WorkflowGraph.tsx)**
```typescript
// Custom node types
- TaskNode: Agent task visualization with drop zones for worker/QC agents
- TransformerNode: Lambda transformer visualization

// Features
- Status styling (pending/executing/completed/failed)
- Execution status icons
- Parallel group badges
- Drag-and-drop agent assignment
- Auto-layout with DAG topological sort
- MiniMap + Controls
- Legend panel (collapsible)
```

#### 3. **Drag-and-Drop Pattern**
- AgentPalette: Drag source for worker/QC agents
- LambdaPalette: Drag source for Lambda scripts
- Task nodes act as drop targets
- Uses react-dnd with HTML5 backend

#### 4. **Modal Dialog Pattern**
- Components: ErrorModal, ConfirmDeleteModal, CreateAgentModal, ImportWorkflowModal
- Uses React state with isOpen flag
- Overlay background with centered content
- Keyboard support (ESC to close)

#### 5. **Execution Tracking Pattern**
- ExecutionState interface with status, taskStatuses, results
- Real-time SSE events (execution-start, task-start, task-complete, execution-complete)
- Task execution status: pending → executing → completed|failed
- Parallel group execution support

#### 6. **Color Theme Pattern**
- Custom Tailwind colors: norse-night, norse-stone, frost-ice, valhalla-gold, magic-rune
- Status colors: yellow (executing), green (completed), red (failed), gray (pending)
- Semantic color usage throughout

---

## 7. BACKEND WORKFLOW SCHEMA (Detailed)

### Workflow Type Definition
```typescript
interface Workflow {
  id: string;                          // UUID
  userId: string;                      // Owner UUID
  name: string;                        // Human-readable name
  description: string;                 // Optional description
  nodes: WorkflowNode[];               // Processing steps
  connections: WorkflowConnection[];   // Data flow edges
  isActive: boolean;                   // Soft-delete flag
  createdAt: string;                   // ISO 8601
  updatedAt: string;                   // ISO 8601
}

interface WorkflowNode {
  id: string;                          // UUID
  workflowId: string;                  // Parent workflow UUID
  type: 'upload' | 'extract' | 'transform' | 'output';
  position: { x: number; y: number };  // Canvas coordinates
  config: Record<string, any>;         // Type-specific config
  metadata: Record<string, any>;       // Labels, descriptions, styling
  createdAt: string;                   // ISO 8601
}

interface WorkflowConnection {
  id: string;                          // UUID
  workflowId: string;                  // Parent workflow UUID
  sourceNodeId: string;                // UUID
  targetNodeId: string;                // UUID
  sourcePort: string;                  // Output port name
  targetPort: string;                  // Input port name
  createdAt: string;                   // ISO 8601
}
```

### Neo4j Query Examples
```cypher
// Create workflow with nodes and connections (transactional)
CREATE (w:Workflow { id, userId, name, description, isActive, createdAt, updatedAt })
CREATE (wn:WorkflowNode { id, workflowId, nodeType, position, config, metadata, createdAt })
CREATE (wc:WorkflowConnection { id, workflowId, sourceNodeId, targetNodeId, sourcePort, targetPort, createdAt })
CREATE (w)-[:HAS_NODE]->(wn)
CREATE (w)-[:HAS_CONNECTION]->(wc)

// Retrieve workflow
MATCH (w:Workflow {id: $id})
MATCH (w)-[:HAS_NODE]->(wn:WorkflowNode)
MATCH (w)-[:HAS_CONNECTION]->(wc:WorkflowConnection)
RETURN w, wn, wc

// List user's workflows
MATCH (w:Workflow {userId: $userId})
WHERE w.isActive = true
RETURN w ORDER BY w.updatedAt DESC
```

---

## 8. FRONTEND TASK TYPE DEFINITION

### Task Types (src/types/task.ts)
```typescript
// Base properties shared by all tasks
interface BaseTask {
  id: string;
  title: string;
  dependencies: string[];          // Task IDs this task depends on
  parallelGroup: number | null;    // Execution grouping
  position?: { x: number; y: number };  // Canvas position
  order?: number;                   // Execution order
  executionStatus?: TaskExecutionStatus;  // Runtime status
}

// Agent Task - runs worker + QC agents
interface AgentTask extends BaseTask {
  taskType: 'agent';
  agentRoleDescription: string;     // Worker role description
  workerPreambleId?: string;        // Reference to worker preamble
  recommendedModel: string;
  prompt: string;                   // Task prompt for agent
  context?: string;
  toolBasedExecution?: string;
  successCriteria: string[];
  estimatedDuration: string;
  estimatedToolCalls: number;
  qcRole: string;                   // QC agent role description
  qcPreambleId?: string;            // Reference to QC preamble
  verificationCriteria: string[];   // Criteria for QC verification
  maxRetries: number;               // QC retry limit
}

// Transformer Task - runs Lambda scripts
interface TransformerTask extends BaseTask {
  taskType: 'transformer';
  lambdaId?: string;                // Reference to Lambda (undefined = pass-through)
  description?: string;             // What transformer does
  inputMapping?: string;            // JSONPath for input selection
  outputMapping?: string;           // JSONPath for output shaping
  lambdaScript?: string;            // Actual code (resolved at runtime)
  lambdaLanguage?: 'typescript' | 'javascript' | 'python';
  lambdaName?: string;              // For logging
}

// Union type
type Task = AgentTask | TransformerTask;

// Type guards
isAgentTask(task: Task): task is AgentTask
isTransformerTask(task: Task): task is TransformerTask
```

### Lambda Type Definition
```typescript
interface Lambda {
  id: string;
  name: string;
  description: string;
  language: 'typescript' | 'python' | 'javascript';
  script: string;                   // Actual code
  version: string;
  created: string;
  inputSchema?: string;             // Optional schema hints
  outputSchema?: string;
}
```

---

## 9. EXECUTION FLOW OVERVIEW

### UI to Execution Flow:
1. **Frontend**: User builds workflow in Studio
   - Drags tasks, connects dependencies
   - Assigns agents to tasks (worker + QC)
   - Assigns lambdas to transformers
   - Stores in planStore (Zustand)

2. **Frontend**: User clicks "Execute"
   - Exports tasks as JSON
   - Sends to backend via API
   - Displays SSE updates in real-time

3. **Backend**: Execution Engine (workflow-executor.ts)
   - Converts UI tasks to TaskDefinition format
   - Generates preambles for each agent role
   - Groups tasks by parallelGroup for parallel execution
   - Creates execution node in Neo4j

4. **Backend**: Task Execution
   - For agent tasks: executeAgentTask()
     - Injects dependency outputs into prompt
     - Calls LangChain with preamble
     - Runs QC verification loop
     - Stores output in taskOutputsRegistry
   - For transformer tasks: executeTransformerTask()
     - Builds LambdaInput from dependencies
     - Executes Lambda script
     - Stores output in taskOutputsRegistry

5. **Backend**: Persistence & Updates
   - Persists execution node to Neo4j
   - Persists task_execution nodes to Neo4j
   - Sends SSE events for real-time UI updates
   - Collects deliverables

6. **Frontend**: Displays Results
   - Updates task status in UI
   - Shows execution summary
   - Downloads deliverables (markdown files)

---

## 10. KEY ARCHITECTURAL PATTERNS

### 1. **Persistence Service Pattern**
```typescript
class WorkflowPersistenceService {
  // CRUD operations backed by Neo4j
  // Transactional for consistency
  // Soft-delete support
}
```

### 2. **Execution State Management**
```typescript
// Global registries
executionStates: Map<executionId, ExecutionState>
taskOutputsRegistry: Map<executionId, Map<taskId, TaskOutputs>>

// Allows tracking progress and inter-task data flow
```

### 3. **Cancellation Token Pattern**
```typescript
// Support for stopping execution mid-flight
createCancellationToken(executionId)
getCancellationToken(executionId)
cleanupCancellationToken(executionId)
```

### 4. **SSE (Server-Sent Events) Pattern**
```typescript
sendSSEEvent(executionId, eventType, data)
// Events: execution-start, task-start, task-complete, 
//         task-fail, agent-chatter, execution-complete, execution-cancelled
```

### 5. **Dependency Injection Pattern**
```typescript
// Previous task output → Next task input
// For agent tasks: Inject into prompt (placeholder or prepend)
// For transformer tasks: Build unified LambdaInput with all dependencies
```

### 6. **Parallel Execution with Rate Limiting**
```typescript
// Group tasks by parallelGroup number
// Execute groups sequentially, tasks within group in parallel
// RateLimiter ensures concurrent requests don't exceed API limits
```

---

## 11. RECENT GIT COMMITS (Workflow Schema Development)

### Recent Commits:
```
6c9c970 - Merge: Define workflow schema and persistence layer for visual editor state
7e30492 - Implement: Define workflow schema and persistence layer for visual editor state
01c0203 - Update chat file
2d6b25b - Merge: fixing lambda views and importing
5bf0ed8 - Fixing lambda views and importing
```

The most recent work (commit 7e30492) specifically implemented:
- Workflow type definitions (Workflow, WorkflowNode, WorkflowConnection)
- WorkflowPersistenceService with full CRUD operations
- Neo4j persistence layer with HAS_NODE and HAS_CONNECTION relationships
- Input/output types for create/update operations
- Soft-delete support for workflows

---

## 12. CODE STYLE & CONVENTIONS

### TypeScript
- Strict mode enabled (strict: true)
- ESM modules (type: "module")
- Comprehensive JSDoc comments with @param, @returns, @example
- Interface-based design over classes (where applicable)
- Union types for flexibility (Task = AgentTask | TransformerTask)

### React Components
- Functional components with hooks
- Custom hooks for business logic
- Tailwind CSS for all styling (no CSS modules)
- Semantic HTML with ARIA attributes where needed
- Status-driven rendering (executing/completed/failed states)

### State Management
- Zustand for global state (no Redux)
- SessionStorage for persistence
- Zustand middleware for logger integration

### Error Handling
- ApiError interface with title, message, details
- Global error state in store
- Error modal component for user feedback
- Try/catch with graceful fallbacks

---

## 13. BUILD & DEPLOYMENT

### Build Process
```bash
# Backend
npm run build              # tsc -> ./build/

# Frontend
npm run build:frontend     # vite build -> ./frontend/dist/

# Full build
npm run build:all          # All three

# Docker
npm run mimir:build        # Docker build -t timothyswt/mimir-server:latest
```

### Development
```bash
# Frontend dev server
npm run dev              # Vite on port 5173 (proxies /api to http://localhost:9042)

# Backend HTTP server
npm start:http           # Express on port 9042

# Backend MCP server
npm start:mcp            # MCP protocol server
```

### Docker Services (docker-compose.yml)
- mimir-server (Node.js HTTP server)
- neo4j (Graph database)
- nornicdb (Custom graph DB)
- open-webui (LLM WebUI)
- ollama (Local LLM inference)

---

## SUMMARY

This is a sophisticated **multi-agent orchestration platform** with:
- **Visual workflow editor** built with React + ReactFlow
- **Task execution engine** with parallel execution, QC verification, and Lambda transformers
- **Neo4j persistence** for both editor state and execution telemetry
- **Real-time SSE updates** for execution progress
- **Comprehensive type safety** with TypeScript + Zod validation
- **Modular architecture** with clear separation of concerns
- **Drag-and-drop UI** for building workflows without code

The codebase is well-organized, thoroughly documented, and follows established patterns for React/Node.js development. The recent commits show active development of the visual workflow schema and persistence layer.
