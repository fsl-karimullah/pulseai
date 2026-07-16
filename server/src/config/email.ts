import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  console.error('[Email] CRITICAL: RESEND_API_KEY is not set. Sending emails will fail.');
}

/**
 * Server-side Resend client for transactional email (e.g. HR candidate notifications).
 */
export const resend = new Resend(resendApiKey || 'MISSING_KEY');

/** Verified "from" address/domain configured in the Resend dashboard. */
export const EMAIL_FROM = process.env.EMAIL_FROM || 'PulseAI HR <onboarding@resend.dev>';

/**
 * Builds a transparent "Company (via PulseAI)" sender display name that
 * shares the one verified platform address across every org. This is the
 * same "via" convention Google Workspace and multi-tenant ATS platforms
 * (Greenhouse, Lever, etc.) use when many tenants send from one domain —
 * candidates immediately see which company this is actually from, which
 * reads as more legitimate than a generic sender, not less, and mail
 * providers treat disclosed "on behalf of" sending as normal rather than
 * suspicious (unlike a From header that tries to impersonate the company).
 */
export function buildOrgSenderDisplay(orgName?: string | null): string {
  const addressMatch = EMAIL_FROM.match(/<(.+)>/);
  const address = addressMatch ? addressMatch[1] : EMAIL_FROM;
  const company = orgName?.trim() || 'HR';
  return `${company} (via PulseAI) <${address}>`;
}
