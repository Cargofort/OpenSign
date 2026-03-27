# Sign Request Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `metadata` field to the SDK sign request API that is stored on the document and echoed in both `document.signed` and `document.completed` webhook payloads, enabling n8n to file signed documents back into the correct CRM record automatically.

**Architecture:** Accept `metadata` (plain JSON object) in `sdkSignRequests`, store it as `Metadata` on `contracts_Document` via the existing `batchdocuments` path, and spread it into the three `dispatchWebhook` call sites in `PDF.js` when present. No schema migration needed (Parse Server is schema-free). No frontend changes.

**Tech Stack:** Node.js ES modules, Parse Server 8.x cloud functions, Jasmine test runner, existing `dispatchWebhook` utility.

**Spec:** `docs/superpowers/specs/2026-03-27-sign-request-metadata-design.md`

---

### Task 1: Validate and accept `metadata` in `sdkSignRequests.js`

Extract a testable validation helper, add the param read + validation, and thread `Metadata` into the `doc` object that gets sent to `batchdocuments`.

**Files:**
- Modify: `apps/OpenSignServer/cloud/parsefunction/sdkSignRequests.js:308-345` (param reading block) and `:430-443` (doc object construction)
- Create: `apps/OpenSignServer/spec/sdkSignRequests.metadata.spec.js`

- [ ] **Step 1: Write the failing test**

Create `apps/OpenSignServer/spec/sdkSignRequests.metadata.spec.js`:

```javascript
// Unit tests for the metadata validation logic.
// These test the pure helper in isolation — no Parse Server needed.

function validateMetadata(metadata) {
  // placeholder — will be replaced by the real import once extracted
  throw new Error('not implemented');
}

describe('validateMetadata', () => {
  it('returns undefined when metadata is undefined (omitted)', () => {
    expect(validateMetadata(undefined)).toBeUndefined();
  });

  it('returns the object when metadata is a plain object', () => {
    const m = { crm_id: 'XYZ', crm_company_id: 'ZYS' };
    expect(validateMetadata(m)).toEqual(m);
  });

  it('returns the object when metadata is an empty object', () => {
    expect(validateMetadata({})).toEqual({});
  });

  it('throws Parse.Error 400 when metadata is null', () => {
    expect(() => validateMetadata(null)).toThrowError();
  });

  it('throws Parse.Error 400 when metadata is an array', () => {
    expect(() => validateMetadata(['a', 'b'])).toThrowError();
  });

  it('throws Parse.Error 400 when metadata is a string', () => {
    expect(() => validateMetadata('hello')).toThrowError();
  });

  it('throws Parse.Error 400 when metadata is a number', () => {
    expect(() => validateMetadata(42)).toThrowError();
  });

  it('throws Parse.Error 400 when metadata is a boolean', () => {
    expect(() => validateMetadata(true)).toThrowError();
  });
});
```

