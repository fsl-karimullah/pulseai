import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Check, Loader2, Sparkles, Zap, Building2, Info, MessageCircle } from 'lucide-react';
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

  useEffect(() => {
    // 1. Check for Midtrans redirect parameters
    const orderId = searchParams.get('order_id');
    const statusCode = searchParams.get('status_code');

    if (orderId && (statusCode === '200' || statusCode === '201')) {
      const verifyPayment = async () => {
        try {
          const verifyRes = await fetch(`http://localhost:3001/api/payments/verify/${orderId}`);
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
    // Dynamically load the Midtrans Snap script
    const script = document.createElement('script');
    script.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
    script.setAttribute('data-client-key', import.meta.env.VITE_MIDTRANS_CLIENT_KEY || 'SB-Mid-client-J8N_M22E');
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [searchParams, setSearchParams]);

  const handleCheckout = async (plan: string, amount: number) => {
    try {
      setLoadingPlan(plan);
      const response = await fetch('http://localhost:3001/api/payments/create-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          plan,
          amount,
          userEmail: user?.email,
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 items-stretch">
        {/* Starter Plan */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col transition-all hover:border-emerald-200">
          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-6">
            <Zap className="text-slate-400" size={24} />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Paket Starter</h3>
          <p className="text-sm text-slate-500 mt-2">Durasi 1 Bulan</p>
          <div className="mt-6 flex flex-col">
            <span className="text-4xl font-extrabold text-slate-900">Rp 69.000</span>
            <span className="text-emerald-600 text-xs font-bold mt-1">Rp 69.000/bulan</span>
          </div>
          <ul className="mt-8 space-y-4 flex-1">
            <FeatureWithTooltip text="Unlimited Pesan / bulan" />
            <FeatureWithTooltip text="Free PDF Documents Upload" />
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
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-slate-900">Rp 149.000</span>
            </div>
            <span className="text-emerald-600 text-xs font-bold mt-1">Hanya ~Rp 49.700/bulan</span>
          </div>
          <ul className="mt-8 space-y-4 flex-1">
            <FeatureWithTooltip text="Unlimited Pesan / bulan" />
            <FeatureWithTooltip text="Free PDF Documents Upload" />
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
            <span className="text-4xl font-extrabold text-slate-900">Rp 249.000</span>
            <span className="text-emerald-600 text-xs font-bold mt-1">Hanya ~Rp 20.750/bulan</span>
          </div>
          <ul className="mt-8 space-y-4 flex-1">
            <FeatureWithTooltip text="Unlimited Pesan / bulan" />
            <FeatureWithTooltip text="Free PDF Documents Upload" />
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
