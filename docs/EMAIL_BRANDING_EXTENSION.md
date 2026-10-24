# Global Email Branding in OpenSign

This document describes how global email branding (logo, colors, footer, wrapper) is applied to emails sent from OpenSign.

---

## Implementation Status

### All Emails Now Branded

| Email Type | Path | Status |
|------------|------|--------|
| Document signature request | createBatchDocs → sendmailv3 | ✅ Branded |
| Document signed (completion) | PDF.js sendCompletedMail → sendmailv3 | ✅ Branded |
| Resend request (Documents/Templates) | DocumentsReport, TemplatesReport → sendmailv3 | ✅ Branded |
| Initial request from UI | PdfRequestFiles, Utils → sendmailv3 | ✅ Branded |
| Document declined | declinedocument → sendSystemMail | ✅ Branded |
| Document forwarded (copy) | ForwardDoc → sendmailv3 | ✅ Branded |
| Signer-signed notification | PDF.js sendNotifyMail → sendSystemMail | ✅ Branded |
| Delete account OTP | deleteUtils → sendSystemMail | ✅ Branded |
| Bulk send summary (to owner) | createBatchDocs → sendSystemMail | — Not branded |
| OTP verification | SendMailOTPv1 → Parse.Cloud.sendEmail → adapter | ✅ Branded |
| Delete user request | sendDeleteUserMail → Parse.Cloud.sendEmail → adapter | ✅ Branded |
| Password reset | Parse Server → adapter (templates) | ✅ Branded |
| Email verification | Parse Server → adapter (templates) | ✅ Branded |
| sendMailGmailProvider (unused, left as-is) | Gmail API | — |

---

## Architecture

### Email Sending Paths

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EMAIL SENDING PATHS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. sendmailv3 (HTTP)                                                        │
│     ├── createBatchDocs, PDF.js, ForwardDoc                                 │
│     ├── Frontend: DocumentsReport, TemplatesReport, PdfRequestFiles, Utils  │
│     └── Branding: req.params.applyBranding → renderBrandedEmailHtml()       │
│                                                                             │
│  1b. sendSystemMail (direct call)                                           │
│     ├── declinedocument, PDF.js sendNotifyMail, deleteUtils, createBatchDocs│
│     └── Branding: req.params.applyBranding → renderBrandedEmailHtml()       │
│                                                                             │
│  2. Parse.Cloud.sendEmail → emailAdapter                                    │
│     ├── SendMailOTPv1, sendDeleteUserMail                                   │
│     └── Branding: Apply in apiCallback before send                          │
│                                                                             │
│  3. Parse Server built-in (password reset, verification)                    │
│     └── Uses adapter with template files → Brand in apiCallback             │
│                                                                             │
│  4. sendMailGmailProvider (left as-is per user request)                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Wrapper Tokens

Use these in the Full Wrapper HTML (MailTemplateEditor): `__APP_NAME__`, `__LOGO_URL__`, `__PRIMARY_COLOR__`, `__HEADER_TEXT__`, `__FOOTER_TEXT__`, `__EMAIL_BODY__`

Header text is **not configurable** globally — each email type passes its own (e.g. "Digital Signature Request", "Document signed successfully"). The preview uses a default placeholder.

---

## Upstream v3 Brand Context

Upstream v3 resolves product name, sender name, logo and colors from `APP_*` env vars (`apps/OpenSignServer/utils/brandContext.js`). Global branding sits on top of it via `resolveGlobalBrandContext()` in `Utils.js`:

| Value | Source |
|-------|--------|
| `__APP_NAME__`, email sender display name | `APP_NAME` / `APP_EMAIL_SENDER_NAME` (default `OpenSign™`) |
| Logo, primary color, footer, wrapper | `partners_GlobalSettings` (`Key: email_branding`), falling back to `APP_EMAIL_LOGO_URL` / `APP_EMAIL_ACCENT_COLOR`, then OpenSign defaults |
| Completion certificate logo / color | Saved global logo / primary color; upstream's certificate defaults until an admin saves branding. Only PNG/JPEG logos can be embedded. |

Upstream's renderers (`renderDocumentEmail`, `renderEmailLogo`, etc.) are not used for our emails — bodies are plain HTML and the wrapper adds logo, header and footer, so the logo appears once.

Upstream's complaint footer (`renderComplaintFooter`, linking to complaints@opensignlabs.com) is intentionally not appended to any email. The delete-account email shows a support contact only when `APP_SUPPORT_EMAIL` is set.

---

## File Summary

| File | Role |
|------|------|
| `Utils.js` | `renderBrandedEmailHtml`, `getEmailBrandingConfig`, `resolveGlobalBrandContext` |
| `sendMailv3.js`, `sendSystemMail.js` | Apply branding when `applyBranding: true` |
| `pdf/GenerateCertificate.js` | Uses `resolveGlobalBrandContext` for certificate logo/color |
| `index.js` | Adapter apiCallback brands all Parse.Cloud.sendEmail + built-in emails |
| `email_brand_wrapper.html` | Default wrapper template |
| `declinedocument.js`, `ForwardDoc.js`, `pdf/PDF.js`, `deleteUtils.js` | Pass applyBranding + brandingFooter |

---

## Testing Checklist

After implementation, verify:

- [ ] Document request emails (createBatchDocs) — already works
- [ ] Completion emails (PDF.js) — already works
- [ ] Document declined — branding visible
- [ ] Document forwarded — branding visible
- [ ] Signer-signed notification — branding visible
- [ ] Delete account OTP — branding visible
- [ ] OTP verification (SendMailOTPv1) — branding visible
- [ ] Delete user request — branding visible
- [ ] Password reset — branding visible
- [ ] Email verification — branding visible
- [ ] Completion certificate — saved logo/color applied

Automated coverage: `apps/OpenSignServer/spec/emailBranding.spec.js` (run with `npx jasmine --config=spec/support/jasmine.metadata.json` in the server container).

---

## References

- `Utils.js`: `renderBrandedEmailHtml`, `getEmailBrandingConfig`, `getDefaultEmailBrandingConfig`
- `sendMailv3.js`: Main mail sender; applies branding when `applyBranding: true`
- `files/email_brand_wrapper.html`: Wrapper template with `__LOGO_URL__`, `__PRIMARY_COLOR__`, `__FOOTER_TEXT__`, `__EMAIL_BODY__`
- `MailTemplateEditor.jsx`: Admin UI to configure global branding
