/**
 * @module codegen/chainTemplates
 * @description Assembles workflow nodes into a LangChain chain using .pipe() based on connection order.
 *
 * Generates the chain assembly code that wires individual node code blocks
 * together following the connection topology of the visual workflow.
 */

import type { WorkflowNode, WorkflowConnection } from '../types/workflow.js';
import { generateNodeCode } from './nodeTemplates.js';
import type { NodeCodeBlock } from './nodeTemplates.js';
import type { ImportStatement } from './codeFormatting.js';

// ============================================================================
// Types
// ============================================================================

export interface ChainGenerationResult {
  /** Combined code for all nodes in execution order */
  nodeCode: string;
  /** All import statements required by the chain */
  imports: ImportStatement[];
  /** The variable name of the final output */
  finalOutputVariable: string;
}

// ============================================================================
// Chain Generation
// ============================================================================

/**
 * Generates LangChain chain assembly code from an ordered list of nodes and connections.
 *
 * Nodes must already be in topologically sorted order (upstream before downstream).
 * The function generates code for each node, wiring outputs to inputs based on connections.
 *
 * @param orderedNodes - Nodes in topological execution order
 * @param connections - Connections defining the data flow between nodes
 * @returns Generated chain code with imports and final output variable
 */
export function generateChain(
  orderedNodes: WorkflowNode[],
  connections: WorkflowConnection[],
): ChainGenerationResult {
  if (orderedNodes.length === 0) {
    return { nodeCode: '// Empty workflow - no nodes to execute', imports: [], finalOutputVariable: '' };
  }

  const allImports: ImportStatement[] = [];
  const codeBlocks: string[] = [];
  const nodeOutputMap = new Map<string, string>();

  // Track how many nodes of each type we've seen (for naming)
  const typeCounters: Record<string, number> = {};

  for (const node of orderedNodes) {
    // Track type index for variable naming
    const typeIndex = typeCounters[node.type] ?? 0;
    typeCounters[node.type] = typeIndex + 1;

    // Find the input variable for this node.
    // Look at connections targeting this node; use the first source's output.
    const incomingConnections = connections.filter(c => c.targetNodeId === node.id);
    let inputVariable = '';

    if (incomingConnections.length > 0) {
      // Use the first incoming connection's source output.
      // For nodes with multiple inputs, concatenate them.
      if (incomingConnections.length === 1) {
        inputVariable = nodeOutputMap.get(incomingConnections[0].sourceNodeId) || '';
      } else {
        // Multiple inputs: combine into an array variable
        const inputVars = incomingConnections
          .map(c => nodeOutputMap.get(c.sourceNodeId))
          .filter(Boolean);
        if (inputVars.length > 0) {
          const combinedVar = `combined_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
          codeBlocks.push(
            `// Combine inputs from multiple sources for node ${node.id}`,
            `const ${combinedVar} = [${inputVars.join(', ')}].flat();`,
            '',
          );
          inputVariable = combinedVar;
        }
      }
    }

    // Generate the code block for this node
    const block: NodeCodeBlock = generateNodeCode(node, typeIndex, inputVariable);

    allImports.push(...block.imports);
    codeBlocks.push(block.code);
    codeBlocks.push(''); // Blank line between nodes
    nodeOutputMap.set(node.id, block.outputVariable);
  }

  // The final output is the last node's output variable
  const lastNode = orderedNodes[orderedNodes.length - 1];
  const finalOutputVariable = nodeOutputMap.get(lastNode.id) || '';

  return {
    nodeCode: codeBlocks.join('\n'),
    imports: allImports,
    finalOutputVariable,
  };
}
