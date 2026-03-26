import axios from 'axios';
import { signPayload } from '../Utils.js';

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export function isWebhookEnabled() {
  return !!(WEBHOOK_URL && WEBHOOK_SECRET);
}

export async function dispatchWebhook(eventType, payload) {
  if (!isWebhookEnabled()) return;

  const body = {
    event: eventType,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  const startTime = Date.now();
  try {
    console.log(`[Webhook] Dispatching ${eventType} for document ${payload?.document?.id}`);
    const signatureHeaders = signPayload(body, WEBHOOK_SECRET);
    const response = await axios.post(WEBHOOK_URL, body, {
      headers: {
        'Content-Type': 'application/json',
        ...signatureHeaders,
      },
      timeout: 10000,
    });
    const elapsed = Date.now() - startTime;
    console.log(
      `[Webhook] Successfully delivered ${eventType} (${response.status}, ${elapsed}ms)`
    );
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (err.response) {
      console.error(
        `[Webhook] Failed to deliver ${eventType} — ${err.response.status} ${err.response.statusText} (${elapsed}ms)`
      );
    } else {
      console.error(
        `[Webhook] Error dispatching ${eventType} — ${err.code || err.message} (${elapsed}ms)`
      );
    }
  }
}
