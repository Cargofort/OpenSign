import axios from 'axios';
import crypto from 'node:crypto';
import { cloudServerUrl, serverAppId, color as signerColors } from '../../Utils.js';

const serverUrl = cloudServerUrl;
const appId = serverAppId;
const masterKey = process.env.MASTER_KEY;
const MAX_PDF_BASE64_CHARS = 28 * 1024 * 1024; // ~21MB decoded
const MAX_SIGNERS = 20;
const MAX_POSITIONS_PER_SIGNER = 50;
const MAX_TOTAL_POSITIONS = 400;
const MAX_PAGE_NUMBER = 5000;
const MAX_COORDINATE = 10000;
const MAX_WIDGET_DIMENSION = 2000;

function newRequestId() {
  // Keep it short (log-friendly).
  return crypto.randomBytes(8).toString('hex');
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || typeof v !== 'string' || !v.trim()) {
    throw new Parse.Error(500, `Missing required env var: ${name}`);
  }
  return v.trim();
}

function getHeader(request, name) {
  const h = request?.headers || {};
  const key = name.toLowerCase();
  return h[key] ?? h[name] ?? h[name.toUpperCase()];
}

function getBearerToken(request) {
  const auth = getHeader(request, 'authorization');
  if (!auth || typeof auth !== 'string') return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function formatAxiosError(err) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const msg =
    (typeof data === 'string' && data) ||
    data?.error ||
    data?.detail ||
    data?.message ||
    err?.message ||
    'Request failed';
  return { status, data, msg };
}

async function introspectAuthentikToken(accessToken) {
  const introspectionUrl = requireEnv('OAUTH_INTROSPECTION_URL');
  const clientId = requireEnv('OAUTH_CLIENT_ID');
  const clientSecret = requireEnv('OAUTH_CLIENT_SECRET');

  try {
    const body = new URLSearchParams({ token: accessToken }).toString();
    const resp = await axios.post(introspectionUrl, body, {
      timeout: 10_000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: {
        username: clientId,
        password: clientSecret,
      },
    });
    const data = resp?.data || {};
    const isActive = data.active === true || data.active === 'true';
    if (!isActive) {
      throw new Parse.Error(401, 'Invalid or expired token.');
    }

    // Best-effort guard: introspection responses vary by provider settings.
    if (data.client_id && typeof data.client_id === 'string' && data.client_id !== clientId) {
      throw new Parse.Error(403, 'Token is not valid for this client.');
    }
    return data;
  } catch (err) {
    if (err instanceof Parse.Error) throw err;
    const { status, msg } = formatAxiosError(err);
    // If introspection endpoint itself failed, surface that message (it's usually actionable).
    const code = status === 401 || status === 403 ? status : 401;
    throw new Parse.Error(code, `Token introspection failed: ${msg}`);
  }
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.toLowerCase().replace(/\s/g, '');
}

function safeFilenameBase(input) {
  const base = typeof input === 'string' ? input.trim() : '';
  const ascii = base.replace(/[^\x20-\x7E]/g, '');
  const cleaned = ascii
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.slice(0, 80) || `sdk-${Date.now()}`;
}

function coerceNumber(v, fieldName) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Parse.Error(400, `Invalid number for ${fieldName}`);
  }
  return n;
}

function parseStrictBoolean(value, fieldName) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  throw new Parse.Error(400, `${fieldName} must be a boolean`);
}

export function validateMetadata(metadata) {
  if (metadata === undefined) return undefined;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Parse.Error(400, 'metadata must be a plain JSON object');
  }
  return metadata;
}

function validatePdfBase64Size(pdfBase64) {
  if (typeof pdfBase64 !== 'string') return;
  if (pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    throw new Parse.Error(400, 'pdf_base64 exceeds maximum allowed size.');
  }
}

function validatePosition(p, signerIdx, positionIdx) {
  const page = coerceNumber(p?.page, `signers[${signerIdx}].positions[${positionIdx}].page`);
  const x = coerceNumber(p?.x, `signers[${signerIdx}].positions[${positionIdx}].x`);
  const y = coerceNumber(p?.y, `signers[${signerIdx}].positions[${positionIdx}].y`);
  const width = coerceNumber(p?.width, `signers[${signerIdx}].positions[${positionIdx}].width`);
  const height = coerceNumber(p?.height, `signers[${signerIdx}].positions[${positionIdx}].height`);

  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE_NUMBER) {
    throw new Parse.Error(400, `signers[${signerIdx}].positions[${positionIdx}].page is out of range`);
  }
  if (x < 0 || x > MAX_COORDINATE || y < 0 || y > MAX_COORDINATE) {
    throw new Parse.Error(400, `signers[${signerIdx}].positions[${positionIdx}] coordinates are out of range`);
  }
  if (width <= 0 || width > MAX_WIDGET_DIMENSION || height <= 0 || height > MAX_WIDGET_DIMENSION) {
    throw new Parse.Error(400, `signers[${signerIdx}].positions[${positionIdx}] size is out of range`);
  }
}

