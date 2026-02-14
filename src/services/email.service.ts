import { Resend } from 'resend';
import { env } from '../utils/env.js';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Send a notification email when an OpenClaw deployment is ready.
 */
export async function sendOpenClawReadyEmail(
  to: string,
  deploymentId: string,
  hostname: string
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log('[email] RESEND_API_KEY not configured, skipping ready email');
    return;
  }

  const frontendUrl = env.FRONTEND_URL || 'https://heyvincent.ai';
  const dashboardLink = `${frontendUrl}/openclaw/${deploymentId}`;

  const { error } = await resend.emails.send({
    from: 'Vincent <notifications@heyvincent.ai>',
    to: [to],
    subject: 'Your agent is ready!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Your agent instance is ready</h1>
        <p style="font-size: 16px; color: #374151; line-height: 1.5; margin-bottom: 24px;">
          Your agent deployment has finished provisioning and is live.  Visit the dashboard to complete Telegram setup so you can chat with your agent anywhere.
        </p>
        <a href="${dashboardLink}"
           style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 500;">
          Open in Dashboard
        </a>
        <p style="font-size: 14px; color: #6b7280; margin-top: 32px; line-height: 1.5;">
          You can also manage your instance, view usage, and add credits from your
          <a href="${frontendUrl}/dashboard" style="color: #2563eb; text-decoration: none;">Vincent dashboard</a>.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('[email] Failed to send OpenClaw ready email:', error);
  } else {
    console.log(`[email] OpenClaw ready email sent to ${to}`);
  }
}

/**
 * Send a notification email when a referral reward is applied.
 */
export async function sendReferralRewardEmail(
  to: string,
  amountUsd: number
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log('[email] RESEND_API_KEY not configured, skipping referral reward email');
    return;
  }

  const frontendUrl = env.FRONTEND_URL || 'https://heyvincent.ai';

  const { error } = await resend.emails.send({
    from: 'Vincent <notifications@heyvincent.ai>',
    to: [to],
    subject: `You earned $${amountUsd} in LLM credits!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Referral reward applied</h1>
        <p style="font-size: 16px; color: #374151; line-height: 1.5; margin-bottom: 24px;">
          Someone you referred just made their first payment on Vincent. We've added <strong>$${amountUsd.toFixed(2)}</strong> in LLM credits to your agent deployment.
        </p>
        <a href="${frontendUrl}/account"
           style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 500;">
          View Account
        </a>
        <p style="font-size: 14px; color: #6b7280; margin-top: 32px; line-height: 1.5;">
          Keep sharing your referral link to earn more credits. You can find it on your
          <a href="${frontendUrl}/account" style="color: #2563eb; text-decoration: none;">account page</a>.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('[email] Failed to send referral reward email:', error);
  } else {
    console.log(`[email] Referral reward email sent to ${to}`);
  }
}
