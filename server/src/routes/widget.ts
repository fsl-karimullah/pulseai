import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase';
import { resolveDefaultProjectId } from '../services/projects';

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
   *  - projectId: The Project ID (optional — new widget_channels embeds pass
   *    this directly; older snippets that only carry orgId keep resolving
   *    to that org's default project, unchanged)
   */
  fastify.get('/widget.js', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId, projectId, botName = 'Aria', company = 'PulseAI' } = request.query as Record<string, string>;

    let resolvedProjectId: string | undefined = projectId;
    if (!resolvedProjectId && orgId) {
      resolvedProjectId = (await resolveDefaultProjectId(orgId)) ?? undefined;
    }

    // Fetch branding and company info from DB
    let query = supabase
      .from('bot_settings')
      .select('color_theme, logo_url, org_id, project_id, widget_placement, organizations(name)')
      .single();

    if (resolvedProjectId) {
      query = supabase
        .from('bot_settings')
        .select('color_theme, logo_url, org_id, project_id, widget_placement, organizations(name)')
        .eq('project_id', resolvedProjectId)
        .single();
    } else {
      query = supabase
        .from('bot_settings')
        .select('color_theme, logo_url, org_id, project_id, widget_placement, organizations(name)')
        .eq('bot_name', botName)
        .single();
    }

    const { data: settings } = await query;

    const themeColor = settings?.color_theme || '#059669';
    const logoUrl = settings?.logo_url || '';
    const resolvedOrgId = orgId || settings?.org_id || '';
    resolvedProjectId = resolvedProjectId || settings?.project_id || '';
    // Use DB company name if available, fallback to query param, then PulseAI
    const resolvedCompany = (settings?.organizations as any)?.name || company || 'PulseAI';
    // Widget placement: 'bottom-right' (default) or 'bottom-left'
    const placement: 'bottom-right' | 'bottom-left' = (settings as any)?.widget_placement === 'bottom-left' ? 'bottom-left' : 'bottom-right';
    const hSide = placement === 'bottom-left' ? 'left' : 'right';
    const hValue = '20px';

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const widgetUrl = `${frontendUrl}/widget?orgId=${resolvedOrgId}&projectId=${resolvedProjectId}&botName=${encodeURIComponent(botName)}&company=${encodeURIComponent(resolvedCompany)}&color=${encodeURIComponent(themeColor)}&logo=${encodeURIComponent(logoUrl)}`;

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
    container.style.${hSide} = '${hValue}';
    container.style.display = 'block';
    container.style.visibility = 'visible';
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
    iframeContainer.style.${hSide} = '0';
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
    style.innerHTML = '@media (max-width: 450px) { #pulseai-chat-widget-container { bottom: 10px !important; ${hSide}: 10px !important; } #pulseai-chat-widget-container > div { position: fixed !important; bottom: 80px !important; ${hSide}: 10px !important; left: 10px !important; width: auto !important; height: calc(100vh - 100px) !important; } }';
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