function resolvePublicOrigin() {
  const configuredPublicUrl = process.env.PUBLIC_URL;
  if (configuredPublicUrl && typeof configuredPublicUrl === 'string' && configuredPublicUrl.trim()) {
    return configuredPublicUrl.trim().replace(/\/$/, '');
  }
  return '';
}

function groupPositionsByPage(positions) {
  const byPage = new Map();
  for (const p of positions) {
    const page = coerceNumber(p?.page, 'positions[].page');
    if (page < 1) throw new Parse.Error(400, 'positions[].page must be >= 1');
    const entry = byPage.get(page) || [];
    entry.push(p);
    byPage.set(page, entry);
  }
  return [...byPage.entries()].sort((a, b) => a[0] - b[0]);
}

async function loginAsUser(userId) {
  if (!masterKey) {
    throw new Parse.Error(500, 'MASTER_KEY is not configured on the server.');
  }
  const loginAsRes = await axios({
    method: 'POST',
    url: `${serverUrl}/loginAs`,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'X-Parse-Application-Id': appId,
      'X-Parse-Master-Key': masterKey,
    },
    params: { userId },
    timeout: 10_000,
  });
  const sessionToken = loginAsRes?.data?.sessionToken;
  if (!sessionToken) throw new Parse.Error(500, 'Failed to obtain admin session.');
  return sessionToken;
}

async function getAdminContext() {
  const adminEmail = normalizeEmail(process.env.SDK_ACT_AS_ADMIN_EMAIL);
  if (!adminEmail) {
    throw new Parse.Error(500, 'SDK_ACT_AS_ADMIN_EMAIL is not configured.');
  }

  let adminUser = await new Parse.Query(Parse.User)
    .equalTo('username', adminEmail)
    .first({ useMasterKey: true });
  if (!adminUser) {
    adminUser = await new Parse.Query(Parse.User).equalTo('email', adminEmail).first({ useMasterKey: true });
  }
  if (!adminUser) {
    throw new Parse.Error(404, `Admin user not found for ${adminEmail}`);
  }

  const sessionToken = await loginAsUser(adminUser.id);

  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': appId,
    'X-Parse-Session-Token': sessionToken,
    sessiontoken: sessionToken, // legacy header used by some cloud functions
  };

  const extUserRes = await axios.post(`${serverUrl}/functions/getUserDetails`, {}, { headers, timeout: 10_000 });
  const extUser = extUserRes?.data?.result;
  if (!extUser?.objectId) {
    throw new Parse.Error(500, 'Failed to resolve admin extended user (contracts_Users).');
  }
  const tenantId = extUser?.TenantId?.objectId || '';
  if (!tenantId) {
    throw new Parse.Error(500, 'Admin tenantId not found.');
  }

  return {
    adminUserId: adminUser.id,
    sessionToken,
    extUser,
    tenantId,
  };
}

async function ensureContact({ adminUserId, sessionToken, tenantId, name, email }) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Parse-Application-Id': appId,
    'X-Parse-Session-Token': sessionToken,
    sessiontoken: sessionToken,
  };

  try {
    const res = await axios.post(
      `${serverUrl}/functions/savecontact`,
      { name, email, tenantId },
      { headers, timeout: 15_000 }
    );
    const contact = res?.data?.result;
    if (!contact?.objectId) {
      throw new Parse.Error(500, 'Failed to create signer contact.');
    }
    return contact;
  } catch (err) {
    const code = err?.response?.data?.code ?? err?.response?.status ?? err?.code;
    const message = err?.response?.data?.error ?? err?.message ?? 'Failed to create signer contact.';

    // savecontact throws DUPLICATE_VALUE for existing contacts; in that case, fetch and reuse it.
    if (code === Parse.Error.DUPLICATE_VALUE || String(message).toLowerCase().includes('already exists')) {
      const q = new Parse.Query('contracts_Contactbook');
      q.equalTo('CreatedBy', { __type: 'Pointer', className: '_User', objectId: adminUserId });
      q.notEqualTo('IsDeleted', true);
      q.equalTo('Email', email);
      const existing = await q.first({ useMasterKey: true });
      if (existing) return JSON.parse(JSON.stringify(existing));
    }

    if (err instanceof Parse.Error) throw err;
    throw new Parse.Error(400, message);
  }
}

