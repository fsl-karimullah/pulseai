import React, { useState } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Settings2,
  Users,
  Bot,
  ChevronLeft,
  ChevronRight,
  LogOut,
  CreditCard,
  Monitor,
  MessageCircle,
  X,
  Database,
  UsersRound,
  ClipboardList,
  FolderKanban,
  TrendingUp,
  Receipt,
} from 'lucide-react';
import type { Page } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  unreadLeads: number;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

type NavItem = {
  id: Page;
  path: string;
  label: string;
  icon: any;
  badge?: boolean;
  comingSoon?: boolean;
};

const navGroups: { header: string; emoji: string; items: NavItem[] }[] = [
  {
    header: 'Main',
    emoji: '',
    items: [
      { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'projects', path: '/projects', label: 'Projects', icon: FolderKanban },
    ],
  },
  {
    header: 'Pulse Chat',
    emoji: '🤖',
    items: [
      { id: 'leads', path: '/leads', label: 'Prospek (Leads)', icon: Users, badge: true },
      { id: 'knowledge', path: '/knowledge', label: 'Basis Pengetahuan', icon: BookOpen },
      { id: 'bot-settings', path: '/bot-settings', label: 'Pengaturan Bot', icon: Settings2 },
      { id: 'widget', path: '/integration/widget', label: 'Widget Website', icon: Monitor },
      { id: 'whatsapp', path: '/integration/whatsapp', label: 'Integrasi WhatsApp', icon: MessageCircle },
      { id: 'pulse-internal', path: '/dashboard/pulse-internal', label: 'PulseInternal', icon: Database, comingSoon: true },
    ],
  },
  {
    header: 'Pulse Career',
    emoji: '👔',
    items: [
      { id: 'cv-screening', path: '/cv-screening', label: 'AI CV Screening', icon: ClipboardList },
      { id: 'pulse-hr', path: '/dashboard/pulse-hr', label: 'PulseHR', icon: UsersRound, comingSoon: true },
    ],
  },
  {
    header: 'Pulse Finance',
    emoji: '💰',
    items: [
      { id: 'finance-transactions', path: '/finance/transactions', label: 'Transaksi', icon: Receipt },
      { id: 'finance-tax', path: '/finance/tax', label: 'Estimasi Pajak', icon: TrendingUp },
    ],
  },
  {
    header: 'Sistem',
    emoji: '',
    items: [
      { id: 'billing', path: '/billing', label: 'Tagihan & Limit', icon: CreditCard },
    ],
  },
];

