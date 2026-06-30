import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Check, Loader2, Sparkles, Zap, Building2, Info, Tag, X, CheckCircle2,
  Coins, Plus, Minus, ShoppingCart, CreditCard, RefreshCw,
} from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useSearchParams } from 'react-router-dom';

declare global {
  interface Window {
    snap: any;
  }
}

const FeatureWithTooltip: React.FC<{ text: string; tooltip?: string }> = ({ text, tooltip }) => (
  <li className="flex items-center gap-3 text-sm text-slate-700 relative group">
    <Check className="text-emerald-500 flex-shrink-0" size={18} />
    <span className="flex-1">{text}</span>
    {tooltip && (
      <div className="relative ml-1">
        <Info size={14} className="text-slate-400 cursor-help hover:text-slate-600 transition-colors" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] leading-tight rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
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

const PricingPage: React.FC = () => {
  const { user, session } = useAuth();
  const { subscription, refresh } = useSubscription();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Tab state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'subscription' | 'topup'>('subscription');

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
          // Check if it's a top-up or subscription
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
    <div className="max-w-6xl mx-auto space-y-6 font-sans pb-16">

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
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl tracking-tight">
          Investasi Cerdas Untuk Bisnis Anda
        </h1>
        <p className="mt-4 text-lg text-slate-500">
          Berlangganan bulanan atau top-up kredit sesuai kebutuhan Anda.
        </p>

        {/* Saldo Kredit Saat Ini */}
        <div className="mt-5 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 shadow-sm">
          <Coins size={18} className="text-amber-500" />
          <span className="text-sm font-semibold text-slate-700">Saldo Kredit:</span>
          <span className="text-xl font-extrabold text-amber-600">
            {currentCredits.toLocaleString('id-ID')}
          </span>
          <span className="text-sm text-slate-500">kredit</span>
        </div>
      </div>

      {/* ── Tab Switcher ────────────────────────────────────────────────── */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200 shadow-sm">
          <button
            onClick={() => setActiveTab('subscription')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === 'subscription'
                ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <CreditCard size={15} />
            Berlangganan
          </button>
          <button
            onClick={() => setActiveTab('topup')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === 'topup'
                ? 'bg-white text-amber-600 shadow-sm border border-amber-100'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Coins size={15} />
            Top-Up Kredit
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB A — Paket Berlangganan
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'subscription' && (
        <div className="space-y-6">

          {/* Coupon — hanya tampil di tab subscription */}
          <div className="max-w-md mx-auto">
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
                      className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                    />
                  </div>
                  <button
                    onClick={validateCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
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

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* ─── Starter ─── */}
            <div className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-emerald-200 hover:shadow-md">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-5">
                <Zap className="text-slate-400" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Paket Starter</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 1 Bulan</p>

              {/* Badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                  <Zap size={11} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700">Unlimited Chat</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-xs font-bold text-slate-600">10 Scan CV/bln</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                {couponData ? (
                  <>
                    <span className="text-sm text-slate-400 line-through">Rp 149.000</span>
                    <span className="text-4xl font-extrabold text-emerald-600">
                      Rp {getFinalAmount(79000).toLocaleString('id-ID')}
                    </span>
                    <span className="text-emerald-600 text-xs font-bold mt-1">
                      Hemat {Math.round(couponData.discount_rate * 100)}% dengan kode kupon
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-slate-400 line-through">Rp 149.000</span>
                    <span className="text-4xl font-extrabold text-slate-900">Rp 79.000</span>
                    <span className="text-emerald-600 text-xs font-bold mt-1">Hemat 47% — promo terbatas</span>
                  </>
                )}
              </div>
              <ul className="mt-7 space-y-3.5 flex-1">
                <FeatureWithTooltip text="♾️ Unlimited AI Chatbot selama 1 bulan" />
                <FeatureWithTooltip text="10 Scan CV ATS per bulan" />
                <FeatureWithTooltip text="Top-up kredit untuk scan ekstra" />
                <FeatureWithTooltip text="Branding Kustom (Tanpa Logo)" />
                <FeatureWithTooltip text="Integrasi Widget Web" />
                <FeatureWithTooltip text="Support Teknis 24/7" />
              </ul>
              <button
                onClick={() => handleCheckout('starter', 79000)}
                disabled={loadingPlan === 'starter' || isCurrentPlan('starter')}
                className={`mt-7 w-full py-3 px-4 rounded-xl font-medium transition-all ${
                  isCurrentPlan('starter')
                  ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 hover:text-emerald-600'
                }`}
              >
                {loadingPlan === 'starter'
                  ? <Loader2 className="animate-spin mx-auto" size={20} />
                  : isCurrentPlan('starter') ? 'Paket Saat Ini' : 'Pilih Paket Starter'}
              </button>
            </div>

            {/* ─── Pro (Best Value) ─── */}
            <div className="bg-white rounded-3xl p-7 border-2 border-emerald-600 shadow-xl shadow-emerald-500/10 relative flex flex-col transform md:-translate-y-4 transition-all">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest py-1.5 px-4 rounded-full shadow-lg">
                BEST VALUE
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-5 border border-emerald-100">
                <Sparkles className="text-emerald-600" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Paket Pro</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 3 Bulan</p>

              {/* Badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                  <Zap size={11} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700">Unlimited Chat</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-xs font-bold text-slate-600">20 Scan CV/bln</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                {couponData ? (
                  <>
                    <span className="text-sm text-slate-400 line-through">Rp 599.000</span>
                    <span className="text-4xl font-extrabold text-emerald-600">
                      Rp {getFinalAmount(199000).toLocaleString('id-ID')}
                    </span>
                    <span className="text-emerald-600 text-xs font-bold mt-1">
                      Hemat {Math.round(couponData.discount_rate * 100)}% dengan kode kupon
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-slate-400 line-through">Rp 599.000</span>
                    <span className="text-4xl font-extrabold text-slate-900">Rp 199.000</span>
                    <span className="text-emerald-600 text-xs font-bold mt-1">Hanya ~Rp 66.300/bulan — hemat 67%</span>
                  </>
                )}
              </div>
              <ul className="mt-7 space-y-3.5 flex-1">
                <FeatureWithTooltip text="♾️ Unlimited AI Chatbot selama 3 bulan" />
                <FeatureWithTooltip text="20 Scan CV ATS per bulan" />
                <FeatureWithTooltip text="Top-up kredit untuk scan ekstra" />
                <FeatureWithTooltip text="Branding Kustom (Tanpa Logo)" />
                <FeatureWithTooltip text="Integrasi Widget Web" />
                <FeatureWithTooltip text="Support Teknis 24/7" />
              </ul>
              <button
                onClick={() => handleCheckout('pro', 199000)}
                disabled={loadingPlan === 'pro' || isCurrentPlan('pro')}
                className={`mt-7 w-full py-3 px-4 rounded-xl font-bold shadow-lg transition-all flex justify-center items-center gap-2 ${
                  isCurrentPlan('pro')
                  ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/20'
                }`}
              >
                {loadingPlan === 'pro'
                  ? <Loader2 className="animate-spin" size={20} />
                  : isCurrentPlan('pro') ? 'Paket Saat Ini' : 'Ambil Penawaran Terbaik'}
              </button>
            </div>

            {/* ─── Full Scale ─── */}
            <div className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-emerald-200 hover:shadow-md">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-5">
                <Building2 className="text-slate-400" size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Paket Full Scale</h3>
              <p className="text-sm text-slate-500 mt-1">Durasi 12 Bulan</p>

              {/* Badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200">
                  <Zap size={11} className="text-violet-600" />
                  <span className="text-xs font-bold text-violet-700">Unlimited Chat</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
                  <span className="text-xs font-bold text-slate-600">30 Scan CV/bln</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col">
                {couponData ? (
                  <>
                    <span className="text-sm text-slate-400 line-through">Rp 1.499.000</span>
                    <span className="text-4xl font-extrabold text-emerald-600">
                      Rp {getFinalAmount(699000).toLocaleString('id-ID')}
                    </span>
                    <span className="text-emerald-600 text-xs font-bold mt-1">
                      Hemat {Math.round(couponData.discount_rate * 100)}% dengan kode kupon
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-slate-400 line-through">Rp 1.499.000</span>
                    <span className="text-4xl font-extrabold text-slate-900">Rp 699.000</span>
                    <span className="text-emerald-600 text-xs font-bold mt-1">Hanya ~Rp 58.250/bulan — hemat 53%</span>
                  </>
                )}
              </div>
              <ul className="mt-7 space-y-3.5 flex-1">
                <FeatureWithTooltip text="♾️ Unlimited AI Chatbot selama 12 bulan" />
                <FeatureWithTooltip text="30 Scan CV ATS per bulan" />
                <FeatureWithTooltip text="Top-up kredit untuk scan ekstra" />
                <FeatureWithTooltip text="Branding Kustom (Tanpa Logo)" />
                <FeatureWithTooltip text="Integrasi Widget Web" />
                <FeatureWithTooltip text="Support Teknis 24/7" />
                <FeatureWithTooltip text="🔥 Prioritas Support & Early Access Fitur Baru" />
              </ul>
              <button
                onClick={() => handleCheckout('full_scale', 699000)}
                disabled={loadingPlan === 'full_scale' || isCurrentPlan('full_scale')}
                className={`mt-7 w-full py-3 px-4 rounded-xl font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center justify-center gap-2 ${
                  isCurrentPlan('full_scale')
                  ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : ''
                }`}
              >
                {loadingPlan === 'full_scale'
                  ? <Loader2 className="animate-spin" size={20} />
                  : isCurrentPlan('full_scale') ? 'Paket Saat Ini' : 'Go Full Scale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB B — Top-Up Kredit
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'topup' && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 border border-slate-700 shadow-xl relative overflow-hidden">
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
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
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
                    className="w-28 text-center text-white font-bold text-lg bg-transparent border-x border-white/20 outline-none py-2"
                  />
                  <button
                    onClick={() => adjustTopup(10)}
                    className="w-10 h-10 flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <div className="text-slate-400 text-sm">→</div>

                {/* Price display */}
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400">Total Bayar</span>
                  <span className="text-2xl font-extrabold text-amber-400">
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
                  className="ml-auto flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