function buildPlaceholderPages(positions) {
  const grouped = groupPositionsByPage(positions);
  return grouped.map(([pageNumber, pagePositions]) => ({
    pageNumber,
    pos: pagePositions.map((p) => ({
      key: crypto.randomBytes(12).toString('hex'),
      type: 'signature',
      xPosition: coerceNumber(p?.x, 'positions[].x'),
      yPosition: coerceNumber(p?.y, 'positions[].y'),
      Width: coerceNumber(p?.width, 'positions[].width'),
      Height: coerceNumber(p?.height, 'positions[].height'),
      scale: 1,
      zIndex: 1,
      options: { name: '', status: 'required' },
    })),
  }));
}

function pickRandomBlockColor() {
  const palette = Array.isArray(signerColors) && signerColors.length > 0 ? signerColors : ['#edf6fc'];
  // crypto.randomInt is available in modern Node; fallback to a bytes-based modulus.
  if (typeof crypto.randomInt === 'function') {
    return palette[crypto.randomInt(0, palette.length)];
  }
  const n = crypto.randomBytes(4).readUInt32BE(0);
  return palette[n % palette.length];
}

/**
 * Public API entrypoint (Parse Cloud Function).
 *
 * Call via:
 *   POST /api/app/functions/sdkSignRequests
 * Headers:
 *   Authorization: Bearer <Authentik client_credentials access token>
 *   X-Parse-Application-Id: <app id>
 */