> **Note:** This spec file stubs the function inline at first. You will replace the stub with a real import after extracting the helper in Step 3.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/OpenSignServer && npm test -- --filter="validateMetadata" 2>&1 | head -40
```

Expected: The 3 success-case tests (`toBeUndefined`, `toEqual`) fail. The 5 `toThrowError` cases pass because the stub throws. This confirms the test runner is wired up correctly.

- [ ] **Step 3: Extract `validateMetadata` and add `metadata` handling in `sdkSignRequests.js`**

In `apps/OpenSignServer/cloud/parsefunction/sdkSignRequests.js`:

**3a.** Add the exported helper after the existing helper functions (after `coerceNumber`, before `validatePdfBase64Size`, around line 125):

```javascript
export function validateMetadata(metadata) {
  if (metadata === undefined) return undefined;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Parse.Error(400, 'metadata must be a plain JSON object');
  }
  return metadata;
}
```

**3b.** In the `sdkSignRequests` function, after the `callbackUrl` validation block (after line 335) and before the `if (!title)` checks, add:

```javascript
const metadata = validateMetadata(request.params?.metadata);
```

**3c.** In the `doc` object construction (around line 442 of `sdkSignRequests.js`, after the `callbackUrl` spread on that same line), add:

```javascript
...(metadata ? { Metadata: metadata } : {}),
```

The complete `doc` object after the change:

```javascript
const doc = {
  Name: title,
  Note: '',
  Description: description,
  URL: pdfUrl,
  CreatedBy: { __type: 'Pointer', className: '_User', objectId: adminUserId },
  ExtUserPtr: extUser,
  Placeholders: placeholders,
  Signers: signerContacts,
  SendinOrder: sendInOrder,
  TimeToCompleteDays: 15,
  AutomaticReminders: false,
  ...(callbackUrl ? { CallbackUrl: callbackUrl } : {}),
  ...(metadata ? { Metadata: metadata } : {}),
};
```

- [ ] **Step 4: Update the test to import the real helper**

Replace the stub at the top of `apps/OpenSignServer/spec/sdkSignRequests.metadata.spec.js` with the real import:

```javascript
import { validateMetadata } from '../cloud/parsefunction/sdkSignRequests.js';
```

Remove the inline stub function that was there before.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/OpenSignServer && npm test -- --filter="validateMetadata" 2>&1 | head -40
```

Expected: All 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/OpenSignServer/cloud/parsefunction/sdkSignRequests.js \
        apps/OpenSignServer/spec/sdkSignRequests.metadata.spec.js
git commit -m "feat(metadata): accept and validate metadata in sdkSignRequests"
```

---

### Task 2: Pass `Metadata` through `createBatchDocs.js`

One line addition in `startBulkSendInBackground`. Follows the identical conditional-spread pattern already used for `CallbackUrl` (line 287) and `RedirectUrl` (line 286).

**Files:**
- Modify: `apps/OpenSignServer/cloud/parsefunction/createBatchDocs.js:287`

- [ ] **Step 1: Add `Metadata` to the batch body**

In `apps/OpenSignServer/cloud/parsefunction/createBatchDocs.js`, inside the `requests.map` callback, after line 287 (`...(x?.CallbackUrl ? { CallbackUrl: x?.CallbackUrl } : {}),`), add:

```javascript
...(x?.Metadata ? { Metadata: x.Metadata } : {}),
```

The surrounding context after the change:

```javascript
          ...(x?.RedirectUrl ? { RedirectUrl: x?.RedirectUrl } : {}),
          ...(x?.CallbackUrl ? { CallbackUrl: x?.CallbackUrl } : {}),
          ...(x?.Metadata ? { Metadata: x.Metadata } : {}),
          ...(mailBody ? { RequestBody: mailBody } : {}),
```

- [ ] **Step 2: Commit**

```bash
git add apps/OpenSignServer/cloud/parsefunction/createBatchDocs.js
git commit -m "feat(metadata): pass Metadata through createBatchDocs to contracts_Document"
```

---

### Task 3: Include `metadata` in all three `dispatchWebhook` calls in `PDF.js`

Three call sites must each get `...(_resDoc.Metadata ? { metadata: _resDoc.Metadata } : {})` added to the payload. `_resDoc` is fetched from the database before any of these calls, so `_resDoc.Metadata` will be populated when the field is stored.

**Files:**
- Modify: `apps/OpenSignServer/cloud/parsefunction/pdf/PDF.js:501-556`

- [ ] **Step 1: Add metadata to `document.signed` dispatch (line ~501)**

The current call:

```javascript
        dispatchWebhook('document.signed', {
          document: {
            id: _resDoc.objectId,
            name: _resDoc.Name,
            isCompleted: updatedDoc.isCompleted,
          },
          signer: {
            id: signUser.objectId,
            name: signUser.Name,
            email: signUser.Email,
          },
          progress: {
            signed: signedAuditEntries.length,
            total: totalSigners,
          },
        }, _resDoc.CallbackUrl || null);
