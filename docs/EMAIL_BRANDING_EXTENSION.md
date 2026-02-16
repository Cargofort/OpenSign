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
| Document declined | declinedocument → sendmailv3 | ✅ Branded |
| Document forwarded (copy) | ForwardDoc → sendmailv3 | ✅ Branded |
| Signer-signed notification | PDF.js sendNotifyMail → sendmailv3 | ✅ Branded |
| Delete account OTP | deleteUtils → sendmailv3 | ✅ Branded |
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
│     ├── createBatchDocs, PDF.js, ForwardDoc, declinedocument, deleteUtils   │
│     ├── Frontend: DocumentsReport, TemplatesReport, PdfRequestFiles, Utils  │
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

## File Summary

| File | Role |
|------|------|
| `Utils.js` | `renderBrandedEmailHtml`, `getEmailBrandingConfig` |
| `sendMailv3.js` | Applies branding when `applyBranding: true` |
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

---

## References

- `Utils.js`: `renderBrandedEmailHtml`, `getEmailBrandingConfig`, `getDefaultEmailBrandingConfig`
- `sendMailv3.js`: Main mail sender; applies branding when `applyBranding: true`
- `files/email_brand_wrapper.html`: Wrapper template with `__LOGO_URL__`, `__PRIMARY_COLOR__`, `__FOOTER_TEXT__`, `__EMAIL_BODY__`
- `MailTemplateEditor.jsx`: Admin UI to configure global branding
