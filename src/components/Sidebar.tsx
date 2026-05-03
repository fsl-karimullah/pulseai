import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Settings2,
  Users,
  Bot,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Zap,
  LogOut,
  CreditCard,
  Monitor,
} from 'lucide-react';
import type { Page } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  unreadLeads: number;
}

const navItems = [
  { id: 'dashboard' as Page, path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'knowledge' as Page, path: '/knowledge', label: 'Basis Pengetahuan', icon: BookOpen },
  { id: 'bot-settings' as Page, path: '/bot-settings', label: 'Pengaturan Bot', icon: Settings2 },
  { id: 'leads' as Page, path: '/leads', label: 'Lead', icon: Users, badge: true },
  { id: 'widget' as Page, path: '/integration/widget', label: 'Widget', icon: Monitor },
  { id: 'billing' as Page, path: '/billing', label: 'Tagihan', icon: CreditCard },
];

const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggle,
  unreadLeads,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { subscription } = useSubscription();
  
  // Try to use the path to figure out the active item instead of the prop
  const currentPath = location.pathname;

  return (
    <aside
      className={`
        relative flex flex-col h-screen bg-slate-950 border-r border-slate-800
        transition-all duration-300 ease-in-out flex-shrink-0
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800 min-h-[72px]">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/30 flex-shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-white font-bold text-sm leading-tight whitespace-nowrap">
              PulseAI
            </p>
            <p className="text-slate-500 text-xs whitespace-nowrap">Enterprise Suite</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 pb-2 text-xs font-semibold text-slate-600 uppercase tracking-widest">
            Menu Utama
          </p>
        )}
        {navItems.map(({ id, path, label, icon: Icon, badge }) => {
          const isActive = currentPath.startsWith(path);
          return (
            <button
              key={id}
              id={`nav-${id}`}
              onClick={() => navigate(path)}
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
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-emerald-400 rounded-full" />
              )}
              <Icon
                className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'}`}
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
            </button>
          );
        })}

        {!collapsed && (
          <>
            <div className="pt-4 pb-2">
              <p className="px-3 pb-2 text-xs font-semibold text-slate-600 uppercase tracking-widest">
                Statistik Cepat
              </p>
            </div>
            <div className="mx-1 p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <TrendingUp size={13} className="text-emerald-400" />
                  <span>Percakapan</span>
                </div>
                <span className="text-xs font-semibold text-slate-100">2,481</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Zap size={13} className="text-amber-400" />
                  <span>Tingkat Resolusi</span>
                </div>
                <span className="text-xs font-semibold text-slate-100">87.4%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Sparkles size={13} className="text-violet-400" />
                  <span>Akurasi AI</span>
                </div>
                <span className="text-xs font-semibold text-slate-100">94.2%</span>
              </div>
            </div>
          </>
        )}
      </nav>

      {/* User Profile Footer */}
      <div className={`border-t border-slate-800 p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
              AJ
            </div>
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
              onClick={() => signOut()}
              title="Sign Out"
              className="text-slate-500 hover:text-slate-300 flex-shrink-0 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>

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
  );
};

export default Sidebar;