```

Replace with:

```javascript
        dispatchWebhook('document.signed', {
          document: {
            id: _resDoc.objectId,
            name: _resDoc.Name,
            isCompleted: updatedDoc.isCompleted,
          },
          signer: {
            id: signUser.objectId,
            name: signUser.Name,
            email: signUser.Email,
          },
          progress: {
            signed: signedAuditEntries.length,
            total: totalSigners,
          },
          ...(_resDoc.Metadata ? { metadata: _resDoc.Metadata } : {}),
        }, _resDoc.CallbackUrl || null);
```

- [ ] **Step 2: Add metadata to `document.completed` happy-path dispatch (line ~527)**

The current call inside `.then(downloadUrl => { ... })`:

```javascript
              dispatchWebhook('document.completed', {
                document: {
                  id: _resDoc.objectId,
                  name: _resDoc.Name,
                  isCompleted: true,
                  downloadUrl: downloadUrl,
                },
                signers: buildWebhookSigners(
                  updatedDoc.AuditTrail,
                  _resDoc.Signers,
                  _resDoc.ExtUserPtr
                ),
              }, _resDoc.CallbackUrl || null);
```

Replace with:

```javascript
              dispatchWebhook('document.completed', {
                document: {
                  id: _resDoc.objectId,
                  name: _resDoc.Name,
                  isCompleted: true,
                  downloadUrl: downloadUrl,
                },
                signers: buildWebhookSigners(
                  updatedDoc.AuditTrail,
                  _resDoc.Signers,
                  _resDoc.ExtUserPtr
                ),
                ...(_resDoc.Metadata ? { metadata: _resDoc.Metadata } : {}),
              }, _resDoc.CallbackUrl || null);
```

- [ ] **Step 3: Add metadata to `document.completed` error-fallback dispatch (line ~543)**

The current call inside `.catch(err => { ... })`:

```javascript
              dispatchWebhook('document.completed', {
                document: {
                  id: _resDoc.objectId,
                  name: _resDoc.Name,
                  isCompleted: true,
                  downloadUrl: null,
                },
                signers: buildWebhookSigners(
                  updatedDoc.AuditTrail,
                  _resDoc.Signers,
                  _resDoc.ExtUserPtr
                ),
              }, _resDoc.CallbackUrl || null);
```

Replace with:

```javascript
              dispatchWebhook('document.completed', {
                document: {
                  id: _resDoc.objectId,
                  name: _resDoc.Name,
                  isCompleted: true,
                  downloadUrl: null,
                },
                signers: buildWebhookSigners(
                  updatedDoc.AuditTrail,
                  _resDoc.Signers,
                  _resDoc.ExtUserPtr
                ),
                ...(_resDoc.Metadata ? { metadata: _resDoc.Metadata } : {}),
              }, _resDoc.CallbackUrl || null);
```

- [ ] **Step 4: Run lint**

```bash
cd apps/OpenSignServer && npm run lint 2>&1 | head -30
```

Expected: No new lint errors.

- [ ] **Step 5: Commit**

```bash
git add apps/OpenSignServer/cloud/parsefunction/pdf/PDF.js
git commit -m "feat(metadata): include metadata in all three dispatchWebhook payloads"
```

---

### Task 4: Update `docs/SDK_SIGN_REQUESTS_API.md`

Add `metadata` to the example request and add a dedicated section explaining the field.

**Files:**
- Modify: `docs/SDK_SIGN_REQUESTS_API.md`

- [ ] **Step 1: Add `metadata` to the curl example**

In `docs/SDK_SIGN_REQUESTS_API.md`, update the curl example body to include `metadata` after `callback_url`:

```json
    "callback_url": "https://your-system.example.com/webhooks/opensign",
    "metadata": {
      "crm_id": "your-crm-record-id",
      "crm_company_id": "your-company-id"
    },
```

- [ ] **Step 2: Add a `## Metadata` section**

After the `## Per-document callback` section, add:

