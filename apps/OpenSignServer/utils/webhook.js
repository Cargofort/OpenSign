import axios from 'axios';
import { signPayload } from '../Utils.js';

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export function isWebhookEnabled() {
  return !!(WEBHOOK_URL && WEBHOOK_SECRET);
}

async function postToUrl(url, body, secret) {
  const startTime = Date.now();
  const headers = { 'Content-Type': 'application/json' };
  if (secret) {
    Object.assign(headers, signPayload(body, secret));
  }
  try {
    console.log(`[Webhook] Dispatching ${body.event} to ${url}`);
    const response = await axios.post(url, body, { headers, timeout: 10000 });
    const elapsed = Date.now() - startTime;
    console.log(
      `[Webhook] Successfully delivered ${body.event} to ${url} (${response.status}, ${elapsed}ms)`
    );
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (err.response) {
      console.error(
        `[Webhook] Failed to deliver ${body.event} to ${url} — ${err.response.status} ${err.response.statusText} (${elapsed}ms)`
      );
    } else {
      console.error(
        `[Webhook] Error dispatching ${body.event} to ${url} — ${err.code || err.message} (${elapsed}ms)`
      );
    }
  }
}

export async function dispatchWebhook(eventType, payload, callbackUrl) {
  const body = {
    event: eventType,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  const dispatches = [];

  if (isWebhookEnabled()) {
    dispatches.push(postToUrl(WEBHOOK_URL, body, WEBHOOK_SECRET));
  }

  if (callbackUrl) {
    dispatches.push(postToUrl(callbackUrl, body, WEBHOOK_SECRET || null));
  }

  await Promise.all(dispatches);
}
