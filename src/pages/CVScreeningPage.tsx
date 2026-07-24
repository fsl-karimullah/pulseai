import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Mail,
  MailCheck,
  ThumbsUp,
  ThumbsDown,
  Send,
  Files,
  Trophy,
  AlertTriangle,
  Zap,
  Crown,
  Phone,
  MessageSquare,
  Wifi,
  WifiOff,
  Info,
} from 'lucide-react';

// --- Types --------------------------------------------------------------------

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
  draft_email_subject?: string;
  draft_email_body?: string;
  email_sent_at?: string | null;
  whatsapp_sent_at?: string | null;
  whatsapp_number_used?: string | null;
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
  draft_email_subject: string;
  draft_email_body: string;
}

interface BulkLeaderboardEntry {
  rank: number;
  file_name: string;
  candidate_name: string;
  match_score: number;
  recommendation_status: 'LOLOS_INTERVIEW' | 'TALENT_POOL' | 'TOLAK';
  experience_level: string;
  key_strengths: string[];
  risk_notes: string;
  email: string;
  whatsapp: string;
  pendidikan_terakhir: string;
  red_flags: string[];
  draft_whatsapp: string;
}

interface BulkResult {
  success: boolean;
  bulk_session_id: string;
  total_uploaded: number;
  total_processed: number;
  total_failed: number;
  credits_deducted: number;
  credits_remaining: number;
  low_credit_warning: string | null;
  failed_files: { file_name: string; reason: string }[];
  leaderboard: BulkLeaderboardEntry[];
}

interface QuotaInfo {
  isSubscriber: boolean;
  pdfLimit: number;
  monthlyCount: number;
  currentCredits: number;
  bulkCvLimit: number;
}

// --- Helpers ------------------------------------------------------------------

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

