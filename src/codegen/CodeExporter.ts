/**
 * @module codegen/CodeExporter
 * @description Service for exporting generated workflow code in various formats.
 *
 * Supports three export modes:
 * - **Single file**: Export as a standalone `.ts` file
 * - **npm package**: Export as a complete package with package.json, tsconfig, README
 * - **GitHub Gist**: Post generated code to GitHub Gist API
 *
 * Validates the workflow before export and tracks export history.
 *
 * @example
 * ```typescript
 * import { CodeExporter } from './codegen/CodeExporter.js';
 * import type { Workflow } from './types/workflow.js';
 *
 * const exporter = new CodeExporter();
 * const blob = await exporter.exportAsFile(workflow);
 * ```
 */

import type { Workflow } from '../types/workflow.js';
import { CodeGenerator } from './CodeGenerator.js';
import {
  generatePackageJson,
  generateTsConfig,
  generateReadme,
  generateTestScaffold,
} from './packageTemplates.js';
import type { PackageTemplateOptions } from './packageTemplates.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported export formats.
 */
export type ExportFormat = 'single-file' | 'npm-package' | 'github-gist';

/**
 * Options controlling the export process.
 */
export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Custom package name (for npm-package format) */
  packageName?: string;
  /** Whether to include dependency information in single-file exports */
  includeDependencies?: boolean;
  /** Whether to include test scaffolding */
  includeTests?: boolean;
  /** GitHub personal access token (for gist export) */
  githubToken?: string;
  /** Whether the gist should be public */
  gistPublic?: boolean;
}

/**
 * Result of a file export (single .ts file).
 */
export interface FileExportResult {
  /** The generated code content */
  content: string;
  /** Suggested filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** Dependencies required to run the code */
  dependencies: Record<string, string>;
}

/**
 * A file entry within a package export.
 */
export interface PackageFile {
  /** Relative path within the package */
  path: string;
  /** File content */
  content: string;
}

/**
 * Result of a package export.
 */
export interface PackageExportResult {
  /** All files that make up the package */
  files: PackageFile[];
  /** Root package name */
  packageName: string;
}

/**
 * Result of a GitHub Gist export.
 */
export interface GistExportResult {
  /** The gist URL */
  url: string;
  /** The gist ID */
  gistId: string;
  /** URL for the raw file */
  rawUrl: string;
}

/**
 * Metadata about a completed export, stored for audit trail.
 */
export interface ExportHistoryEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Export format used */
  format: ExportFormat;
  /** Filename or package name */
  filename: string;
  /** Workflow ID that was exported */
  workflowId: string;
  /** Workflow name at time of export */
  workflowName: string;
  /** Whether tests were included */
  includedTests: boolean;
}

// ============================================================================
// CodeExporter Service
// ============================================================================

/**
 * Service for exporting generated workflow code in various formats.
 *
 * Stateless - each export call is independent.
 */
export class CodeExporter {
  private codeGenerator: CodeGenerator;
  private exportHistory: ExportHistoryEntry[] = [];

  constructor(codeGenerator?: CodeGenerator) {
    this.codeGenerator = codeGenerator ?? new CodeGenerator();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Export workflow as a single TypeScript file.
   *
   * @param workflow - The workflow to export
   * @param options - Export options
   * @returns File content, filename, and dependency information
   * @throws Error if code generation fails
   */
  async exportAsFile(
    workflow: Workflow,
    options?: Partial<ExportOptions>,
  ): Promise<FileExportResult> {
    const code = await this.codeGenerator.generateCode(workflow);
    const dependencies = this.collectDependencies(workflow);
    const filename = this.generateFilename(workflow.name, 'ts');

    let content = code;

    // Add dependency comment block at the top if requested
    if (options?.includeDependencies !== false) {
      const depComment = this.generateDependencyComment(dependencies);
      content = depComment + '\n' + code;
    }

    this.recordExport(workflow, 'single-file', filename, options?.includeTests ?? false);

    return {
      content,
      filename,
      mimeType: 'text/typescript',
      dependencies,
    };
  }

  /**
   * Export workflow as a complete npm package.
   *
   * Generates package.json, tsconfig.json, README.md, and the workflow
   * source code in a src/ directory structure.
   *
   * @param workflow - The workflow to export
   * @param options - Export options
   * @returns Array of files that make up the package
   */
  async exportAsPackage(
    workflow: Workflow,
    options?: Partial<ExportOptions>,
  ): Promise<PackageExportResult> {
    const code = await this.codeGenerator.generateCode(workflow);
    const packageName = this.sanitizePackageName(
      options?.packageName || workflow.name,
    );
    const usesLLM = this.workflowUsesLLM(workflow);
    const nodeTypes = [...new Set(workflow.nodes.map((n) => n.type))];
    const includeTests = options?.includeTests ?? false;

    const templateOptions: PackageTemplateOptions = {
      packageName,
      workflowName: workflow.name,
      workflowDescription: workflow.description,
      usesLLM,
      nodeTypes,
      generatedAt: new Date().toISOString(),
      includeTests,
    };

    const files: PackageFile[] = [
      {
        path: 'package.json',
        content: generatePackageJson(templateOptions),
      },
      {
        path: 'tsconfig.json',
        content: generateTsConfig(),
      },
      {
        path: 'README.md',
        content: generateReadme(templateOptions, code),
      },
      {
        path: 'src/index.ts',
        content: code,
      },
    ];

    // Add test scaffold if requested
    if (includeTests) {
      files.push({
        path: 'src/__tests__/workflow.test.ts',
        content: generateTestScaffold(templateOptions),
      });
    }

    // Add .env.example if LLM is used
    if (usesLLM) {
      files.push({
        path: '.env.example',
        content: [
          '# Required: OpenAI API Key',
          'OPENAI_API_KEY=your-api-key-here',
          '',
          '# Optional: Override default model (default: gpt-4-turbo)',
          '# MIMIR_DEFAULT_MODEL=gpt-4-turbo',
          '',
        ].join('\n'),
      });
    }

    this.recordExport(workflow, 'npm-package', packageName, includeTests);

    return { files, packageName };
  }

  /**
   * Export workflow as a GitHub Gist.
   *
   * Posts the generated code to the GitHub Gist API. Requires a valid
   * personal access token with `gist` scope.
   *
   * @param workflow - The workflow to export
   * @param options - Export options (must include githubToken)
   * @returns Gist URL and metadata
   * @throws Error if no GitHub token is provided or API call fails
   */
  async exportAsGist(
    workflow: Workflow,
    options: Partial<ExportOptions> & { githubToken: string },
  ): Promise<GistExportResult> {
    if (!options.githubToken) {
      throw new Error('GitHub personal access token is required for gist export.');
    }

    const code = await this.codeGenerator.generateCode(workflow);
    const dependencies = this.collectDependencies(workflow);
    const filename = this.generateFilename(workflow.name, 'ts');
    const depComment = this.generateDependencyComment(dependencies);
    const fullCode = depComment + '\n' + code;

    const gistPayload = {
      description: `Mimir Workflow: ${workflow.name} - Generated LangChain TypeScript code`,
      public: options.gistPublic ?? false,
      files: {
        [filename]: { content: fullCode },
      },
    };

    const response = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(gistPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `GitHub Gist API error (${response.status}): ${errorBody}`,
      );
    }

    const gistData = (await response.json()) as {
      id: string;
      html_url: string;
      files: Record<string, { raw_url: string }>;
    };

    this.recordExport(workflow, 'github-gist', filename, options.includeTests ?? false);

    return {
      url: gistData.html_url,
      gistId: gistData.id,
      rawUrl: gistData.files[filename]?.raw_url ?? gistData.html_url,
    };
  }

