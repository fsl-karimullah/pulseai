import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useSubscription } from '../hooks/useSubscription';
import { useOrganization } from '../hooks/useOrganization';
import { AlertTriangle, ChevronRight, Menu, LayoutDashboard, BookOpen, Settings2, Users, CreditCard, Lock } from 'lucide-react';

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Dashboard',
    subtitle: "Welcome back — here's your AI performance overview.",
  },
  '/knowledge': {
    title: 'Knowledge Base',
    subtitle: "Manage articles that power your AI bot's responses.",
  },
  '/bot-settings': {
    title: 'Bot Settings',
    subtitle: "Customize your AI assistant's behavior and personality.",
  },
  '/leads': {
    title: 'Leads',
    subtitle: 'Track and manage leads captured by your bot.',
  },
  '/billing': {
    title: 'Pricing & Billing',
    subtitle: 'Manage your subscription and upgrade your limits.',
  },
  '/widget': {
    title: 'Widget Integration',
    subtitle: 'Embed the PulseAI chatbot into your website.',
  },
};

const mobileNavItems = [
  { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { path: '/bot-settings', label: 'Bot', icon: Settings2 },
  { path: '/leads', label: 'Leads', icon: Users },
  { path: '/billing', label: 'Billing', icon: CreditCard },
];

const DashboardLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { subscription } = useSubscription();
  const { organization } = useOrganization();

  const currentPath = location.pathname;
  const meta = pageMeta[currentPath] || { title: '', subtitle: '' };

  // Calculate trial days remaining
  let trialDaysRemaining = null;
  let isTrialExpired = false;
  
  if (organization && !organization.is_premium) {
    const trialStartedAt = organization.trial_started_at ? new Date(organization.trial_started_at) : new Date();
    const expiresAt = new Date(trialStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    trialDaysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (trialDaysRemaining <= 0) {
      isTrialExpired = true;
      trialDaysRemaining = 0;
    }
  }

  // Calculate subscription days remaining (if premium)
  let subDaysRemaining = null;
  if (organization?.is_premium && subscription?.expires_at) {
    const expires = new Date(subscription.expires_at);
    const now = new Date();
    const diffTime = expires.getTime() - now.getTime();
    subDaysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const showSubWarning = organization?.is_premium && subDaysRemaining !== null && subDaysRemaining <= 3;
  const showTrialWarning = !organization?.is_premium && trialDaysRemaining !== null && trialDaysRemaining <= 5 && !isTrialExpired;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 relative">
      {/* Trial Expired Full Screen Blocker Overlay for Critical Features */}
      {isTrialExpired && currentPath !== '/billing' && (
        <div className="absolute inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Masa Percobaan Habis</h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              Masa percobaan gratis 30 hari Anda telah berakhir. Sistem balasan otomatis AI untuk WhatsApp Anda saat ini <strong>dihentikan (ditangguhkan)</strong>. Upgrade sekarang untuk mengaktifkan kembali bot Anda.
            </p>
            <button
              onClick={() => navigate('/billing')}
              className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-200 text-lg"
            >
              Upgrade Paket Sekarang
            </button>
          </div>
        </div>
      )}

      {/* Desktop + Mobile Sidebar (drawer) */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        unreadLeads={0}
        mobileOpen={mobileDrawerOpen}
        onMobileClose={() => setMobileDrawerOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Trial Expiring Soon Banner */}
        {showTrialWarning && (
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-md z-40 animate-in slide-in-from-top duration-500 gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <AlertTriangle size={20} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold">Masa Percobaan (Trial) Tersisa {trialDaysRemaining} Hari</p>
                <p className="text-xs text-blue-100 mt-0.5">Setelah trial habis, bot WhatsApp Anda akan otomatis non-aktif.</p>
              </div>
            </div>
            <Link
              to="/billing"
              className="bg-white text-indigo-600 px-5 py-2 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap w-full sm:w-auto justify-center"
            >
              Upgrade Paket <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {/* Subscription Expiring Soon Banner */}
        {showSubWarning && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-4 py-2 flex items-center justify-between shadow-md z-40 animate-in slide-in-from-top duration-500">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-1.5 rounded-lg">
                <AlertTriangle size={18} className="text-white" />
              </div>
              <p className="text-sm font-medium">
                Masa aktif langganan PulseAI Anda tinggal <span className="font-bold underline">{subDaysRemaining} hari</span> lagi.
                <span className="hidden md:inline ml-2 text-white/90">Perpanjang sekarang agar bot tetap aktif!</span>
              </p>
            </div>
            <Link
              to="/billing"
              className="bg-white text-orange-600 px-4 py-1.5 rounded-full text-xs font-bold hover:bg-orange-50 transition-colors flex items-center gap-1 shadow-sm"
            >
              Perbarui Sekarang <ChevronRight size={14} />
            </Link>
          </div>
        )}

        {/* Mobile Header Bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-30">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex-shrink-0"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <Settings2 size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-900 truncate leading-tight">{meta.title || 'PulseAI'}</h1>
            </div>
          </div>
        </div>

        {/* Desktop Topbar */}
        <div className="hidden lg:block">
          <Topbar title={meta.title} subtitle={meta.subtitle} />
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <Outlet />
        </main>

        {/* ── Mobile Bottom Navigation ── */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 safe-area-bottom">
          <div className="flex items-center justify-around px-2 py-2">
            {mobileNavItems.map(({ path, label, icon: Icon }) => {
              const isActive = currentPath.startsWith(path);
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                    isActive ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  <div className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${
                    isActive ? 'bg-emerald-50' : ''
                  }`}>
                    <Icon size={18} />
                  </div>
                  <span className={`text-[10px] font-semibold leading-none ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};

export default DashboardLayout;
