import React, { useEffect, useState } from 'react';
import { MessageCircle, Zap, ShieldCheck, Smartphone, LogOut, Loader2, RefreshCw, AlertTriangle, X, Info, Plus, FolderKanban, ChevronDown } from 'lucide-react';
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

            <div>
              <button
                onClick={handleMetaLogin}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] text-white text-xs font-bold rounded-xl hover:bg-[#166fe5] transition-all whitespace-nowrap shadow-md shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
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

            <button
              onClick={() => {
                setNewLabel('');
                setQrBase64(null);
                setActiveSession(null);
                setStatus('disconnected');
                setError(null);
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all text-xs shadow-md whitespace-nowrap"
            >
              <Plus size={15} />
              Tambah Nomor Baru (QR Code)
            </button>
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
                        <button
                          onClick={() => handleDisconnect(s.phone_label)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-[11px]"
                        >
                          <LogOut size={13} /> Putuskan
                        </button>
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
    </div>
  );
};

export default WhatsAppIntegrationPage;