```markdown
## Metadata

The optional `metadata` field lets you attach arbitrary key-value data to a sign request. The server stores it on the document and echoes it back in every webhook event fired for that document (`document.signed` and `document.completed`).

**Type:** Plain JSON object. Any JSON-serializable values are accepted (strings, numbers, booleans, nested objects).

**Use case:** Pass CRM identifiers (e.g. `crm_id`, `crm_company_id`) so your webhook receiver can automatically file the signed document against the correct record — no manual matching needed.

**Validation:**
- Optional. Omitting it is valid.
- If provided, must be a plain JSON object. Arrays, primitives, and `null` are rejected with `400`.

**Webhook payload (with metadata):**

```json
{
  "event": "document.completed",
  "timestamp": "2026-03-27T10:05:00.000Z",
  "document": { "id": "...", "name": "...", "isCompleted": true, "downloadUrl": "..." },
  "signers": [...],
  "metadata": {
    "crm_id": "your-crm-record-id",
    "crm_company_id": "your-company-id"
  }
}
` ``

If no `metadata` was provided at sign request time, the `metadata` key is absent from the webhook payload entirely (not `null`).
```

- [ ] **Step 3: Commit**

```bash
git add docs/SDK_SIGN_REQUESTS_API.md
git commit -m "docs: document metadata field in SDK_SIGN_REQUESTS_API.md"
```

---

### Task 5: Manual end-to-end verification

> **Required before merge.** This is the only test that exercises the full path (sdkSignRequests → batchdocuments → contracts_Document → PDF.js → webhook). Do not skip it.

Verify the full round-trip: SDK API → document creation → signing → webhook callback with metadata.

- [ ] **Step 1: Start the server**

```bash
make up
```

Check logs for the server starting cleanly:
```bash
docker compose logs -f server 2>&1 | head -20
```

- [ ] **Step 2: Send a sign request with metadata**

```bash
curl -sS -X POST "https://localhost:3001/api/app/functions/sdkSignRequests" \
  -H "Content-Type: application/json" \
  -H "X-Parse-Application-Id: opensign" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "title": "Metadata Test",
    "pdf_base64": "YOUR_PDF_BASE64",
    "callback_url": "https://your-n8n-or-webhook-site-url/webhook",
    "metadata": {
      "crm_id": "TEST-001",
      "crm_company_id": "COMPANY-XYZ"
    },
    "signers": [{
      "name": "Test Signer",
      "email": "signer@example.com",
      "positions": [{ "page": 1, "x": 100, "y": 100, "width": 150, "height": 50 }]
    }]
  }' | jq .
```

Expected response includes `documentId`.

- [ ] **Step 3: Verify `Metadata` stored on document**

Using Parse Dashboard or a direct query, confirm the created `contracts_Document` object has `Metadata: { crm_id: "TEST-001", crm_company_id: "COMPANY-XYZ" }`.

- [ ] **Step 4: Sign the document and verify webhook payload**

Open the signing URL (`/placeHolderSign/<documentId>`) and sign. Check your webhook receiver (n8n or webhook.site) received:
- `document.signed` event with a `metadata` key containing `{ crm_id: "TEST-001", crm_company_id: "COMPANY-XYZ" }`
- `document.completed` event (when all signers done) with the same `metadata` key

- [ ] **Step 5: Verify invalid metadata is rejected**

```bash
curl -sS -X POST "https://localhost:3001/api/app/functions/sdkSignRequests" \
  -H "Content-Type: application/json" \
  -H "X-Parse-Application-Id: opensign" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "title": "Bad Metadata Test",
    "pdf_base64": "YOUR_PDF_BASE64",
    "metadata": ["not", "an", "object"],
    "signers": [...]
  }' | jq .
```

Expected: `400` error with message `"metadata must be a plain JSON object"`.

- [ ] **Step 6: Verify backward compatibility**

Send a sign request with **no** `metadata` field. Sign the document. Confirm the webhook payload has **no** `metadata` key (not even `null`).
