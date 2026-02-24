import { useState, useEffect, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { usePlanStore } from '../store/planStore';
import type { ExportHistoryEntry } from '../store/planStore';
import { AgentTemplate, AgentTask, Lambda, TransformerTask } from '../types/task';
import { WorkflowGraph } from './WorkflowGraph';
import { Download, Play, ListPlus, FileDown, XCircle, ArrowRightLeft, Upload, Code } from 'lucide-react';
import { ImportWorkflowModal } from './ImportWorkflowModal';
import { ExportDialog } from './ExportDialog';
import type { ExportResult } from '../services/codeExporter';

// Wrapper to catch agent/lambda drops in graph view
function GraphDropWrapper({ isExecuting }: { isExecuting: boolean }) {
  const { addTask } = usePlanStore();
  
  const [{ isOver, isOverLambda }, dropRef] = useDrop(() => ({
    accept: ['agent', 'lambda'],
    // Handle drops on the graph background
    drop: (item: AgentTemplate | Lambda, monitor) => {
      // Only intercept if no nested zone handled it
      if (monitor.didDrop()) {
        return undefined;
      }
      
      const itemType = monitor.getItemType();
      
      if (itemType === 'lambda') {
        // Lambda dropped on graph background - create new transformer
        const lambda = item as Lambda;
        const newTransformer: TransformerTask = {
          id: `transformer-${Date.now()}`,
          taskType: 'transformer',
          title: `${lambda.name} Transform`,
          description: lambda.description,
          lambdaId: lambda.id,
          dependencies: [],
          parallelGroup: null,
        };
        addTask(newTransformer);
        console.log('Lambda dropped on graph - created transformer:', newTransformer.title);
      } else {
        // Agent dropped on graph background - ignore (must drop on task node to assign)
        console.log('Agent dropped on graph background - ignored (drop on a task node to assign)');
      }
      
      return undefined;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      isOverLambda: monitor.isOver({ shallow: true }) && monitor.getItemType() === 'lambda',
    }),
  }), [addTask]);

  return (
    <div 
      ref={dropRef}
      className={`flex-1 min-h-0 rounded-lg overflow-hidden border transition-all ${
        isOverLambda ? 'border-violet-500/50 bg-violet-950/10' : 
        isOver ? 'border-valhalla-gold/50 bg-valhalla-gold/5' : 'border-norse-rune'
      }`}
    >
      <WorkflowGraph isExecuting={isExecuting} />
    </div>
  );
}

