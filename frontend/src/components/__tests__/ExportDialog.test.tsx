/**
 * @module components/__tests__/ExportDialog.test
 * @description Tests for the ExportDialog component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportDialog } from '../workflow/ExportDialog';
import type { EditorNode, EditorConnection } from '../../types/workflow';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockNodes: EditorNode[] = [
  {
    id: 'node-1',
    type: 'upload',
    position: { x: 0, y: 0 },
    config: { format: 'csv' },
    metadata: { label: 'CSV Upload' },
  },
  {
    id: 'node-2',
    type: 'extract',
    position: { x: 200, y: 0 },
    config: {},
    metadata: { label: 'Extract Data' },
  },
  {
    id: 'node-3',
    type: 'output',
    position: { x: 400, y: 0 },
    config: {},
    metadata: { label: 'Output' },
  },
];

const mockConnections: EditorConnection[] = [
  {
    id: 'conn-1',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    sourcePort: 'data',
    targetPort: 'data',
  },
  {
    id: 'conn-2',
    sourceNodeId: 'node-2',
    targetNodeId: 'node-3',
    sourcePort: 'data',
    targetPort: 'data',
  },
];

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  nodes: mockNodes,
  connections: mockConnections,
  workflowName: 'Test Workflow',
  isValid: true,
  validationErrors: [] as string[],
};

// Mock URL.createObjectURL and URL.revokeObjectURL for download tests
beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  globalThis.URL.revokeObjectURL = vi.fn();
});

// ============================================================================
// Tests
// ============================================================================

describe('ExportDialog', () => {
  // ==========================================================================
  // Rendering
  // ==========================================================================

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(<ExportDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('Export Workflow')).toBeNull();
    });

    it('should render when isOpen is true', () => {
      render(<ExportDialog {...defaultProps} />);
      expect(screen.getByText('Export Workflow')).toBeTruthy();
    });

    it('should show three export format options', () => {
      render(<ExportDialog {...defaultProps} />);
      expect(screen.getByText('Single File')).toBeTruthy();
      expect(screen.getByText('npm Package')).toBeTruthy();
      expect(screen.getByText('GitHub Gist')).toBeTruthy();
    });

    it('should show Export and Cancel buttons', () => {
      render(<ExportDialog {...defaultProps} />);
      // The Export button text is inside a span within a button with an SVG icon
      const buttons = screen.getAllByRole('button');
      const exportBtn = buttons.find((b) => b.textContent?.includes('Export') && !b.textContent?.includes('Workflow'));
      expect(exportBtn).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });
  });

  // ==========================================================================
  // Validation Warnings
  // ==========================================================================

  describe('validation warnings', () => {
    it('should show validation errors when workflow is invalid', () => {
      render(
        <ExportDialog
          {...defaultProps}
          isValid={false}
          validationErrors={['Cycle detected', 'Orphaned node']}
        />,
      );
      expect(screen.getByText('Workflow has validation errors')).toBeTruthy();
      expect(screen.getByText('- Cycle detected')).toBeTruthy();
      expect(screen.getByText('- Orphaned node')).toBeTruthy();
    });

    it('should show warning when no nodes', () => {
      render(<ExportDialog {...defaultProps} nodes={[]} />);
      expect(
        screen.getByText(
          'Add at least one node to the workflow before exporting.',
        ),
      ).toBeTruthy();
    });

    it('should disable export button when workflow is invalid', () => {
      render(<ExportDialog {...defaultProps} isValid={false} />);
      const buttons = screen.getAllByRole('button');
      const exportBtn = buttons.find(
        (b) => b.textContent?.includes('Export') && !b.textContent?.includes('Workflow'),
      );
      expect(exportBtn?.hasAttribute('disabled')).toBe(true);
    });

    it('should disable export button when no nodes', () => {
      render(<ExportDialog {...defaultProps} nodes={[]} />);
      const buttons = screen.getAllByRole('button');
      const exportBtn = buttons.find(
        (b) => b.textContent?.includes('Export') && !b.textContent?.includes('Workflow'),
      );
      expect(exportBtn?.hasAttribute('disabled')).toBe(true);
    });
  });

  // ==========================================================================
  // Format Selection
  // ==========================================================================

  describe('format selection', () => {
    it('should show dependency checkbox for single-file format', () => {
      render(<ExportDialog {...defaultProps} />);
      // Single file is default
      expect(
        screen.getByText('Include dependency installation instructions'),
      ).toBeTruthy();
    });

    it('should show package name input for npm-package format', () => {
      render(<ExportDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('npm Package'));
      expect(screen.getByText('Package Name')).toBeTruthy();
    });

    it('should show GitHub token input for github-gist format', () => {
      render(<ExportDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('GitHub Gist'));
      expect(
        screen.getByText('GitHub Personal Access Token'),
      ).toBeTruthy();
    });

    it('should show test scaffolding checkbox for single-file and npm-package', () => {
      render(<ExportDialog {...defaultProps} />);
      expect(
        screen.getByText('Include test scaffolding (Vitest)'),
      ).toBeTruthy();
    });
  });

  // ==========================================================================
  // Close / Cancel
  // ==========================================================================

  describe('close behavior', () => {
    it('should call onClose when Cancel is clicked', () => {
      const onClose = vi.fn();
      render(<ExportDialog {...defaultProps} onClose={onClose} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      const { container } = render(
        <ExportDialog {...defaultProps} onClose={onClose} />,
      );
      // Backdrop is the first child div with the bg-black class
      const backdrop = container.querySelector('.bg-black\\/60');
      if (backdrop) fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Export Actions
  // ==========================================================================

  describe('export actions', () => {
    it('should trigger file download on single-file export', async () => {
      // Render component first, before mocking createElement
      render(<ExportDialog {...defaultProps} />);

      // Now mock createElement for the download anchor
      const mockClick = vi.fn();
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: any) => {
        const el = origCreate(tag, options);
        if (tag === 'a') {
          el.click = mockClick;
        }
        return el;
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation((child) => child);
      vi.spyOn(document.body, 'removeChild').mockImplementation((child) => child);

      // Find and click the Export button
      const buttons = screen.getAllByRole('button');
      const exportBtn = buttons.find(
        (b) => b.textContent?.includes('Export') && !b.textContent?.includes('Workflow'),
      );
      expect(exportBtn).toBeTruthy();
      fireEvent.click(exportBtn!);

      await waitFor(() => {
        expect(mockClick).toHaveBeenCalled();
      });
    });

    it('should show success message after export', async () => {
      render(<ExportDialog {...defaultProps} />);

      const mockClick = vi.fn();
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: any) => {
        const el = origCreate(tag, options);
        if (tag === 'a') {
          el.click = mockClick;
        }
        return el;
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation((child) => child);
      vi.spyOn(document.body, 'removeChild').mockImplementation((child) => child);

      const buttons = screen.getAllByRole('button');
      const exportBtn = buttons.find(
        (b) => b.textContent?.includes('Export') && !b.textContent?.includes('Workflow'),
      );
      fireEvent.click(exportBtn!);

      await waitFor(() => {
        expect(screen.getByText(/Downloaded/)).toBeTruthy();
      });
    });

    it('should show export history after export', async () => {
      render(<ExportDialog {...defaultProps} />);

      const mockClick = vi.fn();
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: any) => {
        const el = origCreate(tag, options);
        if (tag === 'a') {
          el.click = mockClick;
        }
        return el;
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation((child) => child);
      vi.spyOn(document.body, 'removeChild').mockImplementation((child) => child);

      const buttons = screen.getAllByRole('button');
      const exportBtn = buttons.find(
        (b) => b.textContent?.includes('Export') && !b.textContent?.includes('Workflow'),
      );
      fireEvent.click(exportBtn!);

      await waitFor(() => {
        expect(screen.getByText('Export History')).toBeTruthy();
      });
    });
  });
});
