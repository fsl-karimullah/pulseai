import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Users,
  TrendingUp,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Bot,
  Clock,
  Activity,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';

// ── Simple in-memory cache to avoid re-fetching on tab switch ──────────────
const analyticsCache: { data: any; timestamp: number } = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 60_000; // 60 seconds

const metricsConfig: Record<string, any> = {
  conversations: {
    icon: MessageSquare,
    bg: 'bg-emerald-50',
    iconBg: 'bg-emerald-500',
    textColor: 'text-emerald-600',
  },
  leads: {
    icon: Users,
    bg: 'bg-blue-50',
    iconBg: 'bg-blue-500',
    textColor: 'text-blue-600',
  },
  knowledge: {
    icon: Zap,
    bg: 'bg-violet-50',
    iconBg: 'bg-violet-500',
    textColor: 'text-violet-600',
  },
  resolution: {
    icon: TrendingUp,
    bg: 'bg-amber-50',
    iconBg: 'bg-amber-500',
    textColor: 'text-amber-600',
  },
};

const typeMap: Record<string, any> = {
  bot: { icon: Bot, color: 'text-emerald-500' },
  lead: { icon: Users, color: 'text-blue-500' },
  doc: { icon: Zap, color: 'text-violet-500' },
  activity: { icon: Activity, color: 'text-slate-400' },
};

