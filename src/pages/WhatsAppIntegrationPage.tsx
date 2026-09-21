import React, { useEffect, useState } from 'react';
import { MessageCircle, Zap, ShieldCheck, Smartphone, LogOut, Loader2, RefreshCw, AlertTriangle, X, Info, Plus, FolderKanban, ChevronDown, BookOpen, Send, CheckCircle2, ExternalLink, BarChart2, List, MousePointerClick, Trash2 } from 'lucide-react';
import { useOrganization } from '../hooks/useOrganization';
import { useAuth } from '../contexts/AuthContext';
import { useProjects } from '../contexts/ProjectContext';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '';

declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: any;
  }
}

type ConnectionStatus = 'checking' | 'disconnected' | 'qr' | 'open' | 'connecting';

interface WhatsAppSession {
  phone_number: string;
  org_id: string;
  phone_label: string;
  gateway_user_id: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING';
  platform?: 'baileys' | 'meta';
  meta_waba_id?: string;
  meta_phone_number_id?: string;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MetaPhoneStatus {
  phone_number_id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  status: 'PENDING' | 'CONNECTED' | 'DISCONNECTED' | 'FLAGGED' | 'BANNED' | 'DELETED' | 'MIGRATED' | 'UNKNOWN';
  code_verification_status: 'VERIFIED' | 'NOT_VERIFIED' | 'EXPIRED';
  name_status: string;
  waba_id: string;
}

const WhatsAppIntegrationPage: React.FC = () => {
  const { organization, loading: orgLoading } = useOrganization();
  const { session } = useAuth();
  const { projects, activeProjectId, setActiveProjectId } = useProjects();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);

  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [qrBase64, setQrBase64] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showTipsModal, setShowTipsModal] = useState<boolean>(false);
  const [metaPendingInfo, setMetaPendingInfo] = useState<{ message: string; wabaId: string } | null>(null);
  const [metaPhoneStatuses, setMetaPhoneStatuses] = useState<Record<string, MetaPhoneStatus>>({});
  const [loadingMetaStatus, setLoadingMetaStatus] = useState<boolean>(false);

  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newLabel, setNewLabel] = useState<string>('');

  // Meta Tutorial & Official Broadcast States
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(false);
  const [showMetaBlastModal, setShowMetaBlastModal] = useState<boolean>(false);
  const [blastStep, setBlastStep] = useState<'form' | 'success'>('form');
  const [selectedMetaPhone, setSelectedMetaPhone] = useState<string>('');
  const [templateName, setTemplateName] = useState<string>('hello_world');
  const [targetNumbers, setTargetNumbers] = useState<string>('');
  const [blastLoading, setBlastLoading] = useState<boolean>(false);
  const [blastResult, setBlastResult] = useState<{ total: number; successCount: number; failedCount: number } | null>(null);

  // Meta Template Manager States
  const [showTemplatesModal, setShowTemplatesModal] = useState<boolean>(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState<boolean>(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);

  // Meta Analytics States
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Interactive Message Sender States
  const [showInteractiveModal, setShowInteractiveModal] = useState<boolean>(false);
  const [interactivePhoneId, setInteractivePhoneId] = useState<string>('');
  const [interactiveTo, setInteractiveTo] = useState<string>('');
  const [interactiveType, setInteractiveType] = useState<'button' | 'list'>('button');
  const [interactiveHeader, setInteractiveHeader] = useState<string>('');
  const [interactiveBody, setInteractiveBody] = useState<string>('');
  const [interactiveFooter, setInteractiveFooter] = useState<string>('');
  const [interactiveButtons, setInteractiveButtons] = useState<{ id: string; title: string }[]>([
    { id: 'btn_1', title: 'Ya, saya tertarik' },
    { id: 'btn_2', title: 'Tidak, terima kasih' },
  ]);
  const [interactiveSections, setInteractiveSections] = useState<{ title: string; rows: { id: string; title: string; description: string }[] }[]>([
    { title: 'Pilihan Layanan', rows: [
      { id: 'row_1', title: 'Konsultasi Gratis', description: 'Bicara dengan tim kami' },
      { id: 'row_2', title: 'Lihat Demo', description: 'Demo produk 15 menit' },
    ]}
  ]);
  const [interactiveListBtn, setInteractiveListBtn] = useState<string>('Pilih Opsi');
  const [interactiveSending, setInteractiveSending] = useState<boolean>(false);
  const [interactiveSent, setInteractiveSent] = useState<boolean>(false);
  const [interactiveError, setInteractiveError] = useState<string | null>(null);

  // Baileys Gateway WA Blast States
  const [showBaileysBlastModal, setShowBaileysBlastModal] = useState<boolean>(false);
  const [baileysBlastStep, setBaileysBlastStep] = useState<'form' | 'success'>('form');
  const [selectedBaileysPhoneLabel, setSelectedBaileysPhoneLabel] = useState<string>('');
  const [baileysMessageText, setBaileysMessageText] = useState<string>('Halo {nama}, terima kasih telah menghubungi kami! Ada yang bisa kami bantu?');
  const [baileysTargetNumbers, setBaileysTargetNumbers] = useState<string>('');
  const [baileysDelaySeconds, setBaileysDelaySeconds] = useState<number>(5);
  const [agreedTerms, setAgreedTerms] = useState<boolean>(false);
  const [baileysBlastLoading, setBaileysBlastLoading] = useState<boolean>(false);
  const [baileysBlastProgress, setBaileysBlastProgress] = useState<{ current: number; total: number } | null>(null);
  const [baileysBlastResult, setBaileysBlastResult] = useState<{ total: number; successCount: number; failedCount: number } | null>(null);

  const fetchSessions = async () => {
    if (!organization?.id || !session?.access_token || !activeProjectId) {
      setLoadingSessions(false);
      return;
    }
    try {
      const res = await fetch(`/api/whatsapp-sessions?projectId=${activeProjectId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.success) {
        const loadedSessions: WhatsAppSession[] = data.sessions || [];
        setSessions(loadedSessions);
        // Auto-fetch Meta statuses for sessions that have a phone number ID
        const metaSessions = loadedSessions.filter(s => s.platform === 'meta' && s.meta_phone_number_id);
        if (metaSessions.length > 0) {
          fetchMetaPhoneStatuses(metaSessions, session.access_token);
        }
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchMetaPhoneStatuses = async (metaSessions: WhatsAppSession[], accessToken: string) => {
    setLoadingMetaStatus(true);
    const statusMap: Record<string, MetaPhoneStatus> = {};
    await Promise.allSettled(
      metaSessions
        .filter(s => s.meta_phone_number_id)
        .map(async (s) => {
          try {
            const res = await fetch(
              `/api/whatsapp/meta/phone-status?phoneNumberId=${s.meta_phone_number_id}`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            const data = await res.json();
            if (data.success) {
              statusMap[s.meta_phone_number_id!] = data as MetaPhoneStatus;
            }
          } catch {
            // silently ignore per-number errors
          }
        })
    );
    setMetaPhoneStatuses(statusMap);
    setLoadingMetaStatus(false);
  };

  useEffect(() => {
    if (orgLoading) return;
    fetchSessions();
  }, [organization, session, orgLoading, activeProjectId]);

  useEffect(() => {
    const initFB = () => {
      if (window.FB) {
        window.FB.init({
          appId: FACEBOOK_APP_ID,
          cookie: true,
          xfbml: true,
          version: 'v21.0'
        });
      }
    };

    if (window.FB) {
      initFB();
    } else {
      window.fbAsyncInit = initFB;
    }
  }, []);

  const checkActiveStatus = async () => {
    if (!organization?.id || !activeSession) return;
    try {
      const res = await fetch(`${GATEWAY_URL}/api/session/status?userId=${organization.id}&phoneLabel=${activeSession}`);
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        if (data.qrBase64) {
          setQrBase64(data.qrBase64);
        } else {
          setQrBase64(null);
        }
        
        if (data.status === 'open') {
          await fetchSessions();
          setShowAddModal(false);
          setActiveSession(null);
          setQrBase64(null);
          setNewLabel('');
          setStatus('disconnected');
        }
      }
    } catch (err) {
      console.error('Failed to check active status', err);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (activeSession && status !== 'open') {
      interval = setInterval(checkActiveStatus, 3000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [activeSession, status, organization]);

  const handleStartConnection = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newLabel.trim()) return;

    if (!organization?.id) {
      setError('Organisasi belum termuat atau tidak ditemukan. Coba muat ulang halaman.');
      return;
    }

    if (!activeProjectId) {
      setError('Pilih Project tujuan terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus('connecting');
    setQrBase64(null);
    setActiveSession(newLabel.trim());

    try {
      const intentRes = await fetch('/api/whatsapp/session-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ phoneLabel: newLabel.trim(), projectId: activeProjectId }),
      });
      const intentData = await intentRes.json();
      if (!intentData.success) {
        setError(intentData.message || 'Gagal menyimpan pilihan project.');
        setActiveSession(null);
        setStatus('disconnected');
        setLoading(false);
        return;
      }

      const res = await fetch(`${GATEWAY_URL}/api/session/start?userId=${organization.id}&phoneLabel=${newLabel.trim()}`);
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        if (data.qrBase64) setQrBase64(data.qrBase64);
      } else {
        setError(data.message || 'Gagal memulai sesi WhatsApp.');
        setActiveSession(null);
        setStatus('disconnected');
      }
    } catch {
      setError('Gateway WhatsApp tidak dapat dihubungi.');
      setActiveSession(null);
      setStatus('disconnected');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (label: string) => {
    if (!organization?.id || !session?.access_token) return;
    if (!confirm(`Yakin ingin memutuskan koneksi sesi '${label}'? Semua kredensial dan riwayat cache akan dihapus.`)) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/whatsapp/disconnect?phoneLabel=${encodeURIComponent(label)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        await fetchSessions();
      } else {
        setError(data.message || 'Gagal memutuskan koneksi sesi.');
      }
    } catch {
      setError('Gagal memutuskan koneksi WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  const handleMetaLogin = () => {
    if (!window.FB) {
      setError('Facebook SDK tidak dimuat.');
      return;
    }
    if (!activeProjectId) {
      setError('Pilih Project tujuan terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    window.FB.login(
      (response: any) => {
        if (response.authResponse && response.authResponse.code) {
          const code = response.authResponse.code;
          fetch('/api/whatsapp/meta/exchange-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({ code, projectId: activeProjectId, phoneLabel: 'meta-official' })
          })
            .then(res => res.json())
            .then(data => {
              if (data.success) {
                fetchSessions();
                alert(`✅ Berhasil! Nomor Meta terdaftar: +${data.phone_number}`);
              } else if (data.pending) {
                // WABA terhubung tapi nomor belum di-provision Meta
                fetchSessions();
                setMetaPendingInfo({ message: data.message, wabaId: data.waba_id || '' });
              } else {
                setError(data.message || 'Gagal mendaftarkan Meta WhatsApp.');
              }
            })
            .catch(err => {
              console.error(err);
              setError('Terjadi kesalahan saat bertukar token.');
            })
            .finally(() => setLoading(false));
        } else {
          setLoading(false);
          if (response.status !== 'unknown') {
            setError('Gagal mendapatkan otorisasi dari Facebook.');
          }
        }
      },
      {
        config_id: '1806554713859655',
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3',
        }
      }
    );
  };


  const metaSessions = sessions.filter(s => s.platform === 'meta');
  const baileysSessions = sessions.filter(s => s.platform !== 'meta');

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-emerald-200/25 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-200/15 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* Main Content */}
      <div className="relative flex-1 p-5 lg:p-8 max-w-6xl mx-auto w-full z-10 space-y-6">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold mb-2">
              <Smartphone size={12} />
              <span>Multi-Platform Integration</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Integrasi <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">WhatsApp</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">Kelola koneksi Meta Official API dan Gateway Baileys secara terpisah.</p>
          </div>

          <div className="flex items-center gap-3">
            {projects.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setProjectMenuOpen((v) => !v)}
                  className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm"
                >
                  <FolderKanban size={15} className="text-emerald-500" />
                  {activeProject?.name || 'Pilih Project'}
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
                {projectMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setProjectMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-20 py-1.5 max-h-72 overflow-y-auto">
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setActiveProjectId(p.id); setProjectMenuOpen(false); }}
                          className={`w-full text-left px-3.5 py-2 text-sm font-medium flex items-center justify-between gap-2 hover:bg-slate-50 ${
                            p.id === activeProjectId ? 'text-emerald-600' : 'text-slate-700'
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          {p.id === activeProjectId && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <button 
              onClick={fetchSessions} 
              className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl transition-colors shadow-sm"
              title="Refresh Sesi"
            >
              <RefreshCw size={16} className={loadingSessions ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── Error Banner ─────────────────────────────────── */}
        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <p className="flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 1: META OFFICIAL CLOUD API
        ════════════════════════════════════════════════════════════════════ */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-blue-100 shadow-[0_4px_24px_-8px_rgba(24,119,242,0.12)] overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/70 via-indigo-50/30 to-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-[#1877F2] text-white text-[10px] font-extrabold uppercase tracking-wider">
                  Official API
                </span>
                <h2 className="font-extrabold text-slate-900 text-base">WhatsApp Official (Meta Cloud API)</h2>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed max-w-2xl">
                Koneksi resmi Meta via Embedded Signup. Bebas risiko pemblokiran, centang hijau, gratis 1.000 percakapan Service/bulan.
              </p>
            </div>

            <div className="flex flex-wrap items-center md:justify-end gap-2.5">
              <button
                onClick={() => setShowTutorialModal(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                <BookOpen size={13} className="text-blue-600 flex-shrink-0" />
                Panduan
              </button>
              <button
                onClick={async () => {
                  setShowTemplatesModal(true);
                  setTemplatesError(null);
                  setSelectedTemplate(null);
                  const firstMeta = metaSessions[0];
                  if (!firstMeta?.meta_phone_number_id || !session?.access_token) return;
                  setTemplatesLoading(true);
                  try {
                    const res = await fetch(`/api/whatsapp/meta/templates?phoneNumberId=${firstMeta.meta_phone_number_id}`, {
                      headers: { 'Authorization': `Bearer ${session.access_token}` }
                    });
                    const data = await res.json();
                    if (data.success) setTemplates(data.templates || []);
                    else setTemplatesError(data.message || 'Gagal memuat template');
                  } catch { setTemplatesError('Gagal terhubung ke server'); }
                  finally { setTemplatesLoading(false); }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                <List size={13} className="flex-shrink-0" />
                Template Manager
              </button>
              <button
                onClick={async () => {
                  setShowAnalyticsModal(true);
                  setAnalyticsError(null);
                  const firstMeta = metaSessions[0];
                  if (!firstMeta?.meta_phone_number_id || !session?.access_token) return;
                  setAnalyticsLoading(true);
                  try {
                    const res = await fetch(`/api/whatsapp/meta/analytics?phoneNumberId=${firstMeta.meta_phone_number_id}`, {
                      headers: { 'Authorization': `Bearer ${session.access_token}` }
                    });
                    const data = await res.json();
                    if (data.success) setAnalyticsData(data);
                    else setAnalyticsError(data.message || 'Gagal memuat analitik');
                  } catch { setAnalyticsError('Gagal terhubung ke server'); }
                  finally { setAnalyticsLoading(false); }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                <BarChart2 size={13} className="flex-shrink-0" />
                Analitik
              </button>
              <button
                onClick={() => {
                  setSelectedMetaPhone(metaSessions[0]?.meta_phone_number_id || '');
                  setBlastStep('form');
                  setBlastResult(null);
                  setShowMetaBlastModal(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-500/20 cursor-pointer whitespace-nowrap"
              >
                <Send size={13} className="flex-shrink-0" />
                Blast Official
              </button>
              <button
                onClick={handleMetaLogin}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 px-4 h-9 bg-[#1877F2] text-white text-xs font-bold rounded-xl hover:bg-[#166fe5] transition-all whitespace-nowrap shadow-md shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} className="flex-shrink-0" />}
                Log in with Facebook
              </button>
            </div>
          </div>

          {/* Meta Sessions Table */}
          <div className="overflow-x-auto">
            {loadingSessions ? (
              <div className="p-8 text-center text-slate-400 text-xs">Memuat sesi Meta...</div>
            ) : metaSessions.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs font-semibold text-slate-600">Belum ada nomor Meta Cloud API yang terhubung.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Klik tombol di atas untuk menghubungkan via Facebook Embedded Signup.</p>
              </div>
            ) : (
              <>
                {/* Pending warning banner — shown if any session is PENDING */}
                {metaSessions.some(s => {
                  const ms = metaPhoneStatuses[s.meta_phone_number_id || ''];
                  return !ms || ms.status === 'PENDING' || ms.code_verification_status === 'NOT_VERIFIED';
                }) && (
                  <div className="mx-4 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                    <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600 flex-shrink-0">
                      <AlertTriangle size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-amber-900 mb-0.5">Nomor Belum Terverifikasi di Meta</p>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Klik <strong>Settings (⚙)</strong> pada nomor di Meta Business Manager → pilih <strong>"Add phone number"</strong> atau <strong>"Verify"</strong> untuk menyelesaikan proses aktivasi.
                      </p>
                    </div>
                    <a
                      href="https://business.facebook.com/wa/manage/phone-numbers/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1877F2] text-white text-[11px] font-bold rounded-xl hover:bg-[#166fe5] transition-colors whitespace-nowrap flex-shrink-0 shadow-sm"
                    >
                      <MessageCircle size={12} />
                      Buka Meta Business Manager
                    </a>
                  </div>
                )}

                <table className="w-full text-left border-collapse mt-2">
                  <thead>
                    <tr className="bg-slate-50/60 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3.5">Nama Sesi</th>
                      <th className="px-6 py-3.5">Nomor</th>
                      <th className="px-6 py-3.5">Nama Bisnis</th>
                      <th className="px-6 py-3.5">Status Meta</th>
                      <th className="px-6 py-3.5">Kualitas</th>
                      <th className="px-6 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {metaSessions.map((s) => {
                      const ms = s.meta_phone_number_id ? metaPhoneStatuses[s.meta_phone_number_id] : undefined;
                      const metaStatus = ms?.status || (loadingMetaStatus ? 'LOADING' : 'UNKNOWN');
                      const verifiedName = ms?.verified_name || s.phone_label;
                      const qualityRating = ms?.quality_rating || 'UNKNOWN';
                      const wabaUrl = `https://business.facebook.com/wa/manage/phone-numbers/${s.meta_waba_id ? `?waba_id=${s.meta_waba_id}` : ''}`;

                      const statusBadge = () => {
                        if (metaStatus === 'LOADING') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium">
                              <Loader2 size={10} className="animate-spin" /> Memeriksa...
                            </span>
                          );
                        }
                        if (metaStatus === 'PENDING') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              Pending Verifikasi
                            </span>
                          );
                        }
                        if (metaStatus === 'CONNECTED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Aktif
                            </span>
                          );
                        }
                        if (metaStatus === 'FLAGGED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              Ditandai Meta
                            </span>
                          );
                        }
                        if (metaStatus === 'BANNED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-300 text-[10px] font-bold">
                              ⛔ Diblokir Meta
                            </span>
                          );
                        }
                        if (metaStatus === 'DELETED') {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-bold">
                              ❌ Terhapus di Meta
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium">
                            {metaStatus}
                          </span>
                        );
                      };

                      const qualityBadge = () => {
                        if (!ms) return null;
                        const map: Record<string, string> = {
                          GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          YELLOW: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                          RED: 'bg-red-50 text-red-600 border-red-200',
                          UNKNOWN: 'bg-slate-50 text-slate-500 border-slate-200',
                        };
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${map[qualityRating] || map.UNKNOWN}`}>
                            {qualityRating}
                          </span>
                        );
                      };

                      return (
                        <tr key={s.phone_number} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900 capitalize">{s.phone_label}</td>
                          <td className="px-6 py-4 font-mono text-slate-700">+{s.phone_number}</td>
                          <td className="px-6 py-4 text-slate-600 font-medium">{verifiedName}</td>
                          <td className="px-6 py-4">{statusBadge()}</td>
                          <td className="px-6 py-4">{qualityBadge()}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {/* Verify button — shown for pending/unverified numbers */}
                              {(metaStatus === 'PENDING' || metaStatus === 'UNKNOWN' || !ms) && (
                                <a
                                  href={wabaUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-colors font-bold text-[11px] whitespace-nowrap"
                                  title="Verifikasi nomor di Meta Business Manager"
                                >
                                  <ShieldCheck size={12} />
                                  Verifikasi di Meta
                                </a>
                              )}
                              {/* WA Blast Official Button for Connected Meta numbers */}
                              {metaStatus === 'CONNECTED' && s.meta_phone_number_id && (
                                <>
                                  <button
                                    onClick={() => {
                                      setSelectedMetaPhone(s.meta_phone_number_id || '');
                                      setBlastStep('form');
                                      setBlastResult(null);
                                      setShowMetaBlastModal(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors font-bold text-[11px] whitespace-nowrap"
                                    title="Kirim Pesan Broadcast via Meta API"
                                  >
                                    <Send size={12} />
                                    Blast
                                  </button>
                                  <button
                                    onClick={() => {
                                      setInteractivePhoneId(s.meta_phone_number_id || '');
                                      setInteractiveTo('');
                                      setInteractiveBody('');
                                      setInteractiveHeader('');
                                      setInteractiveFooter('');
                                      setInteractiveSent(false);
                                      setInteractiveError(null);
                                      setShowInteractiveModal(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors font-bold text-[11px] whitespace-nowrap"
                                    title="Kirim Pesan Interaktif (Tombol/List)"
                                  >
                                    <MousePointerClick size={12} />
                                    Interaktif
                                  </button>
                                </>
                              )}
                              {/* Refresh status button */}
                              {s.meta_phone_number_id && (
                                <button
                                  onClick={() => {
                                    if (session?.access_token) {
                                      fetchMetaPhoneStatuses([s], session.access_token);
                                    }
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Refresh status dari Meta"
                                >
                                  <RefreshCw size={13} className={loadingMetaStatus ? 'animate-spin' : ''} />
                                </button>
                              )}
                              <button
                                onClick={() => handleDisconnect(s.phone_label)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-[11px]"
                              >
                                <LogOut size={13} /> Putuskan
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Footer hint with direct link */}
                <div className="px-6 py-3 border-t border-slate-50 flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">
                    Kelola nomor bisnis di{' '}
                    <a
                      href="https://business.facebook.com/wa/manage/phone-numbers/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700 font-semibold underline underline-offset-2"
                    >
                      Meta WhatsApp Manager →
                    </a>
                  </p>
                  <button
                    onClick={() => {
                      const ms2 = metaSessions.filter(s => s.meta_phone_number_id);
                      if (ms2.length > 0 && session?.access_token) {
                        fetchMetaPhoneStatuses(ms2, session.access_token);
                      }
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw size={11} className={loadingMetaStatus ? 'animate-spin' : ''} />
                    Refresh Status Meta
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 2: BAILEYS GATEWAY (SCAN QR)
        ════════════════════════════════════════════════════════════════════ */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-emerald-100 shadow-[0_4px_24px_-8px_rgba(16,185,129,0.12)] overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-emerald-50/70 via-teal-50/30 to-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                  Gateway QR
                </span>
                <h2 className="font-extrabold text-slate-900 text-base">WhatsApp Gateway (Baileys / Scan QR)</h2>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed max-w-2xl">
                Bebas biaya pesan per percakapan. Hubungkan nomor WA pribadi atau bisnis Anda langsung via scan QR peranti tertaut.
              </p>
            </div>

            <div className="flex flex-wrap items-center md:justify-end gap-2.5">
              <button
                onClick={() => {
                  setSelectedBaileysPhoneLabel(baileysSessions[0]?.phone_label || '');
                  setBaileysBlastStep('form');
                  setBaileysBlastResult(null);
                  setAgreedTerms(false);
                  setShowBaileysBlastModal(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20 cursor-pointer whitespace-nowrap"
              >
                <Send size={14} className="flex-shrink-0" />
                WhatsApp Blast (Baileys)
              </button>
              <button
                onClick={() => {
                  setNewLabel('');
                  setQrBase64(null);
                  setActiveSession(null);
                  setStatus('disconnected');
                  setError(null);
                  setShowAddModal(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 h-10 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all text-xs shadow-md whitespace-nowrap"
              >
                <Plus size={15} />
                Tambah Nomor Baru (QR Code)
              </button>
            </div>
          </div>

          {/* Baileys Sessions Table */}
          <div className="overflow-x-auto">
            {loadingSessions ? (
              <div className="p-8 text-center text-slate-400 text-xs">Memuat sesi Baileys...</div>
            ) : baileysSessions.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs font-semibold text-slate-600">Belum ada nomor Gateway Baileys yang terhubung.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Klik tombol "+ Tambah Nomor Baru" di atas untuk memindai QR Code.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3.5">Nama Sesi</th>
                    <th className="px-6 py-3.5">Nomor WhatsApp</th>
                    <th className="px-6 py-3.5">Platform</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {baileysSessions.map((s) => (
                    <tr key={s.phone_number} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900 capitalize">{s.phone_label}</td>
                      <td className="px-6 py-4 font-mono text-slate-700">+{s.phone_number}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">
                          Baileys QR
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {s.status === 'CONNECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Terhubung
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium">
                            Terputus
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {s.status === 'CONNECTED' && (
                            <button
                              onClick={() => {
                                setSelectedBaileysPhoneLabel(s.phone_label);
                                setBaileysBlastStep('form');
                                setBaileysBlastResult(null);
                                setAgreedTerms(false);
                                setShowBaileysBlastModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors font-bold text-[11px] whitespace-nowrap"
                              title="Kirim Broadcast WA via Gateway Baileys"
                            >
                              <Send size={12} /> Kirim Blast
                            </button>
                          )}
                          <button
                            onClick={() => handleDisconnect(s.phone_label)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-[11px]"
                          >
                            <LogOut size={13} /> Putuskan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Disclaimer / Tips info */}
        <div className="bg-amber-50/80 backdrop-blur-md rounded-2xl p-4 border border-amber-200/70 shadow-sm flex items-start gap-3">
          <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600 flex-shrink-0 mt-0.5">
            <AlertTriangle size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-amber-900 text-xs mb-0.5 uppercase tracking-wide">Catatan Keamanan Koneksi</h3>
            <p className="text-xs text-amber-800/90 leading-relaxed">
              Koneksi Baileys (QR Code) adalah <em>Unofficial API</em>. Jika Anda membutuhkan stabilitas enterprise tanpa risiko pemblokiran nomor, disarankan menggunakan <strong>WhatsApp Official (Meta Cloud API)</strong>.
            </p>
          </div>
          <button
            onClick={() => setShowTipsModal(true)}
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900 transition-colors flex-shrink-0"
          >
            <Info size={13} /> Panduan
          </button>
        </div>
      </div>

      {/* ── Add Number Modal (QR Code Wizard) ─────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 to-blue-500" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <Smartphone className="text-emerald-500" size={20} />
                Hubungkan Nomor Gateway (QR Code)
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setActiveSession(null);
                  setQrBase64(null);
                }}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {status === 'disconnected' ? (
              <form onSubmit={handleStartConnection} className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Masukkan label identitas nomor Anda (misalnya: <code>default</code>, <code>sales</code>, atau <code>support</code>).
                </p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  <FolderKanban size={13} />
                  Akan ditambahkan ke project: {activeProject?.name || '—'}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nama Label Sesi</label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: sales"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-850'} text-white text-sm font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2`}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} className="text-emerald-400" />}
                  Mulai Koneksi Sesi
                </button>
              </form>
            ) : (
              <div className="flex flex-col sm:flex-row gap-6 items-center py-2">
                <div className="flex-1 text-center sm:text-left">
                  <h4 className="text-base font-extrabold text-slate-800 mb-3 capitalize">Sesi: {activeSession}</h4>
                  
                  {status === 'connecting' ? (
                    <div className="flex items-center gap-2 py-4">
                      <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                      <span className="text-slate-600 text-sm font-medium">Memulai koneksi Baileys...</span>
                    </div>
                  ) : (
                    <div className="space-y-3 text-slate-600 text-xs mb-5">
                      {[
                        'Buka WhatsApp di ponsel Anda',
                        'Buka Pengaturan → Perangkat Tertaut',
                        'Ketuk Tautkan Perangkat & pindai kode ini',
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center flex-shrink-0 text-[10px] mt-0.5">{i + 1}</div>
                          <p dangerouslySetInnerHTML={{ __html: step.replace(/→/g, '<strong>→</strong>') }} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-500 font-bold animate-pulse uppercase tracking-wider">
                      Status: {status}
                    </span>
                  </div>
                </div>

                {/* QR Image */}
                {status === 'qr' && qrBase64 && (
                  <div className="relative flex-shrink-0 group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-2xl blur opacity-20 group-hover:opacity-35 transition duration-700" />
                    <div className="relative w-44 h-44 p-2.5 bg-white rounded-2xl shadow-lg flex items-center justify-center border border-slate-100 overflow-hidden">
                      <img src={qrBase64} alt="WhatsApp QR Code" className="w-full h-full object-contain relative z-10" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tips Modal ─────────────────────────────────────── */}
      {showTipsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-7 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 to-blue-500" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" size={20} />
                Panduan Anti-Blokir Gateway
              </h3>
              <button
                onClick={() => setShowTipsModal(false)}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { color: 'emerald', num: '1', title: 'Gunakan Nomor Khusus', desc: 'Selalu gunakan nomor sekunder untuk bot. Sangat berisiko jika memakai nomor pribadi.' },
                { color: 'blue', num: '2', title: '"Warm-Up" Nomor Baru', desc: 'Chat manual selama 3–5 hari sebelum disambungkan ke sistem AI.' },
                { color: 'rose', num: '3', title: 'Dilarang Spam', desc: 'Jangan broadcast ke orang yang tidak menyimpan nomor Anda. Laporan "Block" menyebabkan pemblokiran.' },
              ].map((tip) => (
                <div key={tip.num} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <h4 className="font-bold text-slate-800 text-sm mb-1.5 flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full bg-${tip.color}-100 text-${tip.color}-600 flex items-center justify-center text-xs font-bold`}>{tip.num}</div>
                    {tip.title}
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed pl-7">{tip.desc}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowTipsModal(false)}
              className="mt-5 w-full py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

      {/* ── Meta Pending Number Modal ─────────────────────────────────── */}
      {metaPendingInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-7 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="text-amber-500" size={20} />
                Nomor Belum Aktif di Meta
              </h3>
              <button
                onClick={() => setMetaPendingInfo(null)}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-xs text-amber-800 leading-relaxed">
              {metaPendingInfo.message}
            </div>

            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Langkah selanjutnya:</p>
            <div className="space-y-3 mb-5">
              {[
                { num: '1', title: 'Buka Meta Business Manager', desc: 'Kunjungi business.facebook.com → WhatsApp Manager → Phone Numbers' },
                { num: '2', title: 'Verifikasi Nomor via SMS/Telepon', desc: 'Pilih nomor Anda → klik "Verify" → Meta akan SMS atau telepon untuk kode OTP' },
                { num: '3', title: 'Hubungkan Kembali ke PulseAI', desc: 'Setelah nomor terverifikasi di Meta, kembali ke halaman ini dan klik "Log in with Facebook" kembali' },
              ].map((step) => (
                <div key={step.num} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0 text-xs">
                    {step.num}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-xs">{step.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {metaPendingInfo.wabaId && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-5 flex items-center gap-2">
                <Info size={13} className="text-blue-500 flex-shrink-0" />
                <p className="text-[11px] text-blue-700">
                  WABA ID Anda: <strong className="font-mono">{metaPendingInfo.wabaId}</strong> — simpan ini untuk referensi support.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setMetaPendingInfo(null);
                  window.open('https://business.facebook.com/wa/manage/phone-numbers/', '_blank');
                }}
                className="flex-1 py-3 bg-[#1877F2] text-white text-sm font-bold rounded-xl hover:bg-[#166fe5] transition-colors shadow-md"
              >
                Buka Meta Business Manager
              </button>
              <button
                onClick={() => setMetaPendingInfo(null)}
                className="px-5 py-3 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tutorial Modal: Panduan Hubung Meta Cloud API ──────────────────────── */}
      {showTutorialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-7 shadow-2xl relative my-8">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#1877F2] to-indigo-600" />
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-[#1877F2] rounded-xl font-bold">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Panduan Lengkap Integrasi Meta Official API</h3>
                  <p className="text-xs text-slate-500">Langkah demi langkah menghubungkan Meta WhatsApp Cloud API tanpa error</p>
                </div>
              </div>
              <button
                onClick={() => setShowTutorialModal(false)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {/* Steps Checklist */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {[
                {
                  step: 'Langkah 1',
                  title: 'Klik "Log in with Facebook"',
                  desc: 'Klik tombol biru "Log in with Facebook" di atas. Jendela Facebook Embedded Signup akan terbuka otomatis.',
                  badge: 'Di Dashboard PulseAI',
                  color: 'blue'
                },
                {
                  step: 'Langkah 2',
                  title: 'Pilih / Buat Meta Business Account',
                  desc: 'Pilih Business Account Anda di Facebook, lalu buat/pilih WhatsApp Business Account (WABA) dan masukkan nama profil bisnis Anda.',
                  badge: 'Popup Facebook',
                  color: 'indigo'
                },
                {
                  step: 'Langkah 3',
                  title: 'Masukkan Nomor HP & Masukkan Kode OTP SMS',
                  desc: 'Masukkan nomor WhatsApp bisnis baru yang belum terdaftar WA biasa. Pilih verifikasi via SMS/Telepon, lalu ketik 6 digit kode OTP.',
                  badge: 'PENTING: Harus Nomor Baru',
                  color: 'amber'
                },
                {
                  step: 'Langkah 4',
                  title: 'Penyebab Status "Pending" & Cara Mengatasinya',
                  desc: 'Jika setelah verifikasi status masih "Pending", buka Meta Business Manager → Settings (⚙) pada nomor tersebut → Cek peninjauan Display Name. Biasanya disetujui Meta dalam 5–30 menit.',
                  badge: 'Verifikasi Nama Bisnis',
                  color: 'rose'
                },
                {
                  step: 'Langkah 5',
                  title: 'Refresh Status di Dashboard',
                  desc: 'Setelah nama bisnis disetujui oleh Meta, kembali ke dashboard PulseAI dan klik tombol "Refresh Status Meta" (icon putar) di tabel.',
                  badge: 'Selesai & Aktif',
                  color: 'emerald'
                },
              ].map((item, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-extrabold flex items-center justify-center text-xs flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-slate-800 text-sm">{item.title}</h4>
                      <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-600">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <a
                href="https://business.facebook.com/wa/manage/phone-numbers/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1877F2] hover:underline"
              >
                <ExternalLink size={14} /> Buka Meta Business Manager Direct Link
              </a>
              <button
                onClick={() => setShowTutorialModal(false)}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Official Meta WhatsApp Blast Modal ─────────────────────────────────── */}
      {showMetaBlastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-7 shadow-2xl relative my-8">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold">
                  <Send size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">WhatsApp Blast Official (Meta Cloud API)</h3>
                  <p className="text-xs text-slate-500">Kirim broadcast massal aman tanpa risiko nomor diblokir via Meta Official</p>
                </div>
              </div>
              <button
                onClick={() => setShowMetaBlastModal(false)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {blastStep === 'form' ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!targetNumbers.trim()) {
                    setError('Masukkan setidaknya satu nomor tujuan.');
                    return;
                  }
                  setBlastLoading(true);
                  setError(null);

                  // Extract phone numbers (separated by comma, newline, or space)
                  const rawList = targetNumbers.split(/[\n,;]+/).map(n => n.trim().replace(/\D/g, '')).filter(Boolean);
                  if (rawList.length === 0) {
                    setError('Format nomor tujuan tidak valid.');
                    setBlastLoading(false);
                    return;
                  }

                  let successCount = 0;
                  let failedCount = 0;

                  for (const num of rawList) {
                    try {
                      const res = await fetch('/api/whatsapp/meta/send-template', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${session?.access_token}`
                        },
                        body: JSON.stringify({
                          phoneNumberId: selectedMetaPhone || metaSessions[0]?.meta_phone_number_id,
                          to: num,
                          templateName: templateName.trim() || 'hello_world',
                          languageCode: 'en_US'
                        })
                      });
                      const data = await res.json();
                      if (data.success) {
                        successCount++;
                      } else {
                        failedCount++;
                      }
                    } catch {
                      failedCount++;
                    }
                  }

                  setBlastLoading(false);
                  setBlastResult({ total: rawList.length, successCount, failedCount });
                  setBlastStep('success');
                  fetchSessions();
                }}
                className="space-y-4"
              >
                {/* Select Meta Sender Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Pilih Nomor Pengirim Meta Official
                  </label>
                  <select
                    value={selectedMetaPhone}
                    onChange={(e) => setSelectedMetaPhone(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    {metaSessions.map(s => (
                      <option key={s.meta_phone_number_id} value={s.meta_phone_number_id}>
                        {s.phone_label} (+{s.phone_number})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Nama Template Meta (HSM)</span>
                    <span className="text-[10px] text-indigo-600 font-normal">Default: hello_world</span>
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Contoh: hello_world, promo_diskon_september"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Meta mewajibkan pesan broadcast menggunakan template yang sudah diajukan & disetujui di Meta WhatsApp Manager.
                  </p>
                </div>

                {/* Target Numbers Textarea */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nomor Tujuan (Pisahkan dengan baris baru atau koma)
                  </label>
                  <textarea
                    rows={4}
                    value={targetNumbers}
                    onChange={(e) => setTargetNumbers(e.target.value)}
                    placeholder="Contoh:&#10;6281234567890&#10;6289876543210"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start gap-2">
                  <ShieldCheck size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Broadcast melalui Meta Official Cloud API diproses secara instan oleh server Meta. 1000 percakapan Service/bulan gratis tanpa biaya pesan dari Meta.
                  </p>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={blastLoading}
                    className="flex-1 py-3 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
                  >
                    {blastLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {blastLoading ? 'Mengirim Broadcast...' : 'Mulai Kirim WhatsApp Blast'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMetaBlastModal(false)}
                    className="px-5 py-3 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="text-base font-extrabold text-slate-900">Broadcast WhatsApp Berhasil Terkirim!</h4>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total Target</p>
                    <p className="text-lg font-extrabold text-slate-800">{blastResult?.total || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase">Berhasil</p>
                    <p className="text-lg font-extrabold text-emerald-600">{blastResult?.successCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-500 font-bold uppercase">Gagal</p>
                    <p className="text-lg font-extrabold text-rose-500">{blastResult?.failedCount || 0}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMetaBlastModal(false)}
                  className="w-full py-3 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors"
                >
                  Selesai
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Baileys Gateway WhatsApp Blast Modal ───────────────────────────────── */}
      {showBaileysBlastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl relative my-auto max-h-[90vh] flex flex-col overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-700" />
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold">
                  <Send size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">WhatsApp Blast Gateway (Baileys QR)</h3>
                  <p className="text-xs text-slate-500">Kirim broadcast massal menggunakan nomor WA pribadi / bisnis Anda</p>
                </div>
              </div>
              <button
                onClick={() => setShowBaileysBlastModal(false)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            {baileysBlastStep === 'form' ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!agreedTerms) {
                    setError('Anda harus menyetujui Syarat & Ketentuan risiko pemblokiran WhatsApp.');
                    return;
                  }
                  if (!baileysTargetNumbers.trim()) {
                    setError('Masukkan setidaknya satu nomor tujuan.');
                    return;
                  }
                  if (!baileysMessageText.trim()) {
                    setError('Isi pesan broadcast tidak boleh kosong.');
                    return;
                  }

                  setBaileysBlastLoading(true);
                  setError(null);

                  // Extract numbers
                  const rawList = baileysTargetNumbers.split(/[\n,;]+/).map(n => n.trim().replace(/\D/g, '')).filter(Boolean);
                  if (rawList.length === 0) {
                    setError('Format nomor tujuan tidak valid.');
                    setBaileysBlastLoading(false);
                    return;
                  }

                  let successCount = 0;
                  let failedCount = 0;
                  setBaileysBlastProgress({ current: 0, total: rawList.length });

                  const label = selectedBaileysPhoneLabel || baileysSessions[0]?.phone_label || 'default';

                  for (let i = 0; i < rawList.length; i++) {
                    const num = rawList[i];
                    setBaileysBlastProgress({ current: i + 1, total: rawList.length });

                    try {
                      const res = await fetch(`${GATEWAY_URL}/api/session/send-message`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'x-gateway-secret': import.meta.env.VITE_GATEWAY_SECRET || ''
                        },
                        body: JSON.stringify({
                          userId: organization?.id,
                          phoneLabel: label,
                          to: num,
                          message: baileysMessageText
                        })
                      });
                      const data = await res.json();
                      if (data.success) {
                        successCount++;
                      } else {
                        failedCount++;
                      }
                    } catch {
                      failedCount++;
                    }

                    // Delay between messages to prevent spam detection & blocking
                    if (i < rawList.length - 1 && baileysDelaySeconds > 0) {
                      await new Promise(resolve => setTimeout(resolve, baileysDelaySeconds * 1000));
                    }
                  }

                  setBaileysBlastLoading(false);
                  setBaileysBlastProgress(null);
                  setBaileysBlastResult({ total: rawList.length, successCount, failedCount });
                  setBaileysBlastStep('success');
                }}
                className="flex flex-col flex-1 overflow-hidden"
              >
                <div className="overflow-y-auto pr-1 space-y-4 flex-1">
                  {/* Row 1: Session & Delay (2 Columns) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Pilih Sesi WhatsApp Pengirim
                      </label>
                      <select
                        value={selectedBaileysPhoneLabel}
                        onChange={(e) => setSelectedBaileysPhoneLabel(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-500"
                      >
                        {baileysSessions.map(s => (
                          <option key={s.phone_number} value={s.phone_label}>
                            {s.phone_label} (+{s.phone_number})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span>Jeda Pengiriman / Delay (Detik)</span>
                        <span className="text-[10px] text-slate-400 font-normal">Min: 1 detik</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={3600}
                          value={baileysDelaySeconds}
                          onChange={(e) => setBaileysDelaySeconds(Math.max(1, Number(e.target.value)))}
                          placeholder="Masukkan jeda dalam detik (contoh: 5, 60, 120)"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 pr-16"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          Detik
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Disarankan: minimal 5 detik agar pesan tidak terdeteksi otomatis oleh bot WhatsApp.
                      </p>
                    </div>
                  </div>

                  {/* Row 2: Message Text & Target Numbers (2 Columns) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Message Content */}
                    <div className="flex flex-col">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Isi Pesan Broadcast
                      </label>
                      <textarea
                        rows={5}
                        value={baileysMessageText}
                        onChange={(e) => setBaileysMessageText(e.target.value)}
                        placeholder="Tulis pesan Anda di sini..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 leading-relaxed flex-1"
                      />
                      
                      {/* Formatting guide card */}
                      <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-0.5">
                        <p className="font-bold text-slate-800 flex items-center gap-1 text-[11px]">
                          <Info size={12} className="text-emerald-600 shrink-0" /> Panduan Format Pesan:
                        </p>
                        <p className="text-[10px] text-slate-500 leading-snug">
                          Format WA: <code className="bg-white px-1 rounded border">*tebal*</code>, <code className="bg-white px-1 rounded border">_miring_</code>, <code className="bg-white px-1 rounded border">~coret~</code>. Berikan salam sopan &amp; opsi STOP untuk opt-out.
                        </p>
                      </div>
                    </div>

                    {/* Target Numbers */}
                    <div className="flex flex-col">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Nomor Tujuan (Pisahkan baris / koma)
                      </label>
                      <textarea
                        rows={8}
                        value={baileysTargetNumbers}
                        onChange={(e) => setBaileysTargetNumbers(e.target.value)}
                        placeholder="Contoh:&#10;6281234567890&#10;6289876543210&#10;6285554443330"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500 flex-1"
                      />
                    </div>
                  </div>

                  {/* Row 3: Tips Anti-Blokir (Full Width compact) */}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                    <p className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5 mb-1">
                      <ShieldCheck size={14} className="text-amber-600 shrink-0" /> Tips Utama Agar Nomor Tidak Terblokir:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-amber-800/90 leading-relaxed">
                      <p>• <strong>Gunakan Delay ≥ 5 dtk:</strong> Hindari kirim instan agar tidak terdeteksi bot.</p>
                      <p>• <strong>Jangan Spam Kontak Baru:</strong> Prioritaskan kontak yang menyimpan nomor Anda.</p>
                      <p>• <strong>Warm-Up Nomor Baru:</strong> Jangan langsung blast masif di nomor baru.</p>
                      <p>• <strong>Variasikan Isi Pesan:</strong> Hindari pesan yang persis sama secara masif.</p>
                    </div>
                  </div>

                  {/* Terms and Conditions Checkbox */}
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-2xl">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreedTerms}
                        onChange={(e) => setAgreedTerms(e.target.checked)}
                        className="mt-0.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 w-4 h-4 shrink-0"
                      />
                      <span className="text-xs text-rose-900 leading-relaxed">
                        Saya memahami dan menyetujui bahwa pengiriman pesan massal via Gateway QR (Unofficial API) memiliki risiko nomor diblokir oleh WhatsApp. PulseAI tidak bertanggung jawab atas pemblokiran nomor akibat pelanggaran spam.
                      </span>
                    </label>
                  </div>

                  {/* Progress bar during sending */}
                  {baileysBlastLoading && baileysBlastProgress && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-emerald-800">
                        <span>Mengirim broadcast... ({baileysBlastProgress.current} dari {baileysBlastProgress.total})</span>
                        <span>{Math.round((baileysBlastProgress.current / baileysBlastProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full h-2 bg-emerald-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                          style={{ width: `${(baileysBlastProgress.current / baileysBlastProgress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-emerald-600 text-center">Mohon tunggu, memberikan jeda delay {baileysDelaySeconds} detik per pesan...</p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex gap-3 shrink-0 mt-2">
                  <button
                    type="submit"
                    disabled={baileysBlastLoading || !agreedTerms}
                    className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {baileysBlastLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {baileysBlastLoading ? 'Proses Broadcast...' : 'Mulai Kirim Blast Gateway'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBaileysBlastModal(false)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="text-base font-extrabold text-slate-900">Broadcast WhatsApp Baileys Selesai!</h4>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total Target</p>
                    <p className="text-lg font-extrabold text-slate-800">{baileysBlastResult?.total || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase">Berhasil</p>
                    <p className="text-lg font-extrabold text-emerald-600">{baileysBlastResult?.successCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-rose-500 font-bold uppercase">Gagal</p>
                    <p className="text-lg font-extrabold text-rose-500">{baileysBlastResult?.failedCount || 0}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowBaileysBlastModal(false)}
                  className="w-full py-3 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors"
                >
                  Selesai
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Meta Template Manager Modal ──────────────────────────────────── */}
      {showTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><List size={18} className="text-purple-600" /> Template Manager Meta</h3>
                <p className="text-xs text-slate-500 mt-0.5">Daftar template HSM yang terdaftar di WhatsApp Business Account Anda</p>
              </div>
              <button onClick={() => setShowTemplatesModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {templatesLoading ? (
                <div className="text-center py-10"><Loader2 size={24} className="animate-spin text-purple-500 mx-auto" /></div>
              ) : templatesError ? (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs flex items-start gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{templatesError}</div>
              ) : templates.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">Belum ada template terdaftar di WABA Anda.<br /><span className="text-xs">Buat template di <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">Meta Business Manager</a></span></div>
              ) : selectedTemplate ? (
                <div className="space-y-4">
                  <button onClick={() => setSelectedTemplate(null)} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">← Kembali ke daftar</button>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-extrabold text-slate-900 text-sm">{selectedTemplate.name}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedTemplate.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                        selectedTemplate.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>{selectedTemplate.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                      <div><span className="text-slate-400">Kategori:</span> <span className="font-semibold text-slate-700">{selectedTemplate.category}</span></div>
                      <div><span className="text-slate-400">Bahasa:</span> <span className="font-semibold text-slate-700">{selectedTemplate.language}</span></div>
                    </div>
                    <div className="space-y-2">
                      {(selectedTemplate.components || []).map((comp: any, i: number) => (
                        <div key={i} className="bg-white rounded-lg p-3 border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{comp.type}</p>
                          <p className="text-xs text-slate-700 whitespace-pre-wrap">{comp.text || JSON.stringify(comp.buttons || comp, null, 2)}</p>
                        </div>
                      ))}
                    </div>
                    {selectedTemplate.quality_score?.score && (
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Kualitas:</span>
                        <span className={`font-bold ${
                          selectedTemplate.quality_score.score === 'GREEN' ? 'text-emerald-600' :
                          selectedTemplate.quality_score.score === 'YELLOW' ? 'text-amber-600' : 'text-red-600'
                        }`}>{selectedTemplate.quality_score.score}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setTemplateName(selectedTemplate.name);
                      setShowTemplatesModal(false);
                      setSelectedMetaPhone(metaSessions[0]?.meta_phone_number_id || '');
                      setBlastStep('form');
                      setBlastResult(null);
                      setShowMetaBlastModal(true);
                    }}
                    className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Send size={13} /> Gunakan Template Ini untuk Blast
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t)}
                      className="w-full text-left p-3.5 bg-white hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-xl transition-all flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 truncate">{t.name}</p>
                        <p className="text-[11px] text-slate-400">{t.category} · {t.language}</p>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        t.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                        t.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>{t.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-between items-center">
              <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1"><ExternalLink size={11} /> Kelola di Meta BM</a>
              <button onClick={() => setShowTemplatesModal(false)} className="px-5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Meta Analytics Modal ─────────────────────────────────────────── */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><BarChart2 size={18} className="text-emerald-600" /> Analitik Meta WhatsApp</h3>
                <p className="text-xs text-slate-500 mt-0.5">Statistik percakapan dari Meta Business API</p>
              </div>
              <button onClick={() => setShowAnalyticsModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {analyticsLoading ? (
                <div className="text-center py-10"><Loader2 size={24} className="animate-spin text-emerald-500 mx-auto" /><p className="text-xs text-slate-400 mt-3">Memuat data dari Meta...</p></div>
              ) : analyticsError ? (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs flex items-start gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{analyticsError}</div>
              ) : analyticsData ? (
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                    <p className="text-[11px] text-emerald-700 font-bold uppercase mb-1">WABA ID</p>
                    <p className="text-sm font-mono text-slate-700">{analyticsData.wabaId}</p>
                    <p className="text-[11px] text-emerald-700 font-bold uppercase mt-3 mb-1">Phone Number ID</p>
                    <p className="text-sm font-mono text-slate-700">{analyticsData.phoneNumberId}</p>
                  </div>
                  {analyticsData.analytics && analyticsData.analytics.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-500 uppercase">Data Percakapan (7 Hari Terakhir)</p>
                      {analyticsData.analytics.map((item: any, i: number) => (
                        <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            {item.data_points?.map((dp: any, j: number) => (
                              <div key={j}>
                                <p className="text-[10px] text-slate-400 font-bold">{dp.type || 'Percakapan'}</p>
                                <p className="text-xl font-extrabold text-slate-800">{dp.count ?? '-'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-xs text-amber-700 font-semibold flex items-center gap-2"><Info size={13} /> Data analitik belum tersedia.</p>
                      <p className="text-[11px] text-amber-600 mt-1">Meta membutuhkan minimal beberapa hari aktivitas sebelum data percakapan tersedia di API analytics. Coba lagi setelah 24-48 jam dari pertama kali nomor aktif.</p>
                    </div>
                  )}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Info Akun</p>
                    {analyticsData.insights?.account_alerts?.data?.length > 0 ? (
                      analyticsData.insights.account_alerts.data.map((alert: any, i: number) => (
                        <p key={i} className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">{alert.type}: {alert.message}</p>
                      ))
                    ) : (
                      <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Tidak ada peringatan aktif pada akun Anda.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 text-sm">Tidak ada data analitik tersedia.<br /><span className="text-xs">Pastikan Anda memiliki nomor Meta yang terhubung.</span></div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-between items-center">
              <a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1"><ExternalLink size={11} /> Buka Meta BM</a>
              <button onClick={() => setShowAnalyticsModal(false)} className="px-5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Interactive Message Sender Modal ─────────────────────────────── */}
      {showInteractiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><MousePointerClick size={18} className="text-teal-600" /> Kirim Pesan Interaktif</h3>
                <p className="text-xs text-slate-500 mt-0.5">Kirim pesan dengan tombol pilihan atau daftar menu ke satu nomor pelanggan</p>
              </div>
              <button onClick={() => setShowInteractiveModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {interactiveSent ? (
                <div className="text-center py-8 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center mx-auto"><CheckCircle2 size={32} /></div>
                  <h4 className="text-base font-extrabold text-slate-900">Pesan Interaktif Terkirim!</h4>
                  <p className="text-sm text-slate-500">Pesan dengan tombol berhasil dikirim ke <strong>{interactiveTo}</strong></p>
                  <button
                    onClick={() => { setInteractiveSent(false); setInteractiveTo(''); setInteractiveBody(''); }}
                    className="mt-2 px-6 py-2.5 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 transition-colors"
                  >Kirim Lagi</button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!interactiveTo.trim() || !interactiveBody.trim()) return;
                    setInteractiveSending(true);
                    setInteractiveError(null);
                    try {
                      const payload: any = {
                        phoneNumberId: interactivePhoneId,
                        to: interactiveTo.trim(),
                        type: interactiveType,
                        body: interactiveBody.trim(),
                      };
                      if (interactiveHeader.trim()) payload.header = interactiveHeader.trim();
                      if (interactiveFooter.trim()) payload.footer = interactiveFooter.trim();
                      if (interactiveType === 'button') payload.buttons = interactiveButtons;
                      else {
                        payload.sections = interactiveSections;
                        payload.listButtonText = interactiveListBtn;
                      }
                      const res = await fetch('/api/whatsapp/meta/send-interactive', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                        body: JSON.stringify(payload)
                      });
                      const data = await res.json();
                      if (data.success) setInteractiveSent(true);
                      else setInteractiveError(data.message || 'Gagal mengirim pesan');
                    } catch { setInteractiveError('Tidak dapat terhubung ke server'); }
                    finally { setInteractiveSending(false); }
                  }}
                  className="space-y-4"
                >
                  {interactiveError && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs flex items-start gap-2"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{interactiveError}</div>
                  )}
                  {/* Nomor Tujuan */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Nomor Tujuan <span className="text-red-500">*</span></label>
                    <input type="text" value={interactiveTo} onChange={e => setInteractiveTo(e.target.value)}
                      placeholder="628123456789 (tanpa + atau 0)"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      required
                    />
                  </div>
                  {/* Tipe Pesan */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Tipe Interaktif</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['button', 'list'] as const).map(t => (
                        <button type="button" key={t}
                          onClick={() => setInteractiveType(t)}
                          className={`py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            interactiveType === t ? 'bg-teal-600 text-white border-teal-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
                          }`}
                        >
                          {t === 'button' ? <MousePointerClick size={12} /> : <List size={12} />}
                          {t === 'button' ? 'Tombol (Button)' : 'Daftar (List)'}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {interactiveType === 'button' ? '⚡ Max 3 tombol, teks max 20 karakter per tombol' : '📋 Max 10 baris pilihan, cocok untuk menu produk/layanan'}
                    </p>
                  </div>
                  {/* Header (opsional) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Header <span className="text-slate-400 font-normal">(opsional)</span></label>
                    <input type="text" value={interactiveHeader} onChange={e => setInteractiveHeader(e.target.value)}
                      placeholder="Judul pesan (maks 60 karakter)"
                      maxLength={60}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                  </div>
                  {/* Body */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Isi Pesan (Body) <span className="text-red-500">*</span></label>
                    <textarea value={interactiveBody} onChange={e => setInteractiveBody(e.target.value)}
                      rows={3} placeholder="Tulis isi pesan utama di sini..."
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                      required
                    />
                  </div>
                  {/* Footer (opsional) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Footer <span className="text-slate-400 font-normal">(opsional)</span></label>
                    <input type="text" value={interactiveFooter} onChange={e => setInteractiveFooter(e.target.value)}
                      placeholder="Teks kecil di bawah pesan (maks 60 karakter)"
                      maxLength={60}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                  </div>
                  {/* Buttons Config */}
                  {interactiveType === 'button' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Tombol Pilihan <span className="text-slate-400 font-normal">(max 3)</span></label>
                      <div className="space-y-2">
                        {interactiveButtons.map((btn, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <input
                              type="text" value={btn.title}
                              onChange={e => setInteractiveButtons(prev => prev.map((b, j) => j === i ? { ...b, title: e.target.value } : b))}
                              placeholder={`Tombol ${i + 1} (max 20 karakter)`}
                              maxLength={20}
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                            />
                            {interactiveButtons.length > 1 && (
                              <button type="button" onClick={() => setInteractiveButtons(prev => prev.filter((_, j) => j !== i))}
                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                              ><Trash2 size={13} /></button>
                            )}
                          </div>
                        ))}
                        {interactiveButtons.length < 3 && (
                          <button type="button"
                            onClick={() => setInteractiveButtons(prev => [...prev, { id: `btn_${prev.length + 1}`, title: '' }])}
                            className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 font-semibold"
                          ><Plus size={12} /> Tambah Tombol</button>
                        )}
                      </div>
                    </div>
                  )}
                  {/* List Config */}
                  {interactiveType === 'list' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Label Tombol Daftar</label>
                        <input type="text" value={interactiveListBtn} onChange={e => setInteractiveListBtn(e.target.value)}
                          placeholder="Pilih Opsi (max 20 karakter)"
                          maxLength={20}
                          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                        />
                      </div>
                      <label className="block text-xs font-bold text-slate-700">Item Daftar</label>
                      {interactiveSections.map((sec, si) => (
                        <div key={si} className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                          <input type="text" value={sec.title}
                            onChange={e => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, title: e.target.value } : s))}
                            placeholder="Judul seksi (maks 24 karakter)"
                            maxLength={24}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                          />
                          {sec.rows.map((row, ri) => (
                            <div key={ri} className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-1.5">{ri + 1}</span>
                              <div className="flex-1 space-y-1">
                                <input type="text" value={row.title}
                                  onChange={e => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, rows: s.rows.map((r, rj) => rj === ri ? { ...r, title: e.target.value } : r) } : s))}
                                  placeholder="Judul item (max 24 karakter)"
                                  maxLength={24}
                                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                                />
                                <input type="text" value={row.description}
                                  onChange={e => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, rows: s.rows.map((r, rj) => rj === ri ? { ...r, description: e.target.value } : r) } : s))}
                                  placeholder="Deskripsi singkat (opsional, max 72 karakter)"
                                  maxLength={72}
                                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-500 focus:ring-2 focus:ring-teal-500 outline-none"
                                />
                              </div>
                              {sec.rows.length > 1 && (
                                <button type="button" onClick={() => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, rows: s.rows.filter((_, rj) => rj !== ri) } : s))}
                                  className="p-1 text-slate-400 hover:text-red-500 transition-colors mt-1"
                                ><Trash2 size={12} /></button>
                              )}
                            </div>
                          ))}
                          {sec.rows.length < 10 && (
                            <button type="button"
                              onClick={() => setInteractiveSections(prev => prev.map((s, idx) => idx === si ? { ...s, rows: [...s.rows, { id: `row_${s.rows.length + 1}`, title: '', description: '' }] } : s))}
                              className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 font-semibold"
                            ><Plus size={12} /> Tambah Item</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-100 flex gap-3">
                    <button
                      type="submit"
                      disabled={interactiveSending}
                      className="flex-1 py-2.5 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {interactiveSending ? <Loader2 size={14} className="animate-spin" /> : <MousePointerClick size={14} />}
                      {interactiveSending ? 'Mengirim...' : 'Kirim Pesan Interaktif'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInteractiveModal(false)}
                      className="px-5 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
                    >Batal</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppIntegrationPage;