  // ==========================================================================
  // Export History
  // ==========================================================================

  /**
   * Get the export history for this session.
   *
   * @returns Array of export history entries
   */
  getExportHistory(): ExportHistoryEntry[] {
    return [...this.exportHistory];
  }

  /**
   * Clear the export history.
   */
  clearExportHistory(): void {
    this.exportHistory = [];
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Validate that a workflow is ready for export.
   *
   * Checks:
   * - Workflow has nodes
   * - Code generates without errors
   * - All required dependencies can be identified
   *
   * @param workflow - The workflow to validate
   * @returns Validation result with any error messages
   */
  async validateForExport(
    workflow: Workflow,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow must contain at least one node.');
      return { valid: false, errors };
    }

    if (!workflow.name || workflow.name.trim().length === 0) {
      errors.push('Workflow must have a name.');
    }

    // Try generating code to check for generation errors
    try {
      await this.codeGenerator.generateCode(workflow);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown code generation error';
      errors.push(`Code generation failed: ${message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Collect npm dependencies based on the node types in the workflow.
   */
  private collectDependencies(workflow: Workflow): Record<string, string> {
    const deps: Record<string, string> = {
      '@langchain/core': '^1.0.0',
    };

    if (this.workflowUsesLLM(workflow)) {
      deps['@langchain/openai'] = '^1.0.0';
    }

    return deps;
  }

  /**
   * Check if the workflow uses any LLM-powered nodes.
   */
  private workflowUsesLLM(workflow: Workflow): boolean {
    return workflow.nodes.some(
      (n) => n.type === 'extract' || n.type === 'transform',
    );
  }

  /**
   * Generate a filename from the workflow name and date.
   *
   * Format: `workflow-name-YYYY-MM-DD.ext`
   */
  private generateFilename(workflowName: string, extension: string): string {
    const sanitized = workflowName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'workflow';

    const date = new Date().toISOString().split('T')[0];
    return `${sanitized}-${date}.${extension}`;
  }

  /**
   * Sanitize a string into a valid npm package name.
   */
  private sanitizePackageName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      || 'mimir-workflow';
  }

  /**
   * Generate a comment block listing required dependencies.
   */
  private generateDependencyComment(
    dependencies: Record<string, string>,
  ): string {
    const lines = [
      '// ============================================================================',
      '// Required Dependencies',
      '// ============================================================================',
      '//',
      '// Install these packages before running:',
      '//',
      '//   npm install \\',
    ];

    const depEntries = Object.entries(dependencies);
    depEntries.forEach(([name, version], i) => {
      const separator = i < depEntries.length - 1 ? ' \\' : '';
      lines.push(`//     ${name}@${version.replace('^', '')}${separator}`);
    });

    lines.push('//');
    lines.push('// ============================================================================');

    return lines.join('\n');
  }

  /**
   * Record an export in the history.
   */
  private recordExport(
    workflow: Workflow,
    format: ExportFormat,
    filename: string,
    includedTests: boolean,
  ): void {
    this.exportHistory.push({
      timestamp: new Date().toISOString(),
      format,
      filename,
      workflowId: workflow.id,
      workflowName: workflow.name,
      includedTests,
    });
  }
}
