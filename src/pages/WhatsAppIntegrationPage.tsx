import React, { useEffect, useState } from 'react';
import { MessageCircle, Zap, ShieldCheck, Sparkles, Smartphone, LogOut, Loader2, RefreshCw, AlertTriangle, X, Info, ExternalLink, Plus, Settings2, FolderKanban, ChevronDown } from 'lucide-react';
import { useOrganization } from '../hooks/useOrganization';
import { useAuth } from '../contexts/AuthContext';
import { useProjects } from '../contexts/ProjectContext';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;

type ConnectionStatus = 'checking' | 'disconnected' | 'qr' | 'open' | 'connecting';

interface WhatsAppSession {
  phone_number: string;
  org_id: string;
  phone_label: string;
  gateway_user_id: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING';
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
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
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (orgLoading) return;
    fetchSessions();
  }, [organization, session, orgLoading, activeProjectId]);

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
          // Success: connected!
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
      // Record which Project this new number belongs to BEFORE the gateway
      // reveals the actual phone number — see whatsapp_session_intents.
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
      // Go through Fastify (authenticated) — it calls the gateway AND updates the DB row.
      // This works even when the session is already gone from gateway memory.
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

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-emerald-200/25 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-200/15 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* Main Content */}
      <div className="relative flex-1 p-5 lg:p-8 max-w-6xl mx-auto w-full z-10">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold mb-2">
              <Smartphone size={12} />
              <span>Multi-Instance · Perangkat Taut</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Integrasi <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">WhatsApp</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">AI PulseAI siap merespons pelanggan Anda melalui banyak nomor sekaligus.</p>
          </div>

          <div className="flex items-center gap-2">
            {projects.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setProjectMenuOpen((v) => !v)}
                  className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 text-sm font-semibold rounded-xl transition-all duration-150"
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
              onClick={() => {
                setNewLabel('');
                setQrBase64(null);
                setActiveSession(null);
                setStatus('disconnected');
                setError(null);
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all text-sm shadow-md"
            >
              <Plus size={16} />
              Tambah Nomor Baru
            </button>
          </div>
        </div>

        {/* ── Error Banner ─────────────────────────────────── */}
        {error && (
          <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <p className="flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
          </div>
        )}

        {/* ── Main Grid ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Connected Sessions Table — left/main */}
          <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Daftar Nomor WhatsApp Terhubung</h2>
              <button 
                onClick={fetchSessions} 
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="Refresh Daftar"
              >
                <RefreshCw size={14} className={loadingSessions ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="overflow-x-auto flex-1">
              {loadingSessions ? (
                <div className="flex flex-col items-center justify-center p-12 gap-2">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  <p className="text-slate-500 text-xs">Memuat daftar nomor...</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-16 text-slate-400 px-6">
                  <Smartphone size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold text-slate-700">Belum ada nomor yang terhubung</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Hubungkan nomor WhatsApp asisten AI Anda untuk mulai melayani pelanggan secara otomatis.
                  </p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 hover:text-emerald-700 transition-colors text-xs font-bold rounded-lg"
                  >
                    <Plus size={14} /> Hubungkan Sekarang
                  </button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-4">Nama Sesi (Label)</th>
                      <th className="px-6 py-4">Nomor WhatsApp</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sessions.map((sessionItem) => (
                      <tr key={sessionItem.phone_number} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                              <MessageCircle size={15} />
                            </div>
                            <span className="font-bold text-slate-900 text-sm capitalize">{sessionItem.phone_label}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-slate-600 font-mono text-sm">+{sessionItem.phone_number}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {sessionItem.status === 'CONNECTED' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Terhubung
                            </span>
                          ) : sessionItem.status === 'DISCONNECTED' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-500 text-xs font-medium">
                              Terputus
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-700 text-xs font-semibold animate-pulse">
                              Proses
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleDisconnect(sessionItem.phone_label)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1.5 text-xs font-bold"
                            title="Putuskan Koneksi"
                          >
                            <LogOut size={14} />
                            <span className="hidden sm:inline">Putuskan</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Side Panel — right ────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Feature highlights */}
            <div className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-3xl p-6 text-white border border-slate-700/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/15 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <h3 className="font-bold text-base mb-5 flex items-center gap-2 relative z-10">
                <Sparkles className="text-emerald-400" size={16} />
                WhatsApp Multi-Number
              </h3>
              <div className="space-y-5 relative z-10">
                {[
                  { icon: <Zap size={16} />, title: 'Banyak Nomor, Satu Otak', desc: 'Hubungkan nomor CS, Sales, dan Support ke satu basis pengetahuan RAG yang sama.' },
                  { icon: <ShieldCheck size={16} />, title: 'Enkripsi & Keamanan', desc: 'Gateway multi-tenant mengamankan autentikasi token WA di level sesi.' },
                  { icon: <Settings2 size={16} />, title: 'Routing Gateway', desc: 'Atur label spesifik seperti sales/support untuk sinkronisasi webhook otomatis.' },
                ].map((f, i) => (
                  <div key={i} className="flex gap-3.5 group">
                    <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-emerald-400 group-hover:bg-emerald-500/20 transition-all duration-300">
                      {f.icon}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-slate-100 mb-0.5">{f.title}</h4>
                      <p className="text-slate-400 text-xs leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Disclaimer */}
            <div className="bg-amber-50/80 backdrop-blur-md rounded-2xl p-5 border border-amber-200/70 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600 flex-shrink-0 mt-0.5">
                  <AlertTriangle size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-amber-900 text-xs mb-1.5 uppercase tracking-wide">Informasi Penting</h3>
                  <p className="text-xs text-amber-800/90 leading-relaxed mb-3">
                    Koneksi ini menggunakan <em>Unofficial API</em> dan <strong>bukan</strong> mitra resmi Meta. Risiko pemblokiran menjadi tanggung jawab pengguna.
                  </p>
                  <button
                    onClick={() => setShowTipsModal(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-900 transition-colors"
                  >
                    <Info size={13} /> Lihat Panduan Anti-Blokir
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Official API Banner ─────────────────────────── */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-4 px-5 py-4 bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm">
          <img
            src="/Logo-Mekari-Qontak.svg"
            alt="Mekari Qontak"
            className="h-6 flex-shrink-0 opacity-80 mix-blend-multiply"
          />
          <div className="flex-1 text-center sm:text-left min-w-0">
            <p className="text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-800">Butuh WhatsApp API Resmi?</span>{' '}
              Centang hijau (Verified Badge), zero risiko blokir, dan skalabilitas enterprise via Mekari Qontak.
            </p>
          </div>
          <a
            href="https://wa.me/6287826563459?text=Halo%20tim%20PulseAI,%20saya%20tertarik%20beralih%20ke%20WhatsApp%20Official%20API%20via%20Mekari%20Qontak"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-all flex-shrink-0 whitespace-nowrap"
          >
            <MessageCircle size={13} />
            Konsultasi Gratis
            <ExternalLink size={11} className="opacity-60" />
          </a>
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
                Hubungkan Nomor WhatsApp
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
                  Masukkan label identitas nomor Anda (misalnya: <code>default</code>, <code>sales</code>, atau <code>support</code>). Label ini membedakan routing log pesan gateway.
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
                      <div className="absolute top-0 left-0 w-full h-0.5 bg-emerald-400/60 animate-[scan_2s_ease-in-out_infinite] z-20" />
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
                Panduan Anti-Blokir
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
                { color: 'rose', num: '3', title: 'Dilarang Spam', desc: 'Jangan broadcast ke orang yang tidak menyimpan nomor Anda. Laporan "Block" menyebabkan blokir permanen.' },
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
    </div>
  );
};

export default WhatsAppIntegrationPage;
