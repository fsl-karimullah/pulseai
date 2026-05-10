import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Bot, Loader2, Mail, Lock, ArrowRight, Eye, EyeOff, CheckCircle2, ShieldCheck, Zap, Sparkles, User } from 'lucide-react';

const SignUpPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` }
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => navigate('/login'), 4000);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30 px-4 font-sans">
        <div className="w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-100">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-3">Cek email Anda!</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            Kami telah mengirim link verifikasi ke{' '}
            <span className="font-bold text-slate-900">{email}</span>.{' '}
            Silakan verifikasi email untuk mulai menggunakan PulseAI.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            Kembali ke Login <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* ── Right Panel: Form (first for mobile) ── */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 bg-white order-last lg:order-first">
        {/* Mobile logo */}
        <div className="flex justify-center mb-8 lg:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <Bot size={22} className="text-white" />
            </div>
            <span className="text-slate-900 font-black text-xl tracking-tight">PulseAI</span>
          </div>
        </div>

        <div className="w-full max-w-sm mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Buat akun gratis 🚀</h2>
            <p className="mt-1.5 text-sm text-slate-500">Mulai tanpa kartu kredit. Setup dalam 2 menit.</p>
          </div>

          <form onSubmit={handleSignUp} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Email Kerja
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@perusahaan.com"
                  className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 karakter"
                  className="w-full pl-10 pr-11 py-3 text-sm border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Password strength hints */}
              {password.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all ${
                        password.length > i * 2
                          ? password.length >= 8 ? 'bg-emerald-500' : password.length >= 5 ? 'bg-amber-400' : 'bg-red-400'
                          : 'bg-slate-200'
                      }`}
                    />
                  ))}
                  <span className="text-xs text-slate-400 ml-1">
                    {password.length >= 8 ? 'Kuat' : password.length >= 5 ? 'Cukup' : 'Lemah'}
                  </span>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 text-sm text-red-700 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                <ShieldCheck size={16} className="flex-shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.98] group"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Buat Akun Gratis
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">
            Dengan mendaftar, Anda menyetujui{' '}
            <Link to="#" className="underline hover:text-slate-600">Syarat & Ketentuan</Link> kami.
          </p>

          {/* Divider */}
          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500">
              Sudah punya akun?{' '}
              <Link to="/login" className="font-bold text-emerald-600 hover:text-emerald-700 transition-colors">
                Masuk di sini
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* ── Left Panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col justify-between p-12 order-first lg:order-last"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2027 100%)' }}
      >
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-20 blur-[80px]"
            style={{ background: 'radial-gradient(circle, #10b981, transparent)' }} />
          <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full opacity-15 blur-[60px]"
            style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        </div>

        {/* Top: Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Bot size={22} className="text-white" />
            </div>
            <span className="text-white font-black text-xl tracking-tight">PulseAI</span>
          </div>
        </div>

        {/* Middle */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-black text-white leading-tight mb-4">
              Mulai Perjalanan<br />
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #10b981, #06b6d4)' }}>AI Bisnis Anda</span>
            </h1>
            <p className="text-slate-400 text-base leading-relaxed max-w-xs">
              Bergabung dengan 100+ bisnis yang sudah menggunakan PulseAI untuk melayani pelanggan secara otomatis.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {[
              { step: '01', title: 'Daftar akun', desc: 'Gratis, tanpa kartu kredit', icon: User },
              { step: '02', title: 'Upload dokumen bisnis', desc: 'PDF, artikel, FAQ — semua bisa', icon: Sparkles },
              { step: '03', title: 'Embed ke website', desc: 'Satu baris kode, selesai!', icon: Zap },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon size={16} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{title}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
                <span className="ml-auto text-slate-700 text-xs font-bold">{step}</span>
              </div>
            ))}
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-3">
            {['Gratis 30 hari', 'Tanpa kartu kredit', 'Setup 2 menit'].map((badge) => (
              <div key={badge} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span className="text-xs text-slate-300">{badge}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10 flex gap-8">
          {[['100+', 'Pengguna aktif'], ['30 hari', 'Trial gratis'], ['24/7', 'Uptime']].map(([val, label]) => (
            <div key={label}>
              <p className="text-white font-black text-lg">{val}</p>
              <p className="text-slate-500 text-xs">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
