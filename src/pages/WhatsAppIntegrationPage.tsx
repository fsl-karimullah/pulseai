import React from 'react';
import { MessageCircle, Clock } from 'lucide-react';

const WhatsAppIntegrationPage: React.FC = () => {
  return (
    <div className="w-full h-full p-6">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-lg mx-auto px-4 mt-12">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 relative">
          <MessageCircle size={40} className="text-emerald-500" />
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md">
            <Clock size={18} className="text-amber-500" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-slate-800 mb-4">
          Meta WhatsApp Official Cloud API
        </h1>
        
        <p className="text-slate-600 mb-8 leading-relaxed">
          Kami sedang dalam proses persetujuan akhir dengan pihak Meta (App Review) untuk menghadirkan integrasi WhatsApp Business Cloud API resmi bagi Anda. 
          <br /><br />
          Fitur ini akan segera tersedia untuk menghubungkan Chatbot AI Pulse langsung ke nomor WhatsApp bisnis Anda secara aman dan resmi.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 w-full text-left">
          <Clock className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-bold text-amber-800">Coming Soon</h3>
            <p className="text-sm text-amber-700 mt-1">
              Tim engineering kami sedang bekerja sama dengan Meta untuk menyelesaikan integrasi ini secepatnya. Terima kasih atas kesabaran Anda.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppIntegrationPage;
