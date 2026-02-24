// ============================================================================
// Tests for Workflow Types and WorkflowPersistenceService
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  WorkflowNodeType,
  WorkflowNodePosition,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  ListWorkflowsOptions
} from '../src/types/workflow.js';
import { WorkflowPersistenceService } from '../src/managers/WorkflowPersistenceService.js';

// ============================================================================
// Type-Level Tests (compile-time safety validation)
// ============================================================================

describe('Workflow Types', () => {
  describe('WorkflowNodeType', () => {
    it('should accept valid node types', () => {
      const types: WorkflowNodeType[] = ['upload', 'extract', 'transform', 'output'];
      expect(types).toHaveLength(4);
    });
  });

  describe('WorkflowNodePosition', () => {
    it('should represent x/y coordinates', () => {
      const position: WorkflowNodePosition = { x: 100, y: 200 };
      expect(position.x).toBe(100);
      expect(position.y).toBe(200);
    });

    it('should accept zero coordinates', () => {
      const position: WorkflowNodePosition = { x: 0, y: 0 };
      expect(position.x).toBe(0);
      expect(position.y).toBe(0);
    });

    it('should accept negative coordinates', () => {
      const position: WorkflowNodePosition = { x: -50, y: -100 };
      expect(position.x).toBe(-50);
      expect(position.y).toBe(-100);
    });
  });

  describe('WorkflowNode', () => {
    it('should create a valid workflow node with all fields', () => {
      const node: WorkflowNode = {
        id: 'wfn-1',
        type: 'upload',
        position: { x: 100, y: 200 },
        config: { acceptedFormats: ['csv', 'json'] },
        metadata: { label: 'Upload CSV', color: '#ff0000' }
      };

      expect(node.id).toBe('wfn-1');
      expect(node.type).toBe('upload');
      expect(node.position.x).toBe(100);
      expect(node.position.y).toBe(200);
      expect(node.config.acceptedFormats).toEqual(['csv', 'json']);
      expect(node.metadata?.label).toBe('Upload CSV');
    });

    it('should allow nodes without metadata', () => {
      const node: WorkflowNode = {
        id: 'wfn-2',
        type: 'extract',
        position: { x: 0, y: 0 },
        config: {}
      };

      expect(node.metadata).toBeUndefined();
    });

    it('should support all node types', () => {
      const nodeTypes: WorkflowNodeType[] = ['upload', 'extract', 'transform', 'output'];

      for (const type of nodeTypes) {
        const node: WorkflowNode = {
          id: `wfn-${type}`,
          type,
          position: { x: 0, y: 0 },
          config: {}
        };
        expect(node.type).toBe(type);
      }
    });

    it('should accept arbitrary config objects', () => {
      const node: WorkflowNode = {
        id: 'wfn-transform',
        type: 'transform',
        position: { x: 300, y: 100 },
        config: {
          operation: 'filter',
          conditions: [
            { field: 'age', operator: '>', value: 18 }
          ],
          outputFormat: 'json'
        }
      };

      expect(node.config.operation).toBe('filter');
      expect(node.config.conditions).toHaveLength(1);
    });
  });

  describe('WorkflowConnection', () => {
    it('should create a valid connection', () => {
      const conn: WorkflowConnection = {
        id: 'wfc-1',
        sourceNodeId: 'wfn-1',
        targetNodeId: 'wfn-2',
        sourcePort: 'output',
        targetPort: 'input'
      };

      expect(conn.id).toBe('wfc-1');
      expect(conn.sourceNodeId).toBe('wfn-1');
      expect(conn.targetNodeId).toBe('wfn-2');
      expect(conn.sourcePort).toBe('output');
      expect(conn.targetPort).toBe('input');
    });

    it('should support custom port names', () => {
      const conn: WorkflowConnection = {
        id: 'wfc-2',
        sourceNodeId: 'wfn-1',
        targetNodeId: 'wfn-2',
        sourcePort: 'data_out',
        targetPort: 'data_in'
      };

      expect(conn.sourcePort).toBe('data_out');
      expect(conn.targetPort).toBe('data_in');
    });
  });

  describe('Workflow', () => {
    it('should create a complete workflow definition', () => {
      const workflow: Workflow = {
        id: 'wf-1',
        name: 'CSV Processing Pipeline',
        description: 'Process CSV uploads',
        nodes: [
          { id: 'n1', type: 'upload', position: { x: 0, y: 0 }, config: {} },
          { id: 'n2', type: 'extract', position: { x: 200, y: 0 }, config: {} },
          { id: 'n3', type: 'transform', position: { x: 400, y: 0 }, config: {} },
          { id: 'n4', type: 'output', position: { x: 600, y: 0 }, config: {} }
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n1', targetNodeId: 'n2', sourcePort: 'output', targetPort: 'input' },
          { id: 'c2', sourceNodeId: 'n2', targetNodeId: 'n3', sourcePort: 'output', targetPort: 'input' },
          { id: 'c3', sourceNodeId: 'n3', targetNodeId: 'n4', sourcePort: 'output', targetPort: 'input' }
        ],
        createdAt: '2026-02-24T00:00:00Z',
        updatedAt: '2026-02-24T00:00:00Z',
        userId: 'user-123',
        isActive: true
      };

      expect(workflow.id).toBe('wf-1');
      expect(workflow.name).toBe('CSV Processing Pipeline');
      expect(workflow.nodes).toHaveLength(4);
      expect(workflow.connections).toHaveLength(3);
      expect(workflow.userId).toBe('user-123');
      expect(workflow.isActive).toBe(true);
    });

    it('should allow an empty workflow', () => {
      const workflow: Workflow = {
        id: 'wf-empty',
        name: 'Empty Workflow',
        description: '',
        nodes: [],
        connections: [],
        createdAt: '2026-02-24T00:00:00Z',
        updatedAt: '2026-02-24T00:00:00Z',
        userId: 'user-456',
        isActive: true
      };

      expect(workflow.nodes).toHaveLength(0);
      expect(workflow.connections).toHaveLength(0);
    });

    it('should support inactive workflows (soft delete)', () => {
      const workflow: Workflow = {
        id: 'wf-deleted',
        name: 'Deleted Workflow',
        description: '',
        nodes: [],
        connections: [],
        createdAt: '2026-02-24T00:00:00Z',
        updatedAt: '2026-02-24T00:00:00Z',
        userId: 'user-789',
        isActive: false
      };

      expect(workflow.isActive).toBe(false);
    });
  });

  describe('CreateWorkflowInput', () => {
    it('should accept minimal creation input', () => {
      const input: CreateWorkflowInput = {
        name: 'New Workflow',
        userId: 'user-123'
      };

      expect(input.name).toBe('New Workflow');
      expect(input.userId).toBe('user-123');
      expect(input.description).toBeUndefined();
      expect(input.nodes).toBeUndefined();
      expect(input.connections).toBeUndefined();
    });

    it('should accept full creation input', () => {
      const input: CreateWorkflowInput = {
        name: 'Full Workflow',
        description: 'A complete workflow',
        userId: 'user-123',
        nodes: [
          { id: 'n1', type: 'upload', position: { x: 0, y: 0 }, config: {} }
        ],
        connections: [],
        isActive: true
      };

      expect(input.nodes).toHaveLength(1);
    });
  });

  describe('UpdateWorkflowInput', () => {
    it('should allow partial updates', () => {
      const input: UpdateWorkflowInput = {
        name: 'Renamed Workflow'
      };

      expect(input.name).toBe('Renamed Workflow');
      expect(input.description).toBeUndefined();
      expect(input.nodes).toBeUndefined();
    });

    it('should allow updating nodes and connections', () => {
      const input: UpdateWorkflowInput = {
        nodes: [
          { id: 'n1', type: 'upload', position: { x: 50, y: 50 }, config: { maxSize: 1024 } }
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n1', targetNodeId: 'n2', sourcePort: 'output', targetPort: 'input' }
        ]
      };

      expect(input.nodes).toHaveLength(1);
      expect(input.connections).toHaveLength(1);
    });

    it('should allow soft-delete via isActive', () => {
      const input: UpdateWorkflowInput = {
        isActive: false
      };

      expect(input.isActive).toBe(false);
    });
  });

  describe('ListWorkflowsOptions', () => {
    it('should accept empty options', () => {
      const options: ListWorkflowsOptions = {};
      expect(options.userId).toBeUndefined();
      expect(options.limit).toBeUndefined();
    });

    it('should accept all filter options', () => {
      const options: ListWorkflowsOptions = {
        userId: 'user-123',
        isActive: true,
        limit: 20,
        offset: 10
      };

      expect(options.userId).toBe('user-123');
      expect(options.isActive).toBe(true);
      expect(options.limit).toBe(20);
      expect(options.offset).toBe(10);
    });
  });
});

