import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "Clearway AI <no-reply@clearway.ai>";

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  return new Resend(process.env.RESEND_API_KEY);
}

interface ClientInviteEmailParams {
  to: string;
  businessName: string;
  ownerName: string | null;
  magicLink: string;
}

export async function sendClientInviteEmail({
  to,
  businessName,
  ownerName,
  magicLink,
}: ClientInviteEmailParams) {
  const name = ownerName ?? "there";

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; font-size: 14px; color: #0F172A; margin: 0; padding: 0; background: #F8FAFC;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding: 32px 16px;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background: #ffffff; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="padding: 24px 32px; border-bottom: 1px solid #E2E8F0;">
                <span style="font-size: 18px; font-weight: 600; color: #0F766E;">Clearway AI</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px;">
                <p style="margin: 0 0 16px;">Hi ${name},</p>
                <p style="margin: 0 0 16px;">
                  Your AI Business Audit for <strong>${businessName}</strong> has been initiated.
                  To proceed, please complete a short questionnaire (about 5 minutes).
                </p>
                <p style="margin: 0 0 24px;">Click the button below to get started. The link is valid for 24 hours.</p>
                <a href="${magicLink}"
                   style="display: inline-block; background: #0F766E; color: #ffffff; text-decoration: none;
                          padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                  Complete questionnaire
                </a>
                <p style="margin: 24px 0 0; font-size: 12px; color: #94A3B8;">
                  If the button doesn't work, copy and paste this link into your browser:<br>
                  <a href="${magicLink}" style="color: #0F766E;">${magicLink}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 32px; border-top: 1px solid #E2E8F0; background: #F8FAFC;">
                <p style="margin: 0; font-size: 12px; color: #94A3B8;">
                  You're receiving this email because Clearway AI is preparing your business audit.
                  If you have questions, contact your Clearway representative.
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Complete your Clearway AI business questionnaire — ${businessName}`,
    html,
  });
}

interface StaffAuditReadyParams {
  to: string | string[];
  businessName: string;
  auditId: string;
  flagged: boolean;
  appUrl: string;
}

export async function sendStaffAuditReadyEmail({
  to,
  businessName,
  auditId,
  flagged,
  appUrl,
}: StaffAuditReadyParams) {
  const link = `${appUrl}/audits/${auditId}`;
  const html = `
    <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#0F172A;background:#F8FAFC;margin:0;padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin:0 auto;">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #E2E8F0;"><span style="font-size:18px;font-weight:600;color:#0F766E;">Clearway AI</span></td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 12px;">${flagged ? "⚠️ " : ""}Audit ready for review: <strong>${businessName}</strong></p>
        ${flagged ? '<p style="margin:0 0 12px;color:#D97706;">This audit has been flagged for manual review.</p>' : ""}
        <a href="${link}" style="display:inline-block;background:#0F766E;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">Review audit →</a>
      </td></tr>
    </table>
    </body></html>
  `;
  return getResend().emails.send({
    from: FROM,
    to: Array.isArray(to) ? to : [to],
    subject: `${flagged ? "⚠️ " : ""}Audit ready for review — ${businessName}`,
    html,
  });
}

interface StaffApprovalConfirmParams {
  to: string;
  businessName: string;
  auditId: string;
  appUrl: string;
}

export async function sendStaffApprovalConfirmEmail({
  to,
  businessName,
  auditId,
  appUrl,
}: StaffApprovalConfirmParams) {
  const link = `${appUrl}/audits/${auditId}`;
  const html = `
    <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#0F172A;background:#F8FAFC;margin:0;padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin:0 auto;">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #E2E8F0;"><span style="font-size:18px;font-weight:600;color:#0F766E;">Clearway AI</span></td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 12px;">✅ Audit approved and sent: <strong>${businessName}</strong></p>
        <p style="margin:0 0 16px;color:#475569;">The client has been notified and their audit is now accessible.</p>
        <a href="${link}" style="display:inline-block;background:#0F766E;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">View audit →</a>
      </td></tr>
    </table>
    </body></html>
  `;
  return getResend().emails.send({
    from: FROM,
    to,
    subject: `Audit approved & sent — ${businessName}`,
    html,
  });
}

interface DeletionConfirmationParams {
  to: string;
  name: string | null;
  graceEndsAt: string;
}

export async function sendDeletionConfirmationEmail({
  to,
  name,
  graceEndsAt,
}: DeletionConfirmationParams) {
  const displayName = name ?? "there";
  const deadline = new Date(graceEndsAt).toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const html = `
    <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#0F172A;background:#F8FAFC;margin:0;padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin:0 auto;">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #E2E8F0;"><span style="font-size:18px;font-weight:600;color:#0F766E;">Clearway AI</span></td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 12px;">Hi ${displayName},</p>
        <p style="margin:0 0 12px;">We have received a request to permanently delete all data associated with your account.</p>
        <p style="margin:0 0 12px;"><strong>Your data will be permanently deleted on ${deadline}.</strong></p>
        <p style="margin:0 0 16px;">If you did not request this, or if you wish to cancel, please contact your Clearway representative immediately.</p>
        <p style="margin:0;font-size:12px;color:#94A3B8;">This is an automated message from Clearway AI in accordance with GDPR Article 17 (Right to Erasure).</p>
      </td></tr>
    </table>
    </body></html>
  `;
  return getResend().emails.send({
    from: FROM,
    to,
    subject: "Your data deletion request — Clearway AI",
    html,
  });
}
