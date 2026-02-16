import axios from 'axios';
import { appName, cloudServerUrl, serverAppId } from '../../../Utils.js';

const serverUrl = cloudServerUrl;
const appId = serverAppId;
const masterKey = process.env.MASTER_KEY;

// Constants (adjust to your preference)
export const OTP_LENGTH = 6;
export const OTP_EXPIRES_MIN = 10; // OTP validity in minutes
export const RESEND_COOLDOWN_SEC = 30; // Cooldown between OTP sends
export const MAX_ATTEMPTS = 5; // Max allowed wrong attempts

export function generateOtp(len = OTP_LENGTH) {
  // 6-digit numeric OTP (000000–999999, padded)
  const n = Math.floor(Math.random() * Math.pow(10, len));
  return String(n).padStart(len, '0');
}

export async function sendDeleteOtpEmail(extUser, otp) {
  const _extUser = extUser && JSON.parse(JSON.stringify(extUser));
  const params = {
    extUserId: extUser.id,
    from: appName,
    recipient: extUser?.get('Email'),
    subject: 'OTP for Deletion account request',
    applyBranding: true,
    brandingHeader: 'Verification code',
    brandingFooter: "If you didn't request this code, you can ignore this email.",
    html: `
<p>Your verification code is:</p>
<div style="display:inline-block;border:1px solid #e9ecf1;border-radius:6px;background:#f8fafc;padding:10px 14px;margin:10px 0;">
  <span style="font-family:Consolas,'Courier New',monospace;font-size:24px;letter-spacing:6px;color:#0f172a;">${otp}</span>
</div>
<p style="font-size:13px;color:#475569;">This code expires in <strong>${OTP_EXPIRES_MIN}</strong> minutes.</p>
`,
  };
  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': appId,
    'X-Parse-Master-Key': masterKey,
  };
  return axios.post(serverUrl + '/functions/sendmailv3', params, { headers });
}

export function msUntil(nowMs, futureMs) {
  return Math.max(0, (futureMs || 0) - nowMs);
}
