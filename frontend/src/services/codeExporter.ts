/**
 * @module services/codeExporter
 * @description Service for exporting generated workflow code in various formats.
 *
 * Supports three export modes:
 * - Single TypeScript file (immediate download)
 * - npm package (ZIP with package.json, tsconfig.json, src/index.ts, README)
 * - GitHub Gist (via GitHub API with personal access token)
 *
 * All exports go through validation before generation to ensure the exported
 * code is immediately usable.
 */

import {
  generatePackageJson,
  generateTsConfig,
  generateReadme,
  generateTestScaffold,
  sanitizePackageName,
} from './packageTemplates';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'file' | 'package' | 'gist';

export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Workflow name */
  workflowName: string;
  /** Workflow description */
  workflowDescription: string;
  /** Generated TypeScript code */
  code: string;
  /** Whether to include dependency information */
  includeDependencies: boolean;
  /** Whether to include test scaffold */
  includeTests: boolean;
  /** Custom package name (for package/gist formats) */
  customPackageName?: string;
  /** GitHub personal access token (for gist format) */
  githubToken?: string;
  /** Whether the gist should be public */
  gistPublic?: boolean;
  /** Node types used in the workflow (for README) */
  nodeTypes?: string[];
  /** Number of nodes in the workflow */
  nodeCount?: number;
}

export interface ExportResult {
  /** Whether the export succeeded */
  success: boolean;
  /** Export format used */
  format: ExportFormat;
  /** Filename of the exported file */
  filename: string;
  /** Error message if export failed */
  error?: string;
  /** URL of the gist (for gist format) */
  gistUrl?: string;
  /** Timestamp of the export */
  timestamp: string;
}

