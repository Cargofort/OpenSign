# Sign Request Metadata — Design Spec

## Overview

Add an optional `metadata` field to the SDK sign request API. The metadata is stored on the document and echoed back in both `document.signed` and `document.completed` webhook payloads. This closes the loop for automated filing: service sends a sign request with identifiers, and receives them back in the webhook callback so it knows which record to update.

## Scope

- **In scope:** SDK API only (`sdkSignRequests`). Documents created via the OpenSign web UI are not affected.
- **Out of scope:** UI for attaching metadata, querying documents by metadata, metadata-based filtering.

## API Change — `sdkSignRequests`

New optional field `metadata` in the JSON request body:

```json
{
  "title": "...",
  "pdf_base64": "...",
  "signers": [...],
  "callback_url": "https://...",
  "metadata": {
    "id": "XYZ",
    "company_id": "ZYS"
  }
}
```

### Validation

- Optional. Omitting it is valid; existing requests are unaffected.
- If provided, must be a plain JSON object (not `null`, not an array, not a primitive).
- Values may be any JSON-serializable type (strings, numbers, booleans, nested objects).
- Rejected with `400` if the value is not a plain object.

### Response

Unchanged — `{ documentId, documentUrl }`. Metadata is not echoed in the creation response (it is available later in the webhook).

## Storage

`metadata` is stored as `Metadata` on the `contracts_Document` Parse object. Parse Server is schema-free; no migration is required. Documents created via the UI never have this field.

## Webhook Payload Change

Both events gain a top-level `metadata` key when the document has metadata. The key is **absent** (not `null`) for documents without metadata.

### `document.signed` (with metadata)

```json
{
  "event": "document.signed",
  "timestamp": "2026-03-27T10:00:00.000Z",
  "document": {
    "id": "abc123",
    "name": "Contract.pdf",
    "isCompleted": false
  },
  "signer": {
    "id": "xyz789",
    "name": "Jane Doe",
    "email": "jane@example.com"
  },
  "progress": {
    "signed": 1,
    "total": 2
  },
  "metadata": {
    "id": "XYZ",
    "company_id": "ZYS"
  }
}
```

### `document.completed` (with metadata)

```json
{
  "event": "document.completed",
  "timestamp": "2026-03-27T10:05:00.000Z",
  "document": {
    "id": "abc123",
    "name": "Contract.pdf",
    "isCompleted": true,
    "downloadUrl": "https://..."
  },
  "signers": [
    { "id": "xyz789", "name": "Jane Doe", "email": "jane@example.com", "signedOn": "..." }
  ],
  "metadata": {
    "id": "XYZ",
    "company_id": "ZYS"
  }
}
```

## Architecture

### Threading metadata through the stack

```text
sdkSignRequests.js
  - reads request.params.metadata
  - validates: must be plain object if present
  - passes as Metadata field in doc object to batchdocuments
        ↓
createBatchDocs.js (startBulkSendInBackground)
  - includes x.Metadata in the contracts_Document batch body (conditional spread)
        ↓
contracts_Document.Metadata (stored on Parse object)
        ↓
PDF.js (signing handler)
  - _resDoc already fetched from DB, includes Metadata when present
  - all three dispatchWebhook calls spread metadata into payload if truthy
```

### `sdkSignRequests.js` changes

1. Read `metadata` from `request.params`.
2. Validate: if present and not a plain object, throw `Parse.Error(400, ...)`.
3. Add to `doc` object: `...(metadata ? { Metadata: metadata } : {})`.

### `createBatchDocs.js` changes

In `startBulkSendInBackground`, inside the `requests.map`, add to the batch body:

```javascript
...(x?.Metadata ? { Metadata: x.Metadata } : {}),
```

This follows the exact same conditional spread pattern used for `CallbackUrl`, `RedirectUrl`, and other optional fields on the same object.

### `PDF.js` changes

There are three `dispatchWebhook` calls — all three must include the metadata spread:

1. `document.signed` — after `sendNotifyMail`
2. `document.completed` happy path — inside the `getPresignedUrl(...).then(...)` callback
3. `document.completed` error fallback — inside the `.catch(...)` callback (fires when `getPresignedUrl` rejects; must also include metadata so the payload is consistent regardless of whether URL generation succeeds)

Pattern applied to all three:

```javascript
...(_resDoc.Metadata ? { metadata: _resDoc.Metadata } : {}),
```

### `docs/SDK_SIGN_REQUESTS_API.md` changes

- Add `metadata` to the example curl request body.
- Add a `## Metadata` section describing the field, its type, and its appearance in webhook payloads.

## Error Handling

- Invalid metadata type → `400` with a clear message, before any PDF upload or contact creation.
- Missing metadata → silent no-op, no webhook key emitted.
- Metadata present but `_resDoc.Metadata` is falsy when webhook fires → `metadata` key omitted (defensive, shouldn't happen).

## Files Changed

| File | Change |
|---|---|
| `apps/OpenSignServer/cloud/parsefunction/sdkSignRequests.js` | Accept + validate `metadata` param; pass as `Metadata` into doc object |
| `apps/OpenSignServer/cloud/parsefunction/createBatchDocs.js` | Pass `Metadata` through to `contracts_Document` batch body |
| `apps/OpenSignServer/cloud/parsefunction/pdf/PDF.js` | Spread `metadata` into all three `dispatchWebhook` payloads when present (`document.signed`, `document.completed` happy path, `document.completed` error fallback) |
| `docs/SDK_SIGN_REQUESTS_API.md` | Document the new field with example and notes |

## Out of Scope

- UI for attaching metadata to documents
- Querying or filtering documents by metadata values
- Metadata on documents created outside the SDK API
- Metadata validation beyond "must be a plain object"
- Metadata size limits (accepted as-is; MongoDB document size limit applies as a backstop)
