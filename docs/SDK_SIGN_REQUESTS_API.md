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

## Notes / limits (v1)

- `position_type` supports only `signature`.
- `signers[].role` is treated as a label (used as placeholder Role).
- `send_in_order` accepts `true`/`false` booleans (or `"true"`/`"false"` as strings). Any other value is rejected.
- Hard limits:
  - `signers` max: 20
  - positions per signer max: 50
  - total positions max: 400
  - `pdf_base64` max length: 28 MiB (base64 text length)
- `documentUrl` is built from backend `PUBLIC_URL` config; otherwise it is an empty string.
- Signature/login links in outgoing emails also use backend `PUBLIC_URL`.

