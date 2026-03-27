# SDK Sign Requests API (v1)

This repo exposes a Parse Cloud Function for service-to-service creation of signing requests.

## Endpoint

`POST /api/app/functions/sdkSignRequests`

In local Docker+Caddy, that is typically:
- `https://localhost:3001/api/app/functions/sdkSignRequests`

In production, it will look like:
- `https://sign.cargofort.com/api/app/functions/sdkSignRequests`

## Auth

The endpoint requires:
- `Authorization: Bearer <oauth access token>` (client credentials flow)
- `X-Parse-Application-Id: <APP_ID>` (Parse header; not a secret)

Server validates the Bearer token via oauth provider introspection (`OAUTH_INTROSPECTION_URL`).

## Get an access token (client_credentials)

Replace:
- `AUTH_DOMAIN`, `PROVIDER_SLUG`
- `CLIENT_ID`, `CLIENT_SECRET`

```sh
curl -sS -X POST "https://AUTH_DOMAIN/application/o/token/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=CLIENT_ID" \
  -d "client_secret=CLIENT_SECRET" \
  -d "scope=openid" | jq -r .access_token
```

## Create a sign request

Replace:
- `BASE_URL` (e.g. `https://sign.cargofort.com` or `https://localhost:3001`)
- `APP_ID` (default `opensign`)
- `ACCESS_TOKEN` (from previous step)
- `PDF_BASE64` (base64 of a PDF, without data URI prefix)

```sh
curl -sS -X POST "BASE_URL/api/app/functions/sdkSignRequests" \
  -H "Content-Type: application/json" \
  -H "X-Parse-Application-Id: APP_ID" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "title": "Vacation Request - Example",
    "description": "Please sign your vacation request.",
    "send_in_order": true,
    "callback_url": "https://your-system.example.com/webhooks/opensign",
    "metadata": {
      "crm_id": "your-crm-record-id",
      "crm_company_id": "your-company-id"
    },
    "pdf_base64": "PDF_BASE64",
    "signers": [
      {
        "name": "Employee Name",
        "email": "employee@example.com",
        "role": "Primary Signatory",
        "positions": [
          { "page": 1, "x": 465, "y": 515, "width": 150, "height": 50, "position_type": "signature" }
        ]
      }
    ]
  }' | jq .
```

Expected response:

```json
{
  "result": {
    "documentId": "...",
    "documentUrl": "https://sign.cargofort.com/placeHolderSign/..."
  }
}
```

## Per-document callback (`callback_url`)

The optional `callback_url` field registers a per-document webhook URL. When set, the server POSTs signing events to that URL in addition to any globally configured `WEBHOOK_URL`.

- Must be an `https://` URL, max 2048 characters.
- Fires `document.signed` immediately when each signer completes, and `document.completed` once all signers are done.
- Payload shape is identical to the global webhook.
- If `WEBHOOK_SECRET` is configured on the server, each POST is HMAC-SHA256 signed via the `x-webhook-signature` header (same as the global webhook). Otherwise the request is sent unsigned.
- Fire-and-forget: errors are logged server-side but never interrupt the signing flow.

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
```

If no `metadata` was provided at sign request time, the `metadata` key is absent from the webhook payload entirely (not `null`).

## Notes / limits (v1)

- `position_type` supports only `signature`.
- `signers[].role` is treated as a label (used as placeholder Role).
- `send_in_order` accepts `true`/`false` booleans (or `"true"`/`"false"` as strings). Any other value is rejected.
- Hard limits:
  - `signers` max: 20
  - positions per signer max: 50
  - total positions max: 400
  - `pdf_base64` max length: 28 MiB (base64 text length)
  - `callback_url` max length: 2048 characters
- `documentUrl` is built from backend `PUBLIC_URL` config; otherwise it is an empty string.
- Signature/login links in outgoing emails also use backend `PUBLIC_URL`.