// ============================================================================
// WorkflowPersistenceService Tests (with mocked Neo4j driver)
// ============================================================================

describe('WorkflowPersistenceService', () => {
  // Helper to create a mock Neo4j session/transaction
  function createMockSession(records: any[] = []) {
    const mockTx = {
      run: vi.fn().mockResolvedValue({ records }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined)
    };

    const mockSession = {
      run: vi.fn().mockResolvedValue({ records }),
      beginTransaction: vi.fn().mockReturnValue(mockTx),
      close: vi.fn().mockResolvedValue(undefined)
    };

    return { mockSession, mockTx };
  }

  function createMockDriver(mockSession: any) {
    return {
      session: vi.fn().mockReturnValue(mockSession)
    };
  }

  function createMockGraphManager(mockDriver: any) {
    return {
      getDriver: vi.fn().mockReturnValue(mockDriver),
      addNode: vi.fn(),
      getNode: vi.fn(),
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      addEdge: vi.fn(),
      deleteEdge: vi.fn(),
      queryNodes: vi.fn(),
      searchNodes: vi.fn(),
      getEdges: vi.fn(),
      getNeighbors: vi.fn(),
      getSubgraph: vi.fn(),
      getStats: vi.fn(),
      clear: vi.fn(),
      close: vi.fn(),
      initialize: vi.fn(),
      getIsNornicDB: vi.fn().mockReturnValue(false),
      addNodes: vi.fn(),
      updateNodes: vi.fn(),
      deleteNodes: vi.fn(),
      addEdges: vi.fn(),
      deleteEdges: vi.fn(),
      lockNode: vi.fn(),
      unlockNode: vi.fn(),
      queryNodesWithLockStatus: vi.fn(),
      cleanupExpiredLocks: vi.fn(),
      testConnection: vi.fn()
    };
  }

  it('should be constructable with a graph manager', () => {
    const { mockSession } = createMockSession();
    const mockDriver = createMockDriver(mockSession);
    const mockGM = createMockGraphManager(mockDriver);

    const service = new WorkflowPersistenceService(mockGM as any);
    expect(service).toBeDefined();
  });

  describe('createWorkflow', () => {
    it('should create a workflow with nodes and connections in a transaction', async () => {
      const { mockSession, mockTx } = createMockSession();
      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);

      const input: CreateWorkflowInput = {
        name: 'Test Pipeline',
        description: 'Test workflow',
        userId: 'user-123',
        nodes: [
          { id: 'n1', type: 'upload', position: { x: 0, y: 0 }, config: {} },
          { id: 'n2', type: 'extract', position: { x: 200, y: 0 }, config: {} }
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'n1', targetNodeId: 'n2', sourcePort: 'output', targetPort: 'input' }
        ]
      };

      const result = await service.createWorkflow(input);

      expect(result.name).toBe('Test Pipeline');
      expect(result.description).toBe('Test workflow');
      expect(result.userId).toBe('user-123');
      expect(result.nodes).toHaveLength(2);
      expect(result.connections).toHaveLength(1);
      expect(result.isActive).toBe(true);
      expect(result.id).toMatch(/^workflow-/);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      // Verify transaction was used
      expect(mockSession.beginTransaction).toHaveBeenCalled();
      expect(mockTx.commit).toHaveBeenCalled();
      expect(mockSession.close).toHaveBeenCalled();

      // 1 workflow creation + 2 node creations + 1 connection = 4 tx.run calls
      expect(mockTx.run).toHaveBeenCalledTimes(4);
    });

    it('should create an empty workflow without nodes', async () => {
      const { mockSession, mockTx } = createMockSession();
      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);

      const result = await service.createWorkflow({
        name: 'Empty Workflow',
        userId: 'user-456'
      });

      expect(result.name).toBe('Empty Workflow');
      expect(result.nodes).toHaveLength(0);
      expect(result.connections).toHaveLength(0);

      // Only 1 tx.run call for the workflow node itself
      expect(mockTx.run).toHaveBeenCalledTimes(1);
    });

    it('should rollback on failure', async () => {
      const { mockSession, mockTx } = createMockSession();
      mockTx.run.mockRejectedValue(new Error('DB error'));

      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);

      await expect(
        service.createWorkflow({ name: 'Fail', userId: 'user-123' })
      ).rejects.toThrow('DB error');

      expect(mockTx.rollback).toHaveBeenCalled();
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should default isActive to true when not specified', async () => {
      const { mockSession } = createMockSession();
      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);

      const result = await service.createWorkflow({
        name: 'Active By Default',
        userId: 'user-123'
      });

      expect(result.isActive).toBe(true);
    });

    it('should allow creating an inactive workflow', async () => {
      const { mockSession } = createMockSession();
      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);

      const result = await service.createWorkflow({
        name: 'Inactive',
        userId: 'user-123',
        isActive: false
      });

      expect(result.isActive).toBe(false);
    });
  });

  describe('getWorkflowById', () => {
    it('should return null when workflow not found', async () => {
      const { mockSession } = createMockSession([]);
      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);
      const result = await service.getWorkflowById('nonexistent');

      expect(result).toBeNull();
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should return a complete workflow with nodes and connections', async () => {
      const workflowProps = {
        id: 'wf-1',
        type: 'workflow',
        name: 'Test',
        description: 'Test workflow',
        userId: 'user-123',
        isActive: true,
        created: '2026-02-24T00:00:00Z',
        updated: '2026-02-24T00:00:00Z'
      };

      const nodeProps1 = {
        id: 'wfn-wf-1-n1',
        type: 'workflow_node',
        originalNodeId: 'n1',
        nodeType: 'upload',
        position_x: 0,
        position_y: 0,
        config_json: '{}',
        metadata_json: '{"label":"Upload"}',
        created: '2026-02-24T00:00:00Z'
      };

      const nodeProps2 = {
        id: 'wfn-wf-1-n2',
        type: 'workflow_node',
        originalNodeId: 'n2',
        nodeType: 'extract',
        position_x: 200,
        position_y: 0,
        config_json: '{"format":"csv"}',
        metadata_json: '{}',
        created: '2026-02-24T00:00:00Z'
      };

      const connProps = {
        id: 'wfc-wf-1-c1',
        type: 'connects_to',
        connectionId: 'c1',
        sourcePort: 'output',
        targetPort: 'input',
        created: '2026-02-24T00:00:00Z'
      };

      const { mockSession } = createMockSession();

      // First call: workflow metadata
      mockSession.run
        .mockResolvedValueOnce({
          records: [{ get: () => ({ properties: workflowProps }) }]
        })
        // Second call: workflow nodes
        .mockResolvedValueOnce({
          records: [
            { get: () => ({ properties: nodeProps1 }) },
            { get: () => ({ properties: nodeProps2 }) }
          ]
        })
        // Third call: connections
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              if (key === 'c') return { properties: connProps };
              if (key === 'sourceNodeId') return 'n1';
              if (key === 'targetNodeId') return 'n2';
              return null;
            }
          }]
        });

      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);
      const result = await service.getWorkflowById('wf-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('wf-1');
      expect(result!.name).toBe('Test');
      expect(result!.userId).toBe('user-123');
      expect(result!.isActive).toBe(true);

      // Nodes
      expect(result!.nodes).toHaveLength(2);
      expect(result!.nodes[0].id).toBe('n1');
      expect(result!.nodes[0].type).toBe('upload');
      expect(result!.nodes[0].position).toEqual({ x: 0, y: 0 });
      expect(result!.nodes[1].id).toBe('n2');
      expect(result!.nodes[1].type).toBe('extract');
      expect(result!.nodes[1].config).toEqual({ format: 'csv' });

      // Connections
      expect(result!.connections).toHaveLength(1);
      expect(result!.connections[0].id).toBe('c1');
      expect(result!.connections[0].sourceNodeId).toBe('n1');
      expect(result!.connections[0].targetNodeId).toBe('n2');
      expect(result!.connections[0].sourcePort).toBe('output');
      expect(result!.connections[0].targetPort).toBe('input');
    });
  });

  describe('listWorkflows', () => {
    it('should list workflows with filters', async () => {
      const records = [
        {
          get: () => ({
            properties: {
              id: 'wf-1',
              name: 'Workflow 1',
              description: 'First',
              userId: 'user-123',
              isActive: true,
              created: '2026-02-24T00:00:00Z',
              updated: '2026-02-24T01:00:00Z'
            }
          })
        },
        {
          get: () => ({
            properties: {
              id: 'wf-2',
              name: 'Workflow 2',
              description: 'Second',
              userId: 'user-123',
              isActive: true,
              created: '2026-02-24T00:00:00Z',
              updated: '2026-02-24T02:00:00Z'
            }
          })
        }
      ];

      const { mockSession } = createMockSession();
      mockSession.run.mockResolvedValueOnce({ records });

      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);
      const result = await service.listWorkflows({
        userId: 'user-123',
        isActive: true
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('wf-1');
      expect(result[1].id).toBe('wf-2');
      // List view doesn't load nodes/connections
      expect(result[0].nodes).toHaveLength(0);
      expect(result[0].connections).toHaveLength(0);
    });

    it('should return empty array when no workflows match', async () => {
      const { mockSession } = createMockSession([]);
      mockSession.run.mockResolvedValueOnce({ records: [] });

      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);
      const result = await service.listWorkflows({ userId: 'nonexistent' });

      expect(result).toHaveLength(0);
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete a workflow and return true', async () => {
      const { mockSession, mockTx } = createMockSession();

      // First tx.run: delete workflow nodes
      mockTx.run.mockResolvedValueOnce({ records: [] });
      // Second tx.run: delete workflow itself
      mockTx.run.mockResolvedValueOnce({
        records: [{ get: () => 1 }]
      });

      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);
      const result = await service.deleteWorkflow('wf-1');

      expect(result).toBe(true);
      expect(mockTx.commit).toHaveBeenCalled();
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should return false when workflow not found', async () => {
      const { mockSession, mockTx } = createMockSession();

      // Delete nodes: no-op
      mockTx.run.mockResolvedValueOnce({ records: [] });
      // Delete workflow: not found
      mockTx.run.mockResolvedValueOnce({
        records: [{ get: () => 0 }]
      });

      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);
      const result = await service.deleteWorkflow('nonexistent');

      expect(result).toBe(false);
    });

    it('should rollback on failure', async () => {
      const { mockSession, mockTx } = createMockSession();
      mockTx.run.mockRejectedValue(new Error('Delete failed'));

      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);

      await expect(service.deleteWorkflow('wf-1')).rejects.toThrow('Delete failed');
      expect(mockTx.rollback).toHaveBeenCalled();
    });
  });

  describe('updateWorkflow', () => {
    it('should throw when workflow not found', async () => {
      const { mockSession, mockTx } = createMockSession();
      mockTx.run.mockResolvedValueOnce({ records: [] });

      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      const service = new WorkflowPersistenceService(mockGM as any);

      await expect(
        service.updateWorkflow('nonexistent', { name: 'New Name' })
      ).rejects.toThrow('Workflow not found: nonexistent');
    });

    it('should update metadata fields', async () => {
      const workflowRecord = {
        get: () => ({
          properties: {
            id: 'wf-1',
            type: 'workflow',
            name: 'Updated',
            description: 'Updated desc',
            userId: 'user-123',
            isActive: true,
            created: '2026-02-24T00:00:00Z',
            updated: '2026-02-24T01:00:00Z'
          }
        })
      };

      const { mockSession, mockTx } = createMockSession();

      // exists check
      mockTx.run.mockResolvedValueOnce({ records: [workflowRecord] });
      // update SET
      mockTx.run.mockResolvedValueOnce({ records: [] });

      const mockDriver = createMockDriver(mockSession);
      const mockGM = createMockGraphManager(mockDriver);

      // Mock getWorkflowById (called after commit)
      const service = new WorkflowPersistenceService(mockGM as any);

      // We need to mock the getWorkflowById call that happens after commit
      // Since it opens a new session, we need the driver to return a new mock session
      const getSession = createMockSession();
      getSession.mockSession.run
        .mockResolvedValueOnce({ records: [workflowRecord] })  // workflow
        .mockResolvedValueOnce({ records: [] })                  // nodes
        .mockResolvedValueOnce({ records: [] });                 // connections

      // Driver returns different sessions for different calls
      mockDriver.session
        .mockReturnValueOnce(mockSession)       // first call for update transaction
        .mockReturnValueOnce(getSession.mockSession);  // second call for getWorkflowById

      const result = await service.updateWorkflow('wf-1', {
        name: 'Updated',
        description: 'Updated desc'
      });

      expect(result.name).toBe('Updated');
      expect(result.description).toBe('Updated desc');
      expect(mockTx.commit).toHaveBeenCalled();
    });
  });
});
