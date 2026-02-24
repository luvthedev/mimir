import { useState, useCallback } from 'react';
import {
  X,
  Download,
  Package,
  Github,
  FileCode,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  FileText,
  TestTube,
} from 'lucide-react';
import {
  exportAsFile,
  exportAsPackage,
  exportAsGist,
  validateForExport,
} from '../services/codeExporter';
import type { ExportFormat, ExportResult } from '../services/codeExporter';

// ============================================================================
// Types
// ============================================================================

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Generated TypeScript code to export */
  code: string;
  /** Workflow name */
  workflowName: string;
  /** Workflow description */
  workflowDescription: string;
  /** Node types used in the workflow */
  nodeTypes: string[];
  /** Number of nodes in the workflow */
  nodeCount: number;
  /** Callback when export completes (for tracking) */
  onExportComplete?: (result: ExportResult) => void;
}

interface FormatOption {
  id: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}

// ============================================================================
// Format Options
// ============================================================================

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'file',
    label: 'Single File',
    description: 'Download as a standalone .ts file with dependency comments',
    icon: <FileCode className="w-5 h-5" />,
  },
  {
    id: 'package',
    label: 'npm Package',
    description: 'ZIP with package.json, tsconfig, README, and source',
    icon: <Package className="w-5 h-5" />,
  },
  {
    id: 'gist',
    label: 'GitHub Gist',
    description: 'Create a GitHub Gist (requires personal access token)',
    icon: <Github className="w-5 h-5" />,
  },
];

// ============================================================================
// Component
// ============================================================================