const RANK_CONFIG = [
  { bg: 'bg-gradient-to-br from-yellow-400 to-amber-500', text: 'text-white', icon: '🥇', ring: 'ring-2 ring-amber-400' },
  { bg: 'bg-gradient-to-br from-slate-400 to-slate-500', text: 'text-white', icon: '🥈', ring: 'ring-2 ring-slate-400' },
  { bg: 'bg-gradient-to-br from-orange-400 to-amber-600', text: 'text-white', icon: '🥉', ring: 'ring-2 ring-orange-400' },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

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

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#10b981' : score >= 45 ? '#3b82f6' : '#ef4444';
  const bg = score >= 70 ? 'bg-emerald-50' : score >= 45 ? 'bg-blue-50' : 'bg-red-50';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-black ${bg}`} style={{ color }}>
      {score}
    </span>
  );
}

// --- Sub-components ----------------------------------------------------------

// --- WhatsApp Message Modal --------------------------------------------------------

interface WaTemplateMap { [key: string]: (name: string) => string }
const WA_TEMPLATES: WaTemplateMap = {
  LOLOS_INTERVIEW: (name) =>
    `Halo ${name},\n\nKami dengan senang hati menginformasikan bahwa Anda *lolos seleksi administrasi* dan kami ingin mengundang Anda untuk mengikuti tahapan *interview* bersama tim kami.\n\nKami akan segera menghubungi Anda untuk konfirmasi jadwal. Mohon pastikan nomor ini aktif.\n\nTerima kasih atas antusiasme Anda! 🎉\n\nSalam,\nTim HRD`,
  TALENT_POOL: (name) =>
    `Halo ${name},\n\nTerima kasih telah mengirimkan lamaran kepada kami. Setelah melalui proses seleksi, kami menyimpan profil Anda di *talent pool* perusahaan kami.\n\nKami akan menghubungi kembali apabila ada posisi yang sesuai dengan profil Anda di masa mendatang.\n\nSalam,\nTim HRD`,
  TOLAK: (name) =>
    `Halo ${name},\n\nTerima kasih telah meluangkan waktu untuk melamar ke perusahaan kami. Setelah melalui proses seleksi, kami menyampaikan bahwa posisi ini telah diisi oleh kandidat lain yang kualifikasinya lebih sesuai saat ini.\n\nKami mengapresiasi antusiasme dan waktu Anda. Semoga sukses untuk perjalanan karier Anda ke depannya. 🙏\n\nSalam,\nTim HRD`,
};

function normalizePhonePreview(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  let n = digits;
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return n;
}

type WhatsappMessageModalProps = {
  applicant: Applicant;
  jobId: string;
  session: any;
  onClose: () => void;
  onSent: (applicantId: string, phone: string) => void;
};
function WhatsappMessageModal({
  applicant,
  jobId,
  session,
  onClose,
  onSent,
}: WhatsappMessageModalProps) {
  const [phone, setPhone] = useState(applicant.whatsapp || '');
  const [editingPhone, setEditingPhone] = useState(!applicant.whatsapp);
  const [phoneError, setPhoneError] = useState('');
  const [message, setMessage] = useState(
    applicant.draft_whatsapp || WA_TEMPLATES[applicant.status]?.(applicant.name) || ''
  );
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [disclaimerRead, setDisclaimerRead] = useState(false);

  const phonePreview = normalizePhonePreview(phone);
  const isPhoneValid = phonePreview.length >= 10 && phonePreview.length <= 16;
  const cfg = STATUS_CONFIG[applicant.status] || STATUS_CONFIG.PENDING;

  const handleTemplateSelect = (status: string) => {
    const tpl = WA_TEMPLATES[status];
    if (tpl) setMessage(tpl(applicant.name));
  };

  const validatePhone = (val: string) => {
    const digits = val.replace(/\D/g, '');
    if (!digits) { setPhoneError('Nomor tidak boleh kosong.'); return false; }
    const preview = normalizePhonePreview(val);
    if (preview.length < 10 || preview.length > 16) {
      setPhoneError('Nomor tidak valid. Minimal 9 digit (contoh: 081234567890).');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleSend = async () => {
    if (!validatePhone(phone)) return;
    if (!message.trim()) { setSendError('Pesan tidak boleh kosong.'); return; }
    if (!disclaimerRead) { setSendError('Harap centang konfirmasi disclaimer terlebih dahulu.'); return; }

    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/applicants/${applicant.id}/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ message: message.trim(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal mengirim WhatsApp.');
      onSent(applicant.id, data.phone_used || phonePreview);
      onClose();
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-500 to-green-600 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <MessageSquare size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white">Kirim Notifikasi WhatsApp</h3>
              <p className="text-emerald-100 text-xs mt-0.5">via WA Gateway</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">

          {/* Left Column: Information */}
          <div className="space-y-5">
            {/* ⚠️ Disclaimer */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800 mb-1.5">⚠️ Disclaimer Penggunaan WhatsApp</p>
                  <ul className="space-y-1 text-xs text-amber-700">
                    <li className="flex items-start gap-1.5"><span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />Kirim pesan hanya untuk notifikasi rekrutmen resmi, bukan promosi/spam.</li>
                    <li className="flex items-start gap-1.5"><span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />Frekuensi wajar: <strong>1 pesan per kandidat</strong> untuk topik yang sama.</li>
                    <li className="flex items-start gap-1.5"><span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />Pengiriman massal atau berulang dapat menyebabkan nomor WA HRD <strong>diblokir</strong> oleh WhatsApp.</li>
                    <li className="flex items-start gap-1.5"><span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />Pastikan peserta memang menunggu kabar dari perusahaan Anda.</li>
                  </ul>
                  <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={disclaimerRead}
                      onChange={e => setDisclaimerRead(e.target.checked)}
                      className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-400"
                    />
                    <span className="text-xs font-semibold text-amber-800">Saya mengerti dan berkomitmen menggunakan fitur ini secara wajar.</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 📋 Verifikasi Data Pelamar */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Info size={11} /> Verifikasi Data Pelamar
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <span className="text-slate-500">Nama</span>
                <span className="font-semibold text-slate-800 truncate">{applicant.name}</span>
                {applicant.email && (<>
                  <span className="text-slate-500">Email</span>
                  <span className="font-medium text-slate-700 truncate">{applicant.email}</span>
                </>)}
                {applicant.pendidikan_terakhir && (<>
                  <span className="text-slate-500">Pendidikan</span>
                  <span className="font-medium text-slate-700 truncate">{applicant.pendidikan_terakhir}</span>
                </>)}
                <span className="text-slate-500">Status AI</span>
                <span className={`font-bold ${cfg.badgeText}`}>{cfg.label}</span>
                <span className="text-slate-500">ATS Score</span>
                <span className="font-bold text-slate-800">{applicant.ats_score}/100</span>
              </div>
              {applicant.whatsapp_sent_at && (
                <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-slate-600">
                    WA sudah pernah dikirim ke <strong>{applicant.whatsapp_number_used}</strong> pada{' '}
                    {new Date(applicant.whatsapp_sent_at).toLocaleString('id-ID')}. Kirim lagi?
                  </p>
                </div>
              )}
            </div>

            {/* 📞 Nomor WA Tujuan */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={11} /> Nomor WhatsApp Tujuan
                </label>
                {!editingPhone && (
                  <button
                    onClick={() => setEditingPhone(true)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                  >
                    <Pencil size={11} /> Edit Nomor
                  </button>
                )}
              </div>

              {!applicant.whatsapp && !editingPhone && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 mb-2">
                  <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">AI tidak berhasil mendeteksi nomor WhatsApp dari CV. Masukkan nomor secara manual.</p>
                </div>
              )}

              {editingPhone ? (
                <div className="space-y-1.5">
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); validatePhone(e.target.value); }}
                    placeholder="Contoh: 081234567890"
                    className={`w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 transition-all ${
                      phoneError
                        ? 'border-red-300 focus:ring-red-400/40 focus:border-red-400 bg-red-50'
                        : 'border-slate-200 focus:ring-emerald-400/40 focus:border-emerald-400'
                    }`}
                    autoFocus
                  />
                  {phoneError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={11} />{phoneError}
                    </p>
                  )}
                  {phone && isPhoneValid && (
                    <p className="text-xs text-slate-500">
                      Format terkirim: <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-emerald-700">{phonePreview}@s.whatsapp.net</code>
                    </p>
                  )}
                  {phone && !editingPhone && (
                    <button onClick={() => setEditingPhone(false)} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                      Batalkan
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <Phone size={14} className="text-emerald-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">{phone || <span className="text-slate-400 italic">Belum ada nomor</span>}</p>
                    {phone && isPhoneValid && (
                      <p className="text-[10px] text-slate-400">→ {phonePreview}@s.whatsapp.net</p>
                    )}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <Info size={10} /> Nomor diambil dari CV oleh AI dan mungkin tidak akurat. Selalu verifikasi sebelum kirim.
              </p>
            </div>
          </div>

          {/* Right Column: Message Input */}
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Pesan WhatsApp</label>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400 mr-1 hidden sm:inline">Template:</span>
                {(['LOLOS_INTERVIEW', 'TALENT_POOL', 'TOLAK'] as const).map(s => {
                  const c = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => handleTemplateSelect(s)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all hover:opacity-80 ${c.badgeBg} ${c.badgeText} ${c.badgeBorder}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Tulis pesan WhatsApp untuk peserta..."
              className="w-full flex-1 min-h-[250px] px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all resize-none font-sans bg-slate-50 focus:bg-white"
            />
            
            <div className="flex items-center justify-between mt-2 mb-3">
              <p className="text-[11px] text-slate-400">Mendukung format *bold* WhatsApp.</p>
              <p className={`text-[11px] font-medium ${message.length > 1500 ? 'text-red-500' : 'text-slate-400'}`}>
                {message.length} karakter
              </p>
            </div>

            {/* Error */}
            {sendError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 mb-3">
                <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{sendError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-white transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !disclaimerRead || !message.trim() || !isPhoneValid || !!phoneError}
            className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-sm shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 min-w-[160px]"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {sending ? 'Mengirim...' : 'Kirim WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- WA QR Code Modal ---
type WaQrModalProps = { session: any; onClose: () => void; onConnected: (phone: string) => void };
function WaQrModal({ session, onClose, onConnected }: WaQrModalProps) {
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'qr' | 'connected' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  
  const fetchQr = async () => {
    try {
      setStatus('loading');
      const res = await fetch('/api/v1/whatsapp-gateway/start', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal mengambil QR Code');
      
      if (data.status === 'open' || data.status === 'connected') {
        setStatus('connected');
        onConnected(data.phoneNumber || '');
      } else if (data.qrBase64) {
        setQrBase64(data.qrBase64);
        setStatus('qr');
      } else {
        throw new Error('QR Code tidak tersedia. Pastikan Gateway Server berjalan.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  useEffect(() => {
    fetchQr();
    
    // Polling status
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/v1/whatsapp-gateway/status', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const data = await res.json();
        if (data.success && (data.status === 'open' || data.status === 'connected')) {
          setStatus('connected');
          onConnected(data.phoneNumber || '');
          clearInterval(interval);
          setTimeout(onClose, 2000);
        }
      } catch (err) {}
    }, 3000);
    
    return () => clearInterval(interval);
  }, [session]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Wifi size={18} className="text-emerald-500" /> Hubungkan WhatsApp HRD
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={32} className="animate-spin text-emerald-500" />
              <p className="text-sm text-slate-500">Menyiapkan QR Code...</p>
            </div>
          )}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <AlertTriangle size={32} className="text-red-500" />
              <p className="text-sm text-red-600">{errorMsg}</p>
              <button onClick={fetchQr} className="px-4 py-2 mt-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all">Coba Lagi</button>
            </div>
          )}
          {status === 'qr' && qrBase64 && (
            <>
              <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <img src={qrBase64} alt="WhatsApp QR Code" className="w-48 h-48 object-contain" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">Scan QR Code</p>
                <p className="text-xs text-slate-500">Buka WhatsApp di HP Anda, buka menu <strong>Linked Devices (Perangkat Taut)</strong>, lalu scan QR code ini.</p>
              </div>
            </>
          )}
          {status === 'connected' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-emerald-700">Berhasil Terhubung!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type JobModalProps = { onClose: () => void; onSaved: (job: JobVacancy, isEdit: boolean) => void; initialData?: JobVacancy };
function JobModal({ onClose, onSaved, initialData }: JobModalProps) {
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

type ResultModalProps = { result: CVAnalysisResult; onClose: () => void };
function ResultModal({ result, onClose }: ResultModalProps) {
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
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-4">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            Hasil Analisis CV
          </h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-5">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
                {result.nama_pelamar?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-base">{result.nama_pelamar || 'Nama tidak terdeteksi'}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {result.pendidikan_terakhir || <span className="italic text-slate-400">Pendidikan tidak tercantum di CV</span>}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {result.email
                    ? <span className="text-xs text-slate-500">{result.email}</span>
                    : <span className="text-xs text-slate-400 italic">Email tidak ditemukan</span>
                  }
                  {result.whatsapp && <span className="text-xs text-slate-500">• {result.whatsapp}</span>}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <ScoreRing score={result.ats_score} />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ATS Score</span>
              </div>
            </div>

            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${cfg.bg}`}>
              <span className={`w-2 h-2 rounded-full ${cfg.dot} animate-pulse`} />
              <span className={`text-sm font-bold ${cfg.text}`}>Rekomendasi AI: {cfg.label}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Star size={11} /> Kelebihan
                </h4>
                {Array.isArray(result.kelebihan) && result.kelebihan.length > 0 ? (
                  <ul className="space-y-1.5">
                    {result.kelebihan.map((k, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                        <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                        {k}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-50 border border-dashed border-slate-200">
                    <CheckCircle2 size={13} className="text-slate-300 flex-shrink-0" />
                    <p className="text-xs text-slate-400 italic">Tidak ada kelebihan yang teridentifikasi dari CV ini.</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <TrendingUp size={11} /> Kekurangan
                </h4>
                {Array.isArray(result.kekurangan) && result.kekurangan.length > 0 ? (
                  <ul className="space-y-1.5">
                    {result.kekurangan.map((k, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                        <AlertCircle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        {k}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-50 border border-dashed border-slate-200">
                    <AlertCircle size={13} className="text-slate-300 flex-shrink-0" />
                    <p className="text-xs text-slate-400 italic">Tidak ada kekurangan yang teridentifikasi.</p>
                  </div>
                )}
              </div>
            </div>

            {Array.isArray(result.red_flags) && result.red_flags.length > 0 ? (
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
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                <Shield size={13} className="text-emerald-500 flex-shrink-0" />
                <p className="text-xs text-emerald-700 font-medium">Tidak ada red flag yang terdeteksi. 🎉</p>
              </div>
            )}
          </div>

          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <MessageCircle size={11} /> Draft Pesan WhatsApp
              </h4>
              {result.draft_whatsapp && (
                <button
                  onClick={copyDraft}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Tersalin!' : 'Salin'}
                </button>
              )}
            </div>
            {result.draft_whatsapp ? (
              <div className="flex-1 p-4 bg-[#dcf8c6] rounded-xl rounded-tl-none text-sm text-slate-800 leading-relaxed font-sans border border-green-200/50 whitespace-pre-wrap">
                {result.draft_whatsapp}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                <MessageCircle size={14} className="text-slate-300 flex-shrink-0" />
                <p className="text-xs text-slate-400 italic">Draft pesan WhatsApp tidak berhasil digenerate oleh AI.</p>
              </div>
            )}
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

// --- Bulk Leaderboard Modal ----------------------------------------------------

function BulkLeaderboardModal({
  result,
  jobTitle,
  onClose,
}: {
  result: BulkResult;
  jobTitle: string;
  onClose: () => void;
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyWa = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 mb-6">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-violet-600 to-indigo-600 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
          />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Trophy size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">Hasil Bulk Screening</h3>
                  <p className="text-violet-200 text-xs mt-0.5">{jobTitle}</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'Diproses', value: result.total_processed, color: 'text-emerald-300', icon: CheckCircle2 },
                { label: 'Kredit Dipotong', value: result.credits_deducted, color: 'text-amber-300', icon: Zap },
                { label: 'Gagal', value: result.total_failed, color: result.total_failed > 0 ? 'text-red-300' : 'text-white/50', icon: AlertCircle },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="bg-white/10 rounded-xl px-3 py-2.5 text-center">
                  <Icon size={14} className={`${color} mx-auto mb-1`} />
                  <p className="text-white font-black text-xl">{value}</p>
                  <p className="text-violet-200 text-[10px] font-medium">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Low credit warning */}
        {result.low_credit_warning && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 font-medium">{result.low_credit_warning}</p>
          </div>
        )}

        {/* Failed files */}
        {result.failed_files.length > 0 && (
          <div className="mx-5 mt-4 rounded-xl border border-red-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-red-50 flex items-center gap-2">
              <AlertCircle size={14} className="text-red-500" />
              <span className="text-xs font-bold text-red-700">{result.failed_files.length} CV gagal diproses</span>
            </div>
            <div className="divide-y divide-red-50">
              {result.failed_files.map((f, i) => (
                <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                  <FileText size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{f.file_name}</p>
                    <p className="text-xs text-red-600 mt-0.5">{f.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="p-5">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Trophy size={12} /> Leaderboard Kandidat — Urutan Terbaik
          </h4>
          <div className="space-y-2.5">
            {result.leaderboard.map((entry) => {
              const statusCfg = STATUS_CONFIG[entry.recommendation_status] || STATUS_CONFIG.PENDING;
              const rankCfg = RANK_CONFIG[entry.rank - 1];
              const isTop3 = entry.rank <= 3;

              return (
                <div
                  key={entry.rank}
                  className={`relative flex items-start gap-3 p-4 rounded-xl border transition-all ${
                    isTop3
                      ? 'border-violet-100 bg-gradient-to-r from-violet-50/50 to-white shadow-sm'
                      : 'border-slate-100 bg-white hover:bg-slate-50/50'
                  }`}
                >
                  {/* Rank badge */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${
                      isTop3 ? rankCfg.bg + ' ' + rankCfg.text + ' ' + rankCfg.ring : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {isTop3 ? rankCfg.icon : `#${entry.rank}`}
                  </div>

                  {/* Candidate info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{entry.candidate_name}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCfg.badgeBg} ${statusCfg.badgeText} ${statusCfg.badgeBorder}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                      </span>
                      {entry.experience_level && entry.experience_level !== 'Not Recommended' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                          {entry.experience_level}
                        </span>
                      )}
                    </div>
                    {entry.pendidikan_terakhir && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{entry.pendidikan_terakhir}</p>
                    )}
                    {entry.key_strengths.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {entry.key_strengths.slice(0, 2).map((s, i) => (
                          <span key={i} className="px-2 py-0.5 text-[10px] rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">{s}</span>
                        ))}
                        {entry.key_strengths.length > 2 && (
                          <span className="px-2 py-0.5 text-[10px] rounded-md bg-slate-100 text-slate-500 font-medium">+{entry.key_strengths.length - 2} lagi</span>
                        )}
                      </div>
                    )}
                    {entry.risk_notes && (
                      <p className="text-[10px] text-amber-700 mt-1 bg-amber-50 rounded-md px-2 py-1 border border-amber-100 inline-block max-w-full truncate">
                        ⚠️ {entry.risk_notes}
                      </p>
                    )}
                    {entry.red_flags.length > 0 && (
                      <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-bold border border-red-100">
                        <Shield size={9} /> {entry.red_flags.length} flag
                      </span>
                    )}
                  </div>

                  {/* Score + actions */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <ScoreBadge score={entry.match_score} />
                    <div className="flex items-center gap-1">
                      {entry.draft_whatsapp && (
                        <button
                          onClick={() => copyWa(entry.draft_whatsapp, entry.rank)}
                          title="Salin draft WA"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                        >
                          {copiedIdx === entry.rank ? <Check size={13} className="text-emerald-500" /> : <MessageCircle size={13} />}
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 max-w-[80px] truncate text-right">{entry.file_name}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {result.leaderboard.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <FileText size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Tidak ada CV yang berhasil diproses.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Data tersimpan di tabel pelamar. Refresh untuk melihat daftar lengkap.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-sm shadow-violet-600/30 transition-all"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Bulk Upload Panel ---------------------------------------------------------

function BulkUploadPanel({
  jobId,
  quotaInfo,
  session,
  onDone,
}: {
  jobId: string;
  quotaInfo: QuotaInfo | null;
  session: any;
  onDone: (result: BulkResult) => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const maxFiles = quotaInfo?.bulkCvLimit ?? 10;
  const isSubscriber = quotaInfo?.isSubscriber ?? false;
  const freeSlotsRemaining = isSubscriber
    ? Math.max(0, (quotaInfo?.pdfLimit ?? 0) - (quotaInfo?.monthlyCount ?? 0))
    : 0;
  const paidCvCount = Math.max(0, selectedFiles.length - freeSlotsRemaining);
  const creditsNeeded = paidCvCount * 10;
  const creditsAvailable = quotaInfo?.currentCredits ?? 0;
  const insufficientCredits = paidCvCount > 0 && creditsAvailable < creditsNeeded;

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const pdfs = Array.from(newFiles).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    setSelectedFiles(prev => {
      const combined = [...prev, ...pdfs];
      const unique = Array.from(new Map(combined.map(f => [f.name + f.size, f])).values());
      return unique.slice(0, maxFiles);
    });
    setError('');
  }, [maxFiles]);

  const removeFile = (idx: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return;
    if (insufficientCredits) {
      setError(`Kredit tidak cukup. Dibutuhkan ${creditsNeeded} kredit, tersedia ${creditsAvailable}.`);
      return;
    }

    setUploading(true);
    setError('');

    const formData = new FormData();
    selectedFiles.forEach(f => formData.append('cv', f));

    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/apply-bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal memproses CV massal.');
      setSelectedFiles([]);
      onDone(data as BulkResult);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
          ${dragOver ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/30'}
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-1.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1 ${dragOver ? 'bg-violet-100' : 'bg-slate-100'}`}>
            <Files size={18} className={dragOver ? 'text-violet-500' : 'text-slate-400'} />
          </div>
          <p className="text-sm font-semibold text-slate-700">Drag & drop CV disini</p>
          <p className="text-xs text-slate-400">atau klik untuk pilih file (PDF, maks {maxFiles} file × 10MB)</p>
        </div>
      </div>

      {/* Plan limit notice */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${isSubscriber ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
        {isSubscriber ? <Crown size={12} className="text-indigo-500 flex-shrink-0" /> : <Zap size={12} className="text-slate-400 flex-shrink-0" />}
        {isSubscriber
          ? `Plan Premium — maks. ${maxFiles} CV per batch`
          : `Plan Free — maks. ${maxFiles} CV per batch. Upgrade untuk ${(quotaInfo?.bulkCvLimit ?? 30)} CV sekaligus.`
        }
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">{selectedFiles.length} file dipilih</span>
            <button onClick={() => setSelectedFiles([])} className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors">
              Hapus semua
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto divide-y divide-slate-50">
            {selectedFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <FileText size={13} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{file.name}</p>
                  <p className="text-[10px] text-slate-400">{formatBytes(file.size)}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); removeFile(i); }}
                  className="w-5 h-5 rounded-md flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credit estimation */}
      {selectedFiles.length > 0 && (
        <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${insufficientCredits ? 'bg-red-50 border-red-200' : freeSlotsRemaining >= selectedFiles.length ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-1.5 font-bold">
            {insufficientCredits
              ? <><AlertTriangle size={12} className="text-red-500" /><span className="text-red-700">Kredit tidak cukup!</span></>
              : freeSlotsRemaining >= selectedFiles.length
              ? <><CheckCircle2 size={12} className="text-emerald-600" /><span className="text-emerald-700">Semua CV gratis (dalam kuota bulanan)</span></>
              : <><Zap size={12} className="text-amber-600" /><span className="text-amber-700">Estimasi Pemotongan Kredit</span></>
            }
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <span className="text-slate-600">Total CV:</span><span className="font-semibold text-slate-800">{selectedFiles.length} file</span>
            {isSubscriber && freeSlotsRemaining > 0 && (
              <><span className="text-slate-600">Slot gratis tersisa:</span><span className="font-semibold text-emerald-700">{Math.min(freeSlotsRemaining, selectedFiles.length)} CV</span></>
            )}
            {paidCvCount > 0 && (
              <><span className="text-slate-600">CV berbayar:</span><span className="font-semibold">{paidCvCount} × 10 = {creditsNeeded} kredit</span></>
            )}
            <span className="text-slate-600">Saldo kredit:</span>
            <span className={`font-semibold ${insufficientCredits ? 'text-red-600' : 'text-slate-800'}`}>{creditsAvailable} kredit</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
          <AlertCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={selectedFiles.length === 0 || uploading || insufficientCredits}
        className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-violet-500/30 transition-all flex items-center justify-center gap-2"
      >
        {uploading ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Memproses {selectedFiles.length} CV dengan AI...
          </>
        ) : (
          <>
            <Zap size={15} />
            Analisis {selectedFiles.length > 0 ? selectedFiles.length : ''} CV Sekaligus
          </>
        )}
      </button>
    </div>
  );
}

// --- Main Page ----------------------------------------------------------------

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

  // Single CV Upload state
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<CVAnalysisResult | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Bulk CV state
  const [uploadMode, setUploadMode] = useState<Record<string, 'single' | 'bulk'>>({});
  const [bulkResult, setBulkResult] = useState<{ result: BulkResult; jobTitle: string } | null>(null);

  // Quota Info State
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [showQuotaInfo, setShowQuotaInfo] = useState(false);
  const [loadingQuota, setLoadingQuota] = useState(false);

  // WhatsApp gateway state
  const [waGatewayStatus, setWaGatewayStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [waGatewayPhone, setWaGatewayPhone] = useState<string | null>(null);
  const [waModal, setWaModal] = useState<{ applicant: Applicant; jobId: string } | null>(null);
  const [showWaInfo, setShowWaInfo] = useState(false);
  const [showWaQrModal, setShowWaQrModal] = useState(false);

  // -- Fetch jobs -------------------------------------------------------------
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

  // -- Fetch quota info -------------------------------------------------------
  const fetchQuotaInfo = async () => {
    setLoadingQuota(true);
    try {
      const res = await fetch('/api/v1/cv-quota', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) setQuotaInfo(data.data as QuotaInfo);
    } catch (err) {
      console.error('Failed to fetch CV quota', err);
    } finally {
      setLoadingQuota(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchQuotaInfo();
    fetchWaGatewayStatus();

    // Poll WA gateway status every 10 seconds to detect disconnects
    const interval = setInterval(() => {
      fetch('/api/v1/whatsapp-gateway/status', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setWaGatewayStatus(data.connected ? 'connected' : 'disconnected');
            if (data.phoneNumber) setWaGatewayPhone(data.phoneNumber);
          } else {
            setWaGatewayStatus('disconnected');
          }
        })
        .catch(() => {
          setWaGatewayStatus('disconnected');
        });
    }, 10000);

    return () => clearInterval(interval);
  }, [session]);

  // -- Fetch WA Gateway status (initial load) ---------------------------------------------
  const fetchWaGatewayStatus = async () => {
    setWaGatewayStatus('loading');
    try {
      const res = await fetch('/api/v1/whatsapp-gateway/status', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setWaGatewayStatus(data.connected ? 'connected' : 'disconnected');
        setWaGatewayPhone(data.phoneNumber || null);
      } else {
        setWaGatewayStatus('disconnected');
      }
    } catch {
      setWaGatewayStatus('disconnected');
    }
  };

  // -- Handle WA sent callback -----------------------------------------------
  const handleWaSent = (jobId: string, applicantId: string, phoneUsed: string) => {
    setApplicants(prev => ({
      ...prev,
      [jobId]: (prev[jobId] || []).map(a =>
        a.id === applicantId
          ? { ...a, whatsapp_sent_at: new Date().toISOString(), whatsapp_number_used: phoneUsed }
          : a
      ),
    }));
  };


  // -- Fetch applicants for a job ---------------------------------------------
  const fetchApplicants = async (jobId: string) => {
    setLoadingApplicants(prev => ({ ...prev, [jobId]: true }));
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/applicants`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) setApplicants(prev => ({ ...prev, [jobId]: data.data || [] }));
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

  // -- Delete Job -------------------------------------------------------------
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

  // -- Single CV Upload & Analysis --------------------------------------------
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
      const res = await fetch(`/api/v1/jobs/${jobId}/apply`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Analisis gagal.');

      setUploadResult(data.data as CVAnalysisResult);
      fetchApplicants(jobId);
      fetchQuotaInfo();
      if (expandedJob !== jobId) setExpandedJob(jobId);
    } catch (err: any) {
      setUploadError(prev => ({ ...prev, [jobId]: err.message }));
    } finally {
      setUploadingFor(null);
      if (fileInputRefs.current[jobId]) fileInputRefs.current[jobId]!.value = '';
    }
  };

  // -- Update Applicant Status ------------------------------------------------
  const [updatingStatus, setUpdatingStatus] = useState<Record<string, boolean>>({});

  const handleUpdateStatus = async (jobId: string, applicantId: string, status: Applicant['status']) => {
    setUpdatingStatus(prev => ({ ...prev, [applicantId]: true }));
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/applicants/${applicantId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setApplicants(prev => ({
          ...prev,
          [jobId]: (prev[jobId] || []).map(a =>
            a.id === applicantId ? { ...a, status, email_sent_at: null } : a
          ),
        }));
      } else {
        alert(data.message || 'Gagal memperbarui status.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat memperbarui status.');
    } finally {
      setUpdatingStatus(prev => ({ ...prev, [applicantId]: false }));
    }
  };

  // -- Send Email to Applicant ------------------------------------------------
  const [sendingEmail, setSendingEmail] = useState<Record<string, boolean>>({});

  const handleSendEmail = async (jobId: string, applicantId: string) => {
    setSendingEmail(prev => ({ ...prev, [applicantId]: true }));
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/applicants/${applicantId}/send-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setApplicants(prev => ({
          ...prev,
          [jobId]: (prev[jobId] || []).map(a =>
            a.id === applicantId ? { ...a, email_sent_at: new Date().toISOString() } : a
          ),
        }));
      } else {
        alert(data.message || 'Gagal mengirim email.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat mengirim email.');
    } finally {
      setSendingEmail(prev => ({ ...prev, [applicantId]: false }));
    }
  };

  // -- Send Email to ALL Eligible Applicants (bulk, 1-click) ------------------
  const [sendingBulkEmail, setSendingBulkEmail] = useState<Record<string, boolean>>({});

  const getEligibleForBulkEmail = (jobId: string) =>
    (applicants[jobId] || []).filter(a => a.email && !a.email_sent_at);

  const handleSendAllEmails = async (jobId: string) => {
    const eligible = getEligibleForBulkEmail(jobId);
    if (eligible.length === 0) return;
    if (!confirm(`Kirim email ke ${eligible.length} pelamar sekaligus? Tindakan ini akan langsung terkirim dan tidak bisa dibatalkan.`)) return;

    setSendingBulkEmail(prev => ({ ...prev, [jobId]: true }));
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/applicants/send-email-bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        const sentIds: string[] = data.sent_ids || [];
        setApplicants(prev => ({
          ...prev,
          [jobId]: (prev[jobId] || []).map(a =>
            sentIds.includes(a.id) ? { ...a, email_sent_at: new Date().toISOString() } : a
          ),
        }));
        alert(data.message || `Berhasil mengirim ${data.sent} email.`);
      } else {
        alert(data.message || 'Gagal mengirim email massal.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat mengirim email massal.');
    } finally {
      setSendingBulkEmail(prev => ({ ...prev, [jobId]: false }));
    }
  };

  // -- Delete Applicant -------------------------------------------------------
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

  // -- Stats ------------------------------------------------------------------
  const allApplicants = Object.values(applicants).flat();
  const totalApplicants  = allApplicants.length;
  const lolos            = allApplicants.filter(a => a.status === 'LOLOS_INTERVIEW').length;
  const avgScore         = totalApplicants > 0
    ? Math.round(allApplicants.reduce((s, a) => s + a.ats_score, 0) / totalApplicants)
    : 0;

  const getMode = (jobId: string) => uploadMode[jobId] || 'single';
  const setMode = (jobId: string, mode: 'single' | 'bulk') =>
    setUploadMode(prev => ({ ...prev, [jobId]: mode }));

  return (
    <div className="space-y-6">
      {/* -- Header ----------------------------------------------------------- */}
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuotaInfo(true)}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-all"
          >
            <AlertCircle size={15} className="text-slate-500" />
            <span className="hidden sm:inline">Info Kuota</span>
            {quotaInfo && (
              <span className="flex items-center gap-0.5 text-amber-600 font-bold text-xs">
                <Star size={11} className="fill-current" />
                {quotaInfo.currentCredits}
              </span>
            )}
          </button>
          {/* WA Status Badge */}
          <button
            onClick={() => {
              if (waGatewayStatus === 'loading') return;
              if (waGatewayStatus === 'connected') setShowWaInfo(true);
              else setShowWaQrModal(true);
            }}
            title={waGatewayStatus === 'connected' ? 'WhatsApp HRD Terhubung — Klik untuk detail' : 'WhatsApp HRD Belum Terhubung — Klik untuk hubungkan'}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl border transition-all ${
              waGatewayStatus === 'loading'
                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-wait'
                : waGatewayStatus === 'connected'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
            }`}
          >
            {waGatewayStatus === 'loading' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : waGatewayStatus === 'connected' ? (
              <Wifi size={14} />
            ) : (
              <WifiOff size={14} />
            )}
            <span className="hidden sm:inline">
              {waGatewayStatus === 'loading' ? 'Memeriksa WA...' : waGatewayStatus === 'connected' ? 'WA HRD Aktif' : 'Hubungkan WA HRD'}
            </span>
          </button>

          <button
            onClick={() => { setEditingJob(undefined); setShowJobModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-violet-600/30 transition-all active:scale-95"
          >
            <Plus size={15} />
            Buat Lowongan
          </button>
        </div>
      </div>

      {/* -- Quota Info Modal --------------------------------------------------- */}
      {showQuotaInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center">
                  <AlertCircle size={15} className="text-white" />
                </div>
                <h3 className="font-bold text-slate-900">Informasi Kuota CV Scan</h3>
              </div>
              <button onClick={() => setShowQuotaInfo(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X size={15} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {loadingQuota ? (
                <div className="flex justify-center py-4"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : quotaInfo ? (
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Penggunaan Bulan Ini</h4>

                    {quotaInfo.isSubscriber ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">Kuota Bulanan Gratis</span>
                          <span className="font-bold text-slate-900">{quotaInfo.monthlyCount} / {quotaInfo.pdfLimit} Scan</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2">
                          <div
                            className={`h-1.5 rounded-full ${quotaInfo.monthlyCount >= quotaInfo.pdfLimit ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, (quotaInfo.monthlyCount / (quotaInfo.pdfLimit || 1)) * 100)}%` }}
                          />
                        </div>
                        {quotaInfo.monthlyCount >= quotaInfo.pdfLimit && (
                          <p className="text-xs text-amber-600 font-medium">⚠️ Kuota bulanan habis. Scan selanjutnya akan menggunakan 10 kredit/scan.</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-600">
                        Anda menggunakan paket <strong>Free</strong>. Setiap scan CV akan memotong saldo kredit Anda.
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-slate-200 flex justify-between items-center text-sm">
                      <span className="text-slate-600">Saldo Kredit Tersedia</span>
                      <span className="font-bold text-amber-600 flex items-center gap-1">
                        <Star size={14} className="fill-current" /> {quotaInfo.currentCredits} Kredit
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Batas Bulk Upload</h4>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {quotaInfo.isSubscriber ? <Crown size={16} className="text-indigo-500" /> : <Zap size={16} className="text-slate-400" />}
                        <span className="text-sm text-slate-700">
                          {quotaInfo.isSubscriber ? 'Premium' : 'Free'} — maks. <strong>{quotaInfo.bulkCvLimit} CV</strong> per batch
                        </span>
                      </div>
                      {!quotaInfo.isSubscriber && (
                        <span className="text-xs text-indigo-600 font-semibold">Upgrade → 30 CV</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Aturan Pemotongan</h4>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span><strong>Subscriber dalam kuota:</strong> Scan gratis (tidak dipotong kredit sama sekali).</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-slate-600">
                    <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <span><strong>Subscriber melebihi kuota:</strong> Potong 10 kredit per CV dari saldo top-up.</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-slate-600">
                    <AlertCircle size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <span><strong>Pengguna Free:</strong> Selalu potong 10 kredit per CV.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button onClick={() => setShowQuotaInfo(false)} className="px-5 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Stats Row -------------------------------------------------------- */}
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

      {/* -- Jobs List -------------------------------------------------------- */}
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
            const mode = getMode(job.id);

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

                  {/* Desktop Upload Mode Switcher + Upload area */}
                  <div className="hidden sm:flex items-center gap-2">
                    {/* Mode Toggle */}
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                      <button
                        onClick={() => setMode(job.id, 'single')}
                        className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${mode === 'single' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        <FileText size={12} /> 1 CV
                      </button>
                      <button
                        onClick={() => setMode(job.id, 'bulk')}
                        className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${mode === 'bulk' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        <Files size={12} /> Bulk
                      </button>
                    </div>

                    {/* Single upload dropzone (compact) */}
                    {mode === 'single' && (
                      <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed cursor-pointer transition-all text-xs font-semibold
                          ${dragOver === job.id ? 'border-violet-400 bg-violet-50 text-violet-600' : 'border-slate-200 text-slate-400 hover:border-violet-300 hover:text-violet-500 hover:bg-violet-50/30'}
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
                          : <><Upload size={14} /> Upload CV</>
                        }
                      </div>
                    )}
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

                {/* Mobile Upload */}
                <div className="sm:hidden px-4 pb-3 space-y-2">
                  {/* Mobile mode toggle */}
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                    <button
                      onClick={() => setMode(job.id, 'single')}
                      className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors ${mode === 'single' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      <FileText size={12} /> Upload 1 CV
                    </button>
                    <button
                      onClick={() => setMode(job.id, 'bulk')}
                      className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors ${mode === 'bulk' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      <Files size={12} /> Bulk Upload
                    </button>
                  </div>
                  {mode === 'single' && (
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
                  )}
                </div>

                {/* Bulk Upload Panel (shown inline when mode=bulk) */}
                {mode === 'bulk' && (
                  <div className="mx-4 mb-4 p-4 rounded-xl border border-violet-100 bg-violet-50/30">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Files size={12} className="text-violet-600" />
                      </div>
                      <span className="text-sm font-bold text-violet-800">Bulk CV Upload</span>
                      <span className="text-xs text-violet-500 font-medium">— Analisis banyak CV sekaligus</span>
                    </div>
                    <BulkUploadPanel
                      jobId={job.id}
                      quotaInfo={quotaInfo}
                      session={session}
                      onDone={(result) => {
                        setBulkResult({ result, jobTitle: job.title });
                        fetchApplicants(job.id);
                        fetchQuotaInfo();
                        if (expandedJob !== job.id) setExpandedJob(job.id);
                      }}
                    />
                  </div>
                )}

                {err && mode === 'single' && (
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
                      <>
                        <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-slate-50/70 border-b border-slate-100">
                          <p className="text-xs text-slate-500">
                            {getEligibleForBulkEmail(job.id).length} dari {jobApplicants.length} pelamar siap menerima email
                          </p>
                          <button
                            onClick={() => handleSendAllEmails(job.id)}
                            disabled={sendingBulkEmail[job.id] || getEligibleForBulkEmail(job.id).length === 0}
                            title="Kirim email keputusan ke semua pelamar yang belum menerima email"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          >
                            {sendingBulkEmail[job.id]
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Send size={13} />}
                            Kirim Email ke Semua
                          </button>
                        </div>
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
                                    <div className="flex items-center gap-1">
                                      <select
                                        value={applicant.status}
                                        disabled={updatingStatus[applicant.id]}
                                        onChange={(e) => handleUpdateStatus(job.id, applicant.id, e.target.value as Applicant['status'])}
                                        title="Ubah status pelamar"
                                        className={`text-xs font-bold pl-2.5 pr-1.5 py-1 rounded-full border cursor-pointer disabled:opacity-50 disabled:cursor-wait focus:outline-none focus:ring-2 focus:ring-offset-1 ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}
                                      >
                                        <option value="LOLOS_INTERVIEW">Lolos Interview</option>
                                        <option value="TALENT_POOL">Talent Pool</option>
                                        <option value="TOLAK">Ditolak</option>
                                      </select>
                                      <button
                                        onClick={() => handleUpdateStatus(job.id, applicant.id, 'LOLOS_INTERVIEW')}
                                        disabled={updatingStatus[applicant.id] || applicant.status === 'LOLOS_INTERVIEW'}
                                        title="Terima pelamar (Lolos Interview)"
                                        className="p-1 rounded-md text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                      >
                                        <ThumbsUp size={13} />
                                      </button>
                                      <button
                                        onClick={() => handleUpdateStatus(job.id, applicant.id, 'TOLAK')}
                                        disabled={updatingStatus[applicant.id] || applicant.status === 'TOLAK'}
                                        title="Tolak pelamar"
                                        className="p-1 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                      >
                                        <ThumbsDown size={13} />
                                      </button>
                                    </div>
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
                                      {/* WhatsApp Button */}
                                      {applicant.whatsapp_sent_at ? (
                                        <button
                                          disabled
                                          title={`WA sudah dikirim ke ${applicant.whatsapp_number_used} (${new Date(applicant.whatsapp_sent_at).toLocaleString('id-ID')})`}
                                          className="p-1.5 rounded-lg text-emerald-500 cursor-default"
                                        >
                                          <MessageSquare size={15} />
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => setWaModal({ applicant, jobId: job.id })}
                                          title={applicant.whatsapp ? `Kirim WA ke ${applicant.whatsapp}` : 'Kirim WA (masukkan nomor manual)'}
                                          className={`p-1.5 rounded-lg transition-all ${
                                            waGatewayStatus !== 'connected'
                                              ? 'text-slate-300 cursor-not-allowed'
                                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                          }`}
                                          disabled={waGatewayStatus !== 'connected'}
                                        >
                                          <MessageSquare size={15} />
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
                                      {applicant.email && (
                                        applicant.email_sent_at ? (
                                          <button
                                            disabled
                                            title={`Email sudah dikirim (${new Date(applicant.email_sent_at).toLocaleString('id-ID')})`}
                                            className="p-1.5 rounded-lg text-emerald-500 cursor-default"
                                          >
                                            <MailCheck size={15} />
                                          </button>
                                        ) : (
                                          <button
                                            onClick={() => handleSendEmail(job.id, applicant.id)}
                                            disabled={sendingEmail[applicant.id]}
                                            title="Kirim email keputusan ke pelamar"
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all disabled:opacity-50"
                                          >
                                            {sendingEmail[applicant.id]
                                              ? <Loader2 size={15} className="animate-spin" />
                                              : <Mail size={15} />}
                                          </button>
                                        )
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
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* -- Modals ----------------------------------------------------------- */}
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

      {bulkResult && (
        <BulkLeaderboardModal
          result={bulkResult.result}
          jobTitle={bulkResult.jobTitle}
          onClose={() => setBulkResult(null)}
        />
      )}

      {/* WA Gateway Info Modal */}
      {showWaInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className={`px-5 py-4 flex items-center justify-between ${
              waGatewayStatus === 'connected' ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-red-50 border-b border-red-100'
            }`}>
              <div className="flex items-center gap-2.5">
                {waGatewayStatus === 'connected'
                  ? <Wifi size={18} className="text-emerald-600" />
                  : <WifiOff size={18} className="text-red-500" />
                }
                <h3 className={`font-bold ${
                  waGatewayStatus === 'connected' ? 'text-emerald-800' : 'text-red-700'
                }`}>
                  {waGatewayStatus === 'connected' ? 'WA Gateway Terhubung' : 'WA Gateway Belum Terhubung'}
                </h3>
              </div>
              <button onClick={() => setShowWaInfo(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {waGatewayStatus === 'connected' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">WhatsApp aktif &amp; siap kirim</p>
                      {waGatewayPhone && <p className="text-xs text-emerald-600 mt-0.5">Nomor: {waGatewayPhone}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">Klik tombol <strong>📱</strong> di baris pelamar untuk mengirim notifikasi WhatsApp.</p>
                  
                  {/* Disconnect Button */}
                  <button
                    onClick={async () => {
                      if (!confirm('Apakah Anda yakin ingin memutuskan WhatsApp HRD?')) return;
                      try {
                        setWaGatewayStatus('loading');
                        await fetch('/api/v1/whatsapp-gateway/logout', { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token}` } });
                        fetchWaGatewayStatus();
                        setShowWaInfo(false);
                      } catch (err) {
                        console.error('Logout error', err);
                      }
                    }}
                    className="w-full mt-2 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all"
                  >
                    Putuskan Koneksi WhatsApp
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100">
                    <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">WhatsApp HRD belum terhubung. Scan QR untuk menghubungkan nomor WhatsApp HRD Anda.</p>
                  </div>
                  <button
                    onClick={() => { setShowWaInfo(false); setShowWaQrModal(true); }}
                    className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Wifi size={15} />
                    Scan QR &amp; Hubungkan WhatsApp
                  </button>
                  <button
                    onClick={() => { fetchWaGatewayStatus(); }}
                    className="w-full py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Loader2 size={13} className={waGatewayStatus === 'loading' ? 'animate-spin' : ''} />
                    Cek Ulang Status
                  </button>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setShowWaInfo(false)} className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Message Modal */}
      {waModal && (
        <WhatsappMessageModal
          applicant={waModal.applicant}
          jobId={waModal.jobId}
          session={session}
          onClose={() => setWaModal(null)}
          onSent={(applicantId, phoneUsed) => {
            handleWaSent(waModal.jobId, applicantId, phoneUsed);
            setWaModal(null);
          }}
        />
      )}

      {/* QR Modal for HRD Connection */}
      {showWaQrModal && (
        <WaQrModal
          session={session}
          onClose={() => setShowWaQrModal(false)}
          onConnected={(phone) => {
            setWaGatewayStatus('connected');
            setWaGatewayPhone(phone);
          }}
        />
      )}
    </div>
  );
};

export default CVScreeningPage;
