import React from 'react';
import { Users, Timer, Sparkles, ArrowRight } from 'lucide-react';

const LeadsPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mb-8 relative">
        <Users size={40} className="text-emerald-600" />
        <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center border-4 border-white">
          <Timer size={16} className="text-white" />
        </div>
      </div>

      <h1 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">
        Leads Management <span className="text-emerald-600">Coming Soon</span>
      </h1>
      
      <p className="text-slate-500 max-w-md mx-auto mb-10 leading-relaxed">
        Kami sedang membangun sistem manajemen lead yang canggih untuk membantu Anda mengonversi setiap chat menjadi penjualan dengan otomatisasi AI.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-emerald-200 group">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-all">
            <Sparkles size={20} />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mb-2">Auto Scoring</h3>
          <p className="text-xs text-slate-400">Klasifikasi otomatis lead (Hot, Warm, Cold) berdasarkan interaksi AI.</p>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-emerald-200 group">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-all">
            <Users size={20} />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mb-2">Lead Profiling</h3>
          <p className="text-xs text-slate-400">Dapatkan profil lengkap calon pembeli secara otomatis.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-emerald-200 group">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-all">
            <ArrowRight size={20} />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mb-2">Direct Follow-up</h3>
          <p className="text-xs text-slate-400">Terhubung langsung ke WhatsApp lead dalam satu klik.</p>
        </div>
      </div>

      <div className="mt-12 inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-bold shadow-xl shadow-slate-200">
        <Sparkles size={16} className="text-amber-400" />
        Nantikan Update Selanjutnya
      </div>
    </div>
  );
};

export default LeadsPage;
