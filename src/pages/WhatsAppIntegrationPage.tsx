import React from 'react';
import { MessageCircle, Zap, ShieldCheck, Sparkles, Clock } from 'lucide-react';

const WhatsAppIntegrationPage: React.FC = () => {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header Area */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <MessageCircle className="text-emerald-600" size={24} />
          </div>
          Integrasi WhatsApp
        </h1>
        <p className="text-slate-500 mt-2">Hubungkan PulseAI langsung ke nomor WhatsApp bisnis Anda.</p>
      </div>

      {/* Hero Coming Soon Card */}
      <div className="relative overflow-hidden bg-slate-900 rounded-3xl p-8 md:p-12 shadow-2xl border border-slate-800 mb-10">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-32 -mb-32" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-widest uppercase mb-6">
            <Clock size={14} className="animate-pulse" />
            Coming Soon
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
            Asisten AI di Genggaman Pelanggan <br className="hidden md:block" /> Melalui WhatsApp
          </h2>
          
          <p className="text-slate-400 max-w-xl mb-10 leading-relaxed text-lg">
            Kami sedang merampungkan integrasi resmi WhatsApp Business API. Segera hadir, asisten AI Anda dapat membalas pesan pelanggan secara otomatis 24/7 langsung di WhatsApp.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
            {[
              { icon: Zap, title: "Respon Kilat", desc: "Balas pesan dalam hitungan detik." },
              { icon: ShieldCheck, title: "Resmi & Aman", desc: "Menggunakan Official Meta API." },
              { icon: Sparkles, title: "Smart Reply", desc: "AI memahami konteks chat." }
            ].map((feature, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 p-5 rounded-2xl text-left">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
                  <feature.icon size={20} />
                </div>
                <h4 className="text-white font-semibold mb-1">{feature.title}</h4>
                <p className="text-slate-500 text-xs leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>


    </div>
  );
};

export default WhatsAppIntegrationPage;
