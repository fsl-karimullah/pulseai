import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ArrowRight,
  Trash2,
  MessageSquare,
} from 'lucide-react';

interface Message {
  role: 'user' | 'bot';
  content: string;
  timestamp: string; // ISO string for JSON serialisation
  attachments?: { mimeType: string; data: string; name?: string }[];
  feedback?: 'positive' | 'negative';
}

interface StoredSession {
  messages: Message[];
  expiry: number;
}

const PublicChatWidget: React.FC = () => {
  const [searchParams] = useSearchParams();
  const orgId      = searchParams.get('orgId')      || '';
  const projectId  = searchParams.get('projectId')  || '';
  const botName    = searchParams.get('botName')    || 'Aria';
  const company    = searchParams.get('company')    || 'PulseAI';
  const themeColor = searchParams.get('color')      || '#059669';
  const logoUrl    = searchParams.get('logo')       || '';

  // ── Session key (unique per org+project) ─────────────────────────────────
  const SESSION_KEY = `pulse_chat_${orgId}_${projectId}`;
  const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  // ── State ─────────────────────────────────────────────────────────────────
  const [messages, setMessages]       = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput]             = useState('');
  const [isTyping, setIsTyping]       = useState(false);
  const [showLeadForm, setShowLeadForm]   = useState(false);
  const [leadData, setLeadData]       = useState({ name: '', whatsapp: '' });
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [showMenu, setShowMenu]       = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [quickRepliesDismissed, setQuickRepliesDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // V2 Features State
  const [attachments, setAttachments] = useState<{ mimeType: string; data: string; name: string }[]>([]);
  const [proactiveDelay, setProactiveDelay] = useState(0);
  const [followupDelay, setFollowupDelay] = useState(0);
  const [handoffMode, setHandoffMode] = useState(false);

  // ── 1. Load history from localStorage on mount ───────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const stored: StoredSession = JSON.parse(raw);
        if (stored.expiry > Date.now() && Array.isArray(stored.messages) && stored.messages.length > 0) {
          setMessages(stored.messages);
          setQuickRepliesDismissed(true); // hide chips if there's history
          setHistoryLoaded(true);
          return;
        }
      }
    } catch (_) { /* ignore parse errors */ }

    // No valid history → show greeting
    setMessages([{
      role: 'bot',
      content: `Hi there! I'm ${botName}, your AI assistant for ${company}. How can I help you today?`,
      timestamp: new Date().toISOString(),
    }]);
    setHistoryLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Persist messages to localStorage whenever they change ─────────────
  useEffect(() => {
    if (!historyLoaded) return; // don't overwrite before initial load
    try {
      const stored: StoredSession = {
        messages,
        expiry: Date.now() + SESSION_TTL,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    } catch (_) { /* quota exceeded — silently ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, historyLoaded]);

  // ── 3. Fetch quick replies from /api/widget-config ───────────────────────
  useEffect(() => {
    if (!orgId && !projectId) return;
    const apiBase = import.meta.env.VITE_API_URL || '';
    const params = new URLSearchParams();
    if (orgId)     params.set('orgId', orgId);
    if (projectId) params.set('projectId', projectId);

    fetch(`${apiBase}/api/widget-config?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.success) {
          if (Array.isArray(json.data?.quickReplies)) {
            setQuickReplies(json.data.quickReplies.filter(Boolean));
          }
          if (json.data?.proactiveDelay) setProactiveDelay(json.data.proactiveDelay);
          if (json.data?.followupDelay) setFollowupDelay(json.data.followupDelay);
        }
      })
      .catch(() => { /* non-fatal */ });
  }, [orgId, projectId]);

  // ── Track Widget Opened ───────────────────────────────────────────────────
  useEffect(() => {
    if (orgId) {
      const apiBase = import.meta.env.VITE_API_URL || '';
      fetch(`${apiBase}/api/analytics/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, eventType: 'widget_opened' })
      }).catch(() => {});
    }
  }, [orgId]);

  // ── Proactive Chat ────────────────────────────────────────────────────────
  useEffect(() => {
    if (proactiveDelay > 0 && messages.length === 1 && !quickRepliesDismissed) {
      const timerId = setTimeout(() => {
        window.parent.postMessage({ type: 'PULSE_CHAT_OPEN' }, '*');
        const audio = new Audio('https://cdn.freesound.org/previews/415/415209_5121236-lq.mp3'); // short pop
        audio.play().catch(() => {});
      }, proactiveDelay * 1000);
      return () => clearTimeout(timerId);
    }
  }, [proactiveDelay, messages.length, quickRepliesDismissed]);

  // ── Idle Follow-up ────────────────────────────────────────────────────────
  useEffect(() => {
    if (followupDelay > 0 && messages.length > 1) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'bot') {
        const timerId = setTimeout(() => {
          setMessages(prev => [...prev, {
            role: 'bot',
            content: "Halo, apakah ada yang masih membingungkan? Saya siap membantu.",
            timestamp: new Date().toISOString()
          }]);
          window.parent.postMessage({ type: 'PULSE_CHAT_OPEN' }, '*');
          const audio = new Audio('https://cdn.freesound.org/previews/415/415209_5121236-lq.mp3');
          audio.play().catch(() => {});
        }, followupDelay * 60 * 1000);
        return () => clearTimeout(timerId);
      }
    }
  }, [followupDelay, messages]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // ── Clear history ─────────────────────────────────────────────────────────
  const handleClearHistory = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    const greeting: Message = {
      role: 'bot',
      content: `Hi there! I'm ${botName}, your AI assistant for ${company}. How can I help you today?`,
      timestamp: new Date().toISOString(),
    };
    setMessages([greeting]);
    setLeadSubmitted(false);
    setShowLeadForm(false);
    setQuickRepliesDismissed(false);
    setShowMenu(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SESSION_KEY, botName, company]);

  // ── Markdown Renderer ─────────────────────────────────────────────────────
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      const listMatch = line.match(/^(\d+)\.\s+(.*)/);
      if (listMatch) {
        return (
          <div key={lineIdx} className="flex gap-2 mt-2 first:mt-0">
            <span className="font-bold text-slate-500 flex-shrink-0 w-5 text-right">{listMatch[1]}.</span>
            <span>{renderInline(listMatch[2])}</span>
          </div>
        );
      }
      if (line.trim() === '') return <div key={lineIdx} className="h-1" />;
      return <div key={lineIdx}>{renderInline(line)}</div>;
    });
  };

  const renderInline = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\*\*[^*]+\*\*|\[PRODUCT:[^\]]+\]|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s)]*)/g);
    return parts.map((part, i) => {
      if (!part) return null;
      
      // Parse custom PRODUCT tag: [PRODUCT: Nama | Harga | URL_Gambar]
      if (part.startsWith('[PRODUCT:') && part.endsWith(']')) {
        const content = part.slice(9, -1);
        const [name, price, img] = content.split('|').map(s => s.trim());
        return (
          <div key={i} className="my-3 w-full max-w-[240px] bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            {img && <img src={img} alt={name || 'Produk'} className="w-full h-32 object-cover bg-slate-50" />}
            <div className="p-3">
              {name && <div className="font-bold text-sm text-slate-800 line-clamp-2 leading-snug">{name}</div>}
              {price && <div className="text-emerald-600 font-semibold mt-1 text-sm">{price}</div>}
            </div>
          </div>
        );
      }

      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-slate-800">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('[') && part.includes('](')) {
        const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (match) {
          let url = match[2];
          if (!url.startsWith('http')) url = 'https://' + url;
          return <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="underline font-bold text-emerald-600 hover:text-emerald-700 break-words">{match[1]}</a>;
        }
      }
      if (part.match(/^https?:\/\//)) {
        return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline font-bold text-emerald-600 hover:text-emerald-700 break-all">{part}</a>;
      }
      if (part.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\//)) {
        return <a key={i} href={`https://${part}`} target="_blank" rel="noopener noreferrer" className="underline font-bold text-emerald-600 hover:text-emerald-700 break-all">{part}</a>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // ── Attachments Logic ─────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      // Limit to 1MB to prevent large base64 strings freezing the browser and triggering 413
      if (file.size > 1 * 1024 * 1024) {
        alert('Ukuran file gambar maksimal 1MB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (!result) return;
        // Split data URL to get base64 part
        const base64Data = result.split(',')[1];
        if (base64Data) {
          setAttachments(prev => [...prev, {
            name: file.name,
            mimeType: file.type,
            data: base64Data
          }]);
        }
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // ── Send message (shared by form submit & quick reply click) ──────────────
  const sendMessage = useCallback(async (text: string) => {
    if ((!text.trim() && attachments.length === 0) || isTyping) return;

    // Dismiss quick reply chips after first message
    setQuickRepliesDismissed(true);

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    const currentAttachments = [...attachments]; // Capture for API
    setAttachments([]);
    setIsTyping(true);

    const apiBase = import.meta.env.VITE_API_URL || '';

    try {
      const response = await fetch(`${apiBase}/api/chat-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          attachments: currentAttachments.map(a => ({ mimeType: a.mimeType, data: a.data })),
          orgId,
          projectId,
          botName,
          company,
        }),
      });

      if (!response.ok || !response.body) {
        if (response.status === 413) {
          throw new Error('PAYLOAD_TOO_LARGE');
        }
        throw new Error('Failed to get streaming response');
      }

      const botMsg: Message = { role: 'bot', content: '', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);

      const reader   = response.body.getReader();
      const decoder  = new TextDecoder();
      let done       = false;
      let botContent = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.text) {
                botContent += data.text;
                let displayText = botContent;
                if (displayText.includes('|||LEAD|||')) {
                  displayText = displayText.replace('|||LEAD|||', '');
                  if (!leadSubmitted) setTimeout(() => setShowLeadForm(true), 1000);
                }
                setMessages(prev => {
                  const next = [...prev];
                  next[next.length - 1] = { ...next[next.length - 1], content: displayText };
                  return next;
                });
              }
              if (data.done && data.triggerLeadCapture && !leadSubmitted) {
                setTimeout(() => setShowLeadForm(true), 1000);
              }
            } catch (_) {}
          }
        }
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      let errorMsg = "I'm sorry, I encountered an error. Please try again in a moment.";
      if (error.message === 'PAYLOAD_TOO_LARGE') {
        errorMsg = "Mohon maaf, file gambar yang Anda kirimkan terlalu besar. Silakan kompres atau unggah gambar dengan ukuran di bawah 1 MB.";
      }
      setMessages(prev => [...prev, {
        role: 'bot',
        content: errorMsg,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [isTyping, messages, orgId, projectId, botName, company, leadSubmitted, attachments]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await sendMessage(input);
  };

  const handleQuickReply = (text: string) => {
    sendMessage(text);
  };

  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadData.name || !leadData.whatsapp) return;

    const rawNumber       = leadData.whatsapp.replace(/\D/g, '');
    const normalizedNumber = rawNumber.startsWith('0')
      ? '62' + rawNumber.substring(1)
      : rawNumber.startsWith('62')
      ? rawNumber
      : '62' + rawNumber;

    const apiBase = import.meta.env.VITE_API_URL || '';
    setIsSubmittingLead(true);
    try {
      const response = await fetch(`${apiBase}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        leadData.name,
          whatsapp:    normalizedNumber,
          orgId,
          botName,
          lastMessage: messages[messages.length - 1]?.content,
          history: messages,
        }),
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

  // ── Whether to show quick replies ─────────────────────────────────────────
  const showQuickReplies =
    !quickRepliesDismissed &&
    quickReplies.length > 0 &&
    messages.length <= 1;

  return (
    <div className="flex flex-col h-screen bg-white font-sans text-slate-900 overflow-hidden border-0">
      {/* Header */}
      <div
        className="p-4 flex items-center justify-between shadow-lg z-10"
        style={{ backgroundColor: themeColor }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm border-2 border-white/40 relative flex-shrink-0 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-0.5 rounded-full" />
            ) : (
              <Bot size={22} className="text-white" />
            )}
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full" />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">{botName}</h1>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
              <p className="text-white/70 text-[10px] font-medium">Online • Powered by PulseAI</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 relative">
          {/* ··· Menu */}
          <button
            className="p-2 text-white/70 hover:text-white transition-colors"
            onClick={() => setShowMenu(v => !v)}
          >
            <MoreHorizontal size={18} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute top-10 right-8 z-20 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 w-48 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    if (!leadSubmitted) setShowLeadForm(true);
                    else alert('Admin telah diberi tahu dan akan segera menghubungi Anda.');
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User size={13} />
                  Bicara dengan Manusia
                </button>
                <div className="h-px bg-slate-100 my-1" />
                <button
                  onClick={handleClearHistory}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={13} />
                  Hapus Riwayat Chat
                </button>
                <button
                  onClick={() => setShowMenu(false)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <MessageSquare size={13} />
                  Tutup Menu
                </button>
              </div>
            </>
          )}
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
                className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] overflow-hidden ${
                  msg.role === 'user' ? 'bg-slate-200 text-slate-600' : 'text-white'
                }`}
                style={msg.role === 'bot' && !logoUrl ? { backgroundColor: themeColor } : {}}
              >
                {msg.role === 'user' ? (
                  <User size={14} />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Bot" className="w-full h-full object-contain p-0.5" style={{ backgroundColor: themeColor }} />
                ) : (
                  <Bot size={14} />
                )}
              </div>
              <div
                className={`p-3 rounded-2xl text-sm shadow-sm ${
                  msg.role === 'user'
                    ? 'text-white rounded-tr-none leading-relaxed'
                    : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'
                }`}
                style={msg.role === 'user' ? { backgroundColor: themeColor } : {}}
              >
                {msg.role === 'user'
                  ? (
                    <div className="space-y-1">
                      {msg.attachments?.map((att, i) => (
                        <div key={i} className="mb-2">
                          {att.mimeType?.startsWith('image/') ? (
                            <img 
                              src={`data:${att.mimeType};base64,${att.data}`} 
                              alt={att.name || 'Image attachment'} 
                              className="max-w-full h-auto rounded-xl border border-white/20 shadow-sm max-h-48 object-cover" 
                            />
                          ) : (
                            <div className="text-xs bg-black/10 px-2 py-1 rounded flex items-center gap-1 inline-flex">
                              <Paperclip size={10} /> {att.name || 'Attachment'}
                            </div>
                          )}
                        </div>
                      ))}
                      <div>{msg.content || ''}</div>
                    </div>
                  )
                  : (
                    <div>
                      <div className="space-y-0.5 leading-relaxed">{renderMarkdown(msg.content || '')}</div>
                      {idx > 0 && (
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
                          <button 
                            onClick={async () => {
                              const newMsgs = [...messages];
                              newMsgs[idx].feedback = 'positive';
                              setMessages(newMsgs);
                              const apiBase = import.meta.env.VITE_API_URL || '';
                              fetch(`${apiBase}/api/feedback`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orgId, sessionId: localStorage.getItem(SESSION_KEY) || 'unknown', messageContent: msg.content, isPositive: true })
                              }).catch(()=>{});
                            }}
                            className={`text-[10px] flex items-center gap-1 transition-colors ${msg.feedback === 'positive' ? 'text-emerald-500 font-bold' : 'text-slate-400 hover:text-emerald-500'}`}
                          >
                            👍 Membantu
                          </button>
                          <button 
                            onClick={async () => {
                              const newMsgs = [...messages];
                              newMsgs[idx].feedback = 'negative';
                              setMessages(newMsgs);
                              const apiBase = import.meta.env.VITE_API_URL || '';
                              fetch(`${apiBase}/api/feedback`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orgId, sessionId: localStorage.getItem(SESSION_KEY) || 'unknown', messageContent: msg.content, isPositive: false })
                              }).catch(()=>{});
                            }}
                            className={`text-[10px] flex items-center gap-1 transition-colors ${msg.feedback === 'negative' ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-rose-500'}`}
                          >
                            👎 Kurang
                          </button>
                        </div>
                      )}
                    </div>
                  )
                }
              </div>
            </div>
          </div>
        ))}

        {/* Quick Reply Chips */}
        {showQuickReplies && (
          <div className="flex flex-wrap gap-2 mt-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {quickReplies.map((qr, i) => (
              <button
                key={i}
                onClick={() => handleQuickReply(qr)}
                disabled={isTyping}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold border-2 transition-all duration-150 hover:shadow-sm active:scale-95 disabled:opacity-50"
                style={{
                  borderColor: themeColor,
                  color: themeColor,
                  backgroundColor: 'white',
                }}
              >
                {qr}
              </button>
            ))}
          </div>
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start animate-in fade-in duration-200">
            <div className="flex gap-2 max-w-[85%]">
              <div
                className="w-7 h-7 rounded-full text-white flex items-center justify-center overflow-hidden"
                style={!logoUrl ? { backgroundColor: themeColor } : {}}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="Bot" className="w-full h-full object-contain p-0.5" style={{ backgroundColor: themeColor }} />
                ) : (
                  <Bot size={14} />
                )}
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
              <h3 className="text-xl font-bold mb-1">Tertarik dengan {company}?</h3>
              <p className="text-white/80 text-sm">Tinggalkan kontak Anda dan tim kami akan segera menghubungi.</p>
            </div>

            <div className="p-6">
              {leadSubmitted ? (
                <div className="text-center py-8 animate-in zoom-in duration-300">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">Terima Kasih!</h4>
                  <p className="text-sm text-slate-500">Tim kami akan segera menghubungi Anda.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitLead} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Nama Lengkap</label>
                    <input
                      type="text"
                      required
                      placeholder="contoh: Budi Santoso"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      value={leadData.name}
                      onChange={e => setLeadData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Nomor WhatsApp</label>
                    <input
                      type="tel"
                      required
                      placeholder="contoh: 081234567890"
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
                        Hubungi Tim Sales
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-center text-slate-400 leading-relaxed px-4">
                    Dengan mengirimkan form ini, Anda bersedia untuk dihubungi melalui WhatsApp atau Email.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-100 relative">
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {attachments.map((att, i) => (
              <div key={i} className="relative group shrink-0">
                {att.mimeType?.startsWith('image/') ? (
                  <img 
                    src={`data:${att.mimeType};base64,${att.data}`} 
                    alt={att.name || 'Preview'} 
                    className="w-12 h-12 object-cover rounded-lg border border-slate-200 shadow-sm"
                  />
                ) : (
                  <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded text-xs text-slate-600 shadow-sm border border-slate-200 h-12">
                    <span className="truncate max-w-[80px]">{att.name}</span>
                  </div>
                )}
                <button 
                  type="button" 
                  onClick={() => removeAttachment(i)} 
                  className="absolute -top-1.5 -right-1.5 bg-white text-rose-500 rounded-full shadow-md border border-slate-200 p-0.5 hover:scale-110 transition-transform"
                >
                  <X size={12}/>
                </button>
              </div>
            ))}
          </div>
        )}
        <form
          onSubmit={handleSendMessage}
          className="flex items-center gap-1 bg-slate-50 rounded-2xl pr-1.5 pl-2 py-1.5 border border-slate-200 focus-within:border-slate-300 transition-all"
        >
          <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={handleFileChange} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
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
            disabled={(!input.trim() && attachments.length === 0) || isTyping}
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
