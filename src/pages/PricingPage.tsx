import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Check, Loader2, Sparkles, Zap, Building2, Info, Tag, X, CheckCircle2,
  Coins, Plus, Minus, ShoppingCart, RefreshCw,
  Bot, ClipboardList, Wallet, ShieldCheck
} from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useSearchParams } from 'react-router-dom';

declare global {
  interface Window {
    snap: any;
  }
}

const FeatureWithTooltip: React.FC<{ text: string; tooltip?: string }> = ({ text, tooltip }) => (
  <li className="flex items-start gap-2.5 text-sm text-slate-700 relative group leading-relaxed">
    <Check className="text-emerald-500 flex-shrink-0 mt-0.5" size={17} />
    <span className="flex-1">{text}</span>
    {tooltip && (
      <div className="relative ml-1 mt-0.5">
        <Info size={14} className="text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-slate-900 text-white text-[11px] leading-tight rounded-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-xl">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
        </div>
      </div>
    )}
  </li>
);

// ─── Credit quick-pick options ───────────────────────────────────────────────
const QUICK_CREDITS = [50, 100, 250, 500, 1000, 5000];
const CREDIT_RATE = 100;      // 100 kredit
const CREDIT_PRICE = 10000;  // = Rp 10.000

const creditToRupiah = (credits: number) =>
  Math.ceil(credits / CREDIT_RATE) * CREDIT_PRICE;

type TabType = 'chatbot' | 'career' | 'finance' | 'topup';