export function ExportDialog({
  isOpen,
  onClose,
  code,
  workflowName,
  workflowDescription,
  nodeTypes,
  nodeCount,
  onExportComplete,
}: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('file');
  const [includeDependencies, setIncludeDependencies] = useState(true);
  const [includeTests, setIncludeTests] = useState(false);
  const [customPackageName, setCustomPackageName] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [gistPublic, setGistPublic] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  if (!isOpen) return null;

  const validation = validateForExport(code);

  const handleExport = useCallback(async () => {
    // Re-validate
    const preValidation = validateForExport(code);
    if (!preValidation.valid) {
      setValidationErrors(preValidation.errors);
      return;
    }

    setIsExporting(true);
    setExportResult(null);
    setValidationErrors([]);

    const options = {
      format: selectedFormat,
      workflowName,
      workflowDescription,
      code,
      includeDependencies,
      includeTests,
      customPackageName: customPackageName.trim() || undefined,
      githubToken: githubToken.trim() || undefined,
      gistPublic,
      nodeTypes,
      nodeCount,
    };

    let result: ExportResult;

    try {
      switch (selectedFormat) {
        case 'file':
          result = exportAsFile(options);
          break;
        case 'package':
          result = exportAsPackage(options);
          break;
        case 'gist':
          result = await exportAsGist(options);
          break;
        default:
          result = {
            success: false,
            format: selectedFormat,
            filename: '',
            error: `Unknown format: ${selectedFormat}`,
            timestamp: new Date().toISOString(),
          };
      }

      setExportResult(result);
      onExportComplete?.(result);
    } catch (error: any) {
      setExportResult({
        success: false,
        format: selectedFormat,
        filename: '',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    code,
    selectedFormat,
    workflowName,
    workflowDescription,
    includeDependencies,
    includeTests,
    customPackageName,
    githubToken,
    gistPublic,
    nodeTypes,
    nodeCount,
    onExportComplete,
  ]);

  const handleClose = () => {
    setExportResult(null);
    setValidationErrors([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-norse-stone border-2 border-norse-rune rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-norse-rune">
          <div className="flex items-center space-x-3">
            <Download className="w-6 h-6 text-valhalla-gold" />
            <h2 className="text-xl font-bold text-valhalla-gold">Export Code</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-norse-rune rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Validation Error Banner */}
          {!validation.valid && (
            <div className="p-3 rounded-lg border bg-red-900/20 border-red-700">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-400">Code not ready for export</p>
                  <ul className="mt-1 space-y-0.5">
                    {validation.errors.map((err) => (
                      <li key={err} className="text-sm text-red-300">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Export Format</label>
            <div className="grid grid-cols-3 gap-3">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setSelectedFormat(option.id);
                    setExportResult(null);
                  }}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedFormat === option.id
                      ? 'border-valhalla-gold bg-valhalla-gold/10 text-valhalla-gold'
                      : 'border-norse-rune bg-norse-shadow/30 text-gray-300 hover:border-norse-mist hover:bg-norse-shadow/50'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    {option.icon}
                    <span className="font-medium text-sm">{option.label}</span>
                  </div>
                  <p className="text-xs text-gray-400">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">Options</label>

            {/* Include Dependencies */}
            <label className="flex items-center space-x-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={includeDependencies}
                onChange={(e) => setIncludeDependencies(e.target.checked)}
                className="w-4 h-4 rounded border-norse-rune bg-norse-night text-valhalla-gold focus:ring-valhalla-gold focus:ring-offset-0 cursor-pointer"
              />
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-gray-400 group-hover:text-gray-300" />
                <span className="text-sm text-gray-300 group-hover:text-gray-200">
                  Include dependencies
                </span>
              </div>
            </label>

            {/* Include Tests */}
            {(selectedFormat === 'package') && (
              <label className="flex items-center space-x-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={includeTests}
                  onChange={(e) => setIncludeTests(e.target.checked)}
                  className="w-4 h-4 rounded border-norse-rune bg-norse-night text-valhalla-gold focus:ring-valhalla-gold focus:ring-offset-0 cursor-pointer"
                />
                <div className="flex items-center space-x-2">
                  <TestTube className="w-4 h-4 text-gray-400 group-hover:text-gray-300" />
                  <span className="text-sm text-gray-300 group-hover:text-gray-200">
                    Include test scaffold (Vitest)
                  </span>
                </div>
              </label>
            )}
          </div>

          {/* Package Name (for package and gist) */}
          {(selectedFormat === 'package' || selectedFormat === 'gist') && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Custom Package Name
                <span className="text-gray-500 font-normal ml-1">(optional)</span>
              </label>
              <input
                type="text"
                value={customPackageName}
                onChange={(e) => setCustomPackageName(e.target.value)}
                placeholder={workflowName.toLowerCase().replace(/\s+/g, '-')}
                className="w-full px-3 py-2 bg-norse-night border-2 border-norse-rune text-gray-100 placeholder-gray-600 rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm"
              />
            </div>
          )}

          {/* GitHub Token (for gist) */}
          {selectedFormat === 'gist' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  GitHub Personal Access Token
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 bg-norse-night border-2 border-norse-rune text-gray-100 placeholder-gray-600 rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Requires <code className="text-gray-400">gist</code> scope. Token is not stored.
                </p>
              </div>

              <label className="flex items-center space-x-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={gistPublic}
                  onChange={(e) => setGistPublic(e.target.checked)}
                  className="w-4 h-4 rounded border-norse-rune bg-norse-night text-valhalla-gold focus:ring-valhalla-gold focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-sm text-gray-300 group-hover:text-gray-200">
                  Make gist public
                </span>
              </label>
            </div>
          )}

          {/* Export Result */}
          {exportResult && (
            <div
              className={`p-3 rounded-lg border ${
                exportResult.success
                  ? 'bg-green-900/20 border-green-700'
                  : 'bg-red-900/20 border-red-700'
              }`}
            >
              <div className="flex items-start space-x-2">
                {exportResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  {exportResult.success ? (
                    <>
                      <p className="font-medium text-green-400">Export successful</p>
                      <p className="text-sm text-gray-400 mt-0.5">
                        {exportResult.format === 'gist' ? (
                          <a
                            href={exportResult.gistUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-frost-ice hover:text-frost-glacial flex items-center space-x-1"
                          >
                            <span>View gist</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span>Downloaded: {exportResult.filename}</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-red-400">Export failed</p>
                      <p className="text-sm text-red-300 mt-0.5">{exportResult.error}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Validation Errors */}
          {validationErrors.length > 0 && !exportResult && (
            <div className="p-3 rounded-lg border bg-red-900/20 border-red-700">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-400">Validation failed</p>
                  <ul className="mt-1 space-y-0.5">
                    {validationErrors.map((err) => (
                      <li key={err} className="text-sm text-red-300">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-norse-rune bg-norse-shadow/30">
          <p className="text-xs text-gray-500">
            {selectedFormat === 'file' && 'Downloads a single TypeScript file'}
            {selectedFormat === 'package' && 'Downloads a ZIP with all package files'}
            {selectedFormat === 'gist' && 'Creates a GitHub Gist with the code'}
          </p>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-norse-rune text-gray-200 font-medium rounded-lg hover:bg-norse-mist transition-colors"
            >
              {exportResult?.success ? 'Done' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || !validation.valid || (selectedFormat === 'gist' && !githubToken.trim())}
              className="px-4 py-2 bg-valhalla-gold text-norse-night font-semibold rounded-lg hover:bg-valhalla-amber disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
