import React from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface TopbarProps {
  title: string;
  subtitle: string;
}

const Topbar: React.FC<TopbarProps> = ({ title, subtitle }) => {
  const { user, signOut } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
  
  const userEmail = user?.email || 'user@example.com';
  const userName = userEmail.split('@')[0];
  const userInitials = userName.substring(0, 2).toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        {/* ... existing header content ... */}
        {/* Page Title */}
        <div>
          <h1 className="text-lg font-bold text-slate-900 leading-tight">{title}</h1>
          <p className="text-sm text-slate-500 leading-tight">{subtitle}</p>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-3">
          {/* User Pill */}
          <div className="relative group">
            <button
              id="topbar-user"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {userInitials}
              </div>
              <span className="text-sm font-medium text-slate-700 hidden md:block max-w-[100px] truncate">{userName}</span>
              <ChevronDown size={13} className="text-slate-400 hidden md:block" />
            </button>
            
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pt-1">
              <button 
                onClick={() => setShowLogoutConfirm(true)}
                className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-slate-50 flex items-center gap-2 rounded-xl"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
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

export default Topbar;
