import React, { useEffect, useState } from 'react';
import { MessageCircle, Zap, ShieldCheck, Sparkles, Smartphone, LogOut, Loader2, RefreshCw, AlertTriangle, X, Info, ExternalLink } from 'lucide-react';
import { useOrganization } from '../hooks/useOrganization';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL;

type ConnectionStatus = 'checking' | 'disconnected' | 'qr' | 'open';

const WhatsAppIntegrationPage: React.FC = () => {
  const { organization } = useOrganization();
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showTipsModal, setShowTipsModal] = useState<boolean>(false);

  const checkStatus = async () => {
    if (!organization?.id) return;
    try {
      const res = await fetch(`${GATEWAY_URL}/api/session/status?userId=${organization.id}`);
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        if (data.qrBase64) setQrBase64(data.qrBase64);
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('disconnected');
    }
  };

  useEffect(() => { checkStatus(); }, [organization]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (status === 'qr') {
      interval = setInterval(checkStatus, 3000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [status, organization]);

  const handleConnect = async () => {
    if (!organization?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/session/start?userId=${organization.id}`);
      const data = await res.json();
      if (data.success) {
        setStatus(data.status);
        if (data.qrBase64) setQrBase64(data.qrBase64);
      } else {
        setError(data.message || 'Gagal memulai sesi WhatsApp.');
      }
    } catch {
      setError('Gateway WhatsApp tidak dapat dihubungi.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      await fetch(`${GATEWAY_URL}/api/session/logout?userId=${organization.id}`, { method: 'DELETE' });
      setStatus('disconnected');
      setQrBase64(null);
    } catch {
      setError('Gagal memutuskan koneksi WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
          <p className="text-slate-500 text-sm">Memeriksa status koneksi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-emerald-200/25 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-200/15 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* Main Content */}
      <div className="relative flex-1 p-5 lg:p-8 max-w-5xl mx-auto w-full z-10">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold mb-2">
              <Smartphone size={12} />
              <span>Unofficial · Perangkat Taut</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Hubungkan <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">WhatsApp</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">AI PulseAI siap merespons pelanggan Anda 24/7.</p>
          </div>

          {status === 'open' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Aktif
            </div>
          )}
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
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

          {/* Connection Panel — left/main */}
          <div className="xl:col-span-3 bg-white/80 backdrop-blur-xl rounded-3xl border border-white/70 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] overflow-hidden">

            {/* ── CONNECTED ── */}
            {status === 'open' ? (
              <div className="p-8 flex flex-col items-center text-center">
                <div className="relative mb-5">
                  <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20" />
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-50 to-emerald-100 border-4 border-white rounded-full shadow-xl flex items-center justify-center relative z-10">
                    <Smartphone className="text-emerald-500 w-7 h-7" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center shadow">
                      <ShieldCheck className="text-white w-3 h-3" />
                    </div>
                  </div>
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Terhubung Penuh</h2>
                <p className="text-slate-500 text-sm mb-6 max-w-xs leading-relaxed">
                  AI PulseAI aktif sebagai asisten cerdas di WhatsApp Anda.
                </p>
                <button
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-red-100 text-red-600 font-bold rounded-xl hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-50 text-sm shadow-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  Putuskan Koneksi
                </button>
              </div>

            ) : status === 'qr' && qrBase64 ? (
              /* ── QR STATE ── */
              <div className="p-6 flex flex-col sm:flex-row gap-6 items-center">
                <div className="flex-1 text-center sm:text-left">
                  <h2 className="text-xl font-extrabold text-slate-800 mb-4">Pindai Kode QR</h2>
                  <div className="space-y-3 text-slate-600 text-sm mb-5">
                    {[
                      'Buka WhatsApp di ponsel Anda',
                      'Buka Pengaturan → Perangkat Tertaut',
                      'Ketuk Tautkan Perangkat & pindai kode ini',
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center flex-shrink-0 text-xs mt-0.5">{i + 1}</div>
                        <p dangerouslySetInnerHTML={{ __html: step.replace(/→/g, '<strong>→</strong>') }} />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={checkStatus}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors text-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Muat Ulang Status
                  </button>
                </div>

                {/* QR Image */}
                <div className="relative flex-shrink-0 group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-2xl blur opacity-20 group-hover:opacity-35 transition duration-700" />
                  <div className="relative w-52 h-52 p-3 bg-white rounded-2xl shadow-lg flex items-center justify-center border border-slate-100 overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-emerald-400/60 animate-[scan_2s_ease-in-out_infinite] z-20" />
                    <img src={qrBase64} alt="WhatsApp QR Code" className="w-full h-full object-contain relative z-10" />
                  </div>
                </div>
              </div>

            ) : (
              /* ── DISCONNECTED ── */
              <div className="p-10 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-white shadow-inner">
                  <MessageCircle className="text-slate-400 w-8 h-8" />
                </div>
                <h2 className="text-xl font-extrabold text-slate-800 mb-2">Belum Terhubung</h2>
                <p className="text-slate-500 text-sm mb-7 max-w-sm mx-auto leading-relaxed">
                  Ubah WhatsApp Anda menjadi mesin CS cerdas 24/7. Hubungkan dalam hitungan detik.
                </p>
                <button
                  onClick={handleConnect}
                  disabled={loading}
                  className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 group-hover:opacity-10 transition-opacity" />
                  {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /><span>Membuat Sesi...</span></>
                  ) : (
                    <><Zap className="w-5 h-5 text-emerald-400" /><span>Hubungkan WhatsApp</span></>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* ── Side Panel — right ────────────────────────── */}
          <div className="xl:col-span-2 flex flex-col gap-4">

            {/* Feature highlights */}
            <div className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-3xl p-6 text-white border border-slate-700/50 relative overflow-hidden flex-1">
              <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/15 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <h3 className="font-bold text-base mb-5 flex items-center gap-2 relative z-10">
                <Sparkles className="text-emerald-400" size={16} />
                Nilai Tambah PulseAI
              </h3>
              <div className="space-y-5 relative z-10">
                {[
                  { icon: <Zap size={16} />, title: 'Respon Kilat 24/7', desc: 'Balas pelanggan dalam detik, tanpa henti.' },
                  { icon: <ShieldCheck size={16} />, title: 'Koneksi Aman', desc: 'Enkripsi end-to-end dari perangkat ke server.' },
                  { icon: <MessageCircle size={16} />, title: 'Interaksi Humanis', desc: 'AI memahami bahasa natural layaknya manusia.' },
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
        <div className="mt-5 flex flex-col sm:flex-row items-center gap-4 px-5 py-4 bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm">
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
