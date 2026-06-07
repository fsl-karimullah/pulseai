import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Check, Loader2, Sparkles, Zap, Building2, Info, Tag, X, CheckCircle2 } from 'lucide-react';
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

const PricingPage: React.FC = () => {
  const { user, session } = useAuth();
  const { subscription } = useSubscription();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Referral / Kupon state ─────────────────────────────────────────────
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponData, setCouponData] = useState<{
    valid: true;
    partner_id: string;
    partner_name: string;
    discount_rate: number; // e.g. 0.10
  } | null>(null);

  useEffect(() => {
    // 1. Check for Midtrans redirect parameters
    const orderId = searchParams.get('order_id');
    const statusCode = searchParams.get('status_code');

    if (orderId && (statusCode === '200' || statusCode === '201')) {
      const verifyPayment = async () => {
        try {
          const verifyRes = await fetch(`/api/payments/verify/${orderId}`);
          const verifyData = await verifyRes.json();
          
          if (verifyData.success) {
            // Success! Clear params and refresh
            setSearchParams({});
            window.location.reload();
          }
        } catch (err) {
          console.error('Auto-verify failed:', err);
        }
      };
      verifyPayment();
    }
    // Dynamically load the Midtrans Snap script based on environment
    const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY || 'SB-Mid-client-J8N_M22E';
    const isSandbox = clientKey.startsWith('SB-');
    
    const script = document.createElement('script');
    script.src = isSandbox 
      ? 'https://app.sandbox.midtrans.com/snap/snap.js'
      : 'https://app.midtrans.com/snap/snap.js';
    script.setAttribute('data-client-key', clientKey);
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [searchParams, setSearchParams]);

  // ── Validate coupon via API ────────────────────────────────────────────
  const validateCoupon = async () => {
    const trimmed = couponCode.trim();
    if (!trimmed) return;

    setCouponLoading(true);
    setCouponError(null);
    setCouponData(null);

    try {
      const res = await fetch(`/api/referral/validate?code=${encodeURIComponent(trimmed)}`);
      const json = await res.json();

      if (json.valid) {
        setCouponData(json);
      } else {
        setCouponError(json.message || 'Kode tidak valid.');
      }
    } catch {
      setCouponError('Gagal memvalidasi kode. Periksa koneksi Anda.');
    } finally {
      setCouponLoading(false);
    }
  };

  const clearCoupon = () => {
    setCouponCode('');
    setCouponData(null);
    setCouponError(null);
  };

  /** Returns the final amount after applying any active coupon discount. */
  const getFinalAmount = (basePrice: number): number => {
    if (!couponData) return basePrice;
    return Math.round(basePrice * (1 - couponData.discount_rate));
  };

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
          onSuccess: async function (result: any) {
            console.log('Payment success:', result);
            const verifyRes = await fetch(`/api/payments/verify/${result.order_id}`);
            const verifyData = await verifyRes.json();
            
            if (verifyData.success) {
              alert('Pembayaran berhasil! Akun Anda telah ditingkatkan.');
              window.location.reload();
            } else {
              alert('Pembayaran diterima tetapi verifikasi masih tertunda. Silakan muat ulang dalam beberapa saat.');
            }
          },
          onPending: function (_result: any) {
            alert('Pembayaran tertunda. Silakan selesaikan transaksi Anda.');
          },
          onError: function (_result: any) {
            alert('Pembayaran gagal. Silakan coba lagi.');
          },
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

  const currentPlanType = subscription?.plan_type || 'free';
  
  const isCurrentPlan = (plan: string) => {
    return currentPlanType === plan;
  };

  const getPlanLabel = (type: string) => {
    if (type === 'starter') return 'Paket Starter (1 Bulan)';
    if (type === 'pro') return 'Paket Pro (3 Bulan)';
    if (type === 'full_scale') return 'Paket Full Scale (12 Bulan)';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 font-sans pb-12">
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
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl tracking-tight">Investasi Cerdas Untuk Bisnis Anda</h1>
        <p className="mt-4 text-lg text-slate-500">
          Pilih paket yang sesuai dengan volume percakapan dan kebutuhan durasi bisnis Anda.
        </p>
      </div>

      {/* ── Coupon / Kode Referral Input ──────────────────────────────── */}
      <div className="max-w-md mx-auto">
        {couponData ? (
          /* ✅ Coupon applied — success pill */
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
            <button
              onClick={clearCoupon}
              className="p-1 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 transition-colors"
              title="Hapus kode"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          /* Input field */
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    setCouponError(null);
                  }}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6 items-stretch">
        {/* Starter Plan */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-emerald-200">
          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-6">
            <Zap className="text-slate-400" size={24} />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Paket Starter</h3>
          <p className="text-sm text-slate-500 mt-2">Durasi 1 Bulan</p>
          <div className="mt-6 flex flex-col">
            {couponData ? (
              <>
                <span className="text-sm text-slate-400 line-through">Rp 69.000</span>
                <span className="text-4xl font-extrabold text-emerald-600">
                  Rp {getFinalAmount(69000).toLocaleString('id-ID')}
                </span>
                <span className="text-emerald-600 text-xs font-bold mt-1">
                  Hemat {Math.round(couponData.discount_rate * 100)}% dengan kode kupon
                </span>
              </>
            ) : (
              <>
                <span className="text-4xl font-extrabold text-slate-900">Rp 69.000</span>
                <span className="text-emerald-600 text-xs font-bold mt-1">Rp 69.000/bulan</span>
              </>
            )}
          </div>
          <ul className="mt-8 space-y-4 flex-1">
            <FeatureWithTooltip text="Unlimited Pesan / bulan" />
            <FeatureWithTooltip text="3 Dokumen PDF Upload" />
            <FeatureWithTooltip text="Branding Kustom (Tanpa Logo)" />
            <FeatureWithTooltip text="Integrasi Widget Web" />
            <FeatureWithTooltip text="Support Teknis 24/7 Setiap Hari" />
          </ul>
          <button 
            onClick={() => handleCheckout('starter', 69000)}
            disabled={loadingPlan === 'starter' || isCurrentPlan('starter')}
            className={`mt-8 w-full py-3 px-4 rounded-xl font-medium transition-all ${
              isCurrentPlan('starter') 
              ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
              : 'bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 hover:text-emerald-600'
            }`}
          >
            {loadingPlan === 'starter' ? <Loader2 className="animate-spin mx-auto" size={20} /> : (isCurrentPlan('starter') ? 'Paket Saat Ini' : 'Pilih Paket Starter')}
          </button>
        </div>

        {/* Pro Plan (Most Popular) */}
        <div className="bg-white rounded-3xl p-8 border-2 border-emerald-600 shadow-xl shadow-emerald-500/10 relative flex flex-col transform md:-translate-y-4 transition-all">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest py-1.5 px-4 rounded-full shadow-lg">
            BEST VALUE
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-6 border border-emerald-100">
            <Sparkles className="text-emerald-600" size={24} />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Paket Pro</h3>
          <p className="text-sm text-slate-500 mt-2">Durasi 3 Bulan</p>
          <div className="mt-6 flex flex-col">
            {couponData ? (
              <>
                <span className="text-sm text-slate-400 line-through">Rp 149.000</span>
                <span className="text-4xl font-extrabold text-emerald-600">
                  Rp {getFinalAmount(149000).toLocaleString('id-ID')}
                </span>
                <span className="text-emerald-600 text-xs font-bold mt-1">
                  Hemat {Math.round(couponData.discount_rate * 100)}% dengan kode kupon
                </span>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-900">Rp 149.000</span>
                </div>
                <span className="text-emerald-600 text-xs font-bold mt-1">Hanya ~Rp 49.700/bulan</span>
              </>
            )}
          </div>
          <ul className="mt-8 space-y-4 flex-1">
            <FeatureWithTooltip text="Unlimited Pesan / bulan" />
            <FeatureWithTooltip text="3 Dokumen PDF Upload" />
            <FeatureWithTooltip text="Branding Kustom (Tanpa Logo)" />
            <FeatureWithTooltip text="Integrasi Widget Web" />
            <FeatureWithTooltip text="Support Teknis 24/7 Setiap Hari" />
          </ul>
          <button 
            onClick={() => handleCheckout('pro', 149000)}
            disabled={loadingPlan === 'pro' || isCurrentPlan('pro')}
            className={`mt-8 w-full py-3 px-4 rounded-xl font-bold shadow-lg transition-all flex justify-center items-center gap-2 ${
              isCurrentPlan('pro')
              ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/20'
            }`}
          >
            {loadingPlan === 'pro' ? <Loader2 className="animate-spin" size={20} /> : (isCurrentPlan('pro') ? 'Paket Saat Ini' : 'Ambil Penawaran Terbaik')}
          </button>
        </div>

        {/* Full Scale Plan */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-emerald-200">
          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-6">
            <Building2 className="text-slate-400" size={24} />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Paket Full Scale</h3>
          <p className="text-sm text-slate-500 mt-2">Durasi 12 Bulan</p>
          <div className="mt-6 flex flex-col">
            {couponData ? (
              <>
                <span className="text-sm text-slate-400 line-through">Rp 249.000</span>
                <span className="text-4xl font-extrabold text-emerald-600">
                  Rp {getFinalAmount(249000).toLocaleString('id-ID')}
                </span>
                <span className="text-emerald-600 text-xs font-bold mt-1">
                  Hemat {Math.round(couponData.discount_rate * 100)}% dengan kode kupon
                </span>
              </>
            ) : (
              <>
                <span className="text-4xl font-extrabold text-slate-900">Rp 249.000</span>
                <span className="text-emerald-600 text-xs font-bold mt-1">Hanya ~Rp 20.750/bulan</span>
              </>
            )}
          </div>
          <ul className="mt-8 space-y-4 flex-1">
            <FeatureWithTooltip text="Unlimited Pesan / bulan" />
            <FeatureWithTooltip text="3 Dokumen PDF Upload" />
            <FeatureWithTooltip text="Branding Kustom (Tanpa Logo)" />
            <FeatureWithTooltip text="Integrasi Widget Web" />
            <FeatureWithTooltip text="Support Teknis 24/7 Setiap Hari" />
          </ul>
          <button 
            onClick={() => handleCheckout('full_scale', 249000)}
            disabled={loadingPlan === 'full_scale' || isCurrentPlan('full_scale')}
            className={`mt-8 w-full py-3 px-4 rounded-xl font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center justify-center gap-2 ${
              isCurrentPlan('full_scale')
              ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
              : ''
            }`}
          >
            {loadingPlan === 'full_scale' ? <Loader2 className="animate-spin" size={20} /> : (isCurrentPlan('full_scale') ? 'Paket Saat Ini' : 'Go Full Scale')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
