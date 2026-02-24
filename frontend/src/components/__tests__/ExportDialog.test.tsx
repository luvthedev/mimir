/**
 * Tests for the ExportDialog component.
 *
 * Covers: rendering, format selection, validation display,
 *         export triggering, and callback handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportDialog } from '../ExportDialog';

// ============================================================================
// Mock the codeExporter service to avoid browser download side effects
// ============================================================================

vi.mock('../../services/codeExporter', async () => {
  const actual = await vi.importActual<typeof import('../../services/codeExporter')>('../../services/codeExporter');
  return {
    ...actual,
    exportAsFile: vi.fn(() => ({
      success: true,
      format: 'file' as const,
      filename: 'test-workflow-2025-01-01.ts',
      timestamp: '2025-01-01T00:00:00Z',
    })),
    exportAsPackage: vi.fn(() => ({
      success: true,
      format: 'package' as const,
      filename: 'test-workflow-2025-01-01.zip',
      timestamp: '2025-01-01T00:00:00Z',
    })),
    exportAsGist: vi.fn(async () => ({
      success: true,
      format: 'gist' as const,
      filename: 'test-workflow.ts',
      gistUrl: 'https://gist.github.com/test/123',
      timestamp: '2025-01-01T00:00:00Z',
    })),
  };
});

// ============================================================================
// Test data
// ============================================================================

const VALID_CODE = `import { ChatOpenAI } from '@langchain/openai';

export async function executeTestWorkflow(): Promise<any> {
  return 'test';
}
`;

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  code: VALID_CODE,
  workflowName: 'Test Workflow',
  workflowDescription: 'A test workflow',
  nodeTypes: ['agent', 'transformer'],
  nodeCount: 3,
  onExportComplete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Rendering
// ============================================================================

describe('ExportDialog', () => {
  describe('rendering', () => {
    it('should render when open', () => {
      render(<ExportDialog {...defaultProps} />);
      expect(screen.getByText('Export Code')).toBeDefined();
    });

    it('should not render when closed', () => {
      render(<ExportDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('Export Code')).toBeNull();
    });

    it('should display format options', () => {
      render(<ExportDialog {...defaultProps} />);
      expect(screen.getByText('Single File')).toBeDefined();
      expect(screen.getByText('npm Package')).toBeDefined();
      expect(screen.getByText('GitHub Gist')).toBeDefined();
    });

    it('should display the Export button', () => {
      render(<ExportDialog {...defaultProps} />);
      expect(screen.getByText('Export')).toBeDefined();
    });

    it('should display the Cancel button', () => {
      render(<ExportDialog {...defaultProps} />);
      expect(screen.getByText('Cancel')).toBeDefined();
    });
  });

  // ============================================================================
  // Validation
  // ============================================================================

  describe('validation', () => {
    it('should show validation error for empty code', () => {
      render(<ExportDialog {...defaultProps} code="" />);
      expect(screen.getByText('Code not ready for export')).toBeDefined();
    });

    it('should show validation error for code without export function', () => {
      render(<ExportDialog {...defaultProps} code="import { x } from 'y';\nconst a = 1;" />);
      expect(screen.getByText('Code not ready for export')).toBeDefined();
    });

    it('should not show validation error for valid code', () => {
      render(<ExportDialog {...defaultProps} />);
      expect(screen.queryByText('Code not ready for export')).toBeNull();
    });

    it('should disable export button for invalid code', () => {
      render(<ExportDialog {...defaultProps} code="" />);
      const exportBtn = screen.getByText('Export').closest('button');
      expect(exportBtn?.disabled).toBe(true);
    });
  });

  // ============================================================================
  // Format selection
  // ============================================================================

  describe('format selection', () => {
    it('should default to single file format', () => {
      render(<ExportDialog {...defaultProps} />);
      const singleFileBtn = screen.getByText('Single File').closest('button');
      expect(singleFileBtn?.className).toContain('border-valhalla-gold');
    });

    it('should switch to package format on click', () => {
      render(<ExportDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('npm Package'));
      const packageBtn = screen.getByText('npm Package').closest('button');
      expect(packageBtn?.className).toContain('border-valhalla-gold');
    });

    it('should show custom package name input for package format', () => {
      render(<ExportDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('npm Package'));
      expect(screen.getByText('Custom Package Name')).toBeDefined();
    });

    it('should show GitHub token input for gist format', () => {
      render(<ExportDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('GitHub Gist'));
      expect(screen.getByText('GitHub Personal Access Token')).toBeDefined();
    });

    it('should show test scaffold option for package format', () => {
      render(<ExportDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('npm Package'));
      expect(screen.getByText('Include test scaffold (Vitest)')).toBeDefined();
    });

    it('should disable export for gist without token', () => {
      render(<ExportDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('GitHub Gist'));
      const exportBtn = screen.getByText('Export').closest('button');
      expect(exportBtn?.disabled).toBe(true);
    });
  });

  // ============================================================================
  // Close behavior
  // ============================================================================

  describe('close behavior', () => {
    it('should call onClose when Cancel is clicked', () => {
      const onClose = vi.fn();
      render(<ExportDialog {...defaultProps} onClose={onClose} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Export action
  // ============================================================================

  describe('export action', () => {
    it('should trigger file export on click', async () => {
      const onExportComplete = vi.fn();
      render(<ExportDialog {...defaultProps} onExportComplete={onExportComplete} />);

      fireEvent.click(screen.getByText('Export'));

      await waitFor(() => {
        expect(onExportComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            format: 'file',
          })
        );
      });
    });

    it('should show success message after export', async () => {
      render(<ExportDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Export'));

      await waitFor(() => {
        expect(screen.getByText('Export successful')).toBeDefined();
      });
    });

    it('should show Done button after successful export', async () => {
      render(<ExportDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Export'));

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Options checkboxes
  // ============================================================================

  describe('options', () => {
    it('should render include dependencies checkbox', () => {
      render(<ExportDialog {...defaultProps} />);
      expect(screen.getByText('Include dependencies')).toBeDefined();
    });

    it('should allow toggling include dependencies', () => {
      render(<ExportDialog {...defaultProps} />);
      const checkbox = screen.getByText('Include dependencies')
        .closest('label')
        ?.querySelector('input[type="checkbox"]');
      expect(checkbox).toBeDefined();
      if (checkbox) {
        fireEvent.click(checkbox);
        expect((checkbox as HTMLInputElement).checked).toBe(false);
      }
    });
  });
});
