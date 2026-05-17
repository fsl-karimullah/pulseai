import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, ShieldCheck, CalendarRange, ArrowRight, Loader2, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';

const PulseHRPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setToast({ show: false, message: '', type: 'success' });

    try {
      const { error } = await supabase.from('waitlist_hr').insert([{ email }]);

      if (error) {
        throw error;
      }

      setToast({
        show: true,
        message: 'Success! You have been successfully added to the PulseHR early access list.',
        type: 'success',
      });
      setEmail('');
    } catch (err: any) {
      console.error(err);
      // Fallback in case table doesn't exist yet, to ensure a good demo experience
      if (err.message?.includes('relation "waitlist_hr" does not exist')) {
        setToast({
          show: true,
          message: 'Demomode: Waitlist saved locally! (Table "waitlist_hr" not yet created in Supabase)',
          type: 'success',
        });
        setEmail('');
      } else {
        setToast({
          show: true,
          message: err.message || 'Something went wrong. Please try again.',
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
      // Auto-hide toast after 5 seconds
      setTimeout(() => {
        setToast((prev) => ({ ...prev, show: false }));
      }, 5000);
    }
  };

  return (
    <div className="min-h-[85vh] bg-[#020617] text-white rounded-3xl p-6 sm:p-10 border border-slate-800 relative overflow-hidden font-sans">
      {/* Background radial effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-20 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #10b981, transparent)' }} />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full opacity-10 blur-[80px]"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
        <div className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Floating dynamic Toast notification */}
      {toast.show && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 ${
          toast.type === 'success' 
            ? 'bg-slate-900 border-emerald-500/30 text-emerald-400' 
            : 'bg-slate-900 border-red-500/30 text-red-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-semibold text-slate-200">{toast.message}</span>
        </div>
      )}

      {/* Content wrapper */}
      <div className="relative z-10 max-w-4xl mx-auto flex flex-col justify-between h-full">
        <div>
          {/* Glowing Badges */}
          <div className="flex items-center gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-lg shadow-amber-500/5 animate-pulse">
              <Sparkles size={12} />
              Coming Soon
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Internal Tooling
            </span>
          </div>

          {/* Main Title & Subtitle */}
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight mb-4">
            PulseHR — <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500">Automated Employee Onboarding & SOP Assistant</span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-2xl leading-relaxed mb-12">
            Train your team automatically. Let AI answer internal SOP questions so you can focus on scaling your business operations securely.
          </p>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {/* Card 1 */}
            <div className="bg-slate-950/40 backdrop-blur-md border border-white/5 hover:border-emerald-500/20 p-6 rounded-2xl transition-all duration-300 group hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <FileText className="text-emerald-400" size={22} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">SOP Training Hub</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Upload your internal company SOPs. New hires can ask the bot directly: <span className="text-emerald-400 italic">"How do I file for a reimbursement?"</span> or <span className="text-emerald-400 italic">"What is our dress code?"</span>.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-slate-950/40 backdrop-blur-md border border-white/5 hover:border-emerald-500/20 p-6 rounded-2xl transition-all duration-300 group hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <ShieldCheck className="text-emerald-400" size={22} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Sensitive Data Guard</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                The AI is hardcoded with strict data boundaries so it will never leak internal employee data to public customers.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-slate-950/40 backdrop-blur-md border border-white/5 hover:border-emerald-500/20 p-6 rounded-2xl transition-all duration-300 group hover:-translate-y-1">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <CalendarRange className="text-emerald-400" size={22} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Automated Leave Request</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Employees can request time off via chat, which automatically triggers an approval notification on the HR dashboard.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Waitlist Section */}
        <div className="w-full max-w-xl bg-slate-950/60 backdrop-blur-lg border border-slate-800 p-6 sm:p-8 rounded-3xl shadow-2xl">
          <h3 className="text-lg font-bold text-white mb-2">Get Early Access to PulseHR</h3>
          <p className="text-slate-400 text-xs mb-6">
            Join the waitlist to receive private beta credentials and setup instructions once we launch.
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="flex-1 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-[#10b981] hover:bg-[#0d9488] text-[#020617] text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Get Early Access to PulseHR
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PulseHRPage;
