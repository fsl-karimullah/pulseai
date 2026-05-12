import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  CloudUpload,
  Sparkles,
  ChevronRight,
  Trash2,
  FileCheck,
  XCircle,
  Check,
  Info,
} from 'lucide-react';
import { ingestPdf, type IngestResponse } from '../services/ingestService';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  const [status, setStatus] = useState<IngestStatus>({ phase: 'idle' });
  const [showGuide, setShowGuide] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = status.phase === 'uploading' || status.phase === 'processing';

  const handleClose = () => {
    if (isProcessing) return;
    setStatus({ phase: 'idle' });
    setSelectedFile(null);
    setPdfTitle('');
    setIsDragging(false);
    onClose();
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      if (file.size > 4 * 1024 * 1024) {
        setStatus({ phase: 'error', message: 'Ukuran file maksimal 4MB. Silakan kompres PDF Anda terlebih dahulu.' });
        return;
      }
      setSelectedFile(file);
      setStatus({ phase: 'idle' });
    } else {
      setStatus({ phase: 'error', message: 'Hanya file PDF yang diterima.' });
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        setStatus({ phase: 'error', message: 'Ukuran file maksimal 4MB. Silakan kompres PDF Anda terlebih dahulu.' });
        return;
      }
      setSelectedFile(file);
      setStatus({ phase: 'idle' });
    }
  };

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
        message: err instanceof Error ? err.message : 'Terjadi kesalahan yang tidak terduga.',
      });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        id="ingest-modal"
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden"
        style={{ animation: 'modalIn 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
              <Upload size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Upload Dokumen PDF</h2>
              <p className="text-xs text-slate-500">Ekstrak, embed, dan simpan konten ke basis pengetahuan</p>
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
              { label: 'Ekstrak Teks', icon: FileText },
              { label: 'Pecah', icon: ChevronRight },
              { label: 'Embed', icon: Sparkles },
              { label: 'Simpan', icon: CheckCircle2 },
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
                <p className="text-sm text-slate-500 mt-1">Berhasil diproses!</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Sumber', value: status.result.source_type.toUpperCase() },
                  { label: 'Bagian', value: status.result.chunks_inserted.toString() },
                  { label: 'Kata', value: status.result.total_words.toLocaleString() },
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
                  onClick={() => { setStatus({ phase: 'idle' }); setSelectedFile(null); setPdfTitle(''); }}
                  className="flex-1 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
                >
                  Upload Lagi
                </button>
                <button
                  id="ingest-done"
                  onClick={handleClose}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-sm shadow-emerald-500/30 transition-all"
                >
                  Selesai
                </button>
              </div>
            </div>
          ) : (
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
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                      <FileText size={18} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{selectedFile.name}</p>
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
                  <>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isDragging ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <CloudUpload size={22} className={isDragging ? 'text-emerald-500' : 'text-slate-400'} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-700">
                        {isDragging ? 'Lepaskan PDF di sini' : 'Seret PDF atau klik untuk pilih file'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Maks 4 MB · Hanya PDF</p>
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowGuide(true); }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      <Info size={14} />
                      Panduan Optimasi PDF
                    </button>
                  </>
                )}
              </div>

              {/* Optional Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Judul <span className="text-slate-400 font-normal">(opsional — default dari metadata PDF)</span>
                </label>
                <input
                  id="ingest-pdf-title"
                  type="text"
                  placeholder="contoh: Panduan Produk Q1 2026"
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
                        ? `Mengunggah… ${status.progress}%`
                        : 'Memproses — ekstrak, pecah & embed…'}
                    </span>
                    {status.phase === 'uploading' && (
                      <span className="text-slate-400">{status.progress}%</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-300"
                      style={{
                        width: status.phase === 'uploading' ? `${status.progress}%` : '100%',
                        animation: status.phase === 'processing' ? 'pulse 1.5s ease-in-out infinite' : undefined,
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
                    Memproses…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Sparkles size={15} />
                    Ekstrak & Simpan PDF
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {showGuide && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={(e) => { e.stopPropagation(); setShowGuide(false); }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden font-sans" onClick={(e) => e.stopPropagation()} style={{ animation: 'modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
                  <FileCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Panduan Optimasi Dokumen</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Agar AI merespon dengan lebih akurat</p>
                </div>
              </div>
              <button onClick={() => setShowGuide(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* DOs Section */}
              <div>
                <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Check size={12} />
                  Sangat Disarankan
                </h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Check size={12} className="text-emerald-500" />
                    </div>
                    <span className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Digital Text Format:</strong> Gunakan PDF hasil export langsung dari Word/Docs, bukan scan gambar.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Check size={12} className="text-emerald-500" />
                    </div>
                    <span className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Clear Structure:</strong> Gunakan Heading (H1, H2) dan penomoran yang jelas.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Check size={12} className="text-emerald-500" />
                    </div>
                    <span className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Bullet Points:</strong> Gunakan poin-poin untuk daftar, mempermudah AI memahami konteks.</span>
                  </li>
                </ul>
              </div>

              {/* DON'Ts Section */}
              <div>
                <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <XCircle size={12} />
                  Hindari Hal Berikut
                </h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <XCircle size={12} className="text-amber-500" />
                    </div>
                    <span className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Password Protected:</strong> Pastikan PDF tidak terkunci oleh kata sandi.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <XCircle size={12} className="text-amber-500" />
                    </div>
                    <span className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Hand-written notes:</strong> Jangan gunakan tulisan tangan atau coretan manual.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                      <XCircle size={12} className="text-red-500" />
                    </div>
                    <span className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-800">Blurry Photo Scans:</strong> Hindari foto buram dari kamera HP; AI kesulitan membacanya.</span>
                  </li>
                </ul>
              </div>

              {/* Specs */}
              <div className="flex gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Max File Size</p>
                  <p className="text-sm font-bold text-slate-800">10MB</p>
                </div>
                <div className="w-px bg-slate-200"></div>
                <div className="flex-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Recommended Font</p>
                  <p className="text-sm font-bold text-slate-800">10pt+</p>
                </div>
              </div>
              
              <button 
                onClick={() => setShowGuide(false)}
                className="w-full py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

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
