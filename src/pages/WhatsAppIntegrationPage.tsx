import React, { useEffect, useState } from 'react';
import { MessageCircle, Zap, ShieldCheck, Sparkles, Smartphone, LogOut, Loader2, RefreshCw, AlertTriangle, X, Info } from 'lucide-react';
import { useOrganization } from '../hooks/useOrganization';

// Use environment variables for the gateway URL, fall back to localhost for local testing
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
        if (data.qrBase64) {
          setQrBase64(data.qrBase64);
        }
      } else {
        setStatus('disconnected');
      }
    } catch (err) {
      console.error('Failed to check WhatsApp status:', err);
      // If gateway is down, just show disconnected
      setStatus('disconnected');
    }
  };

  useEffect(() => {
    checkStatus();
  }, [organization]);

  // Polling when waiting for QR scan
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (status === 'qr') {
      interval = setInterval(() => {
        checkStatus();
      }, 3000); // Poll every 3 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
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
        if (data.qrBase64) {
          setQrBase64(data.qrBase64);
        }
      } else {
        setError(data.message || 'Gagal memulai sesi WhatsApp.');
      }
    } catch (err) {
      console.error(err);
      setError('Gateway WhatsApp tidak dapat dihubungi. Pastikan server gateway berjalan.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      await fetch(`${GATEWAY_URL}/api/session/logout?userId=${organization.id}`, {
        method: 'DELETE',
      });
      setStatus('disconnected');
      setQrBase64(null);
    } catch (err) {
      console.error(err);
      setError('Gagal memutuskan koneksi WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="p-6 max-w-5xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-slate-500 font-medium">Memeriksa status koneksi WhatsApp...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-emerald-300/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-300/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />
      
      <div className="relative p-6 lg:p-10 max-w-6xl mx-auto z-10">
        {/* Header Area */}
        <div className="mb-10 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100/50 border border-emerald-200 text-emerald-700 text-sm font-semibold mb-4 backdrop-blur-md">
            <Sparkles size={16} className="text-emerald-600" />
            <span>Integrasi Premium</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight mb-3">
            Hubungkan <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">WhatsApp Bisnis</span> Anda
          </h1>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto lg:mx-0">
            Berikan pengalaman asisten AI 24/7 kepada pelanggan Anda secara instan.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Main Connection Panel */}
          <div className="xl:col-span-2">
            {error && (
              <div className="mb-6 p-4 bg-red-50/80 backdrop-blur-md border border-red-200 rounded-2xl text-red-700 text-sm font-medium flex items-start gap-3 shadow-sm animate-in slide-in-from-top-2">
                <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
                <p>{error}</p>
              </div>
            )}

            <div className="bg-white/70 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] overflow-hidden transition-all duration-500 relative">
              
              {/* Connected State */}
              {status === 'open' ? (
                <div className="p-8 lg:p-10 flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20"></div>
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-50 to-emerald-100 border-4 border-white rounded-full shadow-xl flex items-center justify-center relative z-10">
                      <Smartphone className="text-emerald-500 w-8 h-8" />
                      <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 border-4 border-white rounded-full flex items-center justify-center shadow-lg">
                        <ShieldCheck className="text-white w-4 h-4" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-bold mb-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Status: Aktif & Mendengarkan
                  </div>
                  
                  <h2 className="text-2xl font-bold text-slate-800 mb-3">Sistem Terhubung Penuh</h2>
                  <p className="text-slate-500 mb-8 max-w-lg text-base leading-relaxed">
                    AI PulseAI kini aktif sebagai asisten pintar di nomor WhatsApp Anda, siap merespons pertanyaan pelanggan seketika.
                  </p>
                  
                  <button
                    onClick={handleDisconnect}
                    disabled={loading}
                    className="group flex items-center gap-2 px-6 py-3 bg-white border-2 border-red-100 text-red-600 font-bold rounded-2xl hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-50 shadow-sm"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />}
                    Putuskan Koneksi WhatsApp
                  </button>
                </div>
              ) : status === 'qr' && qrBase64 ? (
                /* QR State */
                <div className="p-8 lg:p-12 flex flex-col md:flex-row gap-10 items-center justify-between">
                  <div className="flex-1 text-center md:text-left">
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-6">Pindai Kode QR</h2>
                    
                    <div className="space-y-6 text-slate-600 mb-8 max-w-sm mx-auto md:mx-0">
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center flex-shrink-0 mt-0.5 shadow-inner">1</div>
                        <p className="text-lg">Buka WhatsApp di telepon Anda</p>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center flex-shrink-0 mt-0.5 shadow-inner">2</div>
                        <p className="text-lg">Buka <strong>Pengaturan</strong> &gt; <strong>Perangkat Tertaut</strong></p>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center flex-shrink-0 mt-0.5 shadow-inner">3</div>
                        <p className="text-lg">Ketuk <strong>Tautkan Perangkat</strong> dan pindai layar ini</p>
                      </div>
                    </div>

                    <button
                      onClick={checkStatus}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors mx-auto md:mx-0"
                    >
                      <RefreshCw className="w-4 h-4" /> Muat Ulang Status
                    </button>
                  </div>
                  
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                    <div className="relative w-72 h-72 p-6 bg-white rounded-3xl shadow-xl flex items-center justify-center border border-slate-100 overflow-hidden">
                      {/* Scanning Animation Line */}
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400/50 blur-[2px] z-20 animate-[scan_2s_ease-in-out_infinite]" style={{ boxShadow: '0 0 15px 2px rgba(52, 211, 153, 0.5)' }}></div>
                      <img src={qrBase64} alt="WhatsApp QR Code" className="w-full h-full object-contain relative z-10" />
                    </div>
                  </div>
                </div>
              ) : (
                /* Disconnected State */
                <div className="p-12 lg:p-20 text-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-200 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner border border-white">
                    <MessageCircle className="text-slate-400 w-12 h-12" />
                  </div>
                  <h2 className="text-3xl font-extrabold text-slate-800 mb-4">Siap Mengotomatisasi Chat Anda?</h2>
                  <p className="text-slate-500 mb-10 max-w-lg mx-auto text-lg leading-relaxed">
                    Ubah nomor WhatsApp biasa Anda menjadi mesin CS cerdas 24/7. Hubungkan sekarang hanya dalam hitungan detik.
                  </p>
                  
                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="group relative inline-flex items-center gap-3 px-10 py-5 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                    {loading ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-lg">Membuat Sesi Aman...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-6 h-6 text-emerald-400" />
                        <span className="text-lg">Hubungkan WhatsApp Sekarang</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Info Side Panel */}
          <div className="flex flex-col gap-6">
            {status !== 'open' && (
              <div className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-[2rem] p-8 text-white border border-slate-700/50 relative overflow-hidden shadow-2xl">
                {/* Decorative elements */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none" />
                
                <h3 className="font-bold text-xl mb-8 relative z-10 flex items-center gap-2">
                  <Sparkles className="text-emerald-400" size={20} />
                  Nilai Tambah PulseAI
                </h3>
                
                <div className="space-y-8 relative z-10">
                  <div className="flex gap-5 group">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 transition-all duration-300">
                      <Zap className="text-emerald-400 w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-base mb-1.5 text-slate-100">Respon Kilat 24/7</h4>
                      <p className="text-slate-400 text-sm leading-relaxed">Balas pelanggan dalam hitungan detik tanpa henti, pagi maupun malam.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-5 group">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 transition-all duration-300">
                      <ShieldCheck className="text-emerald-400 w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-base mb-1.5 text-slate-100">Koneksi Aman</h4>
                      <p className="text-slate-400 text-sm leading-relaxed">Enkripsi langsung dari perangkat ke server memastikan keamanan privasi.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-5 group">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 transition-all duration-300">
                      <MessageCircle className="text-emerald-400 w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-base mb-1.5 text-slate-100">Interaksi Humanis</h4>
                      <p className="text-slate-400 text-sm leading-relaxed">AI canggih memahami bahasa slang dan menjawab selayaknya manusia sungguhan.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Disclaimer & Anti-Block Tips */}
            <div className="bg-red-50/80 backdrop-blur-md rounded-[2rem] p-7 border border-red-200 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <AlertTriangle size={100} className="text-red-900" />
              </div>
              <h3 className="font-bold text-red-900 text-sm mb-3 flex items-center gap-2 relative z-10">
                <div className="p-1.5 bg-red-100 rounded-lg text-red-600">
                  <AlertTriangle size={16} />
                </div>
                Informasi Penting
              </h3>
              <p className="text-sm text-red-800/90 leading-relaxed mb-6 text-justify relative z-10">
                Koneksi ini menggunakan <i>Unofficial API</i> (Web WhatsApp) dan <strong>bukan</strong> mitra resmi Meta. Risiko pemblokiran nomor sepenuhnya menjadi tanggung jawab pengguna.
              </p>
              
              <button
                onClick={() => setShowTipsModal(true)}
                className="w-full py-3.5 bg-white border border-red-100 hover:border-red-300 text-red-700 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md relative z-10"
              >
                <Info size={18} />
                Lihat Panduan Anti-Blokir
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tips Modal */}
      {showTipsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] max-w-md w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-blue-500"></div>
            
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" size={24} />
                Panduan Anti-Blokir
              </h3>
              <button 
                onClick={() => setShowTipsModal(false)}
                className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">1</div>
                  Gunakan Nomor Khusus
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed pl-8">Selalu gunakan nomor sekunder/khusus untuk bot. <strong>Sangat berisiko jika menggunakan nomor pribadi/utama.</strong></p>
              </div>
              
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">2</div>
                  "Warm-Up" Nomor Baru
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed pl-8">Jika menggunakan nomor perdana baru, chat secara manual dengan teman atau masuk ke grup WhatsApp selama 3-5 hari sebelum disambungkan ke sistem AI.</p>
              </div>
              
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs">3</div>
                  Dilarang Keras Melakukan Spam
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed pl-8">Jangan pernah mengirim broadcast ke orang yang tidak menyimpan nomor Anda. Laporan <strong>Report/Block</strong> dari penerima pesan adalah penyebab utama Meta memblokir nomor secara permanen.</p>
              </div>
            </div>
            
            <button
              onClick={() => setShowTipsModal(false)}
              className="mt-8 w-full py-4 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
            >
              Saya Mengerti Panduan Ini
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppIntegrationPage;
