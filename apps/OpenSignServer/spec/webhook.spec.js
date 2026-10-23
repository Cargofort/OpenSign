import crypto from 'node:crypto';
import axios from 'axios';

// webhook.js reads WEBHOOK_URL/WEBHOOK_SECRET at import time, so each case imports a fresh copy.
let importCount = 0;
async function loadWebhook({ url, secret } = {}) {
  const saved = { url: process.env.WEBHOOK_URL, secret: process.env.WEBHOOK_SECRET };
  if (url) process.env.WEBHOOK_URL = url;
  else delete process.env.WEBHOOK_URL;
  if (secret) process.env.WEBHOOK_SECRET = secret;
  else delete process.env.WEBHOOK_SECRET;
  try {
    importCount += 1;
    return await import(`../utils/webhook.js?case=${importCount}`);
  } finally {
    if (saved.url === undefined) delete process.env.WEBHOOK_URL;
    else process.env.WEBHOOK_URL = saved.url;
    if (saved.secret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = saved.secret;
  }
}

const sign = (body, secret) =>
  crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');

describe('dispatchWebhook', () => {
  let postSpy;

  beforeEach(() => {
    postSpy = spyOn(axios, 'post').and.resolveTo({ status: 200 });
    spyOn(console, 'log');
    spyOn(console, 'error');
  });

  it('posts a signed payload to WEBHOOK_URL', async () => {
    const { dispatchWebhook, isWebhookEnabled } = await loadWebhook({
      url: 'https://hooks.example.com/opensign',
      secret: 's3cret',
    });
    expect(isWebhookEnabled()).toBe(true);

    await dispatchWebhook('document.signed', { docId: 'doc1' });

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, body, options] = postSpy.calls.mostRecent().args;
    expect(url).toBe('https://hooks.example.com/opensign');
    expect(body).toEqual(
      jasmine.objectContaining({ event: 'document.signed', docId: 'doc1', timestamp: jasmine.any(String) })
    );
    expect(options.headers['x-webhook-signature']).toBe(sign(body, 's3cret'));
    expect(options.timeout).toBe(10000);
  });

  it('also posts to the per-document callback URL', async () => {
    const { dispatchWebhook } = await loadWebhook({
      url: 'https://hooks.example.com/opensign',
      secret: 's3cret',
    });

    await dispatchWebhook('document.completed', { docId: 'doc1' }, 'https://client.example.com/cb');

    const urls = postSpy.calls.allArgs().map(args => args[0]);
    expect(urls).toEqual(['https://hooks.example.com/opensign', 'https://client.example.com/cb']);
    const callbackArgs = postSpy.calls.allArgs()[1];
    expect(callbackArgs[2].headers['x-webhook-signature']).toBe(sign(callbackArgs[1], 's3cret'));
  });

  it('sends nothing when no global webhook and no callback URL are configured', async () => {
    const { dispatchWebhook, isWebhookEnabled } = await loadWebhook();
    expect(isWebhookEnabled()).toBe(false);

    await dispatchWebhook('document.signed', { docId: 'doc1' });

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('posts an unsigned payload to the callback URL when no secret is configured', async () => {
    const { dispatchWebhook } = await loadWebhook();

    await dispatchWebhook('document.signed', { docId: 'doc1' }, 'https://client.example.com/cb');

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, , options] = postSpy.calls.mostRecent().args;
    expect(url).toBe('https://client.example.com/cb');
    expect(options.headers['x-webhook-signature']).toBeUndefined();
  });

  it('does not throw when delivery fails', async () => {
    postSpy.and.rejectWith(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    const { dispatchWebhook } = await loadWebhook({
      url: 'https://hooks.example.com/opensign',
      secret: 's3cret',
    });

    await expectAsync(dispatchWebhook('document.signed', { docId: 'doc1' })).toBeResolved();
  });
});
