import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  Upload,
  Link2,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  CloudUpload,
  Globe,
  Sparkles,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { ingestPdf, ingestUrl, type IngestResponse } from '../services/ingestService';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'pdf' | 'url';

type IngestStatus =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'processing' }
  | { phase: 'success'; result: NonNullable<IngestResponse['data']> }
  | { phase: 'error'; message: string };

interface IngestModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${((bytes / 1024)).toFixed(1)} KB`;
  return `${((bytes / (1024 * 1024))).toFixed(1)} MB`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const IngestModal: React.FC<IngestModalProps> = ({ open, onClose, onSuccess }) => {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>('pdf');
  const [status, setStatus] = useState<IngestStatus>({ phase: 'idle' });

  // PDF state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL state
  const [urlValue, setUrlValue] = useState('');
  const [urlTitle, setUrlTitle] = useState('');

  const isProcessing =
    status.phase === 'uploading' || status.phase === 'processing';

  // ── Reset ────────────────────────────────────────────────────────────────

  const handleClose = () => {
    if (isProcessing) return;
    setStatus({ phase: 'idle' });
    setSelectedFile(null);
    setPdfTitle('');
    setUrlValue('');
    setUrlTitle('');
    setIsDragging(false);
    onClose();
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setStatus({ phase: 'idle' });
    } else {
      setStatus({ phase: 'error', message: 'Only PDF files are accepted.' });
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setStatus({ phase: 'idle' });
    }
  };

  // ── Submit PDF ────────────────────────────────────────────────────────────

  const handlePdfSubmit = async () => {
    if (!selectedFile || !session?.access_token) return;
    setStatus({ phase: 'uploading', progress: 0 });

    try {
      const result = await ingestPdf(selectedFile, session.access_token, pdfTitle || undefined, (pct) => {
        if (pct < 100) {
          setStatus({ phase: 'uploading', progress: pct });
        } else {
          setStatus({ phase: 'processing' });
        }
      });

      if (result.success && result.data) {
        setStatus({ phase: 'success', result: result.data });
        onSuccess?.();
      } else {
        setStatus({ phase: 'error', message: result.message });
      }
    } catch (err) {
      setStatus({
        phase: 'error',
        message: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    }
  };

  // ── Submit URL ────────────────────────────────────────────────────────────

  const handleUrlSubmit = async () => {
    if (!urlValue.trim() || !session?.access_token) return;
    setStatus({ phase: 'processing' });

    try {
      const result = await ingestUrl(urlValue.trim(), session.access_token, urlTitle || undefined);

      if (result.success && result.data) {
        setStatus({ phase: 'success', result: result.data });
        onSuccess?.();
      } else {
        setStatus({ phase: 'error', message: result.message });
      }
    } catch (err) {
      setStatus({
        phase: 'error',
        message: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    }
  };

  if (!open) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      {/* Modal */}
      <div
        id="ingest-modal"
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden animate-in"
        style={{ animation: 'modalIn 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
              <Sparkles size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Add Knowledge Source</h2>
              <p className="text-xs text-slate-500">Extract, embed, and store content</p>
            </div>
          </div>
          <button
            id="ingest-modal-close"
            onClick={handleClose}
            disabled={isProcessing}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* Pipeline steps indicator */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            {[
              { label: 'Extract Text', icon: FileText },
              { label: 'Chunk', icon: ChevronRight },
              { label: 'Embed', icon: Sparkles },
              { label: 'Store', icon: CheckCircle2 },
            ].map(({ label, icon: Icon }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <ChevronRight size={10} className="text-slate-300 flex-shrink-0" />}
                <span className="flex items-center gap-1">
                  <Icon size={10} />
                  {label}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Success State */}
          {status.phase === 'success' ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto">
                <CheckCircle2 size={26} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900">{status.result.title}</p>
                <p className="text-sm text-slate-500 mt-1">Ingestion complete!</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Source', value: status.result.source_type.toUpperCase() },
                  { label: 'Chunks', value: status.result.chunks_inserted.toString() },
                  { label: 'Words', value: status.result.total_words.toLocaleString() },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-lg font-bold text-slate-900">{value}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  id="ingest-add-another"
                  onClick={() => setStatus({ phase: 'idle' })}
                  className="flex-1 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
                >
                  Add Another
                </button>
                <button
                  id="ingest-done"
                  onClick={handleClose}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-sm shadow-emerald-500/30 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tab Switcher */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                <button
                  id="ingest-tab-pdf"
                  onClick={() => { setTab('pdf'); setStatus({ phase: 'idle' }); }}
                  disabled={isProcessing}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${
                    tab === 'pdf'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Upload size={14} />
                  Upload PDF
                </button>
                <button
                  id="ingest-tab-url"
                  onClick={() => { setTab('url'); setStatus({ phase: 'idle' }); }}
                  disabled={isProcessing}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${
                    tab === 'url'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Link2 size={14} />
                  Scrape URL
                </button>
              </div>

              {/* ── PDF Tab ─────────────────────────────────────────────── */}
              {tab === 'pdf' && (
                <div className="space-y-4">
                  {/* Drop Zone */}
                  <div
                    id="ingest-dropzone"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => !selectedFile && fileInputRef.current?.click()}
                    className={`
                      relative flex flex-col items-center justify-center gap-3
                      p-6 rounded-xl border-2 border-dashed cursor-pointer
                      transition-all duration-200
                      ${isDragging
                        ? 'border-emerald-400 bg-emerald-50 scale-[1.01]'
                        : selectedFile
                        ? 'border-slate-200 bg-slate-50 cursor-default'
                        : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30'
                      }
                    `}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={handleFileInput}
                    />

                    {selectedFile ? (
                      /* File Selected State */
                      <div className="flex items-center gap-3 w-full">
                        <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                          <FileText size={18} className="text-red-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {selectedFile.name}
                          </p>
                          <p className="text-xs text-slate-400">{formatBytes(selectedFile.size)}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setStatus({ phase: 'idle' }); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      /* Empty Drop Zone */
                      <>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isDragging ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                          <CloudUpload size={22} className={isDragging ? 'text-emerald-500' : 'text-slate-400'} />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-slate-700">
                            {isDragging ? 'Drop your PDF here' : 'Drop PDF or click to browse'}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">Max 25 MB · PDF only</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Optional Title */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Title <span className="text-slate-400 font-normal">(optional — defaults to PDF metadata)</span>
                    </label>
                    <input
                      id="ingest-pdf-title"
                      type="text"
                      placeholder="e.g. Q1 2026 Product Roadmap"
                      value={pdfTitle}
                      onChange={(e) => setPdfTitle(e.target.value)}
                      disabled={isProcessing}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 disabled:opacity-50 transition-all"
                    />
                  </div>

                  {/* Progress Bar */}
                  {(status.phase === 'uploading' || status.phase === 'processing') && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                          <Loader2 size={12} className="animate-spin text-emerald-500" />
                          {status.phase === 'uploading'
                            ? `Uploading… ${status.progress}%`
                            : 'Processing — extracting, chunking & embedding…'}
                        </span>
                        {status.phase === 'uploading' && (
                          <span className="text-slate-400">{status.progress}%</span>
                        )}
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-300"
                          style={{
                            width: status.phase === 'uploading'
                              ? `${status.progress}%`
                              : '100%',
                            animation: status.phase === 'processing'
                              ? 'pulse 1.5s ease-in-out infinite'
                              : undefined,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {status.phase === 'error' && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100">
                      <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 leading-relaxed">{status.message}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    id="ingest-pdf-submit"
                    onClick={handlePdfSubmit}
                    disabled={!selectedFile || isProcessing}
                    className="w-full py-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-sm shadow-emerald-500/30 transition-all active:scale-[0.98]"
                  >
                    {isProcessing ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 size={15} className="animate-spin" />
                        Processing…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Sparkles size={15} />
                        Extract & Ingest PDF
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* ── URL Tab ─────────────────────────────────────────────── */}
              {tab === 'url' && (
                <div className="space-y-4">
                  {/* URL Input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Page URL <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Globe
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        id="ingest-url-input"
                        type="url"
                        placeholder="https://docs.example.com/getting-started"
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        disabled={isProcessing}
                        className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 disabled:opacity-50 transition-all"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">
                      Must be publicly accessible. JavaScript-rendered pages may not work.
                    </p>
                  </div>

                  {/* Optional Title */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Title <span className="text-slate-400 font-normal">(optional — defaults to page &lt;title&gt;)</span>
                    </label>
                    <input
                      id="ingest-url-title"
                      type="text"
                      placeholder="e.g. Getting Started Guide"
                      value={urlTitle}
                      onChange={(e) => setUrlTitle(e.target.value)}
                      disabled={isProcessing}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 disabled:opacity-50 transition-all"
                    />
                  </div>

                  {/* Processing Indicator */}
                  {status.phase === 'processing' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                        <Loader2 size={12} className="animate-spin text-emerald-500" />
                        Scraping page and generating embeddings…
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
                          style={{ width: '100%', animation: 'pulse 1.5s ease-in-out infinite' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {status.phase === 'error' && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100">
                      <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 leading-relaxed">{status.message}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    id="ingest-url-submit"
                    onClick={handleUrlSubmit}
                    disabled={!urlValue.trim() || isProcessing}
                    className="w-full py-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-sm shadow-emerald-500/30 transition-all active:scale-[0.98]"
                  >
                    {isProcessing ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 size={15} className="animate-spin" />
                        Processing…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Globe size={15} />
                        Scrape & Ingest URL
                      </span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default IngestModal;
