---
version: "2.0"
---

# Intelligence

## Tech Stack
- **tech_stack**: TypeScript, Node.js, LangChain, Model Context Protocol, Go, React, VSCode Extension API
- **primary_language**: TypeScript
- **detected_files**: package.json, package-lock.json
- **rationale**: The package.json reveals this is a monorepo with TypeScript as the primary language (25% of codebase). The project is named 'mimir' and is an MCP (Model Context Protocol) server combining TODO tracking with Graph-RAG for AI agents. Key evidence: (1) package.json shows TypeScript compilation ('tsc' build script), (2) Dependencies include @langchain/core, @langchain/community, @langchain/langgraph, @langchain/openai, and @modelcontextprotocol/sdk - indicating LLM integration and MCP protocol support, (3) Monorepo structure with 'frontend' and 'vscode-extension' workspaces suggests React frontend and VSCode extension, (4) Authentication dependencies (@types/passport, jsonwebtoken, cookie-parser, express-session) indicate Express.js backend, (5) Go represents 62.6% of codebase likely for performance-critical components or CLI tools (bin entries: mimir, mimir-chain, mimir-execute). The project is a hybrid TypeScript/Go system with Node.js backend and multiple client interfaces.
- **alternatives_rejected**: {'language': 'Python', 'reason': 'Only 2.8% of codebase is Python; no requirements.txt or pyproject.toml found. Python dependencies are only in LangChain integrations, not primary language'}, {'language': 'Go', 'reason': 'While Go represents 62.6% of code, no go.mod file provided. Go appears to be used for CLI tools and performance components, not the primary application logic which is TypeScript/Node.js'}, {'language': 'JavaScript', 'reason': 'Only 2.2% of codebase; TypeScript is the compiled superset being used instead, as evidenced by tsc build script and .ts file compilation'}, {'language': 'C++', 'reason': '2.2% of codebase; likely native bindings or performance optimizations, not primary language'}
- **confidence**: 0.92

## Coding Patterns
- **error_handling**: Try-catch blocks with console logging and error propagation through promise rejection/resolution chains
- **testing_patterns**: Vitest framework with vi.mock for mocking dependencies, beforeEach/afterEach lifecycle hooks, and expect assertions
- **async_patterns**: Async/await with Promise-based queue processing, async generators for streaming responses, and session-based connection management
- **file_organization**: Modular structure with src/ for source code, separate directories for tools, api routes, managers, middleware, and config; scripts/ for utilities; testing/ for tests; language-specific organization (Go packages, Python modules)
- **code_style**: TypeScript with strict typing (interfaces, generics), JSDoc comments for documentation, environment variable configuration, camelCase naming, and descriptive function/variable names

## Key Utilities
*(No key utilities identified yet. These will populate as you build stories.)*

---

# Evolution

## Story: Phase 1: Design workflow data model and persistence layer (completed 2026-02-24T20:42:06Z)
- **Learned**: No implementation completed - story was marked done without creating workflow schema or persistence layer for visual editor state

## Story: Phase 2: Build visual editor React component with drag-and-drop (completed 2026-02-24T20:55:19Z)
- **Learned**: No implementation was completed - the story for building an interactive drag-and-drop canvas for workflow construction was not executed

## Story: Phase 3: Implement workflow code generation engine (completed 2026-02-24T21:09:42Z)
- **Learned**: No files were created or modified; the story did not produce any deliverables

## Story: Phase 5: Implement code export and download functionality (completed 2026-02-24T21:24:47Z)
- **Learned**: No implementation was completed - story was marked done with zero files created or modified

## Story: Phase 8: Add workflow templates and pre-built component library (completed 2026-02-24T21:49:12Z)
- **Learned**: No implementation was completed - story shows 0 files created/modified with no measurable progress metrics
