import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Send, 
  Bot, 
  User, 
  X, 
  MoreHorizontal, 
  Paperclip, 
  ShieldCheck,
  Zap,
  Loader2,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

interface Message {
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
}

const PublicChatWidget: React.FC = () => {
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get('orgId') || '';
  const botName = searchParams.get('botName') || 'Aria';
  const company = searchParams.get('company') || 'PulseAI';
  const themeColor = searchParams.get('color') || '#059669';
  const logoUrl = searchParams.get('logo') || '';
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'bot',
      content: `Hi there! I'm ${botName}, your AI assistant for ${company}. How can I help you today?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadData, setLeadData] = useState({ name: '', whatsapp: '' });
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    const apiBase = import.meta.env.VITE_API_URL || '';
    
    try {
      const response = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          orgId,
          botName,
          company
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessages(prev => [...prev, {
          role: 'bot',
          content: data.message,
          timestamp: new Date()
        }]);

        // If AI triggers lead capture, show the form
        if (data.triggerLeadCapture && !leadSubmitted) {
          setTimeout(() => setShowLeadForm(true), 1000);
        }
      } else {
        throw new Error(data.message || 'Failed to get response');
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'bot',
        content: "I'm sorry, I encountered an error. Please try again in a moment.",
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadData.name || !leadData.whatsapp) return;

    const apiBase = import.meta.env.VITE_API_URL || '';

    setIsSubmittingLead(true);
    try {
      const response = await fetch(`${apiBase}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: leadData.name,
          whatsapp: leadData.whatsapp,
          orgId,
          botName,
          lastMessage: messages[messages.length - 1]?.content
        })
      });

      if (response.ok) {
        setLeadSubmitted(true);
        setTimeout(() => setShowLeadForm(false), 2000);
      }
    } catch (error) {
      console.error('Lead submission error:', error);
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const handleClose = () => {
    window.parent.postMessage({ type: 'PULSE_CHAT_CLOSE' }, '*');
  };

  return (
    <div className="flex flex-col h-screen bg-white font-sans text-slate-900 overflow-hidden border-0">
      {/* Header */}
      <div 
        className="p-4 flex items-center justify-between shadow-lg z-10"
        style={{ backgroundColor: themeColor }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/30 relative overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <Bot size={22} className="text-white" />
            )}
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-900 rounded-full" />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">{botName}</h1>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
              <p className="text-white/70 text-[10px] font-medium">Online • Powered by PulseAI</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 text-white/70 hover:text-white transition-colors">
            <MoreHorizontal size={18} />
          </button>
          <button 
            onClick={handleClose}
            className="p-2 text-white/70 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50"
      >
        {messages.map((msg, idx) => (
          <div 
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div 
                className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] ${
                  msg.role === 'user' ? 'bg-slate-200 text-slate-600' : 'text-white'
                }`}
                style={msg.role === 'bot' ? { backgroundColor: themeColor } : {}}
              >
                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div 
                className={`p-3 rounded-2xl text-sm shadow-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'text-white rounded-tr-none' 
                    : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'
                }`}
                style={msg.role === 'user' ? { backgroundColor: themeColor } : {}}
              >
                {(msg.content || "").split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                  part && part.match(/^https?:\/\//) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline font-bold text-emerald-600 hover:text-emerald-700 break-all">
                      {part}
                    </a>
                  ) : part
                )}
              </div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start animate-in fade-in duration-200">
            <div className="flex gap-2 max-w-[85%]">
              <div 
                className="w-7 h-7 rounded-full text-white flex items-center justify-center"
                style={{ backgroundColor: themeColor }}
              >
                <Bot size={14} />
              </div>
              <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lead Capture Overlay */}
      {showLeadForm && (
        <div className="absolute inset-0 z-20 flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
            <div 
              className="p-6 text-white relative overflow-hidden"
              style={{ backgroundColor: themeColor }}
            >
              <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <button 
                onClick={() => setShowLeadForm(false)}
                className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
              <h3 className="text-xl font-bold mb-1">Interested in {company}?</h3>
              <p className="text-white/80 text-sm">Leave your details and we'll get back to you shortly.</p>
            </div>
            
            <div className="p-6">
              {leadSubmitted ? (
                <div className="text-center py-8 animate-in zoom-in duration-300">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">Thank You!</h4>
                  <p className="text-sm text-slate-500">Our team will contact you soon.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitLead} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Full Name</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      value={leadData.name}
                      onChange={e => setLeadData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">WhatsApp Number</label>
                    <input 
                      type="tel"
                      required
                      placeholder="e.g. +62812345678"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      value={leadData.whatsapp}
                      onChange={e => setLeadData(prev => ({ ...prev, whatsapp: e.target.value }))}
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isSubmittingLead}
                    className="w-full py-3.5 px-4 rounded-2xl text-white font-bold text-sm shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    style={{ backgroundColor: themeColor }}
                  >
                    {isSubmittingLead ? <Loader2 size={18} className="animate-spin" /> : (
                      <>
                        Connect with Sales
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-center text-slate-400 leading-relaxed px-4">
                    By submitting, you agree to receive a follow-up via WhatsApp or Email.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-100 relative">
        <form 
          onSubmit={handleSendMessage}
          className="flex items-center gap-1 bg-slate-50 rounded-2xl pr-1.5 pl-2 py-1.5 border border-slate-200 focus-within:border-slate-300 transition-all"
        >
          <button type="button" className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <Paperclip size={18} />
          </button>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-transparent border-none text-sm focus:outline-none placeholder:text-slate-400 px-1"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isTyping}
            className="w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-md hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all flex-shrink-0"
            style={{ backgroundColor: themeColor }}
          >
            {isTyping ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
        
        <div className="flex items-center justify-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={10} className="text-slate-400" />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">End-to-End Encrypted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap size={10} className="text-slate-400" />
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Instant Response</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicChatWidget;
