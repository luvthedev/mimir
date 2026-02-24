/**
 * @fileoverview Unit tests for WorkflowPersistenceService
 *
 * Tests the workflow persistence CRUD operations with mocked Neo4j driver,
 * following the same patterns as orchestration/persistence.test.ts.
 *
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowPersistenceService } from './WorkflowPersistenceService.js';
import type { IGraphManager } from '../types/index.js';
import type { CreateWorkflowInput, UpdateWorkflowInput } from '../types/workflow.js';

describe('WorkflowPersistenceService', () => {
  let service: WorkflowPersistenceService;
  let mockGraphManager: IGraphManager;
  let mockSession: any;
  let mockDriver: any;

  beforeEach(() => {
    mockSession = {
      run: vi.fn().mockResolvedValue({
        records: [],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
    };

    mockGraphManager = {
      getDriver: vi.fn().mockReturnValue(mockDriver),
    } as any;

    service = new WorkflowPersistenceService(mockGraphManager);
  });

  describe('initialize', () => {
    it('should create constraints and indexes', async () => {
      await service.initialize();

      // Should create 3 unique constraints + 3 indexes = 6 calls
      expect(mockSession.run).toHaveBeenCalledTimes(6);
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should throw on schema initialization failure', async () => {
      mockSession.run.mockRejectedValueOnce(new Error('Schema error'));

      await expect(service.initialize()).rejects.toThrow('Schema error');
      expect(mockSession.close).toHaveBeenCalledOnce();
    });
  });

  describe('createWorkflow', () => {
    it('should create a workflow with metadata only', async () => {
      mockSession.run.mockResolvedValue({
        records: [{ get: (key: string) => 'mock-id' }],
      });

      const input: CreateWorkflowInput = {
        name: 'Test Workflow',
        description: 'A test workflow',
        userId: 'user-123',
      };

      const workflow = await service.createWorkflow(input);

      expect(workflow.name).toBe('Test Workflow');
      expect(workflow.description).toBe('A test workflow');
      expect(workflow.userId).toBe('user-123');
      expect(workflow.isActive).toBe(true);
      expect(workflow.nodes).toEqual([]);
      expect(workflow.connections).toEqual([]);
      expect(workflow.id).toBeDefined();
      expect(workflow.createdAt).toBeDefined();
      expect(workflow.updatedAt).toBeDefined();
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should create a workflow with nodes and connections', async () => {
      mockSession.run.mockResolvedValue({
        records: [{ get: (key: string) => 'mock-id' }],
      });

      const input: CreateWorkflowInput = {
        name: 'Pipeline',
        userId: 'user-456',
        nodes: [
          {
            id: 'node-1',
            type: 'upload',
            position: { x: 0, y: 0 },
            config: { format: 'csv' },
            metadata: { label: 'Upload CSV' },
          },
          {
            id: 'node-2',
            type: 'transform',
            position: { x: 200, y: 0 },
            config: { operation: 'filter' },
            metadata: { label: 'Filter Rows' },
          },
        ],
        connections: [
          {
            sourceNodeId: 'node-1',
            targetNodeId: 'node-2',
            sourcePort: 'output',
            targetPort: 'input',
          },
        ],
      };

      const workflow = await service.createWorkflow(input);

      expect(workflow.nodes).toHaveLength(2);
      expect(workflow.nodes[0].id).toBe('node-1');
      expect(workflow.nodes[0].type).toBe('upload');
      expect(workflow.nodes[0].position).toEqual({ x: 0, y: 0 });
      expect(workflow.nodes[1].id).toBe('node-2');
      expect(workflow.nodes[1].type).toBe('transform');

      expect(workflow.connections).toHaveLength(1);
      expect(workflow.connections[0].sourceNodeId).toBe('node-1');
      expect(workflow.connections[0].targetNodeId).toBe('node-2');
      expect(workflow.connections[0].sourcePort).toBe('output');
      expect(workflow.connections[0].targetPort).toBe('input');
      expect(workflow.connections[0].id).toBeDefined();

      // 1 for workflow root + 2 for nodes + 1 for connection = 4 queries
      expect(mockSession.run).toHaveBeenCalledTimes(4);
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should default description to empty string', async () => {
      mockSession.run.mockResolvedValue({
        records: [{ get: (key: string) => 'mock-id' }],
      });

      const input: CreateWorkflowInput = {
        name: 'No Description',
        userId: 'user-789',
      };

      const workflow = await service.createWorkflow(input);

      expect(workflow.description).toBe('');
    });

    it('should throw on database error', async () => {
      mockSession.run.mockRejectedValueOnce(new Error('Connection lost'));

      const input: CreateWorkflowInput = {
        name: 'Failing',
        userId: 'user-000',
      };

      await expect(service.createWorkflow(input)).rejects.toThrow('Connection lost');
      expect(mockSession.close).toHaveBeenCalledOnce();
    });
  });

  describe('getWorkflowById', () => {
    it('should return null when workflow not found', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await service.getWorkflowById('nonexistent-id');

      expect(result).toBeNull();
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should return full workflow with nodes and connections', async () => {
      // First call: workflow root
      mockSession.run
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const data: Record<string, any> = {
                id: 'wf-1',
                userId: 'user-1',
                name: 'Test WF',
                description: 'desc',
                isActive: true,
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
              };
              return data[key];
            },
          }],
        })
        // Second call: nodes
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const data: Record<string, any> = {
                id: 'n-1',
                type: 'upload',
                position: '{"x":10,"y":20}',
                config: '{"format":"json"}',
                metadata: '{"label":"Upload"}',
                createdAt: '2024-01-01T00:00:00Z',
              };
              return data[key];
            },
          }],
        })
        // Third call: connections
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const data: Record<string, any> = {
                id: 'c-1',
                sourceNodeId: 'n-1',
                targetNodeId: 'n-2',
                sourcePort: 'output',
                targetPort: 'input',
                createdAt: '2024-01-01T00:00:00Z',
              };
              return data[key];
            },
          }],
        });

      const workflow = await service.getWorkflowById('wf-1');

      expect(workflow).not.toBeNull();
      expect(workflow!.id).toBe('wf-1');
      expect(workflow!.name).toBe('Test WF');
      expect(workflow!.userId).toBe('user-1');
      expect(workflow!.isActive).toBe(true);

      expect(workflow!.nodes).toHaveLength(1);
      expect(workflow!.nodes[0].id).toBe('n-1');
      expect(workflow!.nodes[0].type).toBe('upload');
      expect(workflow!.nodes[0].position).toEqual({ x: 10, y: 20 });

      expect(workflow!.connections).toHaveLength(1);
      expect(workflow!.connections[0].sourceNodeId).toBe('n-1');
      expect(workflow!.connections[0].targetNodeId).toBe('n-2');

      // 3 queries: root, nodes, connections
      expect(mockSession.run).toHaveBeenCalledTimes(3);
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should throw on database error', async () => {
      mockSession.run.mockRejectedValueOnce(new Error('Query timeout'));

      await expect(service.getWorkflowById('wf-1')).rejects.toThrow('Query timeout');
      expect(mockSession.close).toHaveBeenCalledOnce();
    });
  });

  describe('listWorkflows', () => {
    it('should return workflows for a user', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, any> = {
                id: 'wf-1',
                userId: 'user-1',
                name: 'Workflow A',
                description: 'First',
                isActive: true,
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
              };
              return data[key];
            },
          },
          {
            get: (key: string) => {
              const data: Record<string, any> = {
                id: 'wf-2',
                userId: 'user-1',
                name: 'Workflow B',
                description: 'Second',
                isActive: true,
                createdAt: '2024-01-03T00:00:00Z',
                updatedAt: '2024-01-04T00:00:00Z',
              };
              return data[key];
            },
          },
        ],
      });

      const workflows = await service.listWorkflows('user-1');

      expect(workflows).toHaveLength(2);
      expect(workflows[0].id).toBe('wf-1');
      expect(workflows[1].id).toBe('wf-2');
      // Listing should not include nodes/connections
      expect(workflows[0].nodes).toEqual([]);
      expect(workflows[0].connections).toEqual([]);
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should return empty array when user has no workflows', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const workflows = await service.listWorkflows('user-no-wf');

      expect(workflows).toEqual([]);
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should filter active workflows by default', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.listWorkflows('user-1');

      const cypher = mockSession.run.mock.calls[0][0];
      expect(cypher).toContain('isActive = true');
    });

    it('should include inactive workflows when requested', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.listWorkflows('user-1', true);

      const cypher = mockSession.run.mock.calls[0][0];
      expect(cypher).not.toContain('isActive = true');
    });
  });

  describe('updateWorkflow', () => {
    it('should return null when workflow not found', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await service.updateWorkflow('nonexistent', { name: 'New Name' });

      expect(result).toBeNull();
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should update workflow metadata', async () => {
      // First call: exists check
      mockSession.run
        .mockResolvedValueOnce({
          records: [{ get: () => 'wf-1' }],
        })
        // Second call: SET metadata
        .mockResolvedValueOnce({
          records: [{ get: () => 'wf-1' }],
        })
        // Subsequent calls for getWorkflowById (root, nodes, connections)
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const data: Record<string, any> = {
                id: 'wf-1', userId: 'user-1', name: 'Updated',
                description: 'New desc', isActive: true,
                createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-05T00:00:00Z',
              };
              return data[key];
            },
          }],
        })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] });

      const result = await service.updateWorkflow('wf-1', {
        name: 'Updated',
        description: 'New desc',
      });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated');
      expect(result!.description).toBe('New desc');
    });

    it('should replace nodes when provided', async () => {
      // exists check
      mockSession.run
        .mockResolvedValueOnce({ records: [{ get: () => 'wf-1' }] })
        // SET metadata
        .mockResolvedValueOnce({ records: [{ get: () => 'wf-1' }] })
        // Delete old nodes
        .mockResolvedValueOnce({ records: [] })
        // Create new node
        .mockResolvedValueOnce({ records: [{ get: () => 'n-new' }] })
        // getWorkflowById calls (root, nodes, connections)
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const data: Record<string, any> = {
                id: 'wf-1', userId: 'user-1', name: 'WF',
                description: '', isActive: true,
                createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-05T00:00:00Z',
              };
              return data[key];
            },
          }],
        })
        .mockResolvedValueOnce({
          records: [{
            get: (key: string) => {
              const data: Record<string, any> = {
                id: 'n-new', type: 'output',
                position: '{"x":300,"y":100}',
                config: '{}', metadata: '{}',
                createdAt: '2024-01-05T00:00:00Z',
              };
              return data[key];
            },
          }],
        })
        .mockResolvedValueOnce({ records: [] });

      const result = await service.updateWorkflow('wf-1', {
        nodes: [{
          id: 'n-new',
          type: 'output',
          position: { x: 300, y: 100 },
          config: {},
          metadata: {},
        }],
      });

      expect(result).not.toBeNull();
      expect(result!.nodes).toHaveLength(1);
      expect(result!.nodes[0].id).toBe('n-new');
    });

    it('should throw on database error', async () => {
      mockSession.run.mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        service.updateWorkflow('wf-1', { name: 'test' })
      ).rejects.toThrow('Update failed');
      expect(mockSession.close).toHaveBeenCalledOnce();
    });
  });

  describe('deleteWorkflow', () => {
    it('should soft-delete workflow by setting isActive to false', async () => {
      mockSession.run.mockResolvedValue({
        records: [{ get: () => 'wf-1' }],
      });

      const result = await service.deleteWorkflow('wf-1');

      expect(result).toBe(true);

      const cypher = mockSession.run.mock.calls[0][0];
      expect(cypher).toContain('isActive = false');
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should return false when workflow not found', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await service.deleteWorkflow('nonexistent');

      expect(result).toBe(false);
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should throw on database error', async () => {
      mockSession.run.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(service.deleteWorkflow('wf-1')).rejects.toThrow('Delete failed');
      expect(mockSession.close).toHaveBeenCalledOnce();
    });
  });

  describe('deleteWorkflowPermanently', () => {
    it('should permanently delete workflow with all children', async () => {
      // Delete connections
      mockSession.run
        .mockResolvedValueOnce({ records: [] })
        // Delete nodes
        .mockResolvedValueOnce({ records: [] })
        // Delete root
        .mockResolvedValueOnce({
          records: [{ get: () => 1 }],
        });

      const result = await service.deleteWorkflowPermanently('wf-1');

      expect(result).toBe(true);
      // 3 queries: connections, nodes, root
      expect(mockSession.run).toHaveBeenCalledTimes(3);
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it('should return false when workflow not found', async () => {
      mockSession.run
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({
          records: [{ get: () => 0 }],
        });

      const result = await service.deleteWorkflowPermanently('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw on database error', async () => {
      mockSession.run.mockRejectedValueOnce(new Error('Permanent delete failed'));

      await expect(
        service.deleteWorkflowPermanently('wf-1')
      ).rejects.toThrow('Permanent delete failed');
      expect(mockSession.close).toHaveBeenCalledOnce();
    });
  });
});
