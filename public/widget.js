/**
 * PulseAI Enterprise - Standalone Chat Widget
 * Embed this script on any website to add the AI assistant.
 * Usage: <script src="https://your-domain.com/widget.js" defer></script>
 */

(function () {
  // Prevent multiple initializations
  if (window.__PulseAIWidgetInitialized) return;
  window.__PulseAIWidgetInitialized = true;

  // Configuration
  const API_BASE = 'http://localhost:3001/api'; // Change this for production
  const BOT_NAME = 'Aria';
  const PRIMARY_COLOR = '#10b981'; // Emerald 500
  const TEXT_COLOR = '#0f172a'; // Slate 900
  const BG_COLOR = '#ffffff';

  class PulseAIWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.isOpen = false;
      this.isWaitingForLead = false;
      this.messages = [
        { role: 'assistant', content: `Hi there! I'm ${BOT_NAME}. How can I help you today?` }
      ];
      this.conversationId = crypto.randomUUID();
    }

    connectedCallback() {
      this.render();
      this.setupEventListeners();
    }

    render() {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            --primary: ${PRIMARY_COLOR};
            --text: ${TEXT_COLOR};
            --bg: ${BG_COLOR};
            --slate-50: #f8fafc;
            --slate-100: #f1f5f9;
            --slate-200: #e2e8f0;
            --slate-400: #94a3b8;
            --slate-500: #64748b;
            --slate-800: #1e293b;
            --slate-900: #0f172a;
            
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            font-family: system-ui, -apple-system, sans-serif;
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          /* Toggle Button */
          .toggle-btn {
            width: 60px;
            height: 60px;
            border-radius: 30px;
            background-color: var(--primary);
            color: white;
            border: none;
            cursor: pointer;
            box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .toggle-btn:hover {
            transform: scale(1.05);
          }
          .toggle-btn svg {
            width: 28px;
            height: 28px;
            fill: currentColor;
          }

          /* Chat Window */
          .chat-window {
            position: absolute;
            bottom: 80px;
            right: 0;
            width: 360px;
            height: 520px;
            background: var(--bg);
            border-radius: 16px;
            box-shadow: 0 20px 40px -10px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            opacity: 0;
            pointer-events: none;
            transform: translateY(20px) scale(0.95);
            transform-origin: bottom right;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          }
          .chat-window.open {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0) scale(1);
          }

          /* Header */
          .header {
            background: var(--slate-900);
            color: white;
            padding: 16px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .avatar {
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, var(--primary), #059669);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
          }
          .header-info {
            flex: 1;
          }
          .header-title {
            font-size: 16px;
            font-weight: 600;
            line-height: 1.2;
          }
          .header-subtitle {
            font-size: 12px;
            color: var(--slate-400);
            display: flex;
            align-items: center;
            gap: 4px;
            margin-top: 2px;
          }
          .status-dot {
            width: 6px;
            height: 6px;
            background: var(--primary);
            border-radius: 50%;
          }

          /* Messages Area */
          .messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            background: var(--slate-50);
          }
          .message {
            max-width: 85%;
            font-size: 14px;
            line-height: 1.5;
            padding: 12px 16px;
            border-radius: 16px;
            word-wrap: break-word;
          }
          .message.assistant {
            align-self: flex-start;
            background: white;
            color: var(--slate-800);
            border: 1px solid var(--slate-200);
            border-bottom-left-radius: 4px;
          }
          .message.user {
            align-self: flex-end;
            background: var(--primary);
            color: white;
            border-bottom-right-radius: 4px;
          }
          .loading-dots {
            display: flex;
            gap: 4px;
            padding: 4px;
          }
          .dot {
            width: 6px;
            height: 6px;
            background: var(--slate-400);
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out both;
          }
          .dot:nth-child(1) { animation-delay: -0.32s; }
          .dot:nth-child(2) { animation-delay: -0.16s; }
          @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
          }

          /* Input Area */
          .input-area {
            padding: 16px;
            background: white;
            border-top: 1px solid var(--slate-200);
          }
          .input-form {
            display: flex;
            gap: 8px;
          }
          .chat-input {
            flex: 1;
            border: 1px solid var(--slate-200);
            border-radius: 20px;
            padding: 10px 16px;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s;
            font-family: inherit;
          }
          .chat-input:focus {
            border-color: var(--primary);
          }
          .send-btn {
            width: 40px;
            height: 40px;
            border-radius: 20px;
            background: var(--primary);
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
          }
          .send-btn:hover {
            background: #059669;
          }
          .send-btn:disabled {
            background: var(--slate-300);
            cursor: not-allowed;
          }

          /* Lead Form */
          .lead-form-container {
            display: none;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
            background: white;
            border-top: 1px solid var(--slate-200);
            border-radius: 12px 12px 0 0;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.05);
          }
          .lead-form-container.active {
            display: flex;
          }
          .lead-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--slate-800);
            margin-bottom: 4px;
          }
          .lead-input {
            width: 100%;
            border: 1px solid var(--slate-200);
            border-radius: 8px;
            padding: 10px 12px;
            font-size: 14px;
            outline: none;
            font-family: inherit;
          }
          .lead-input:focus {
            border-color: var(--primary);
          }
          .lead-submit {
            background: var(--slate-900);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 4px;
          }
          .lead-submit:hover {
            background: var(--slate-800);
          }
          
          /* Footer */
          .footer {
            text-align: center;
            padding: 8px;
            font-size: 10px;
            color: var(--slate-400);
            background: white;
          }
          .footer a {
            color: var(--slate-400);
            text-decoration: none;
          }

          @media (max-width: 480px) {
            .chat-window {
              position: fixed;
              bottom: 0;
              right: 0;
              width: 100%;
              height: 100%;
              border-radius: 0;
            }
            .toggle-btn {
              display: none;
            }
          }
        </style>

        <div class="chat-window" id="chatWindow">
          <div class="header">
            <div class="avatar">${BOT_NAME[0]}</div>
            <div class="header-info">
              <div class="header-title">${BOT_NAME}</div>
              <div class="header-subtitle">
                <div class="status-dot"></div> Online
              </div>
            </div>
            <button id="closeBtn" style="background:none;border:none;color:white;cursor:pointer;padding:4px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <div class="messages" id="messagesContainer">
            <!-- Messages will be rendered here -->
          </div>

          <div class="lead-form-container" id="leadFormContainer">
            <div class="lead-title">Please provide your details so our team can follow up:</div>
            <input type="text" id="leadName" class="lead-input" placeholder="Your Name" required>
            <input type="tel" id="leadWhatsapp" class="lead-input" placeholder="WhatsApp Number" required>
            <button id="leadSubmitBtn" class="lead-submit">Submit Details</button>
          </div>

          <div class="input-area" id="inputArea">
            <form class="input-form" id="chatForm">
              <input type="text" id="chatInput" class="chat-input" placeholder="Type a message..." autocomplete="off">
              <button type="submit" class="send-btn" id="sendBtn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </form>
          </div>
          
          <div class="footer">
            Powered by <a href="#" target="_blank">PulseAI</a>
          </div>
        </div>

        <button class="toggle-btn" id="toggleBtn" aria-label="Toggle chat">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.2L4 17.2V4H20V16Z"/>
          </svg>
        </button>
      `;
    }

    setupEventListeners() {
      const toggleBtn = this.shadowRoot.getElementById('toggleBtn');
      const closeBtn = this.shadowRoot.getElementById('closeBtn');
      const chatForm = this.shadowRoot.getElementById('chatForm');
      const leadSubmitBtn = this.shadowRoot.getElementById('leadSubmitBtn');

      toggleBtn.addEventListener('click', () => this.toggleChat());
      closeBtn.addEventListener('click', () => this.toggleChat(false));
      chatForm.addEventListener('submit', (e) => this.handleSendMessage(e));
      leadSubmitBtn.addEventListener('click', () => this.handleLeadSubmit());

      this.renderMessages();
    }

    toggleChat(forceState) {
      this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
      const window = this.shadowRoot.getElementById('chatWindow');
      if (this.isOpen) {
        window.classList.add('open');
        setTimeout(() => this.shadowRoot.getElementById('chatInput').focus(), 300);
      } else {
        window.classList.remove('open');
      }
    }

    renderMessages() {
      const container = this.shadowRoot.getElementById('messagesContainer');
      container.innerHTML = this.messages.map(msg => `
        <div class="message ${msg.role}">
          ${this.escapeHTML(msg.content)}
        </div>
      `).join('');
      this.scrollToBottom();
    }

    showTypingIndicator() {
      const container = this.shadowRoot.getElementById('messagesContainer');
      const indicator = document.createElement('div');
      indicator.className = 'message assistant';
      indicator.id = 'typingIndicator';
      indicator.innerHTML = `
        <div class="loading-dots">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      `;
      container.appendChild(indicator);
      this.scrollToBottom();
    }

    hideTypingIndicator() {
      const indicator = this.shadowRoot.getElementById('typingIndicator');
      if (indicator) {
        indicator.remove();
      }
    }

    scrollToBottom() {
      const container = this.shadowRoot.getElementById('messagesContainer');
      container.scrollTop = container.scrollHeight;
    }

    escapeHTML(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\\n/g, '<br>');
    }

    setLeadMode(active) {
      this.isWaitingForLead = active;
      const inputArea = this.shadowRoot.getElementById('inputArea');
      const leadForm = this.shadowRoot.getElementById('leadFormContainer');
      
      if (active) {
        inputArea.style.display = 'none';
        leadForm.classList.add('active');
        setTimeout(() => this.shadowRoot.getElementById('leadName').focus(), 100);
      } else {
        inputArea.style.display = 'block';
        leadForm.classList.remove('active');
      }
    }

    async handleSendMessage(e) {
      e.preventDefault();
      if (this.isWaitingForLead) return;

      const input = this.shadowRoot.getElementById('chatInput');
      const sendBtn = this.shadowRoot.getElementById('sendBtn');
      const message = input.value.trim();

      if (!message) return;

      // Add user message
      this.messages.push({ role: 'user', content: message });
      input.value = '';
      this.renderMessages();

      // Lock input
      input.disabled = true;
      sendBtn.disabled = true;
      this.showTypingIndicator();

      try {
        const response = await fetch(\`\${API_BASE}/chat\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            history: this.messages.slice(0, -1), // Send history excluding the message we just added
            conversationId: this.conversationId,
            botName: BOT_NAME
          }),
        });

        const data = await response.json();
        this.hideTypingIndicator();

        if (data.success) {
          this.messages.push({ role: 'assistant', content: data.message });
          this.renderMessages();

          if (data.triggerLeadCapture) {
            this.setLeadMode(true);
          }
        } else {
          throw new Error(data.message || 'Error communicating with server');
        }
      } catch (error) {
        console.error('Chat error:', error);
        this.hideTypingIndicator();
        this.messages.push({ role: 'assistant', content: 'Sorry, I am having trouble connecting right now. Please try again later.' });
        this.renderMessages();
      } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        if (!this.isWaitingForLead) {
          input.focus();
        }
      }
    }

    async handleLeadSubmit() {
      const nameInput = this.shadowRoot.getElementById('leadName');
      const whatsappInput = this.shadowRoot.getElementById('leadWhatsapp');
      const submitBtn = this.shadowRoot.getElementById('leadSubmitBtn');

      const name = nameInput.value.trim();
      const whatsapp = whatsappInput.value.trim();

      if (!name || !whatsapp) {
        alert('Please fill in both name and WhatsApp number.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      // Find the last user message to provide context
      const lastUserMsg = [...this.messages].reverse().find(m => m.role === 'user');

      try {
        const response = await fetch(\`\${API_BASE}/leads\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            whatsapp,
            conversationId: this.conversationId,
            lastMessage: lastUserMsg ? lastUserMsg.content : ''
          }),
        });

        const data = await response.json();

        if (data.success) {
          this.setLeadMode(false);
          this.messages.push({ role: 'assistant', content: 'Thank you! Our team will reach out to you shortly via WhatsApp.' });
          this.renderMessages();
        } else {
          throw new Error(data.message || 'Failed to submit lead');
        }
      } catch (error) {
        console.error('Lead submission error:', error);
        alert('Sorry, there was an error submitting your details. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Details';
      }
    }
  }

  customElements.define('pulse-ai-widget', PulseAIWidget);

  // Auto-inject to body if not already present
  window.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('pulse-ai-widget')) {
      const widget = document.createElement('pulse-ai-widget');
      document.body.appendChild(widget);
    }
  });
})();
