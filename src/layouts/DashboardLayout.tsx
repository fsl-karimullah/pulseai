import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useSubscription } from '../hooks/useSubscription';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';


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

const DashboardLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  const { subscription } = useSubscription();

  const currentPath = location.pathname;
  const meta = pageMeta[currentPath] || { title: '', subtitle: '' };

  // Calculate days remaining
  let daysRemaining = null;
  if (subscription?.expires_at) {
    const expires = new Date(subscription.expires_at);
    const now = new Date();
    const diffTime = expires.getTime() - now.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const showWarning = subscription?.plan_type !== 'free' && daysRemaining !== null && daysRemaining <= 3;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        unreadLeads={3}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {showWarning && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-4 py-2 flex items-center justify-between shadow-md z-50 animate-in slide-in-from-top duration-500">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-1.5 rounded-lg">
                <AlertTriangle size={18} className="text-white" />
              </div>
              <p className="text-sm font-medium">
                Masa aktif PulseAI Anda tinggal <span className="font-bold underline">{daysRemaining} hari</span> lagi. 
                <span className="hidden md:inline ml-2 text-white/90">Hemat Rp 239rb dengan upgrade ke paket Tahunan!</span>
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
        <Topbar title={meta.title} subtitle={meta.subtitle} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
