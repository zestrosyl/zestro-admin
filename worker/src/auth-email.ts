import type { AuthEnv } from './auth-schema';

interface EmailEnv extends AuthEnv {
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

export async function sendInvitationEmail(
  env: EmailEnv,
  input: { to: string; name: string; token: string; expiresAt: string }
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    throw new Error('Invitation email transport is not configured.');
  }
  const appUrl = new URL(env.ADMIN_APP_URL);
  if (appUrl.protocol !== 'https:') throw new Error('Invitation link origin must use HTTPS.');
  const inviteUrl = new URL('/accept-invitation', appUrl);
  inviteUrl.searchParams.set('token', input.token);
  const name = escapeHtml(input.name);
  const expiry = new Date(input.expiresAt).toUTCString();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [input.to],
      subject: 'You are invited to ZESTRO Admin',
      text: `Hello ${input.name},\n\nYou have been invited to join a restaurant team on ZESTRO Admin. Set your password using this one-time link: ${inviteUrl.toString()}\n\nThe invitation expires at ${expiry}. If you were not expecting this invitation, you can ignore this email.`,
      html: `<p>Hello ${name},</p><p>You have been invited to join a restaurant team on ZESTRO Admin.</p><p><a href="${escapeHtml(inviteUrl.toString())}">Accept invitation and set your password</a></p><p>This link expires at ${escapeHtml(expiry)}. If you were not expecting this invitation, ignore this email.</p>`,
    }),
  });
  if (!response.ok) {
    // Do not include the recipient or token-bearing URL in logs/errors.
    throw new Error(`Resend invitation delivery failed with status ${response.status}.`);
  }
}