const weekDays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const DashboardPage: React.FC = () => {
  const { user, session } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { subscription } = useSubscription();

  const userEmail = user?.email || 'User';
  const userName = userEmail.split('@')[0];
  // Capitalize first letter
  const formattedName = userName.charAt(0).toUpperCase() + userName.slice(1);

  useEffect(() => {
    if (!session?.access_token) return;
    
    const now = Date.now();
    // If cache is fresh, use it immediately (no flicker on tab switch)
    if (analyticsCache.data && (now - analyticsCache.timestamp) < CACHE_TTL_MS) {
      setData(analyticsCache.data);
      setLoading(false);
      return;
    }

    // Stale or empty: show loader and fetch fresh data
    setLoading(true);
    fetch('/api/analytics', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          analyticsCache.data = resData;
          analyticsCache.timestamp = Date.now();
          setData(resData);
        }
      })
      .catch((err) => console.error('Failed to fetch analytics', err))
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  const weeklyData = data?.weeklyData || [0, 0, 0, 0, 0, 0, 0];
  const maxVal = Math.max(...weeklyData, 10); // Ensure no divide by zero

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 border border-slate-700">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/20 via-transparent to-violet-600/10" />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-emerald-400 text-sm font-medium mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Sistem Operasional
            </p>
            <h2 className="text-2xl font-bold text-white">
              Halo, {formattedName} 👋
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Bot AI Anda menangani <span className="text-white font-semibold">{data?.header?.todayConversations || 0} percakapan</span> hari ini.
            </p>
            {subscription && (
              <div className={`mt-4 flex items-center gap-2 px-3 py-1.5 rounded-lg border w-fit ${
                subscription.plan_type === 'enterprise' 
                ? 'bg-violet-500/20 border-violet-500/30 text-violet-300' 
                : subscription.plan_type === 'business'
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                : 'bg-white/10 border-white/10 text-white'
              }`}>
                <CreditCard size={14} className={
                  subscription.plan_type === 'enterprise' ? 'text-violet-400' :
                  subscription.plan_type === 'business' ? 'text-emerald-400' : 'text-slate-400'
                } />
                <span className="text-xs capitalize font-bold tracking-wide">
                  {subscription.plan_type === 'free' ? 'Starter' : subscription.plan_type} Plan
                </span>
                <span className="text-[10px] opacity-60 ml-1">• {subscription.chat_limit.toLocaleString()} Limit Chat</span>
                {subscription.expires_at && (
                  <>
                    <span className="text-[10px] opacity-60 ml-1">•</span>
                    <span className={`text-[10px] font-bold ml-1 ${
                      (() => {
                        const days = Math.ceil((new Date(subscription.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                        return days <= 7 ? 'text-amber-400' : 'text-slate-400';
                      })()
                    }`}>
                      {(() => {
                        const days = Math.ceil((new Date(subscription.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                        if (days < 0) return 'Kadaluarsa';
                        if (days === 0) return 'Berakhir hari ini';
                        return `Berakhir dalam ${days} hari`;
                      })()}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-center px-4 py-2 rounded-xl bg-white/5 border border-white/10">
              <p className="text-2xl font-bold text-white">{data?.header?.uptime || '99.9%'}</p>
              <p className="text-xs text-slate-400">Uptime</p>
            </div>
            <div className="text-center px-4 py-2 rounded-xl bg-white/5 border border-white/10">
              <p className="text-2xl font-bold text-white">{data?.header?.avgResponse || '0s'}</p>
              <p className="text-xs text-slate-400">Respons Rata-rata</p>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12 gap-3">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
              <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin" />
            </div>
            <p className="text-sm font-medium text-slate-500">Memuat data dashboard...</p>
          </div>
        ) : (
          data?.metrics?.map(({ id, title, value, change, label }: any) => {
            const config = metricsConfig[id] || metricsConfig.conversations;
            const Icon = config.icon;
            return (
              <div
                key={id}
                id={`metric-${id}`}
                className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl ${config.iconBg} shadow-sm flex items-center justify-center`}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <div
                    className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                      change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                    }`}
                  >
                    {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(change)}%
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
                <p className="text-sm font-medium text-slate-600 mt-0.5">{title}</p>
                <p className="text-xs text-slate-400 mt-1">{label}</p>
              </div>
            );
          })
        )}
      </div>

      {/* Chart + Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Bar Chart */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-slate-900">Volume Percakapan</h3>
              <p className="text-sm text-slate-500">Minggu ini vs. minggu lalu</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                Minggu ini
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-200" />
                Minggu lalu
              </span>
            </div>
          </div>
          <div className="flex items-end gap-2 h-36">
            {weeklyData.map((val: number, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-0.5 h-28">
                  <div
                    className="flex-1 bg-emerald-500 rounded-t-md transition-all duration-500"
                    style={{ height: `${(val / maxVal) * 100}%` }}
                  />
                  <div
                    className="flex-1 bg-slate-100 rounded-t-md"
                    style={{ height: `${((val * 0.8) / maxVal) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400">{weekDays[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Aktivitas Terbaru</h3>
            <button className="text-xs text-emerald-600 font-medium hover:text-emerald-700">Lihat semua</button>
          </div>
          <div className="space-y-4">
            {data?.recentActivity?.length > 0 ? (
              data.recentActivity.map(({ id, type, text, time }: any) => {
                const conf = typeMap[type] || typeMap.activity;
                const Icon = conf.icon;
                return (
                  <div key={id} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon size={13} className={conf.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 leading-snug">{text}</p>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400">
                        <Clock size={10} />
                        {time}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-400">Tidak ada aktivitas terbaru.</p>
            )}
          </div>
        </div>
      </div>

      {/* Bot Performance */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-slate-900">Ringkasan Performa Bot</h3>
            <p className="text-sm text-slate-500">30 hari terakhir</p>
          </div>
          <button className="text-xs text-emerald-600 font-medium hover:text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg">
            Laporan Lengkap
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data?.performance ? (
            data.performance.map(({ label, value, sub, bar }: any, idx: number) => {
              const color = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-violet-500'][idx % 4];
              return (
                <div key={label} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-2">{label}</p>
                  <p className="text-xl font-bold text-slate-900 mb-0.5">{value}</p>
                  <p className="text-xs text-slate-400 mb-3">{sub}</p>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full transition-all duration-700`}
                      style={{ width: `${bar}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
