import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Briefcase,
  Upload,
  FileText,
  Users,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  MessageCircle,
  Copy,
  Check,
  Trash2,
  Pencil,
  Eye,
  Shield,
  Star,
  BarChart3,
  ClipboardList,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobVacancy {
  id: string;
  title: string;
  description: string;
  requirements: string;
  is_active: boolean;
  created_at: string;
}

interface Applicant {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  ats_score: number;
  status: 'LOLOS_INTERVIEW' | 'TALENT_POOL' | 'TOLAK' | 'PENDING';
  pendidikan_terakhir?: string;
  red_flags?: string[];
  draft_whatsapp?: string;
  analysis_result?: CVAnalysisResult;
  created_at: string;
}

interface CVAnalysisResult {
  nama_pelamar: string;
  email: string;
  whatsapp: string;
  pendidikan_terakhir: string;
  ats_score: number;
  kelebihan: string[];
  kekurangan: string[];
  red_flags: string[];
  rekomendasi_status: 'LOLOS_INTERVIEW' | 'TALENT_POOL' | 'TOLAK';
  draft_whatsapp: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  LOLOS_INTERVIEW: {
    label: 'Lolos Interview',
    bg: 'bg-emerald-500/15 border-emerald-500/30',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
  },
  TALENT_POOL: {
    label: 'Talent Pool',
    bg: 'bg-blue-500/15 border-blue-500/30',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
  },
  TOLAK: {
    label: 'Ditolak',
    bg: 'bg-red-500/15 border-red-500/30',
    text: 'text-red-400',
    dot: 'bg-red-400',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    badgeBorder: 'border-red-200',
  },
  PENDING: {
    label: 'Pending',
    bg: 'bg-slate-500/15 border-slate-500/30',
    text: 'text-slate-400',
    dot: 'bg-slate-400',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-600',
    badgeBorder: 'border-slate-200',
  },
};

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 70 ? '#10b981' : score >= 45 ? '#3b82f6' : '#ef4444';
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;

  return (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={radius} stroke="#1e293b" strokeWidth="6" fill="none" />
        <circle
          cx="36" cy="36" r={radius}
          stroke={color} strokeWidth="6" fill="none"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-black" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function JobModal({ onClose, onSaved, initialData }: { onClose: () => void; onSaved: (job: JobVacancy, isEdit: boolean) => void; initialData?: JobVacancy }) {
  const { session } = useAuth();
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [requirements, setRequirements] = useState(initialData?.requirements || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Judul dan deskripsi wajib diisi.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const isEdit = !!initialData;
      const url = isEdit ? `/api/v1/jobs/${initialData.id}` : '/api/v1/jobs';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), requirements: requirements.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal menyimpan lowongan.');
      onSaved(data.data, isEdit);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <Briefcase size={15} className="text-white" />
            </div>
            <h3 className="font-bold text-slate-900">{initialData ? 'Edit Lowongan' : 'Buat Lowongan Baru'}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Judul Posisi *</label>
            <input
              type="text" required value={title} onChange={e => setTitle(e.target.value)}
              placeholder="contoh: Senior Backend Engineer"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Deskripsi Pekerjaan *</label>
            <textarea
              required value={description} onChange={e => setDescription(e.target.value)} rows={4}
              placeholder="Jelaskan tanggung jawab, lingkungan kerja, dll..."
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Persyaratan</label>
            <textarea
              value={requirements} onChange={e => setRequirements(e.target.value)} rows={3}
              placeholder="- Min. 3 tahun pengalaman Node.js&#10;- Familiar dengan PostgreSQL&#10;- Mampu kerja mandiri"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all resize-none"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-xl shadow-sm shadow-emerald-500/30 transition-all flex items-center justify-center gap-2">
              {loading ? <Loader2 size={14} className="animate-spin" /> : (initialData ? <Pencil size={14} /> : <Plus size={14} />)}
              {initialData ? 'Simpan Perubahan' : 'Buat Lowongan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResultModal({ result, onClose }: { result: CVAnalysisResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const cfg = STATUS_CONFIG[result.rekomendasi_status];

  const copyDraft = () => {
    navigator.clipboard.writeText(result.draft_whatsapp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            Hasil Analisis CV
          </h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Top Row — Identity + Score */}
          <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
              {result.nama_pelamar.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 text-base">{result.nama_pelamar}</p>
              <p className="text-xs text-slate-500 mt-0.5">{result.pendidikan_terakhir}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {result.email && <span className="text-xs text-slate-500">{result.email}</span>}
                {result.whatsapp && <span className="text-xs text-slate-500">• {result.whatsapp}</span>}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <ScoreRing score={result.ats_score} />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ATS Score</span>
            </div>
          </div>

          {/* Status Badge */}
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${cfg.bg}`}>
            <span className={`w-2 h-2 rounded-full ${cfg.dot} animate-pulse`} />
            <span className={`text-sm font-bold ${cfg.text}`}>Rekomendasi AI: {cfg.label}</span>
          </div>

          {/* Kelebihan / Kekurangan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Star size={11} /> Kelebihan
              </h4>
              <ul className="space-y-1.5">
                {result.kelebihan.map((k, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    {k}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp size={11} /> Kekurangan
              </h4>
              <ul className="space-y-1.5">
                {result.kekurangan.map((k, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <AlertCircle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Red Flags */}
          {result.red_flags.length > 0 && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100">
              <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield size={11} /> Red Flags Terdeteksi
              </h4>
              <ul className="space-y-1.5">
                {result.red_flags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-red-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Draft WhatsApp */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <MessageCircle size={11} /> Draft Pesan WhatsApp
              </h4>
              <button
                onClick={copyDraft}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Tersalin!' : 'Salin'}
              </button>
            </div>
            <div className="p-3 bg-[#dcf8c6] rounded-xl rounded-tl-none text-sm text-slate-800 leading-relaxed font-sans border border-green-200/50 whitespace-pre-wrap">
              {result.draft_whatsapp}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-sm shadow-emerald-500/30 transition-all">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const CVScreeningPage: React.FC = () => {
  const { session } = useAuth();

  // Jobs
  const [jobs, setJobs] = useState<JobVacancy[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<JobVacancy | undefined>(undefined);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  // Applicants per job
  const [applicants, setApplicants] = useState<Record<string, Applicant[]>>({});
  const [loadingApplicants, setLoadingApplicants] = useState<Record<string, boolean>>({});

  // CV Upload state
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<CVAnalysisResult | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Fetch jobs ─────────────────────────────────────────────────────────────
  const fetchJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch('/api/v1/jobs', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) setJobs(data.data || []);
    } catch (err) {
      console.error('Failed to fetch jobs', err);
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => { fetchJobs(); }, [session]);

  // ── Fetch applicants for a job ─────────────────────────────────────────────
  const fetchApplicants = async (jobId: string) => {
    setLoadingApplicants(prev => ({ ...prev, [jobId]: true }));
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/applicants`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setApplicants(prev => ({ ...prev, [jobId]: data.data || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch applicants', err);
    } finally {
      setLoadingApplicants(prev => ({ ...prev, [jobId]: false }));
    }
  };

  const toggleJob = (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
    } else {
      setExpandedJob(jobId);
      if (!applicants[jobId]) fetchApplicants(jobId);
    }
  };

  // ── Delete Job ─────────────────────────────────────────────────────────────
  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus lowongan ini? Semua data pelamar di dalamnya akan ikut terhapus secara permanen.')) return;
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setJobs(prev => prev.filter(j => j.id !== jobId));
        if (expandedJob === jobId) setExpandedJob(null);
      } else {
        alert(data.message || 'Gagal menghapus lowongan.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat menghapus lowongan.');
    }
  };

  // ── CV Upload & Analysis ───────────────────────────────────────────────────
  const processCV = async (jobId: string, file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setUploadError(prev => ({ ...prev, [jobId]: 'Hanya file PDF yang diterima.' }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(prev => ({ ...prev, [jobId]: 'File melebihi batas 10MB.' }));
      return;
    }

    setUploadingFor(jobId);
    setUploadError(prev => ({ ...prev, [jobId]: '' }));

    const formData = new FormData();
    formData.append('cv', file);

    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/apply`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Analisis gagal.');

      setUploadResult(data.data as CVAnalysisResult);
      // Refresh applicants list
      fetchApplicants(jobId);
      if (expandedJob !== jobId) setExpandedJob(jobId);
    } catch (err: any) {
      setUploadError(prev => ({ ...prev, [jobId]: err.message }));
    } finally {
      setUploadingFor(null);
      // Reset file input
      if (fileInputRefs.current[jobId]) fileInputRefs.current[jobId]!.value = '';
    }
  };

  // ── Delete Applicant ───────────────────────────────────────────────────────
  const handleDeleteApplicant = async (jobId: string, applicantId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus pelamar ini?')) return;
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/applicants/${applicantId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setApplicants(prev => ({
          ...prev,
          [jobId]: prev[jobId].filter(a => a.id !== applicantId)
        }));
      } else {
        alert(data.message || 'Gagal menghapus');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan');
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const allApplicants = Object.values(applicants).flat();
  const totalApplicants  = allApplicants.length;
  const lolos            = allApplicants.filter(a => a.status === 'LOLOS_INTERVIEW').length;
  const talentPool       = allApplicants.filter(a => a.status === 'TALENT_POOL').length;
  const avgScore         = totalApplicants > 0
    ? Math.round(allApplicants.reduce((s, a) => s + a.ats_score, 0) / totalApplicants)
    : 0;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <ClipboardList size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight">AI CV Screening & ATS</h2>
            <p className="text-xs text-slate-500 mt-0.5">Analisis CV otomatis dengan Google Gemini AI</p>
          </div>
        </div>
        <button
          onClick={() => { setEditingJob(undefined); setShowJobModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-violet-600/30 transition-all active:scale-95"
        >
          <Plus size={15} />
          Buat Lowongan
        </button>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Lowongan', value: jobs.length, icon: Briefcase, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Total Pelamar', value: totalApplicants, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Lolos Interview', value: lolos, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Rata-rata ATS', value: avgScore ? `${avgScore}/100` : '-', icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon size={16} className={color} />
            </div>
            <p className="text-xl font-black text-slate-900">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Jobs List ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {loadingJobs ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <Briefcase size={28} className="text-violet-400" />
            </div>
            <h3 className="text-base font-bold text-slate-700 mb-1">Belum ada lowongan</h3>
            <p className="text-sm text-slate-400 mb-5">Buat lowongan kerja pertama Anda untuk mulai screening CV</p>
            <button
              onClick={() => { setEditingJob(undefined); setShowJobModal(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-all shadow-sm shadow-violet-600/30"
            >
              <Plus size={15} />
              Buat Lowongan Pertama
            </button>
          </div>
        ) : (
          jobs.map(job => {
            const isExpanded = expandedJob === job.id;
            const jobApplicants = applicants[job.id] || [];
            const isUploading = uploadingFor === job.id;
            const err = uploadError[job.id];

            return (
              <div key={job.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-200">
                {/* Job Header */}
                <div className="flex items-center gap-4 p-4 sm:p-5">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                    <Briefcase size={18} className="text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-sm">{job.title}</h3>
                      {job.is_active ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">AKTIF</span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-500 border border-slate-200">TUTUP</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(job.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {jobApplicants.length > 0 && ` · ${jobApplicants.length} pelamar`}
                    </p>
                  </div>

                  {/* Upload CV area (compact) */}
                  <div
                    className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed cursor-pointer transition-all text-xs font-semibold
                      ${dragOver === job.id
                        ? 'border-violet-400 bg-violet-50 text-violet-600'
                        : 'border-slate-200 text-slate-400 hover:border-violet-300 hover:text-violet-500 hover:bg-violet-50/30'
                      }
                      ${isUploading ? 'opacity-50 pointer-events-none' : ''}
                    `}
                    onClick={() => fileInputRefs.current[job.id]?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(job.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOver(null);
                      const file = e.dataTransfer.files[0];
                      if (file) processCV(job.id, file);
                    }}
                  >
                    <input
                      ref={el => { fileInputRefs.current[job.id] = el; }}
                      type="file" accept=".pdf,application/pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) processCV(job.id, f); }}
                    />
                    {isUploading
                      ? <><Loader2 size={14} className="animate-spin text-violet-500" /> Menganalisis...</>
                      : <><Upload size={14} /> Upload CV (.pdf)</>
                    }
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingJob(job); setShowJobModal(true); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                      title="Edit Lowongan"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.id); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Hapus Lowongan"
                    >
                      <Trash2 size={15} />
                    </button>
                    <div className="w-px h-5 bg-slate-200 mx-1" />
                    <button
                      onClick={() => toggleJob(job.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </div>
                </div>

                {/* Mobile Upload + Error */}
                <div className="sm:hidden px-4 pb-3">
                  <div
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all text-xs font-semibold
                      ${dragOver === job.id ? 'border-violet-400 bg-violet-50 text-violet-600' : 'border-slate-200 text-slate-400 hover:border-violet-300 hover:text-violet-500'}
                      ${isUploading ? 'opacity-50 pointer-events-none' : ''}
                    `}
                    onClick={() => fileInputRefs.current[`mobile-${job.id}`]?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(job.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => { e.preventDefault(); setDragOver(null); const file = e.dataTransfer.files[0]; if (file) processCV(job.id, file); }}
                  >
                    <input
                      ref={el => { fileInputRefs.current[`mobile-${job.id}`] = el; }}
                      type="file" accept=".pdf,application/pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) processCV(job.id, f); }}
                    />
                    {isUploading
                      ? <><Loader2 size={13} className="animate-spin text-violet-500" /> Menganalisis CV dengan AI...</>
                      : <><Upload size={13} /> Upload CV untuk dianalisis</>
                    }
                  </div>
                </div>

                {err && (
                  <div className="mx-4 mb-3 flex items-start gap-2 p-2.5 rounded-xl bg-red-50 border border-red-100">
                    <AlertCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{err}</p>
                  </div>
                )}

                {/* Expanded: Applicants Table */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {loadingApplicants[job.id] ? (
                      <div className="flex justify-center py-8">
                        <Loader2 size={20} className="animate-spin text-violet-400" />
                      </div>
                    ) : jobApplicants.length === 0 ? (
                      <div className="text-center py-10 text-slate-400">
                        <FileText size={24} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-medium">Belum ada pelamar</p>
                        <p className="text-xs mt-1">Upload file CV (.pdf) di atas untuk memulai screening</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                              <th className="px-5 py-3">Pelamar</th>
                              <th className="px-5 py-3 hidden md:table-cell">Pendidikan</th>
                              <th className="px-5 py-3">ATS Score</th>
                              <th className="px-5 py-3">Status</th>
                              <th className="px-5 py-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {jobApplicants.map(applicant => {
                              const cfg = STATUS_CONFIG[applicant.status];
                              return (
                                <tr key={applicant.id} className="hover:bg-slate-50/50 transition-colors group">
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                        {applicant.name.charAt(0).toUpperCase()}
                                      </div>
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">{applicant.name}</p>
                                        <p className="text-xs text-slate-400">{applicant.email}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3 hidden md:table-cell">
                                    <p className="text-xs text-slate-600 max-w-[180px] truncate">{applicant.pendidikan_terakhir || '-'}</p>
                                  </td>
                                  <td className="px-5 py-3">
                                    <ScoreRing score={applicant.ats_score} />
                                  </td>
                                  <td className="px-5 py-3">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                      {cfg.label}
                                    </span>
                                    {applicant.red_flags && applicant.red_flags.length > 0 && (
                                      <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-bold border border-red-100">
                                        <Shield size={9} /> {applicant.red_flags.length} flag
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3 text-right">
                                    <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {applicant.analysis_result && (
                                        <button
                                          onClick={() => setUploadResult(applicant.analysis_result!)}
                                          title="Lihat Detail Analisis"
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                                        >
                                          <Eye size={15} />
                                        </button>
                                      )}
                                      {applicant.draft_whatsapp && (
                                        <button
                                          onClick={() => navigator.clipboard.writeText(applicant.draft_whatsapp!)}
                                          title="Salin draft WA"
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all"
                                        >
                                          <MessageCircle size={15} />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDeleteApplicant(job.id, applicant.id)}
                                        title="Hapus Pelamar"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Status summary bar */}
                        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center gap-4 flex-wrap">
                          {(['LOLOS_INTERVIEW', 'TALENT_POOL', 'TOLAK'] as const).map(s => {
                            const count = jobApplicants.filter(a => a.status === s).length;
                            const c = STATUS_CONFIG[s];
                            return count > 0 ? (
                              <span key={s} className={`inline-flex items-center gap-1.5 text-xs font-semibold ${c.badgeText}`}>
                                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                                {c.label}: {count}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showJobModal && (
        <JobModal
          initialData={editingJob}
          onClose={() => { setShowJobModal(false); setEditingJob(undefined); }}
          onSaved={(job, isEdit) => {
            if (isEdit) {
              setJobs(prev => prev.map(j => j.id === job.id ? job : j));
            } else {
              setJobs(prev => [job, ...prev]);
            }
            setShowJobModal(false);
            setEditingJob(undefined);
          }}
        />
      )}

      {uploadResult && (
        <ResultModal
          result={uploadResult}
          onClose={() => setUploadResult(null)}
        />
      )}
    </div>
  );
};

export default CVScreeningPage;