const PricingPage: React.FC = () => {
  const { user, session } = useAuth();
  const { subscription, refresh } = useSubscription();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Tab state: Chatbot, Career, Finance, Top-Up Kredit ───────────────────
  const [activeTab, setActiveTab] = useState<TabType>('chatbot');

  // ── Referral / Kupon state ─────────────────────────────────────────────
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponData, setCouponData] = useState<{
    valid: true;
    partner_id: string;
    partner_name: string;
    discount_rate: number;
  } | null>(null);

  // ── Top-up kredit state ────────────────────────────────────────────────
  const [topupCredits, setTopupCredits] = useState(100);
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupInput, setTopupInput] = useState('100');

  useEffect(() => {
    const orderId = searchParams.get('order_id');
    const statusCode = searchParams.get('status_code');

    if (orderId && (statusCode === '200' || statusCode === '201')) {
      const verify = async () => {
        try {
          const isTopup = orderId.startsWith('TOPUP-');
          const endpoint = isTopup
            ? `/api/payments/verify-topup/${orderId}`
            : `/api/payments/verify/${orderId}`;
          const res = await fetch(endpoint);
          const data = await res.json();
          if (data.success) {
            setSearchParams({});
            refresh?.();
            window.location.reload();
          }
        } catch (err) {
          console.error('Auto-verify failed:', err);
        }
      };
      verify();
    }

    // Load Midtrans Snap script
    const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY || 'SB-Mid-client-J8N_M22E';
    const isSandbox = clientKey.startsWith('SB-');
    const script = document.createElement('script');
    script.src = isSandbox
      ? 'https://app.sandbox.midtrans.com/snap/snap.js'
      : 'https://app.midtrans.com/snap/snap.js';
    script.setAttribute('data-client-key', clientKey);
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, [searchParams, setSearchParams]);

  // ── Coupon helpers ─────────────────────────────────────────────────────
  const validateCoupon = async () => {
    const trimmed = couponCode.trim();
    if (!trimmed) return;
    setCouponLoading(true);
    setCouponError(null);
    setCouponData(null);
    try {
      const res = await fetch(`/api/referral/validate?code=${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      if (json.valid) setCouponData(json);
      else setCouponError(json.message || 'Kode tidak valid.');
    } catch {
      setCouponError('Gagal memvalidasi kode. Periksa koneksi Anda.');
    } finally {
      setCouponLoading(false);
    }
  };

  const clearCoupon = () => { setCouponCode(''); setCouponData(null); setCouponError(null); };

  const getFinalAmount = (basePrice: number): number => {
    if (!couponData) return basePrice;
    return Math.round(basePrice * (1 - couponData.discount_rate));
  };

  // ── Subscription checkout ────────────────────────────────────────────────────
  const handleCheckout = async (plan: string, baseAmount: number) => {
    const finalAmount = getFinalAmount(baseAmount);
    try {
      setLoadingPlan(plan);
      const response = await fetch('/api/payments/create-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          plan,
          amount: finalAmount,
          userEmail: user?.email,
          referral_code: couponData ? couponCode.trim().toUpperCase() : undefined,
        }),
      });
      const data = await response.json();
      if (data.success && data.token) {
        window.snap.pay(data.token, {
          onSuccess: async (result: any) => {
            const verifyRes = await fetch(`/api/payments/verify/${result.order_id}`);
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              alert('Pembayaran berhasil! Akun Anda telah ditingkatkan.');
              window.location.reload();
            } else {
              alert('Pembayaran diterima tetapi verifikasi masih tertunda. Silakan muat ulang dalam beberapa saat.');
            }
          },
          onPending: () => alert('Pembayaran tertunda. Silakan selesaikan transaksi Anda.'),
          onError: () => alert('Pembayaran gagal. Silakan coba lagi.'),
        });
      } else {
        alert(data.message || 'Gagal menginisialisasi gerbang pembayaran.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Terjadi kesalahan yang tidak terduga.');
    } finally {
      setLoadingPlan(null);
    }
  };

  // ── Top-up kredit checkout ─────────────────────────────────────────────
  const handleTopupCheckout = async () => {
    if (topupCredits < 10) {
      alert('Minimal pembelian adalah 10 kredit.');
      return;
    }
    try {
      setTopupLoading(true);
      const response = await fetch('/api/payments/create-topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ credits: topupCredits, userEmail: user?.email }),
      });
      const data = await response.json();
      if (data.success && data.token) {
        window.snap.pay(data.token, {
          onSuccess: async (result: any) => {
            const verifyRes = await fetch(`/api/payments/verify-topup/${result.order_id}`);
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              alert(`Berhasil! ${topupCredits.toLocaleString('id-ID')} kredit telah ditambahkan.`);
              refresh?.();
              window.location.reload();
            }
          },
          onPending: () => alert('Pembayaran tertunda. Silakan selesaikan transaksi Anda.'),
          onError: () => alert('Pembayaran gagal. Silakan coba lagi.'),
        });
      } else {
        alert(data.message || 'Gagal menginisialisasi pembayaran.');
      }
    } catch (error) {
      console.error('Top-up error:', error);
      alert('Terjadi kesalahan yang tidak terduga.');
    } finally {
      setTopupLoading(false);
    }
  };

  const handleTopupInputChange = (val: string) => {
    setTopupInput(val);
    const num = parseInt(val.replace(/\D/g, ''), 10);
    if (!isNaN(num) && num >= 0) setTopupCredits(num);
  };

  const adjustTopup = (delta: number) => {
    const next = Math.max(10, topupCredits + delta);
    setTopupCredits(next);
    setTopupInput(String(next));
  };

  const currentPlanType = subscription?.plan_type || 'free';
  const currentCredits = subscription?.credits ?? 0;

  const isCurrentPlan = (plan: string) => currentPlanType === plan;

  const getPlanLabel = (type: string) => {
    if (type === 'starter') return 'Paket Starter (1 Bulan)';
    if (type === 'pro') return 'Paket Pro (3 Bulan)';
    if (type === 'full_scale') return 'Paket Full Scale (12 Bulan)';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const topupAmount = creditToRupiah(topupCredits);

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans pb-16 px-2 sm:px-4">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="text-center max-w-3xl mx-auto mt-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Paket Saat Ini: <span className="font-bold">{getPlanLabel(currentPlanType)}</span>
          {subscription?.expires_at && (
            <span className="text-[10px] text-slate-500 ml-2 border-l border-slate-200 pl-2">
              {(() => {
                const days = Math.ceil((new Date(subscription.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                if (days < 0) return 'Kadaluarsa';
                if (days === 0) return 'Berakhir hari ini';
                return `Berakhir dalam ${days} hari`;
              })()}
            </span>
          )}
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Investasi Cerdas Untuk Bisnis Anda
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-500 max-w-xl mx-auto">
          Pilih modul sesuai fokus bisnis Anda atau top-up kredit kapan saja.
        </p>

        {/* Saldo Kredit Saat Ini */}
        <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 shadow-sm">
          <Coins size={17} className="text-amber-500" />
          <span className="text-xs sm:text-sm font-semibold text-slate-700">Saldo Kredit:</span>
          <span className="text-lg sm:text-xl font-extrabold text-amber-600">
            {currentCredits.toLocaleString('id-ID')}
          </span>
          <span className="text-xs text-slate-500">kredit</span>
        </div>
      </div>

      {/* ── Tab Switcher (Responsive, Horizontal Scroll on Mobile) ─────── */}
      <div className="flex justify-center pt-2">
        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar flex sm:inline-flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 border border-slate-200 shadow-inner">
          {[
            {
              id: 'chatbot' as TabType,
              label: 'Pulse Chat',
              icon: Bot,
              activeClass: 'bg-white text-emerald-700 shadow-sm border border-emerald-100',
            },
            {
              id: 'career' as TabType,
              label: 'Pulse Career',
              icon: ClipboardList,
              activeClass: 'bg-white text-violet-700 shadow-sm border border-violet-100',
            },
            {
              id: 'finance' as TabType,
              label: 'Pulse Finance',
              icon: Wallet,
              activeClass: 'bg-white text-amber-700 shadow-sm border border-amber-100',
            },
            {
              id: 'topup' as TabType,
              label: 'Top-Up Kredit',
              icon: Coins,
              activeClass: 'bg-white text-orange-600 shadow-sm border border-orange-100',
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 flex-1 sm:flex-initial ${
                  isActive
                    ? tab.activeClass
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Coupon Voucher (Tampil untuk semua tab paket berlangganan) ── */}
      {activeTab !== 'topup' && (
        <div className="max-w-md mx-auto pt-1">
          {couponData ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">
                    Kode <span className="font-black">{couponCode.toUpperCase()}</span> diterapkan!
                  </p>
                  <p className="text-xs text-emerald-600">
                    Diskon {Math.round(couponData.discount_rate * 100)}% dari {couponData.partner_name}
                  </p>
                </div>
              </div>
              <button onClick={clearCoupon} className="p-1 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 transition-colors" title="Hapus kode">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && validateCoupon()}
                    placeholder="Punya kode voucher? Masukkan di sini"
                    className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                  />
                </div>
                <button
                  onClick={validateCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  className="px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shrink-0"
                >
                  {couponLoading ? <Loader2 size={15} className="animate-spin" /> : 'Pakai'}
                </button>
              </div>
              {couponError && (
                <p className="text-xs text-red-500 flex items-center gap-1 pl-1">
                  <X size={12} /> {couponError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 1 — PULSE CHAT (AI CHATBOT)
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'chatbot' && (
        <div className="space-y-6">
          {/* Module Banner */}
          <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-center max-w-3xl mx-auto shadow-sm">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1 flex items-center justify-center gap-2">
              <span>🤖</span> Pulse Chat — AI Chatbot & Customer Service 24/7
            </h3>
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed max-w-2xl mx-auto">
              Ubah katalog produk, dokumen SOP, dan FAQ bisnis Anda menjadi asisten AI pintar yang melayani pelanggan tanpa henti di WhatsApp dan Website.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Starter */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-emerald-200 hover:shadow-md">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-5 border border-slate-100">
                <Zap className="text-slate-500" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Paket Starter</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 1 Bulan</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <Zap size={11} className="text-emerald-600" />
                  <span className="text-[11px] font-bold text-emerald-700">Unlimited Chat</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">Baileys QR Only</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">10 Scan CV/bln</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                <span className="text-sm text-slate-400 line-through">Rp 149.000</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  Rp {getFinalAmount(79000).toLocaleString('id-ID')}
                </span>
                <span className="text-emerald-600 text-xs font-bold mt-1">
                  {couponData ? `Hemat ${Math.round(couponData.discount_rate * 100)}% dengan kupon` : 'Hemat 47% — promo terbatas'}
                </span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                <FeatureWithTooltip text="♾️ Unlimited AI Chatbot selama 1 bulan" />
                <FeatureWithTooltip text="Baileys WhatsApp (Koneksi via Scan QR)" tooltip="Tautkan nomor WhatsApp bisnis lewat scan QR peranti tertaut." />
                <FeatureWithTooltip text="Integrasi Widget Web (1 baris kode)" />
                <FeatureWithTooltip text="Basis Pengetahuan Dokumen (RAG PDF)" />
                <FeatureWithTooltip text="10 Kuota Scan CV Pelamar / bulan" />
                <FeatureWithTooltip text="Pencatatan Keuangan Pulse Finance" />
                <FeatureWithTooltip text="Support Teknis 24/7" />
              </ul>

              <button
                onClick={() => handleCheckout('starter', 79000)}
                disabled={loadingPlan === 'starter' || isCurrentPlan('starter')}
                className={`mt-6 w-full py-3 px-4 rounded-xl font-medium transition-all ${
                  isCurrentPlan('starter')
                  ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 hover:text-emerald-600'
                }`}
              >
                {loadingPlan === 'starter'
                  ? <Loader2 className="animate-spin mx-auto" size={20} />
                  : isCurrentPlan('starter') ? 'Paket Saat Ini' : 'Pilih Starter'}
              </button>
            </div>

            {/* Pro (Best Value) */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-emerald-600 shadow-xl shadow-emerald-500/10 relative flex flex-col transform md:-translate-y-3 transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest py-1 px-4 rounded-full shadow-md whitespace-nowrap">
                BEST VALUE
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-5 border border-emerald-100">
                <Sparkles className="text-emerald-600" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Paket Pro</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 3 Bulan</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <Zap size={11} className="text-emerald-600" />
                  <span className="text-[11px] font-bold text-emerald-700">Unlimited Chat</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                  <Sparkles size={11} className="text-blue-600" />
                  <span className="text-[11px] font-bold text-blue-700">Meta API Support</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">20 Scan CV/bln</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                <span className="text-sm text-slate-400 line-through">Rp 599.000</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600">
                  Rp {getFinalAmount(199000).toLocaleString('id-ID')}
                </span>
                <span className="text-emerald-600 text-xs font-bold mt-1">
                  {couponData ? `Hemat ${Math.round(couponData.discount_rate * 100)}% dengan kupon` : 'Hanya ~Rp 66.300/bulan — hemat 67%'}
                </span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                <FeatureWithTooltip text="♾️ Unlimited AI Chatbot selama 3 bulan" />
                <FeatureWithTooltip text="Meta Official Cloud API + Baileys QR" tooltip="Dukungan Meta Official Cloud API (Centang hijau, 1.000 percakapan service gratis/bulan dari Meta)." />
                <FeatureWithTooltip text="Integrasi Widget Web Tanpa Batas" />
                <FeatureWithTooltip text="RAG Knowledge Base Dokumen Tanpa Batas" />
                <FeatureWithTooltip text="20 Kuota Scan CV Pelamar / bulan" />
                <FeatureWithTooltip text="Pencatatan Keuangan Pulse Finance Lengkap" />
                <FeatureWithTooltip text="Support Teknis Prioritas 24/7" />
              </ul>

              <button
                onClick={() => handleCheckout('pro', 199000)}
                disabled={loadingPlan === 'pro' || isCurrentPlan('pro')}
                className={`mt-6 w-full py-3 px-4 rounded-xl font-bold shadow-lg transition-all flex justify-center items-center gap-2 ${
                  isCurrentPlan('pro')
                  ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/20'
                }`}
              >
                {loadingPlan === 'pro'
                  ? <Loader2 className="animate-spin" size={20} />
                  : isCurrentPlan('pro') ? 'Paket Saat Ini' : 'Ambil Penawaran Pro'}
              </button>
            </div>

            {/* Full Scale */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-emerald-200 hover:shadow-md">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-5 border border-slate-100">
                <Building2 className="text-slate-500" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Paket Full Scale</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 12 Bulan</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 border border-violet-200">
                  <Zap size={11} className="text-violet-600" />
                  <span className="text-[11px] font-bold text-violet-700">Unlimited Chat</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                  <Sparkles size={11} className="text-blue-600" />
                  <span className="text-[11px] font-bold text-blue-700">Meta API Support</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">30 Scan CV/bln</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                <span className="text-sm text-slate-400 line-through">Rp 1.499.000</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  Rp {getFinalAmount(699000).toLocaleString('id-ID')}
                </span>
                <span className="text-emerald-600 text-xs font-bold mt-1">
                  {couponData ? `Hemat ${Math.round(couponData.discount_rate * 100)}% dengan kupon` : 'Hanya ~Rp 58.250/bulan — hemat 53%'}
                </span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                <FeatureWithTooltip text="♾️ Unlimited AI Chatbot selama 12 bulan" />
                <FeatureWithTooltip text="Meta Official Cloud API + Baileys QR" />
                <FeatureWithTooltip text="Branding Kustom (Tanpa Logo PulseAI)" />
                <FeatureWithTooltip text="30 Kuota Scan CV Pelamar / bulan" />
                <FeatureWithTooltip text="Pencatatan Keuangan Pulse Finance 1 Tahun" />
                <FeatureWithTooltip text="🔥 Prioritas Support & Early Access Fitur Baru" />
              </ul>

              <button
                onClick={() => handleCheckout('full_scale', 699000)}
                disabled={loadingPlan === 'full_scale' || isCurrentPlan('full_scale')}
                className={`mt-6 w-full py-3 px-4 rounded-xl font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-emerald-500 hover:text-emerald-600 transition-all ${
                  isCurrentPlan('full_scale') ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''
                }`}
              >
                {loadingPlan === 'full_scale'
                  ? <Loader2 className="animate-spin mx-auto" size={20} />
                  : isCurrentPlan('full_scale') ? 'Paket Saat Ini' : 'Go Full Scale'}
              </button>
            </div>
          </div>

          {/* Meta Pricing Info Banner */}
          <div className="mt-8 p-4 bg-blue-50/70 border border-blue-200 rounded-2xl text-xs text-blue-900 flex items-start gap-3">
            <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Informasi Biaya WhatsApp Official (Meta Cloud API):</span>
              <p className="mt-0.5 text-blue-800 leading-relaxed">
                Biaya langganan PulseAI mencakup akses software & sistem AI. Untuk integrasi Meta Cloud API, <strong>1.000 percakapan Service (Customer Service) pertama setiap bulan diberikan GRATIS oleh Meta</strong>. Jika percakapan melebihi 1.000, tagihan pesan WhatsApp dibayarkan secara mandiri langsung ke Meta melalui Meta Business Manager Anda.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 2 — PULSE CAREER (ATS CV SCANNER)
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'career' && (
        <div className="space-y-6">
          {/* Module Banner */}
          <div className="p-5 rounded-2xl bg-violet-50/80 border border-violet-200 text-center max-w-3xl mx-auto shadow-sm">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1 flex items-center justify-center gap-2">
              <span>👔</span> Pulse Career — AI HR & ATS CV Scanner Otomatis
            </h3>
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed max-w-2xl mx-auto">
              Seleksi ratusan CV pelamar kerja dalam hitungan detik. AI menganalisis kecocokan kualifikasi, skor ATS 0-100, deteksi red flag, dan draft pesan WhatsApp ke kandidat.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Starter ATS */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-violet-200 hover:shadow-md">
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center mb-5 border border-violet-100">
                <ClipboardList className="text-violet-600" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Starter Career</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 1 Bulan</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 border border-violet-200">
                  <span className="text-[11px] font-bold text-violet-700">10 Scan CV/bln</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">Skor ATS 0-100</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">Draft WhatsApp</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                <span className="text-sm text-slate-400 line-through">Rp 149.000</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  Rp {getFinalAmount(79000).toLocaleString('id-ID')}
                </span>
                <span className="text-violet-600 text-xs font-bold mt-1">
                  {couponData ? `Hemat ${Math.round(couponData.discount_rate * 100)}% dengan kupon` : 'Hemat 47% — promo terbatas'}
                </span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                <FeatureWithTooltip text="📄 10 Kuota Scan CV / Bulan" />
                <FeatureWithTooltip text="⚡ AI Scoring ATS 0-100 Otomatis sesuai Posisi" />
                <FeatureWithTooltip text="🔍 Analisis Kelebihan & Kelemahan Kandidat" />
                <FeatureWithTooltip text="🚩 Deteksi Red Flags (Job Hopping, Gap Karier)" />
                <FeatureWithTooltip text="📋 Rekomendasi HR (Lolos, Talent Pool, Tolak)" />
                <FeatureWithTooltip text="💬 Draft Pesan WhatsApp Siap Kirim ke Kandidat" />
                <FeatureWithTooltip text="♾️ Termasuk Akses AI Chatbot CS 1 Bulan" />
                <FeatureWithTooltip text="🪙 Top-Up Kredit tersedia jika butuh scan ekstra" />
              </ul>

              <button
                onClick={() => handleCheckout('starter', 79000)}
                disabled={loadingPlan === 'starter' || isCurrentPlan('starter')}
                className={`mt-6 w-full py-3 px-4 rounded-xl font-medium transition-all ${
                  isCurrentPlan('starter')
                  ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-violet-500 hover:text-violet-600'
                }`}
              >
                {loadingPlan === 'starter'
                  ? <Loader2 className="animate-spin mx-auto" size={20} />
                  : isCurrentPlan('starter') ? 'Paket Saat Ini' : 'Pilih Starter Career'}
              </button>
            </div>

            {/* Pro ATS (Best Value) */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-violet-600 shadow-xl shadow-violet-500/10 relative flex flex-col transform md:-translate-y-3 transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[10px] font-bold uppercase tracking-widest py-1 px-4 rounded-full shadow-md whitespace-nowrap">
                BEST VALUE
              </div>
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center mb-5 border border-violet-100">
                <Sparkles className="text-violet-600" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Pro Career</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 3 Bulan</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 border border-violet-200">
                  <span className="text-[11px] font-bold text-violet-700">20 Scan CV/bln</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                  <span className="text-[11px] font-bold text-blue-700">Bulk CV Scan</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">Analisis Mendalam</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                <span className="text-sm text-slate-400 line-through">Rp 599.000</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-violet-700">
                  Rp {getFinalAmount(199000).toLocaleString('id-ID')}
                </span>
                <span className="text-violet-600 text-xs font-bold mt-1">
                  {couponData ? `Hemat ${Math.round(couponData.discount_rate * 100)}% dengan kupon` : 'Hanya ~Rp 66.300/bulan — hemat 67%'}
                </span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                <FeatureWithTooltip text="📄 20 Kuota Scan CV / Bulan" />
                <FeatureWithTooltip text="📂 Bulk CV Scan (Upload banyak file CV sekaligus)" />
                <FeatureWithTooltip text="⚡ AI Scoring ATS 0-100 & Komparasi Kandidat" />
                <FeatureWithTooltip text="🚩 Deteksi Red Flags & Rekomendasi Pertanyaan Interview" />
                <FeatureWithTooltip text="📋 Rekomendasi Rekrutmen & Draft WhatsApp Kandidat" />
                <FeatureWithTooltip text="♾️ Termasuk Akses AI Chatbot CS 3 Bulan" />
                <FeatureWithTooltip text="💬 Support Prioritas Rekrutmen" />
                <FeatureWithTooltip text="🪙 Top-Up Kredit tersedia jika butuh scan ekstra" />
              </ul>

              <button
                onClick={() => handleCheckout('pro', 199000)}
                disabled={loadingPlan === 'pro' || isCurrentPlan('pro')}
                className={`mt-6 w-full py-3 px-4 rounded-xl font-bold shadow-lg transition-all flex justify-center items-center gap-2 ${
                  isCurrentPlan('pro')
                  ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-violet-600 text-white hover:bg-violet-700 shadow-violet-500/20'
                }`}
              >
                {loadingPlan === 'pro'
                  ? <Loader2 className="animate-spin" size={20} />
                  : isCurrentPlan('pro') ? 'Paket Saat Ini' : 'Ambil Penawaran Pro Career'}
              </button>
            </div>

            {/* Full Scale ATS */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-violet-200 hover:shadow-md">
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center mb-5 border border-violet-100">
                <Building2 className="text-violet-600" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Full Scale Career</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 12 Bulan</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 border border-violet-200">
                  <span className="text-[11px] font-bold text-violet-700">30 Scan CV/bln</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                  <span className="text-[11px] font-bold text-blue-700">Bulk Unlimited</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">Prioritas HR</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                <span className="text-sm text-slate-400 line-through">Rp 1.499.000</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  Rp {getFinalAmount(699000).toLocaleString('id-ID')}
                </span>
                <span className="text-violet-600 text-xs font-bold mt-1">
                  {couponData ? `Hemat ${Math.round(couponData.discount_rate * 100)}% dengan kupon` : 'Hanya ~Rp 58.250/bulan — hemat 53%'}
                </span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                <FeatureWithTooltip text="📄 30 Kuota Scan CV / Bulan selama 1 Tahun" />
                <FeatureWithTooltip text="📂 Bulk CV Scan Tanpa Batas Sesi" />
                <FeatureWithTooltip text="⚡ Prioritas Pemrosesan Gemini AI ATS Scanner" />
                <FeatureWithTooltip text="🔍 Deteksi Red Flags & Profil Lengkap Pelamar" />
                <FeatureWithTooltip text="📋 Manajemen Pipeline Kandidat & Arsip CV" />
                <FeatureWithTooltip text="♾️ Termasuk Akses AI Chatbot CS 12 Bulan" />
                <FeatureWithTooltip text="🔥 Support Teknis Prioritas HR 24/7" />
              </ul>

              <button
                onClick={() => handleCheckout('full_scale', 699000)}
                disabled={loadingPlan === 'full_scale' || isCurrentPlan('full_scale')}
                className={`mt-6 w-full py-3 px-4 rounded-xl font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-violet-500 hover:text-violet-600 transition-all ${
                  isCurrentPlan('full_scale') ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''
                }`}
              >
                {loadingPlan === 'full_scale'
                  ? <Loader2 className="animate-spin mx-auto" size={20} />
                  : isCurrentPlan('full_scale') ? 'Paket Saat Ini' : 'Go Full Scale Career'}
              </button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="mt-8 p-4 bg-violet-50/70 border border-violet-200 rounded-2xl text-xs text-violet-900 flex items-start gap-3">
            <ShieldCheck size={17} className="text-violet-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Keamanan & Kerahasiaan Data Pelamar:</span>
              <p className="mt-0.5 text-violet-800 leading-relaxed">
                Seluruh dokumen CV yang diunggah diproses secara aman dan terenkripsi. PulseAI tidak membagikan data kandidat Anda ke pihak ketiga. Kuota scan CV diperbarui otomatis setiap bulan sesuai masa aktif paket berlangganan Anda.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 3 — PULSE FINANCE (KEUANGAN & PAJAK UMKM)
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          {/* Module Banner */}
          <div className="p-5 rounded-2xl bg-amber-50/80 border border-amber-200 text-center max-w-3xl mx-auto shadow-sm">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1 flex items-center justify-center gap-2">
              <span>💰</span> Pulse Finance — Manajemen Keuangan Bisnis & Pajak UMKM
            </h3>
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed max-w-2xl mx-auto">
              Catat pemasukan & pengeluaran harian, pantau arus kas real-time, dan kalkulasi PPh Final UMKM 0,5% otomatis tanpa perlu keahlian akuntansi atau Excel rumit.
            </p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Starter Finance */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-amber-200 hover:shadow-md">
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-5 border border-amber-100">
                <Wallet className="text-amber-600" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Starter Finance</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 1 Bulan</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-700">Pencatatan Harian</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">Laba Rugi</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">Pajak 0.5%</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                <span className="text-sm text-slate-400 line-through">Rp 149.000</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  Rp {getFinalAmount(79000).toLocaleString('id-ID')}
                </span>
                <span className="text-amber-600 text-xs font-bold mt-1">
                  {couponData ? `Hemat ${Math.round(couponData.discount_rate * 100)}% dengan kupon` : 'Hemat 47% — promo terbatas'}
                </span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                <FeatureWithTooltip text="📝 Pencatatan Pemasukan & Pengeluaran Harian" />
                <FeatureWithTooltip text="📊 Dashboard Laporan Laba Rugi Real-Time" />
                <FeatureWithTooltip text="🧮 Estimasi Pajak PPh Final UMKM (0,5% x Omzet)" />
                <FeatureWithTooltip text="🏷️ AI Kategorisasi Transaksi Otomatis" />
                <FeatureWithTooltip text="📱 Akses Multi-Device (Mobile HP & Laptop)" />
                <FeatureWithTooltip text="♾️ Termasuk Akses AI Chatbot CS 1 Bulan" />
                <FeatureWithTooltip text="💬 Support Teknis 24/7" />
              </ul>

              <button
                onClick={() => handleCheckout('starter', 79000)}
                disabled={loadingPlan === 'starter' || isCurrentPlan('starter')}
                className={`mt-6 w-full py-3 px-4 rounded-xl font-medium transition-all ${
                  isCurrentPlan('starter')
                  ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-amber-500 hover:text-amber-600'
                }`}
              >
                {loadingPlan === 'starter'
                  ? <Loader2 className="animate-spin mx-auto" size={20} />
                  : isCurrentPlan('starter') ? 'Paket Saat Ini' : 'Pilih Starter Finance'}
              </button>
            </div>

            {/* Pro Finance (Best Value) */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-amber-500 shadow-xl shadow-amber-500/10 relative flex flex-col transform md:-translate-y-3 transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold uppercase tracking-widest py-1 px-4 rounded-full shadow-md whitespace-nowrap">
                BEST VALUE
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-5 border border-amber-100">
                <Sparkles className="text-amber-600" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Pro Finance</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 3 Bulan</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-700">Cash Flow Pro</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-50 border border-orange-200">
                  <span className="text-[11px] font-bold text-orange-700">Reminder SPT</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">Export Laporan</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                <span className="text-sm text-slate-400 line-through">Rp 599.000</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-amber-600">
                  Rp {getFinalAmount(199000).toLocaleString('id-ID')}
                </span>
                <span className="text-amber-600 text-xs font-bold mt-1">
                  {couponData ? `Hemat ${Math.round(couponData.discount_rate * 100)}% dengan kupon` : 'Hanya ~Rp 66.300/bulan — hemat 67%'}
                </span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                <FeatureWithTooltip text="📊 Semua fitur Starter Finance selama 3 Bulan" />
                <FeatureWithTooltip text="📈 Analisis Arus Kas (Cash Flow) & Grafik Tren Bulanan" />
                <FeatureWithTooltip text="🧮 Kalkulator Proyeksi Pajak Tahunan & Reminder SPT" />
                <FeatureWithTooltip text="📥 Export Laporan Keuangan (Format PDF / Excel)" />
                <FeatureWithTooltip text="🏷️ Riwayat & Kategori Transaksi Tanpa Batas" />
                <FeatureWithTooltip text="♾️ Termasuk Akses AI Chatbot CS 3 Bulan" />
                <FeatureWithTooltip text="💬 Support Teknis Prioritas" />
              </ul>

              <button
                onClick={() => handleCheckout('pro', 199000)}
                disabled={loadingPlan === 'pro' || isCurrentPlan('pro')}
                className={`mt-6 w-full py-3 px-4 rounded-xl font-bold shadow-lg transition-all flex justify-center items-center gap-2 ${
                  isCurrentPlan('pro')
                  ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-amber-500/20'
                }`}
              >
                {loadingPlan === 'pro'
                  ? <Loader2 className="animate-spin" size={20} />
                  : isCurrentPlan('pro') ? 'Paket Saat Ini' : 'Ambil Penawaran Pro Finance'}
              </button>
            </div>

            {/* Full Scale Finance */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-amber-200 hover:shadow-md">
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-5 border border-amber-100">
                <Building2 className="text-amber-600" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Full Scale Finance</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 12 Bulan</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-700">Laporan Tahunan</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-50 border border-orange-200">
                  <span className="text-[11px] font-bold text-orange-700">Pembukuan Lengkap</span>
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">Prioritas 24/7</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                <span className="text-sm text-slate-400 line-through">Rp 1.499.000</span>
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  Rp {getFinalAmount(699000).toLocaleString('id-ID')}
                </span>
                <span className="text-amber-600 text-xs font-bold mt-1">
                  {couponData ? `Hemat ${Math.round(couponData.discount_rate * 100)}% dengan kupon` : 'Hanya ~Rp 58.250/bulan — hemat 53%'}
                </span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                <FeatureWithTooltip text="📊 Semua fitur Pro Finance selama 1 Tahun Penuh" />
                <FeatureWithTooltip text="📈 Laporan Pembukuan Tahunan Lengkap untuk Pajak SPT" />
                <FeatureWithTooltip text="🧮 Multi-Kategori Transaksi Bisnis Tanpa Batas" />
                <FeatureWithTooltip text="🚀 Early Access Fitur Payment Gateway & Invoice" />
                <FeatureWithTooltip text="♾️ Termasuk Akses AI Chatbot CS 12 Bulan" />
                <FeatureWithTooltip text="🔥 Support Teknis Prioritas 24/7" />
              </ul>

              <button
                onClick={() => handleCheckout('full_scale', 699000)}
                disabled={loadingPlan === 'full_scale' || isCurrentPlan('full_scale')}
                className={`mt-6 w-full py-3 px-4 rounded-xl font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-amber-500 hover:text-amber-600 transition-all ${
                  isCurrentPlan('full_scale') ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''
                }`}
              >
                {loadingPlan === 'full_scale'
                  ? <Loader2 className="animate-spin mx-auto" size={20} />
                  : isCurrentPlan('full_scale') ? 'Paket Saat Ini' : 'Go Full Scale Finance'}
              </button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="mt-8 p-4 bg-amber-50/70 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-3">
            <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Regulasi & Dasar Hukum Pajak UMKM:</span>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                Perhitungan estimasi pajak Pulse Finance mengacu pada regulasi pemerintah <strong>PP No. 23 Tahun 2018</strong> mengenai PPh Final 0,5% dari omzet bruto bagi Wajib Pajak UMKM. Data keuangan dan transaksi Anda tersimpan aman dan terenkripsi.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 4 — TOP-UP KREDIT
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'topup' && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-700 shadow-xl relative overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-orange-500/5 pointer-events-none" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <Coins size={16} className="text-amber-400" />
                  </div>
                  <h2 className="text-lg font-bold text-white">Top-Up Kredit</h2>
                </div>
                <p className="text-sm text-slate-400">
                  Beli kredit sesuai kebutuhan. Tidak ada expired — kredit berlaku selamanya.
                </p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
                <Coins size={14} className="text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">Saldo: {currentCredits.toLocaleString('id-ID')} kredit</span>
              </div>
            </div>

            {/* Pricing info */}
            <div className="flex flex-wrap items-center gap-3 mb-7">
              <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-xs text-slate-400">Rate</p>
                <p className="text-sm font-bold text-white">100 Kredit = Rp 10.000</p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-xs text-slate-400">Minimum</p>
                <p className="text-sm font-bold text-white">10 Kredit</p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-xs text-slate-400">Validity</p>
                <p className="text-sm font-bold text-white">Tidak Ada Expired</p>
              </div>
            </div>

            {/* Quick pick buttons */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pilih Cepat</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_CREDITS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setTopupCredits(c); setTopupInput(String(c)); }}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      topupCredits === c
                      ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/20'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    {c.toLocaleString('id-ID')} Kredit
                  </button>
                ))}
              </div>
            </div>

            {/* Custom amount input */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Jumlah Kredit Kustom</p>
              <div className="flex items-center gap-4 flex-wrap">
                {/* Stepper */}
                <div className="flex items-center gap-0 rounded-xl border border-white/20 overflow-hidden bg-white/5">
                  <button
                    onClick={() => adjustTopup(-10)}
                    className="w-10 h-10 flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="text"
                    value={topupInput}
                    onChange={(e) => handleTopupInputChange(e.target.value)}
                    onBlur={() => {
                      if (topupCredits < 10) { setTopupCredits(10); setTopupInput('10'); }
                    }}
                    className="w-24 sm:w-28 text-center text-white font-bold text-lg bg-transparent border-x border-white/20 outline-none py-2"
                  />
                  <button
                    onClick={() => adjustTopup(10)}
                    className="w-10 h-10 flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <div className="text-slate-400 text-sm hidden sm:block">→</div>

                {/* Price display */}
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400">Total Bayar</span>
                  <span className="text-xl sm:text-2xl font-extrabold text-amber-400">
                    Rp {topupAmount.toLocaleString('id-ID')}
                  </span>
                  <span className="text-xs text-slate-500 mt-0.5">
                    {topupCredits.toLocaleString('id-ID')} kredit × Rp {(CREDIT_PRICE / CREDIT_RATE).toLocaleString('id-ID')}/kredit
                  </span>
                </div>

                {/* Checkout button */}
                <button
                  onClick={handleTopupCheckout}
                  disabled={topupLoading || topupCredits < 10}
                  className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {topupLoading
                    ? <><RefreshCw size={18} className="animate-spin" /> Memproses...</>
                    : <><ShoppingCart size={18} /> Beli {topupCredits.toLocaleString('id-ID')} Kredit</>
                  }
                </button>
              </div>

              {topupCredits < 10 && (
                <p className="text-xs text-red-400 mt-3 flex items-center gap-1">
                  <X size={12} /> Minimal pembelian adalah 10 kredit.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PricingPage;