export function TaskCanvas() {
  const { 
    tasks, 
    parallelGroups, 
    addTask,
    addTransformer,
    agentTemplates, 
    lambdas,
    projectPlan,
    updateTaskExecutionStatus,
    setActiveExecution,
    setExecutionResults,
    isExecuting,
    activeExecutionId,
  } = usePlanStore();
  
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [completedExecutionId, setCompletedExecutionId] = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<Array<{ filename: string; size: number; mimeType: string }>>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  const { addExportRecord } = usePlanStore();
  
  // Reconnect to SSE on mount if there's an active execution
  useEffect(() => {
    if (activeExecutionId && activeExecutionId !== 'starting' && !currentExecutionId) {
      console.log('🔄 Page loaded with active execution - reconnecting to SSE:', activeExecutionId);
      setCurrentExecutionId(activeExecutionId);
    }
  }, []); // Run once on mount

  // Export JSON handler
  const handleExportJSON = () => {
    // Export only the necessary data (tasks, parallelGroups, agentTemplates)
    // Don't duplicate data that's already in projectPlan
    const exportData = {
      overview: projectPlan?.overview,
      tasks,
      parallelGroups,
      agentTemplates,
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Generate code and open export dialog
  const handleExportCode = useCallback(async () => {
    if (tasks.length === 0) return;

    setIsGeneratingCode(true);
    try {
      const response = await fetch('/api/workflows/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tasks,
          parallelGroups,
          projectPlan,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.code) {
          setGeneratedCode(result.code);
          setIsExportDialogOpen(true);
        } else {
          // If backend doesn't return code, generate a placeholder
          // that includes the workflow structure
          const placeholder = generateFallbackCode();
          setGeneratedCode(placeholder);
          setIsExportDialogOpen(true);
        }
      } else {
        // Fall back to client-side code representation
        const fallback = generateFallbackCode();
        setGeneratedCode(fallback);
        setIsExportDialogOpen(true);
      }
    } catch {
      // Generate a fallback representation if API is unavailable
      const fallback = generateFallbackCode();
      setGeneratedCode(fallback);
      setIsExportDialogOpen(true);
    } finally {
      setIsGeneratingCode(false);
    }
  }, [tasks, parallelGroups, projectPlan]);

  // Generate fallback code when the API endpoint is not available
  const generateFallbackCode = useCallback((): string => {
    const timestamp = new Date().toISOString();
    const workflowName = projectPlan?.overview?.goal || 'Workflow';
    const safeName = workflowName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');

    const taskSetup = tasks.map((task, i) => {
      if (task.taskType === 'transformer') {
        return `  // Step ${i + 1}: ${task.title} (Transformer)
  console.log('Running transformer: ${task.title}');
  // Lambda: ${task.lambdaName || 'pass-through'}
  const step${i + 1}Result = await transformStep('${task.id}', ${i > 0 ? `step${i}Result` : "''"});`;
      }
      return `  // Step ${i + 1}: ${task.title} (Agent)
  console.log('Running agent task: ${task.title}');
  const step${i + 1}Result = await executeAgentTask({
    id: '${task.id}',
    title: '${task.title}',
    prompt: ${JSON.stringify(task.taskType === 'agent' ? task.prompt : '')},
    dependencies: ${JSON.stringify(task.dependencies)},
  });`;
    }).join('\n\n');

    return `/**
 * AUTO-GENERATED CODE - DO NOT EDIT MANUALLY
 *
 * Generated from workflow: ${workflowName}
 * Generated at: ${timestamp}
 * Tasks: ${tasks.length}
 *
 * WARNING: Manual edits to this file will break visual editor sync.
 * Edit the workflow in the visual editor and regenerate instead.
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

// ============================================================================
// Workflow: ${workflowName}
// ============================================================================

async function executeAgentTask(task: { id: string; title: string; prompt: string; dependencies: string[] }): Promise<string> {
  const model = new ChatOpenAI({ modelName: 'gpt-4', temperature: 0 });
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are an expert assistant.'],
    ['human', task.prompt || 'Complete the task: {title}'],
  ]);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  return await chain.invoke({ title: task.title });
}

async function transformStep(id: string, input: string): Promise<string> {
  console.log(\`[Transform \${id}] Processing...\`);
  return input;
}

export async function execute${safeName}Workflow(): Promise<any> {
  console.log('Starting workflow: ${workflowName}');
  const startTime = Date.now();

${taskSetup}

  const durationMs = Date.now() - startTime;
  console.log(\`Workflow completed in \${durationMs}ms\`);
  return step${tasks.length}Result;
}

// Run if executed directly
execute${safeName}Workflow()
  .then(result => console.log('Result:', result))
  .catch(error => console.error('Workflow failed:', error));
`;
  }, [tasks, projectPlan]);

  // Handle export completion for history tracking
  const handleExportComplete = useCallback((result: ExportResult) => {
    const entry: ExportHistoryEntry = {
      timestamp: result.timestamp,
      format: result.format,
      filename: result.filename,
      success: result.success,
      gistUrl: result.gistUrl,
    };
    addExportRecord(entry);
  }, [addExportRecord]);

  // SSE connection for real-time execution updates
  useEffect(() => {
    if (!currentExecutionId || currentExecutionId === 'starting') return;
    
    console.log(`📡 Connecting to SSE stream for execution ${currentExecutionId}`);
    const eventSource = new EventSource(`/api/execution-stream/${currentExecutionId}`);
    
    eventSource.addEventListener('init', (event) => {
      const data = JSON.parse(event.data);
      console.log('SSE init:', data);
    });
    
    eventSource.addEventListener('execution-start', (event) => {
      const data = JSON.parse(event.data);
      console.log('Execution started:', data);
      setActiveExecution(currentExecutionId, true);
    });
    
    eventSource.addEventListener('task-start', (event) => {
      const data = JSON.parse(event.data);
      console.log('🟡 Task started:', data.taskId, data);
      updateTaskExecutionStatus(data.taskId, 'executing');
      console.log('Updated task status to executing');
    });
    
    eventSource.addEventListener('task-complete', (event) => {
      const data = JSON.parse(event.data);
      console.log('🟢 Task completed:', data.taskId, data);
      updateTaskExecutionStatus(data.taskId, 'completed');
      console.log('Updated task status to completed');
    });
    
    eventSource.addEventListener('task-fail', (event) => {
      const data = JSON.parse(event.data);
      console.log('🔴 Task failed:', data.taskId, data);
      updateTaskExecutionStatus(data.taskId, 'failed');
      console.log('Updated task status to failed');
    });
    
    eventSource.addEventListener('agent-chatter', (event) => {
      const data = JSON.parse(event.data);
      console.group(`💬 Agent Chatter: ${data.taskTitle} (${data.taskId})`);
      if (data.preamble) {
        console.log(`📋 Preamble (truncated):\n${data.preamble}`);
      }
      if (data.output) {
        console.log(`📤 Output (truncated):\n${data.output}`);
      }
      if (data.tokens) {
        console.log(`🎫 Tokens: ${data.tokens.input} in, ${data.tokens.output} out`);
      }
      if (data.toolCalls) {
        console.log(`🔧 Tool Calls: ${data.toolCalls}`);
      }
      console.groupEnd();
    });
    
    eventSource.addEventListener('execution-complete', (event) => {
      const data = JSON.parse(event.data);
      console.log('✅ Execution complete:', data);
      setActiveExecution(null, false);
      setExecutionResults(currentExecutionId, data);
      setDeliverables(data.deliverables || []);
      setCompletedExecutionId(currentExecutionId); // Store for deliverable downloads
      setCurrentExecutionId(null);
      
      // Clear execution state from sessionStorage (keep workflow state)
      sessionStorage.removeItem('mimir-execution-state');
      console.log('🗑️ Cleared execution state from sessionStorage');
      
      eventSource.close();
    });
    
    eventSource.addEventListener('execution-cancelled', (event) => {
      const data = JSON.parse(event.data);
      console.log('⛔ Execution cancelled:', data);
      setActiveExecution(null, false);
      setExecutionResults(currentExecutionId, data);
      setCurrentExecutionId(null);
      
      // Clear execution state from sessionStorage
      sessionStorage.removeItem('mimir-execution-state');
      console.log('🗑️ Cleared execution state from sessionStorage');
      
      alert('Workflow execution was cancelled.');
      eventSource.close();
    });
    
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
      setActiveExecution(null, false);
    };
    
    return () => {
      eventSource.close();
    };
  }, [currentExecutionId, updateTaskExecutionStatus, setActiveExecution, setExecutionResults]);

  // Execute workflow handler
  const handleExecuteWorkflow = async () => {
    // Prevent multiple executions
    if (isExecuting) {
      console.warn('⚠️ Execution already in progress - ignoring duplicate click');
      return;
    }
    
          // Clear previous deliverables when starting new execution
      setDeliverables([]);
      setCompletedExecutionId(null);
      console.log('🗑️ Cleared previous deliverables cache');
    
    // Initialize ALL tasks to 'pending' status
    console.log('🔄 Initializing all tasks to pending status');
    console.log('Tasks to initialize:', tasks.map(t => ({ id: t.id, title: t.title })));
    tasks.forEach(task => {
      updateTaskExecutionStatus(task.id, 'pending');
    });
    
    // IMMEDIATELY lock the UI before making the API call
    setActiveExecution('starting', true);
    
    try {
      // Resolve Lambda scripts for transformer tasks
      const resolvedTasks = tasks.map(task => {
        if (task.taskType === 'transformer' && task.lambdaId) {
          const lambda = lambdas.find(l => l.id === task.lambdaId);
          if (lambda) {
            return {
              ...task,
              lambdaScript: lambda.script,
              lambdaLanguage: lambda.language,
              lambdaName: lambda.name,
            };
          }
        }
        return task;
      });

      const workflowData = {
        tasks: resolvedTasks,
        parallelGroups,
        agentTemplates,
        projectPlan,
      };

      const response = await fetch('/api/execute-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send HTTP-only cookie
        body: JSON.stringify(workflowData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Workflow execution failed');
      }

      const result = await response.json();
      console.log('✅ Workflow execution started:', result);
      
      // Connect to SSE stream with actual execution ID
      setCurrentExecutionId(result.executionId);
      setActiveExecution(result.executionId, true);
    } catch (error: any) {
      console.error('❌ Failed to execute workflow:', error);
      alert(`Failed to execute workflow: ${error.message}`);
      // Unlock UI on error
      setActiveExecution(null, false);
      setCurrentExecutionId(null);
    }
  };
  
  // Download deliverables handler (as zip archive)
  const handleDownloadDeliverables = async () => {
    if (deliverables.length === 0) return;
    
    const execId = completedExecutionId || currentExecutionId;
    if (!execId) return;
    
    try {
      // Fetch the zip archive
      const response = await fetch(`/api/deliverables/${execId}/download`, {
        credentials: 'include' // Send HTTP-only cookie
      });
      if (!response.ok) {
        throw new Error('Failed to download deliverables archive');
      }
      
      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `execution-${execId}-deliverables.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the object URL
      URL.revokeObjectURL(url);
      
      console.log(`✅ Downloaded deliverables archive with ${deliverables.length} files`);
    } catch (error: any) {
      console.error('❌ Failed to download deliverables archive:', error);
      alert(`Failed to download deliverables: ${error.message}`);
    }
  };
  
  // Cancel execution handler
  const handleCancelExecution = async () => {
    if (!currentExecutionId || currentExecutionId === 'starting') {
      return;
    }
    
    const confirmed = window.confirm('Are you sure you want to cancel the running workflow? This cannot be undone.');
    if (!confirmed) return;
    
    try {
      console.log('⛔ Requesting cancellation for execution:', currentExecutionId);
      
      const response = await fetch(`/api/cancel-execution/${currentExecutionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send HTTP-only cookie
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel execution');
      }
      
      const result = await response.json();
      console.log('✅ Cancellation requested:', result);
    } catch (error: any) {
      console.error('❌ Failed to cancel execution:', error);
      alert(`Failed to cancel execution: ${error.message}`);
    }
  };

  const handleCreateTask = () => {
    const newTask: AgentTask = {
      id: `task-${Date.now()}`,
      taskType: 'agent',
      title: 'New Task',
      agentRoleDescription: '',
      recommendedModel: 'gpt-4.1',
      prompt: '',
      successCriteria: [],
      dependencies: [],
      estimatedDuration: '30 minutes',
      estimatedToolCalls: 20,
      parallelGroup: null,
      qcRole: '',
      verificationCriteria: [],
      maxRetries: 3,
    };
    addTask(newTask);
  };
  
  return (
    <div className="p-4 h-full flex flex-col bg-norse-night">
      {/* Header Row */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h2 className="text-lg font-bold text-valhalla-gold">Task Canvas</h2>
        <p className="text-xs text-gray-500">
          Drag nodes • Connect dependencies • Drop agents
        </p>
      </div>

      {/* Action Toolbar - Compact horizontal bar */}
      <div className="flex items-center justify-between bg-norse-shadow/50 rounded-lg px-3 py-2 border border-norse-rune/50 flex-shrink-0 mt-4">
        {/* Left: Execute/Stop */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={isExecuting ? handleCancelExecution : handleExecuteWorkflow}
            disabled={!isExecuting && tasks.length === 0}
            className={`px-3 py-1.5 rounded-lg flex items-center space-x-2 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
              isExecuting
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-frost-ice text-norse-night hover:bg-magic-rune'
            }`}
          >
            {isExecuting ? (
              <>
                <XCircle className="w-4 h-4" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Execute</span>
              </>
            )}
          </button>
          
          {deliverables.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadDeliverables}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-1.5 transition-all text-sm font-medium"
              title={`Download all ${deliverables.length} deliverable${deliverables.length === 1 ? '' : 's'}`}
            >
              <FileDown className="w-4 h-4" />
              <span>ZIP ({deliverables.length})</span>
            </button>
          )}
        </div>

        {/* Center: Add Actions */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleCreateTask}
            disabled={isExecuting}
            className="px-3 py-1.5 bg-valhalla-gold text-norse-night rounded-lg hover:bg-valhalla-amber flex items-center space-x-1.5 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ListPlus className="w-4 h-4" />
            <span>Task</span>
          </button>
          <button
            type="button"
            onClick={addTransformer}
            disabled={isExecuting}
            className="px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-500 flex items-center space-x-1.5 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Transformer</span>
          </button>
        </div>

        {/* Right: Import/Export */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            disabled={isExecuting}
            className="px-3 py-1.5 bg-norse-stone border border-norse-rune text-gray-300 rounded-lg hover:bg-norse-rune hover:text-white flex items-center space-x-1.5 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Import workflow from JSON"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            disabled={tasks.length === 0}
            className="px-3 py-1.5 bg-norse-stone border border-norse-rune text-gray-300 rounded-lg hover:bg-norse-rune hover:text-white flex items-center space-x-1.5 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export workflow as JSON"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button
            type="button"
            onClick={handleExportCode}
            disabled={tasks.length === 0 || isGeneratingCode}
            className="px-3 py-1.5 bg-frost-ice/20 border border-frost-ice/40 text-frost-ice rounded-lg hover:bg-frost-ice/30 hover:text-white flex items-center space-x-1.5 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export generated TypeScript code"
          >
            {isGeneratingCode ? (
              <div className="animate-spin h-4 w-4 border-2 border-frost-ice border-t-transparent rounded-full" />
            ) : (
              <Code className="w-4 h-4" />
            )}
            <span>Code</span>
          </button>
        </div>
      </div>

      {/* Graph View */}
      {tasks.length > 0 && (
        <div className="flex-1 min-h-0 mt-4 flex flex-col">
          <GraphDropWrapper isExecuting={isExecuting} />
        </div>
      )}

      {/* Empty State */}
      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="text-6xl mb-4">🎯</div>
          <h3 className="text-2xl font-bold mb-3 text-gray-200">No tasks yet</h3>
          <p className="text-center max-w-md text-base leading-relaxed mb-6">
            Click "Create Task" to add a new task, then drag worker and QC agents from the left 
            sidebar into the task card. Or use the PM Agent to generate a complete task plan.
          </p>
          <button
            type="button"
            onClick={handleCreateTask}
            className="px-6 py-3 bg-valhalla-gold text-norse-night rounded-lg hover:bg-valhalla-amber flex items-center space-x-2 transition-all font-semibold shadow-lg hover:shadow-valhalla-gold/30"
          >
            <ListPlus className="w-5 h-5" />
            <span>Create Your First Task</span>
          </button>
        </div>
      )}

      {/* Import Workflow Modal */}
      <ImportWorkflowModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Export Code Dialog */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        code={generatedCode}
        workflowName={projectPlan?.overview?.goal || 'Workflow'}
        workflowDescription={projectPlan?.overview?.goal || 'Generated LangChain workflow'}
        nodeTypes={tasks.map(t => t.taskType)}
        nodeCount={tasks.length}
        onExportComplete={handleExportComplete}
      />
    </div>
  );
}