const NavContent: React.FC<{
  collapsed: boolean;
  currentPath: string;
  unreadLeads: number;
  user: any;
  subscription: any;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}> = ({ collapsed, currentPath, unreadLeads, user, subscription, onNavigate, onLogout }) => {
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true, 4: false });

  const toggleGroup = (index: number) => {
    setOpenGroups(prev => ({ ...prev, [index]: !prev[index] }));
  };

  return (
  <>
    {/* Logo / Brand */}
    <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800 min-h-[72px]">
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/30 flex-shrink-0">
        <Bot className="w-5 h-5 text-white" />
      </div>
      {!collapsed && (
        <div className="overflow-hidden">
          <p className="text-white font-bold text-sm leading-tight whitespace-nowrap">PulseAI</p>
          <p className="text-slate-500 text-xs whitespace-nowrap">Enterprise Suite</p>
        </div>
      )}
    </div>

    {/* Navigation */}
    <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
      {navGroups.map((group, index) => (
        <div key={index} className="mb-4 last:mb-0">
          {!collapsed && (
            <button
              onClick={() => toggleGroup(index)}
              className="w-full flex items-center justify-between px-3 pb-2 pt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                {group.emoji && <span className="text-[11px]">{group.emoji}</span>}
                {group.header}
              </span>
              <ChevronRight
                size={12}
                className={`transition-transform duration-200 ${openGroups[index] ? 'rotate-90' : ''}`}
              />
            </button>
          )}
          {(openGroups[index] || collapsed) && (
            <div className="space-y-1">
            {group.items.map(({ id, path, label, icon: Icon, badge, comingSoon }) => {
              const isActive = currentPath.startsWith(path);
              return (
                <button
                  key={id}
                  id={`nav-${id}`}
                  onClick={() => onNavigate(path)}
                  title={collapsed ? label : undefined}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                    transition-all duration-150 group relative
                    ${isActive
                      ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }
                  `}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-emerald-400 rounded-full" />
                  )}
                  <Icon
                    className={`flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`}
                    size={18}
                  />
                  {!collapsed && (
                    <span className="flex-1 text-left truncate">{label}</span>
                  )}
                  {!collapsed && badge && unreadLeads > 0 && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-bold flex-shrink-0">
                      {unreadLeads > 9 ? '9+' : unreadLeads}
                    </span>
                  )}
                  {collapsed && badge && unreadLeads > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                  {!collapsed && comingSoon && (
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wider ml-auto flex-shrink-0 border border-emerald-500/20">
                      SOON
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          )}
        </div>
      ))}


    </nav>

    {/* User Profile Footer */}
    <div className={`border-t border-slate-800 p-3 ${collapsed ? 'flex justify-center' : ''}`}>
      {collapsed ? (
        <div className="relative">
          <button
            onClick={onLogout}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold"
          >
            {user?.email?.charAt(0) || 'U'}
          </button>
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-950 rounded-full" />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold uppercase">
              {user?.email?.charAt(0) || 'U'}
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-950 rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{user?.email || 'User'}</p>
            <p className="text-xs text-slate-500 capitalize truncate">
              {subscription?.plan_type === 'free' ? 'Starter' : (subscription?.plan_type || 'User')}
            </p>
          </div>
          <button
            onClick={onLogout}
            title="Sign Out"
            className="text-slate-500 hover:text-red-400 flex-shrink-0 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </div>
  </>
  );
};

const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggle,
  unreadLeads,
  mobileOpen = false,
  onMobileClose,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { subscription } = useSubscription();
  const currentPath = location.pathname;
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

  const handleNavigate = (path: string) => {
    navigate(path);
    onMobileClose?.();
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside
        className={`
          hidden lg:relative lg:flex flex-col h-screen bg-slate-950 border-r border-slate-800
          transition-all duration-300 ease-in-out flex-shrink-0
          ${collapsed ? 'w-16' : 'w-64'}
        `}
      >
        <NavContent
          collapsed={collapsed}
          currentPath={currentPath}
          unreadLeads={unreadLeads}
          user={user}
          subscription={subscription}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
        {/* Collapse Toggle */}
        <button
          id="sidebar-toggle"
          onClick={onToggle}
          className="
            absolute -right-3 top-[88px] z-10
            w-6 h-6 rounded-full bg-slate-800 border border-slate-700
            flex items-center justify-center
            text-slate-400 hover:text-slate-100 hover:bg-slate-700
            shadow-md transition-all duration-150
          "
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* ── Mobile Drawer Overlay ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
          onClick={onMobileClose}
        />
      )}

      {/* ── Mobile Drawer ── */}
      <aside
        className={`
          lg:hidden fixed left-0 top-0 z-50 h-full w-72 flex flex-col bg-slate-950 border-r border-slate-800
          transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Close button */}
        <button
          onClick={onMobileClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
        <NavContent
          collapsed={false}
          currentPath={currentPath}
          unreadLeads={unreadLeads}
          user={user}
          subscription={subscription}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      </aside>

      {/* Logout Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut size={28} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Yakin ingin keluar?</h3>
              <p className="text-sm text-slate-500 mb-8">
                Anda perlu login kembali untuk mengakses dashboard PulseAI.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all active:scale-[0.98]"
                >
                  Batal
                </button>
                <button
                  onClick={() => signOut()}
                  className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-[0.98]"
                >
                  Ya, Keluar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
