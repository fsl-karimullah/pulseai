import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';

export default async function widgetRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/widget.js
   * 
   * Serves a vanilla Javascript snippet that injects a Chat Bubble and Iframe
   * into the host website.
   * 
   * Query params:
   *  - botName: The name of the bot
   *  - company: The company name
   *  - orgId: The organization ID
   */
  fastify.get('/widget.js', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId, botName = 'Aria', company = 'PulseAI' } = request.query as Record<string, string>;
    
    // Fetch branding from DB using orgId (preferred) or botName (legacy)
    let query = supabase.from('bot_settings').select('color_theme, logo_url, org_id');
    
    if (orgId) {
      query = query.eq('org_id', orgId);
    } else {
      query = query.eq('bot_name', botName);
    }

    const { data: settings } = await query.maybeSingle();

    const themeColor = settings?.color_theme || '#059669';
    const logoUrl = settings?.logo_url || '';
    const resolvedOrgId = orgId || settings?.org_id || '';

    const widgetUrl = `http://localhost:5173/widget?orgId=${resolvedOrgId}&botName=${encodeURIComponent(botName)}&company=${encodeURIComponent(company)}&color=${encodeURIComponent(themeColor)}&logo=${encodeURIComponent(logoUrl)}`;

    const scriptContent = `
(function() {
  function init() {
    if (document.getElementById('pulseai-chat-widget-container')) return;
    if (!document.body) {
      setTimeout(init, 50);
      return;
    }

    // 1. Create a container
    var container = document.createElement('div');
    container.id = 'pulseai-chat-widget-container';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.zIndex = '2147483647';
    container.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    // 2. Create the toggle button
    var btn = document.createElement('button');
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
    btn.style.width = '60px';
    btn.style.height = '60px';
    btn.style.borderRadius = '30px';
    btn.style.backgroundColor = '${themeColor}';
    btn.style.color = '#ffffff';
    btn.style.border = 'none';
    btn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    btn.style.cursor = 'pointer';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
    
    btn.onmouseover = function() { btn.style.transform = 'scale(1.05)'; };
    btn.onmouseout = function() { btn.style.transform = 'scale(1)'; };

    // 3. Create the hidden iframe
    var iframeContainer = document.createElement('div');
    iframeContainer.style.display = 'none';
    iframeContainer.style.position = 'absolute';
    iframeContainer.style.bottom = '80px';
    iframeContainer.style.right = '0';
    iframeContainer.style.width = '360px';
    iframeContainer.style.height = '600px';
    iframeContainer.style.backgroundColor = '#ffffff';
    iframeContainer.style.borderRadius = '16px';
    iframeContainer.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.15)';
    iframeContainer.style.overflow = 'hidden';
    iframeContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    iframeContainer.style.opacity = '0';
    iframeContainer.style.transform = 'translateY(10px)';

    // Handle small screens
    var style = document.createElement('style');
    style.innerHTML = '@media (max-width: 450px) { #pulseai-chat-widget-container { bottom: 10px !important; right: 10px !important; } #pulseai-chat-widget-container > div { position: fixed !important; bottom: 80px !important; right: 10px !important; left: 10px !important; width: auto !important; height: calc(100vh - 100px) !important; } }';
    document.head.appendChild(style);

    var iframe = document.createElement('iframe');
    iframe.src = '${widgetUrl}';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframeContainer.appendChild(iframe);

    container.appendChild(iframeContainer);
    container.appendChild(btn);
    document.body.appendChild(container);

    // 4. Toggle logic
    var isOpen = false;
    btn.onclick = function() {
      isOpen = !isOpen;
      if (isOpen) {
        iframeContainer.style.display = 'block';
        void iframeContainer.offsetWidth;
        iframeContainer.style.opacity = '1';
        iframeContainer.style.transform = 'translateY(0)';
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      } else {
        iframeContainer.style.opacity = '0';
        iframeContainer.style.transform = 'translateY(10px)';
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
        setTimeout(function() {
          iframeContainer.style.display = 'none';
        }, 300);
      }
    };

    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'PULSE_CHAT_CLOSE' && isOpen) {
        btn.click();
      }
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
`;

    reply.type('application/javascript').send(scriptContent);
  });
}
