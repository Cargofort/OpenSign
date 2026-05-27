# OpenSign — Cargofort Fork

A self-hosted e-signature platform based on [OpenSign](https://www.opensignlabs.com) (open-source DocuSign alternative). This fork adds SSO/OIDC authentication, global email branding, a service-to-service SDK API, batch document processing, and webhook notifications.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [SSO / OIDC Setup](#sso--oidc-setup)
5. [SDK Sign Requests API](#sdk-sign-requests-api)
6. [Webhooks](#webhooks)
7. [Global Email Branding](#global-email-branding)
8. [Batch Documents](#batch-documents)
9. [Development](#development)

---

## Architecture

Monorepo with two independent apps, each with its own `package.json`:

| Service | Description | Port |
|---|---|---|
| `apps/OpenSign/` | React 19 frontend (Vite, Redux, Tailwind, react-pdf) | 3000 |
| `apps/OpenSignServer/` | Node.js backend (Express 5, Parse Server 8.x, MongoDB) | 8080 |

**Docker Compose** orchestrates five services:

- `server` — Parse Server backend
- `client` — React frontend
- `mongo` — MongoDB (exposed on host port `27018`)
- `caddy` — Reverse proxy; routes `/api/*` → server, everything else → client (ports 3001 / 80 / 443)
- `mailcatcher` — Local SMTP trap for development (SMTP `1025`, Web UI `1080`)

**Parse Server** is the core backend framework. All business logic lives in cloud functions registered in `apps/OpenSignServer/cloud/main.js`. The database uses Parse classes prefixed with `contracts_` (documents, users, signatures, templates) and `partners_` (tenants, global settings).

**File storage**: Local filesystem by default (`USE_LOCAL=true`), or S3/DigitalOcean Spaces via `DO_*` env vars.

---

## Quick Start

### Prerequisites

- Docker and Docker Compose
- A `.env` file (copy from `.env.local_dev` for local dev, or `.env.example` for production reference)

### Run

```bash
# First time / after dependency changes
HOST_URL=https://opensign.yourdomain.com make build

# Start without rebuilding
make up

# Stop
make down

# Shell into server container
make ssh
```

`HOST_URL` is required for production — it sets `SERVER_URL` and `PUBLIC_URL` inside the containers. Omit it for local development (defaults to `https://localhost:3001`).

---

## Environment Variables

Copy `.env.local_dev` to `.env` to get started. Key variables:

### Core

| Variable | Description |
|---|---|
| `HOST_URL` | Public URL of the app (e.g. `https://opensign.yourdomain.com`). Set as a shell env var before running `make build`. |
| `APP_ID` / `REACT_APP_APPID` | Must both be `opensign` |
| `MASTER_KEY` | Parse Server master key — keep secret |
| `MONGODB_URI` | MongoDB connection string |
| `REACT_APP_SERVERURL` | Backend API URL seen by the browser (e.g. `https://opensign.yourdomain.com/api/app`) |
| `SERVER_URL` | Backend API URL used by server-side cloud functions |
| `USE_LOCAL=true` | Use local filesystem instead of S3 |
| `PFX_BASE64` / `PASS_PHRASE` | PDF signing certificate (base64-encoded PFX/P12) |

### Email (one of the following)

| Variable | Description |
|---|---|
| `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` + `MAILGUN_SENDER` | Mailgun sending |
| `SMTP_ENABLE=true` + `SMTP_HOST` + `SMTP_PORT` + `SMTP_USERNAME` + `SMTP_USER_EMAIL` + `SMTP_PASS` | SMTP sending |
| `SMTP_MAIL_FROM` | Optional SMTP envelope override (defaults to `SMTP_USER_EMAIL`) |

### Storage (S3 / DigitalOcean Spaces)

| Variable | Description |
|---|---|
| `DO_SPACE` | Bucket/space name |
| `DO_ENDPOINT` | S3-compatible endpoint |
| `DO_BASEURL` | Public base URL for stored files |
| `DO_ACCESS_KEY_ID` / `DO_SECRET_ACCESS_KEY` | Credentials |
| `DO_REGION` | Region |

---

## SSO / OIDC Setup

### How it works

Users authenticate via an OAuth2/OIDC provider (e.g. Authentik, Keycloak). The frontend redirects to the provider using PKCE; the backend validates the access token against the userinfo endpoint.

### Required env vars

```bash
# Frontend — enables the "Sign in with SSO" button
REACT_APP_OAUTH_ISSUER=https://auth.yourdomain.com/application/o
REACT_APP_OAUTH_CLIENT_ID=your-client-id

# Backend — token validation
SSO_API_URL=https://auth.yourdomain.com/application/o
SSO_USERINFO_PATH=/userinfo/
SSO_OAUTH_CLIENT_ID=your-client-id
SSO_OAUTH_CLIENT_SECRET=your-client-secret
```

### Restricting access to internal users (optional)

Set `SSO_ALLOWED_GROUPS` to a comma-separated list of group names. Users not in any of these groups will be rejected at login.

```bash
SSO_ALLOWED_GROUPS=opensign-internal,employees
SSO_GROUPS_CLAIM=groups   # userinfo claim name that contains groups (default: groups)
```

To populate the `groups` claim in Authentik: go to **Customization → Property Mappings → Create → Scope Mapping**, set scope to `profile`, and use the expression:

```python
return {"groups": [str(g.name) for g in request.user.ak_groups.all()]}
```

Assign this mapping to your OAuth2 Provider for OpenSign.

### Role mapping (new users only)

On first SSO signup, the user's role is read from the userinfo claim defined by `SSO_ROLE_CLAIM` (default: `opensign_role`).

```bash
SSO_ROLE_CLAIM=opensign_role   # default, can be omitted
```

In your OIDC provider, add a custom claim to the userinfo response:

```json
{
  "opensign_role": "admin"
}
```

| Claim value | OpenSign role |
|---|---|
| `admin`, `orgadmin`, `org_admin` | `contracts_Admin` |
| `editor` | `contracts_Editor` |
| anything else / missing | `contracts_User` |

> **Important:** Role mapping only runs at signup (first login). For existing users, set `UserRole` directly in the `contracts_Users` MongoDB collection.

---

## SDK Sign Requests API

Service-to-service API for programmatically creating sign requests. Uses OAuth2 client credentials (machine-to-machine) — no user session required.

### Required env vars

```bash
OAUTH_INTROSPECTION_URL=https://auth.yourdomain.com/application/o/introspect/
OAUTH_CLIENT_ID=your-api-client-id
OAUTH_CLIENT_SECRET=your-api-client-secret

# OpenSign admin user the SDK will act as (must exist in the DB)
SDK_ACT_AS_ADMIN_EMAIL=admin@example.com

# Optional email display overrides
SDK_SIGN_REQUEST_FROM_NAME="Cargofort Sign"
SDK_SIGN_REQUEST_REPLY_TO=no-reply@example.com
```

### Authentication

Obtain a token from your OAuth2 provider using client credentials, then pass it as a Bearer token:

```
Authorization: Bearer <access_token>
```

The backend introspects the token against `OAUTH_INTROSPECTION_URL` using `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET`.

### Cloud function

```
POST /1/functions/sdkSignRequests
```

The function accepts a document (as base64-encoded PDF), signer list with signature positions, and creates the document + sign request in OpenSign acting as `SDK_ACT_AS_ADMIN_EMAIL`.

---

## Webhooks

Outbound HTTP notifications for document events. Both variables must be set to enable webhooks.

```bash
WEBHOOK_URL=https://your-service.example.com/webhooks/opensign
WEBHOOK_SECRET=your-hmac-secret
```

### Events

| Event | Trigger |
|---|---|
| `document.signed` | A signer completes signing |
| `document.completed` | All signers have signed |

### Payload

```json
{
  "event": "document.completed",
  "timestamp": "2026-05-27T16:00:00.000Z",
  ...document fields
}
```

### Signature verification

Every request includes an `x-webhook-signature` header — an HMAC-SHA256 of the raw JSON body signed with `WEBHOOK_SECRET`. Verify it on the receiving end to confirm the request is authentic.

> Webhooks are fire-and-forget with no retries. Delivery failures are logged server-side.

### Per-document callbacks

Sign requests can include a `callbackUrl` field. If set, webhook events for that document are also sent to that URL (signed with `WEBHOOK_SECRET` if set, unsigned otherwise).

---

## Global Email Branding

Admins can configure a global email logo and colors that are applied to all outgoing emails. Settings are stored in the `partners_GlobalSettings` Parse class.

Cloud functions:
- `getGlobalEmailBranding` — returns current branding settings
- `updateGlobalEmailBranding` — updates settings (requires `contracts_Admin` or `contracts_OrgAdmin` role)

---

## Batch Documents

`createBatchDocs` cloud function — creates multiple documents in a single request. Useful for bulk onboarding or bulk signing workflows.

---

## Development

> All project commands must run inside Docker containers. Do not run `npm`, `node`, or other project tooling directly on the host.

### Frontend

```bash
docker compose exec client npm run dev
docker compose exec client npm run build
docker compose exec client npm test
```

### Backend

```bash
docker compose exec server npm start       # production
docker compose exec server npm run watch   # dev with hot reload
docker compose exec server npm test
docker compose exec server npm run lint-fix
```

### Useful paths

| Path | Description |
|---|---|
| `apps/OpenSignServer/cloud/main.js` | Cloud function registry (73+ functions) |
| `apps/OpenSignServer/cloud/parsefunction/` | Individual cloud function implementations |
| `apps/OpenSignServer/cloud/customRoute/` | Custom HTTP routes |
| `apps/OpenSignServer/databases/migrations/` | DB migrations |
| `apps/OpenSign/src/App.jsx` | Frontend routes |
| `apps/OpenSignServer/auth/authadapter.js` | SSO Parse auth adapter |

---

Based on [OpenSign](https://www.opensignlabs.com) by OpenSignLabs, licensed under AGPL-3.
