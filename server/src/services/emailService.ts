/**
 * emailService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin service layer around Resend for sending transactional HR emails
 * (e.g. CV screening decisions to candidates) so routes don't touch the
 * provider SDK directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resend, EMAIL_FROM } from '../config/email';

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  /** Optional decision banner (e.g. "STATUS: DITERIMA") shown above the body. */
  statusLabel?: string;
  /** Banner background color, e.g. '#059669'. Defaults to slate if omitted. */
  statusColor?: string;
  /** Overrides the platform default sender — e.g. an org's own verified domain. */
  from?: string;
  /** Routes candidate replies to the org's real contact email instead of the shared sender. */
  replyTo?: string;
}

function toHtml(body: string, statusLabel?: string, statusColor?: string): string {
  const htmlBody = body
    .split('\n')
    .map((line) => line.length ? line : '<br>')
    .join('<br>');

  if (!statusLabel) return htmlBody;

  const banner = `<div style="display:inline-block;background:${statusColor || '#64748b'};color:#ffffff;padding:10px 18px;border-radius:8px;font-weight:700;font-size:14px;margin-bottom:18px;">${statusLabel}</div><br><br>`;
  return banner + htmlBody;
}

function toText(body: string, statusLabel?: string): string {
  return statusLabel ? `${statusLabel}\n\n${body}` : body;
}

/**
 * Sends a single transactional email via Resend.
 * Throws if the provider rejects the send so callers can surface the failure.
 */
export async function sendEmail({ to, subject, body, statusLabel, statusColor, from, replyTo }: SendEmailParams): Promise<{ id: string }> {
  const { data, error } = await resend.emails.send({
    from: from || EMAIL_FROM,
    to,
    subject,
    html: toHtml(body, statusLabel, statusColor),
    text: toText(body, statusLabel),
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    throw new Error(`Resend failed to send email: ${error.message}`);
  }

  return { id: data?.id ?? '' };
}

/**
 * Sends up to 100 emails in a single Resend Batch API call — used for HR's
 * "send to all candidates" bulk action so it doesn't fire one HTTP request
 * per candidate (slow, and easy to hit per-request rate limits). Callers are
 * responsible for chunking payloads larger than 100 (Resend's batch limit).
 */
export async function sendBatchEmails(emails: SendEmailParams[]): Promise<void> {
  const payload = emails.map(({ to, subject, body, statusLabel, statusColor, from, replyTo }) => ({
    from: from || EMAIL_FROM,
    to,
    subject,
    html: toHtml(body, statusLabel, statusColor),
    text: toText(body, statusLabel),
    ...(replyTo ? { replyTo } : {}),
  }));

  const { error } = await resend.batch.send(payload);

  if (error) {
    throw new Error(`Resend failed to send batch emails: ${error.message}`);
  }
}