export default async function sdkSignRequests(request) {
  const reqId = newRequestId();
  try {
    // The UI route used to manage/request signatures is /placeHolderSign/:docId
    const publicOrigin = resolvePublicOrigin();

    const accessToken = getBearerToken(request);
    if (!accessToken) {
      throw new Parse.Error(401, 'Missing Authorization: Bearer token.');
    }

    await introspectAuthentikToken(accessToken);

    const title = (request.params?.title || request.params?.Name || '').toString().trim();
    const description = (request.params?.description || '').toString().trim();
    const sendInOrder =
      request.params?.send_in_order === undefined
        ? true
        : parseStrictBoolean(request.params?.send_in_order, 'send_in_order');
    const pdfBase64 = request.params?.pdf_base64;
    const signers = Array.isArray(request.params?.signers) ? request.params.signers : [];
    const callbackUrl = request.params?.callback_url ?? null;
    if (callbackUrl !== null) {
      if (typeof callbackUrl !== 'string' || callbackUrl.length > 2048)
        throw new Parse.Error(400, 'callback_url must be a string <= 2048 chars');
      if (!callbackUrl.startsWith('https://'))
        throw new Parse.Error(400, 'callback_url must be an HTTPS URL');
    }

    const metadata = validateMetadata(request.params?.metadata);

    if (!title) throw new Parse.Error(400, 'title is required');
    if (title.length > 250) throw new Parse.Error(400, 'title must be <= 250 characters');
    if (description.length > 500) throw new Parse.Error(400, 'description must be <= 500 characters');
    if (!pdfBase64 || typeof pdfBase64 !== 'string') throw new Parse.Error(400, 'pdf_base64 is required');
    if (signers.length === 0) throw new Parse.Error(400, 'signers must be a non-empty array');
    if (signers.length > MAX_SIGNERS) throw new Parse.Error(400, `signers must be <= ${MAX_SIGNERS}`);
    validatePdfBase64Size(pdfBase64);

    const { adminUserId, sessionToken, extUser, tenantId } = await getAdminContext();

    // 1) Upload PDF via existing savefile (keeps flattening behavior).
    const fileName = `${safeFilenameBase(title)}.pdf`;
    const parseHeaders = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': appId,
      'X-Parse-Session-Token': sessionToken,
      sessiontoken: sessionToken,
      ...(publicOrigin ? { public_url: publicOrigin } : {}),
    };

    let pdfUrl = '';
    try {
      const saveFileRes = await axios.post(
        `${serverUrl}/functions/savefile`,
        { fileBase64: pdfBase64, fileName },
        { headers: parseHeaders, timeout: 60_000 }
      );
      pdfUrl = saveFileRes?.data?.result?.url || '';
    } catch (err) {
      const { status, msg, data } = formatAxiosError(err);
      console.error(`[sdkSignRequests:${reqId}] savefile failed`, { status, msg, data });
      throw new Parse.Error(400, `savefile failed: ${msg}`);
    }
    if (!pdfUrl) throw new Parse.Error(500, 'Failed to upload PDF.');

    // 2) Ensure signers exist as contracts_Contactbook entries (created by admin).
    const signerContacts = [];
    const placeholders = [];

    let totalPositions = 0;
    for (let i = 0; i < signers.length; i++) {
      const s = signers[i] || {};
      const email = normalizeEmail(s.email);
      const name = (s.name || '').toString().trim() || email;
      if (!email || !email.includes('@')) throw new Parse.Error(400, `Invalid signer email at index ${i}`);
      if (!name) throw new Parse.Error(400, `Missing signer name at index ${i}`);

      const positions = Array.isArray(s.positions) ? s.positions : [];
      if (positions.length === 0) {
        throw new Parse.Error(400, `signers[${i}].positions must be a non-empty array`);
      }
      if (positions.length > MAX_POSITIONS_PER_SIGNER) {
        throw new Parse.Error(
          400,
          `signers[${i}].positions must be <= ${MAX_POSITIONS_PER_SIGNER}`
        );
      }
      const unsupported = positions.find((p) => (p?.position_type || 'signature') !== 'signature');
      if (unsupported) {
        throw new Parse.Error(400, 'Only position_type="signature" is supported in v1.');
      }
      for (let j = 0; j < positions.length; j++) {
        validatePosition(positions[j], i, j);
      }
      totalPositions += positions.length;
      if (totalPositions > MAX_TOTAL_POSITIONS) {
        throw new Parse.Error(400, `Total positions must be <= ${MAX_TOTAL_POSITIONS}`);
      }

      const contact = await ensureContact({
        adminUserId,
        sessionToken,
        tenantId,
        name,
        email,
      });

      signerContacts.push(contact);

      const roleLabel = (s.role || `Signer ${i + 1}`).toString().trim() || `Signer ${i + 1}`;
      const blockColor = pickRandomBlockColor();
      placeholders.push({
        Id: String(i + 1),
        Role: roleLabel,
        blockColor,
        signerPtr: contact, // createBatchDocs will convert to pointer if objectId exists
        signerObjId: contact.objectId,
        email,
        placeHolder: buildPlaceholderPages(positions),
      });
    }

    // 3) Create/send document using existing batchdocuments function.
    const doc = {
      Name: title,
      Note: '',
      Description: description,
      URL: pdfUrl,
      CreatedBy: { __type: 'Pointer', className: '_User', objectId: adminUserId },
      ExtUserPtr: extUser, // must include TenantId for email templates (as in UI flow)
      Placeholders: placeholders,
      Signers: signerContacts, // pass full objects so ACL creation can include signer CreatedBy pointers
      SendinOrder: sendInOrder,
      TimeToCompleteDays: 15,
      AutomaticReminders: false,
      ...(callbackUrl ? { CallbackUrl: callbackUrl } : {}),
      ...(metadata ? { Metadata: metadata } : {}),
    };

    let documentId = '';
    try {
      const batchRes = await axios.post(
        `${serverUrl}/functions/batchdocuments`,
        { Documents: JSON.stringify([doc]) },
        { headers: parseHeaders, timeout: 60_000 }
      );
      const result = batchRes?.data?.result;
      documentId = typeof result === 'string' ? result : result?.documentId || result?.objectId || '';
    } catch (err) {
      const { status, msg, data } = formatAxiosError(err);
      console.error(`[sdkSignRequests:${reqId}] batchdocuments failed`, { status, msg, data });
      throw new Parse.Error(400, `batchdocuments failed: ${msg}`);
    }

    if (!documentId || documentId === 'success') {
      throw new Parse.Error(500, 'Failed to create document.');
    }

    const documentUrl = publicOrigin ? `${publicOrigin}/placeHolderSign/${documentId}` : '';
    return { documentId, documentUrl };
  } catch (err) {
    // Ensure Parse receives a Parse.Error (otherwise it becomes code 141 with poor context).
    if (err instanceof Parse.Error) {
      // Add correlation id so you can find it in server logs.
      throw new Parse.Error(err.code, `${err.message} (reqId=${reqId})`);
    }
    const msg = err?.message || String(err);
    console.error(`[sdkSignRequests:${reqId}] Unexpected error`, err);
    throw new Parse.Error(400, `${msg} (reqId=${reqId})`);
  }
}