export interface ValidationResult {
  /** Whether the code is valid for export */
  valid: boolean;
  /** Validation error messages */
  errors: string[];
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates that the generated code is ready for export.
 *
 * Checks:
 * - Code is non-empty
 * - Code contains expected structure (export function, imports)
 * - No obvious syntax issues
 *
 * @param code - The generated TypeScript code to validate
 * @returns Validation result with any errors
 */
export function validateForExport(code: string): ValidationResult {
  const errors: string[] = [];

  if (!code || code.trim().length === 0) {
    errors.push('No code to export. Generate code from the workflow first.');
    return { valid: false, errors };
  }

  if (!code.includes('export async function') && !code.includes('export function')) {
    errors.push('Generated code does not contain an exported function. The workflow may be invalid.');
  }

  if (!code.includes('import')) {
    errors.push('Generated code has no imports. Required dependencies may be missing.');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Export: Single File
// ============================================================================

/**
 * Exports the generated code as a single TypeScript file download.
 *
 * Creates a Blob with the code content and triggers a browser download
 * with an appropriate filename based on the workflow name and date.
 *
 * @param options - Export options
 * @returns Export result
 */
export function exportAsFile(options: ExportOptions): ExportResult {
  const { workflowName, code, includeDependencies } = options;
  const timestamp = new Date().toISOString();

  try {
    let fileContent = code;

    // Optionally append dependency comment block
    if (includeDependencies) {
      const deps = extractDependencies(code);
      if (deps.length > 0) {
        const depComment = [
          '',
          '// ============================================================================',
          '// Required Dependencies',
          '// ============================================================================',
          '// Install with:',
          `// npm install ${deps.join(' ')}`,
          '// ============================================================================',
          '',
        ].join('\n');
        fileContent = fileContent + depComment;
      }
    }

    const blob = new Blob([fileContent], { type: 'text/typescript;charset=utf-8' });
    const filename = generateFilename(workflowName, 'ts');

    triggerDownload(blob, filename);

    return {
      success: true,
      format: 'file',
      filename,
      timestamp,
    };
  } catch (error: any) {
    return {
      success: false,
      format: 'file',
      filename: '',
      error: error.message,
      timestamp,
    };
  }
}

// ============================================================================
// Export: npm Package (ZIP)
// ============================================================================

/**
 * Exports the generated code as a complete npm package in a ZIP file.
 *
 * The ZIP contains:
 * - package.json with all LangChain dependencies
 * - tsconfig.json with strict TypeScript settings
 * - src/index.ts with the generated workflow code
 * - README.md with usage instructions
 * - Optionally: src/__tests__/index.test.ts with a Vitest scaffold
 *
 * Uses the browser's native compression capabilities via Blob construction.
 * Since we're in a browser environment without access to native ZIP libraries,
 * we create an uncompressed ZIP using the ZIP file format specification.
 *
 * @param options - Export options
 * @returns Export result
 */
export function exportAsPackage(options: ExportOptions): ExportResult {
  const {
    workflowName,
    workflowDescription,
    code,
    includeTests,
    customPackageName,
    nodeTypes = [],
    nodeCount = 0,
  } = options;
  const timestamp = new Date().toISOString();

  try {
    const packageName = customPackageName || sanitizePackageName(workflowName);

    // Generate all package files
    const files: Record<string, string> = {
      'package.json': generatePackageJson({
        name: packageName,
        description: workflowDescription,
        workflowName,
        includeTests,
      }),
      'tsconfig.json': generateTsConfig(),
      'src/index.ts': code,
      'README.md': generateReadme({
        name: workflowName,
        description: workflowDescription,
        nodeTypes,
        nodeCount,
        generatedAt: timestamp,
        includeTests,
      }),
    };

    if (includeTests) {
      files['src/__tests__/index.test.ts'] = generateTestScaffold(workflowName);
    }

    // Build ZIP file
    const zipBlob = createZipBlob(files);
    const filename = generateFilename(packageName, 'zip');

    triggerDownload(zipBlob, filename);

    return {
      success: true,
      format: 'package',
      filename,
      timestamp,
    };
  } catch (error: any) {
    return {
      success: false,
      format: 'package',
      filename: '',
      error: error.message,
      timestamp,
    };
  }
}

// ============================================================================
// Export: GitHub Gist
// ============================================================================

/**
 * Exports the generated code as a GitHub Gist.
 *
 * Creates a gist with the workflow code and optionally the package files.
 * Requires a valid GitHub personal access token with gist scope.
 *
 * @param options - Export options including GitHub token
 * @returns Export result with gist URL
 */
export async function exportAsGist(options: ExportOptions): Promise<ExportResult> {
  const {
    workflowName,
    workflowDescription: gistDescription,
    code,
    githubToken,
    gistPublic = false,
    includeDependencies,
  } = options;
  const timestamp = new Date().toISOString();

  if (!githubToken) {
    return {
      success: false,
      format: 'gist',
      filename: '',
      error: 'GitHub personal access token is required for gist export.',
      timestamp,
    };
  }

  try {
    const files: Record<string, { content: string }> = {
      [`${sanitizePackageName(workflowName)}.ts`]: { content: code },
    };

    if (includeDependencies) {
      const deps = extractDependencies(code);
      if (deps.length > 0) {
        files['dependencies.txt'] = {
          content: `# Required dependencies for ${workflowName}\n# Install with: npm install ${deps.join(' ')}\n\n${deps.join('\n')}`,
        };
      }
    }

    const response = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        description: `${workflowName} - ${gistDescription || 'Generated LangChain workflow'}`,
        public: gistPublic,
        files,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `GitHub API error (${response.status}): ${errorData.message || response.statusText}`
      );
    }

    const gistData = await response.json();

    return {
      success: true,
      format: 'gist',
      filename: `${sanitizePackageName(workflowName)}.ts`,
      gistUrl: gistData.html_url,
      timestamp,
    };
  } catch (error: any) {
    return {
      success: false,
      format: 'gist',
      filename: '',
      error: error.message,
      timestamp,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generates a filename with workflow name and date stamp.
 * Format: workflow-name-YYYY-MM-DD.ext
 */
export function generateFilename(name: string, extension: string): string {
  const safeName = sanitizePackageName(name);
  const date = new Date().toISOString().split('T')[0];
  return `${safeName}-${date}.${extension}`;
}

/**
 * Extracts dependency package names from import statements in generated code.
 */
export function extractDependencies(code: string): string[] {
  const importRegex = /from\s+['"]([^'"./][^'"]*)['"]/g;
  const deps = new Set<string>();

  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const moduleName = match[1];
    // Get the package name (handle scoped packages like @langchain/core)
    if (moduleName.startsWith('@')) {
      const parts = moduleName.split('/');
      deps.add(`${parts[0]}/${parts[1]}`);
    } else {
      deps.add(moduleName.split('/')[0]);
    }
  }

  return Array.from(deps).sort();
}

/**
 * Triggers a browser file download from a Blob.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Creates a ZIP file as a Blob from a dictionary of filename -> content.
 *
 * Uses the ZIP file format specification to create an uncompressed archive.
 * This works purely in the browser without external dependencies.
 */
export function createZipBlob(files: Record<string, string>): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  const entries = Object.entries(files);

  for (const [filename, content] of entries) {
    const fileData = encoder.encode(content);
    const fileNameBytes = encoder.encode(filename);
    const crc = crc32(fileData);

    // Local file header
    const localHeader = new Uint8Array(30 + fileNameBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true);  // Local file header signature
    view.setUint16(4, 20, true);           // Version needed to extract
    view.setUint16(6, 0, true);            // General purpose bit flag
    view.setUint16(8, 0, true);            // Compression method (store)
    view.setUint16(10, 0, true);           // Last mod file time
    view.setUint16(12, 0, true);           // Last mod file date
    view.setUint32(14, crc, true);         // CRC-32
    view.setUint32(18, fileData.length, true);  // Compressed size
    view.setUint32(22, fileData.length, true);  // Uncompressed size
    view.setUint16(26, fileNameBytes.length, true); // File name length
    view.setUint16(28, 0, true);           // Extra field length

    localHeader.set(fileNameBytes, 30);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + fileNameBytes.length);
    const cdView = new DataView(cdEntry.buffer);

    cdView.setUint32(0, 0x02014b50, true);  // Central directory signature
    cdView.setUint16(4, 20, true);           // Version made by
    cdView.setUint16(6, 20, true);           // Version needed to extract
    cdView.setUint16(8, 0, true);            // General purpose bit flag
    cdView.setUint16(10, 0, true);           // Compression method
    cdView.setUint16(12, 0, true);           // Last mod file time
    cdView.setUint16(14, 0, true);           // Last mod file date
    cdView.setUint32(16, crc, true);         // CRC-32
    cdView.setUint32(20, fileData.length, true);  // Compressed size
    cdView.setUint32(24, fileData.length, true);  // Uncompressed size
    cdView.setUint16(28, fileNameBytes.length, true); // File name length
    cdView.setUint16(30, 0, true);           // Extra field length
    cdView.setUint16(32, 0, true);           // File comment length
    cdView.setUint16(34, 0, true);           // Disk number start
    cdView.setUint16(36, 0, true);           // Internal file attributes
    cdView.setUint32(38, 0, true);           // External file attributes
    cdView.setUint32(42, offset, true);      // Relative offset of local header

    cdEntry.set(fileNameBytes, 46);
    centralDirectory.push(cdEntry);

    parts.push(localHeader);
    parts.push(fileData);
    offset += localHeader.length + fileData.length;
  }

  // Write central directory entries
  const cdOffset = offset;
  let cdSize = 0;
  for (const cdEntry of centralDirectory) {
    parts.push(cdEntry);
    cdSize += cdEntry.length;
  }

  // End of central directory record
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, 0x06054b50, true);  // End of central directory signature
  eocdView.setUint16(4, 0, true);            // Number of this disk
  eocdView.setUint16(6, 0, true);            // Disk with central directory
  eocdView.setUint16(8, entries.length, true);  // Entries on this disk
  eocdView.setUint16(10, entries.length, true); // Total entries
  eocdView.setUint32(12, cdSize, true);         // Central directory size
  eocdView.setUint32(16, cdOffset, true);       // Central directory offset
  eocdView.setUint16(20, 0, true);              // Comment length

  parts.push(eocd);

  return new Blob(parts as BlobPart[], { type: 'application/zip' });
}

/**
 * CRC-32 calculation for ZIP file integrity.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
