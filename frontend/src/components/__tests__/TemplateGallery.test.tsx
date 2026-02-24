import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateGallery } from '../workflow/TemplateGallery';
import { WORKFLOW_TEMPLATES } from '../../types/workflowTemplates';

describe('TemplateGallery', () => {
  it('renders the Templates heading', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);
    expect(screen.getByText('Templates')).toBeDefined();
  });

  it('displays all available templates', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    for (const template of WORKFLOW_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeDefined();
    }
  });

  it('shows template descriptions', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    // Each template description is truncated to 2 lines in the card view,
    // but should still be in the DOM
    for (const template of WORKFLOW_TEMPLATES) {
      const descriptions = screen.getAllByText(template.description);
      expect(descriptions.length).toBeGreaterThan(0);
    }
  });

  it('shows "Use Template" buttons for each template', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    const useButtons = screen.getAllByText('Use Template');
    expect(useButtons.length).toBe(WORKFLOW_TEMPLATES.length);
  });

  it('calls onSelectTemplate when "Use Template" is clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    const useButtons = screen.getAllByText('Use Template');
    fireEvent.click(useButtons[0]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(WORKFLOW_TEMPLATES[0]);
  });

  it('shows "Preview" buttons for each template', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    const previewButtons = screen.getAllByText('Preview');
    expect(previewButtons.length).toBe(WORKFLOW_TEMPLATES.length);
  });

  it('opens detail modal when Preview is clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    const previewButtons = screen.getAllByText('Preview');
    fireEvent.click(previewButtons[0]);

    // The detail modal should now show the full template info
    expect(screen.getByText('Workflow Preview')).toBeDefined();
    expect(screen.getByText('Description')).toBeDefined();
  });

  it('closes detail modal when Cancel is clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    // Open the modal
    const previewButtons = screen.getAllByText('Preview');
    fireEvent.click(previewButtons[0]);

    // Close the modal
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // "Workflow Preview" should no longer be visible
    expect(screen.queryByText('Workflow Preview')).toBeNull();
  });

  it('calls onSelectTemplate from detail modal "Use Template" button', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    // Open the modal for the first template
    const previewButtons = screen.getAllByText('Preview');
    fireEvent.click(previewButtons[0]);

    // Click "Use Template" in the modal
    const useButtons = screen.getAllByText('Use Template');
    // The last "Use Template" button should be in the modal footer
    fireEvent.click(useButtons[useButtons.length - 1]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(WORKFLOW_TEMPLATES[0]);
  });

  it('shows node count in template cards', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    // Each template has 4 nodes, so we should see "4 nodes" text
    const nodeCountTexts = screen.getAllByText('4 nodes');
    expect(nodeCountTexts.length).toBe(WORKFLOW_TEMPLATES.length);
  });

  it('shows category badges', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    // Should show document processing and analysis categories
    expect(screen.getAllByText('Document Processing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Analysis').length).toBeGreaterThan(0);
  });

  it('shows the help text about starting from templates', () => {
    const onSelect = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelect} />);

    expect(
      screen.getByText('Start from a pre-built workflow template and customize it'),
    ).toBeDefined();
  });
});
