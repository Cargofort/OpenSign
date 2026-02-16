import dotenv from 'dotenv';
import { format, toZonedTime } from 'date-fns-tz';
import getPresignedUrl, { getSignedLocalUrl } from './cloud/parsefunction/getSignedUrl.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PDFDocument, rgb } from 'pdf-lib';
import { parseUploadFile } from './utils/fileUtils.js';

dotenv.config({ quiet: true });

export const cloudServerUrl = 'http://localhost:8080/app';
export const serverAppId = process.env.APP_ID || 'opensign';
export const appName = 'OpenSign™';
export const EMAIL_BRANDING_SETTINGS_KEY = 'email_branding';
export const EMAIL_BRANDING_CLASS_NAME = 'partners_GlobalSettings';
const defaultEmailBrandingTemplatePath = new URL('./files/email_brand_wrapper.html', import.meta.url);
const fallbackEmailBrandingTemplate =
  "<html><head><meta http-equiv='Content-Type' content='text/html; charset=UTF-8' /></head><body style='margin:0;background:#f5f5f5;font-family:Arial,sans-serif'><table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#f5f5f5;padding:20px 0'><tr><td align='center'><table role='presentation' width='640' cellpadding='0' cellspacing='0' style='background:#ffffff;border:1px solid #e9ecf1'><tr><td style='padding:16px 20px'><img src='__LOGO_URL__' alt='__APP_NAME__' height='50' style='display:block' /></td></tr><tr><td style='background:__PRIMARY_COLOR__;padding:14px 20px;color:#ffffff;font-size:20px'>__HEADER_TEXT__</td></tr><tr><td style='padding:20px'>__EMAIL_BODY__</td></tr><tr><td style='padding:16px 20px;border-top:1px solid #e9ecf1;color:#4b5563;font-size:12px'>__FOOTER_TEXT__</td></tr></table></td></tr></table></body></html>";
const brandingTokenRegex = /<[^>]*>/g;
const defaultBranding = {
  logoUrl: 'https://qikinnovation.ams3.digitaloceanspaces.com/logo.png',
  primaryColor: '#47a3ad',
  headerText: 'Digital Signature Request',
  footerText: '',
  wrapperHtml: '',
};
export const prefillDraftDocWidget = ['date', 'textbox', 'checkbox', 'radio button', 'image'];
export const prefillDraftTemWidget = [
  'date',
  'textbox',
  'checkbox',
  'radio button',
  'image',
  'dropdown',
];
export const MAX_NAME_LENGTH = 250;
export const MAX_NOTE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 500;
export const color = [
  '#93a3db',
  '#e6c3db',
  '#c0e3bc',
  '#bce3db',
  '#b8ccdb',
  '#ceb8db',
  '#ffccff',
  '#99ffcc',
  '#cc99ff',
  '#ffcc99',
  '#66ccff',
  '#ffffcc',
];

export const prefillBlockColor = 'transparent';
export function replaceMailVaribles(subject, body, variables) {
  let replacedSubject = subject;
  let replacedBody = body;

  for (const variable in variables) {
    const regex = new RegExp(`{{${variable}}}`, 'g');
    if (subject) {
      replacedSubject = replacedSubject.replace(regex, variables[variable]);
    }
    if (body) {
      replacedBody = replacedBody.replace(regex, variables[variable]);
    }
  }
  const result = { subject: replacedSubject, body: replacedBody };
  return result;
}

const normalizeColorCode = value => {
  if (!value || typeof value !== 'string') {
    return defaultBranding.primaryColor;
  }
  const candidate = value.trim();
  const validHex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(candidate);
  return validHex ? candidate : defaultBranding.primaryColor;
};

const toStringSafe = value => (typeof value === 'string' ? value.trim() : '');

export const getDefaultEmailBrandingTemplate = () => {
  try {
    const template = fs.readFileSync(defaultEmailBrandingTemplatePath, 'utf8');
    return template || fallbackEmailBrandingTemplate;
  } catch (err) {
    return fallbackEmailBrandingTemplate;
  }
};

export const getDefaultEmailBrandingConfig = () => ({
  ...defaultBranding,
  footerText: `This is an automated email from ${appName}.`,
  wrapperHtml: getDefaultEmailBrandingTemplate(),
});

export const sanitizeEmailBrandingPayload = details => {
  const safeDetails = details && typeof details === 'object' ? details : {};
  const fallback = getDefaultEmailBrandingConfig();
  return {
    logoUrl: toStringSafe(safeDetails.logoUrl) || fallback.logoUrl,
    primaryColor: normalizeColorCode(safeDetails.primaryColor),
    footerText: toStringSafe(safeDetails.footerText) || fallback.footerText,
    wrapperHtml: toStringSafe(safeDetails.wrapperHtml) || fallback.wrapperHtml,
  };
};

const normalizeEmailBody = html => {
  if (!html || typeof html !== 'string') {
    return '';
  }
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
};

const cleanPlainText = value => toStringSafe(value).replace(brandingTokenRegex, '');

export const getEmailBrandingConfig = async () => {
  const fallback = getDefaultEmailBrandingConfig();
  try {
    const query = new Parse.Query(EMAIL_BRANDING_CLASS_NAME);
    query.equalTo('Key', EMAIL_BRANDING_SETTINGS_KEY);
    const existing = await query.first({ useMasterKey: true });
    if (!existing) {
      return fallback;
    }
    const config = existing.toJSON?.() || {};
    return sanitizeEmailBrandingPayload({
      logoUrl: config.logoUrl,
      primaryColor: config.primaryColor,
      footerText: config.footerText,
      wrapperHtml: config.wrapperHtml,
    });
  } catch (err) {
    return fallback;
  }
};

export const renderBrandedEmailHtml = async ({ htmlBody, headerText, footerText }) => {
  const branding = await getEmailBrandingConfig();
  const defaultFooter = `This is an automated email from ${appName}.`;
  const resolvedHeader = cleanPlainText(headerText) || defaultBranding.headerText;
  const resolvedFooter = cleanPlainText(footerText) || branding.footerText || defaultFooter;
  const wrapped = branding.wrapperHtml || getDefaultEmailBrandingTemplate();
  return wrapped
    .replaceAll('__APP_NAME__', appName)
    .replaceAll('__LOGO_URL__', branding.logoUrl)
    .replaceAll('__PRIMARY_COLOR__', branding.primaryColor)
    .replaceAll('__HEADER_TEXT__', resolvedHeader)
    .replaceAll('__FOOTER_TEXT__', resolvedFooter)
    .replaceAll('__EMAIL_BODY__', normalizeEmailBody(htmlBody));
};

export const saveFileUsage = async (size, fileUrl, userId) => {
  //checking server url and save file's size
  try {
    if (userId) {
      const userPtr = { __type: 'Pointer', className: '_User', objectId: userId };
      const tenantQuery = new Parse.Query('partners_Tenant');
      tenantQuery.equalTo('UserId', userPtr);
      const tenant = await tenantQuery.first({ useMasterKey: true });
      if (tenant) {
        const tenantPtr = { __type: 'Pointer', className: 'partners_Tenant', objectId: tenant.id };
        try {
          const tenantCredits = new Parse.Query('partners_TenantCredits');
          tenantCredits.equalTo('PartnersTenant', tenantPtr);
          const res = await tenantCredits.first({ useMasterKey: true });
          if (res) {
            const response = JSON.parse(JSON.stringify(res));
            const usedStorage = response?.usedStorage ? response.usedStorage + size : size;
            const updateCredit = new Parse.Object('partners_TenantCredits');
            updateCredit.id = res.id;
            updateCredit.set('usedStorage', usedStorage);
            await updateCredit.save(null, { useMasterKey: true });
          } else {
            const newCredit = new Parse.Object('partners_TenantCredits');
            newCredit.set('usedStorage', size);
            newCredit.set('PartnersTenant', tenantPtr);
            await newCredit.save(null, { useMasterKey: true });
          }
        } catch (err) {
          console.log('err in save usage', err);
        }
        saveDataFile(size, fileUrl, tenantPtr, userPtr);
      }
    }
  } catch (err) {
    console.log('err in fetch tenant Id', err);
  }
};

//function for save fileUrl and file size in particular client db class partners_DataFiles
const saveDataFile = async (size, fileUrl, tenantPtr, UserId) => {
  try {
    const newDataFiles = new Parse.Object('partners_DataFiles');
    newDataFiles.set('FileUrl', fileUrl);
    newDataFiles.set('FileSize', size);
    newDataFiles.set('TenantPtr', tenantPtr);
    newDataFiles.set('UserId', UserId);
    await newDataFiles.save(null, { useMasterKey: true });
  } catch (err) {
    console.log('error in save usage ', err);
  }
};

export const updateMailCount = async (extUserId, plan, monthchange) => {
  // Update count in contracts_Users class
  const query = new Parse.Query('contracts_Users');
  query.equalTo('objectId', extUserId);

  try {
    const contractUser = await query.first({ useMasterKey: true });
    if (contractUser) {
      const _extRes = JSON.parse(JSON.stringify(contractUser));
      let updateDate = new Date();
      if (_extRes?.LastEmailCountReset?.iso) {
        updateDate = new Date(_extRes?.LastEmailCountReset?.iso);
        const newDate = new Date();
        // Update the month while keeping the same day and year
        updateDate.setMonth(newDate.getMonth());
        updateDate.setFullYear(newDate.getFullYear());
      }
      contractUser.increment('EmailCount', 1);
      if (plan === 'freeplan') {
        if (monthchange) {
          contractUser.set('LastEmailCountReset', updateDate);
          contractUser.set('MonthlyFreeEmails', 1);
        } else {
          if (contractUser?.get('MonthlyFreeEmails')) {
            contractUser.increment('MonthlyFreeEmails', 1);
            if (contractUser?.get('LastEmailCountReset')) {
              contractUser.set('LastEmailCountReset', updateDate);
            }
          } else {
            contractUser.set('MonthlyFreeEmails', 1);
            contractUser.set('LastEmailCountReset', updateDate);
          }
        }
      }
      await contractUser.save(null, { useMasterKey: true });
    }
  } catch (error) {
    console.log('Error updating EmailCount in contracts_Users: ' + error.message);
  }
};

export function sanitizeFileName(fileName) {
  // Remove spaces and invalid characters
  const file = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  const removedot = file.replace(/\.(?=.*\.)/g, '');
  return removedot.replace(/[^a-zA-Z0-9._-]/g, '');
}

export const useLocal = process.env.USE_LOCAL ? process.env.USE_LOCAL.toLowerCase() : 'false';
export const smtpsecure = process.env.SMTP_PORT && process.env.SMTP_PORT !== '465' ? false : true;
export const smtpenable =
  process.env.SMTP_ENABLE && process.env.SMTP_ENABLE.toLowerCase() === 'true' ? true : false;
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeMailValue = value => (typeof value === 'string' ? value.trim() : '');

export const isValidEmail = value => emailRegex.test(normalizeMailValue(value));

export const getResolvedMailSender = ({ isSmtp = smtpenable } = {}) => {
  if (isSmtp) {
    const smtpUserEmail = normalizeMailValue(process.env.SMTP_USER_EMAIL);
    if (isValidEmail(smtpUserEmail)) {
      return smtpUserEmail;
    }

    const smtpUsername = normalizeMailValue(process.env.SMTP_USERNAME);
    if (isValidEmail(smtpUsername)) {
      return smtpUsername;
    }

    throw new Error('Invalid SMTP sender. Set SMTP_USER_EMAIL to a valid email address.');
  }

  const mailgunSender = normalizeMailValue(process.env.MAILGUN_SENDER);
  if (isValidEmail(mailgunSender)) {
    return mailgunSender;
  }

  throw new Error('Invalid MAILGUN_SENDER. Set it to a valid email address.');
};

export const getSmtpEnvelopeFrom = senderEmail => {
  const smtpMailFrom = normalizeMailValue(process.env.SMTP_MAIL_FROM);
  if (!smtpMailFrom) {
    return senderEmail;
  }

  if (isValidEmail(smtpMailFrom)) {
    return smtpMailFrom;
  }

  throw new Error('Invalid SMTP_MAIL_FROM. Set it to a valid email address.');
};

export const formatFromHeader = (displayName, senderEmail) => {
  const safeSender = normalizeMailValue(senderEmail);
  const safeDisplayName = normalizeMailValue(displayName);
  return safeDisplayName ? `${safeDisplayName} <${safeSender}>` : safeSender;
};

export function signPayload(payload, secret) {
  if (payload && secret) {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return { 'x-webhook-signature': signature };
  } else {
    return {};
  }
}

// `generateId` is used to unique Id for fileAdapter
export function generateId(length) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

/**
 * FlattenPdf is used to remove existing widgets if present any and flatten pdf.
 * @param {string | Uint8Array | ArrayBuffer} pdfFile - pdf file.
 * @returns {Promise<Uint8Array>} flatPdf - pdf file in unit8arry
 */
export const flattenPdf = async pdfFile => {
  try {
    const pdfDoc = await PDFDocument.load(pdfFile);
    // Get the form
    const form = pdfDoc.getForm();
    // fetch form fields
    const fields = form.getFields();
    // remove form all existing fields and their widgets
    if (fields && fields?.length > 0) {
      try {
        for (const field of fields) {
          while (field.acroField.getWidgets().length) {
            field.acroField.removeWidget(0);
          }
          form.removeField(field);
        }
      } catch (err) {
        console.log('err while removing field from pdf', err);
      }
    }
    // Updates the field appearances to ensure visual changes are reflected.
    form.updateFieldAppearances();
    // Flattens the form, converting all form fields into non-editable, static content
    form.flatten();
    const flatPdf = await pdfDoc.save({ useObjectStreams: false });
    return flatPdf;
  } catch (err) {
    console.log('err ', err);
    throw new Error('error in pdf');
  }
};

// Format date and time for the selected timezone
export const formatTimeInTimezone = (date, timezone) => {
  const nyDate = timezone && toZonedTime(date, timezone);
  const generatedDate = timezone
    ? format(nyDate, 'EEE, dd MMM yyyy HH:mm:ss zzz', { timeZone: timezone })
    : new Date(date).toUTCString();
  return generatedDate;
};

// `getSecureUrl` is used to return local secure url if local files
export const getSecureUrl = url => {
  const fileUrl = new URL(url)?.pathname?.includes('files');
  if (fileUrl) {
    try {
      const file = getSignedLocalUrl(url);
      if (file) {
        return { url: file };
      } else {
        return { url: '' };
      }
    } catch (err) {
      console.log('err while fileupload ', err);
      return { url: '' };
    }
  } else {
    return { url: url };
  }
};

export const mailTemplate = async param => {
  const subject = `${param.senderName} has requested you to sign "${param.title}"`;
  const body =
    `<div><p style='font-size:14px;margin-bottom:10px'>` +
    param.senderName +
    ' has requested you to review and sign <strong>' +
    param.title +
    "</strong>.</p><div style='padding: 5px 0px 5px 25px;display:flex;flex-direction:row;justify-content:space-around'><table><tr><td style='font-weight:bold;font-family:sans-serif;font-size:15px'>Sender</td><td></td><td style='color:#626363;font-weight:bold'>" +
    param.senderMail +
    "</td></tr><tr><td style='font-weight:bold;font-family:sans-serif;font-size:15px'>Organization</td><td></td><td style='color:#626363;font-weight:bold'> " +
    param.organization +
    "</td></tr><tr><td style='font-weight:bold;font-family:sans-serif;font-size:15px'>Expires on</td><td></td><td style='color:#626363;font-weight:bold'>" +
    param.localExpireDate +
    "</td></tr><tr><td style='font-weight:bold;font-family:sans-serif;font-size:15px'>Note</td><td></td><td style='color:#626363;font-weight:bold'>" +
    param.note +
    "</td></tr><tr><td></td><td></td></tr></table></div> <div style='margin-left:70px'><a target=_blank href=" +
    param.signingUrl +
    "><button style='padding:12px;background-color:#d46b0f;color:white;border:0px;font-weight:bold;margin-top:30px'>Sign here</button></a></div><div style='display:flex;justify-content:center;margin-top:10px'></div></div>";

  return { subject, body };
};

export const selectFormat = data => {
  switch (data) {
    case 'L':
      return 'MM/dd/yyyy';
    case 'MM/DD/YYYY':
      return 'MM/dd/yyyy';
    case 'DD-MM-YYYY':
      return 'dd-MM-yyyy';
    case 'DD/MM/YYYY':
      return 'dd/MM/yyyy';
    case 'LL':
      return 'MMMM dd, yyyy';
    case 'DD MMM, YYYY':
      return 'dd MMM, yyyy';
    case 'YYYY-MM-DD':
      return 'yyyy-MM-dd';
    case 'MM-DD-YYYY':
      return 'MM-dd-yyyy';
    case 'MM.DD.YYYY':
      return 'MM.dd.yyyy';
    case 'MMM DD, YYYY':
      return 'MMM dd, yyyy';
    case 'MMMM DD, YYYY':
      return 'MMMM dd, yyyy';
    case 'DD MMMM, YYYY':
      return 'dd MMMM, yyyy';
    case 'DD.MM.YYYY':
      return 'dd.MM.yyyy';
    default:
      return 'MM/dd/yyyy';
  }
};

export function formatDateTime(date, dateFormat, timeZone, is12Hour) {
  const zonedDate = toZonedTime(date, timeZone); // Convert date to the given timezone
  const timeFormat = is12Hour ? 'hh:mm:ss a' : 'HH:mm:ss';
  return dateFormat
    ? format(zonedDate, `${selectFormat(dateFormat)}, ${timeFormat} 'GMT' XXX`, { timeZone })
    : formatTimeInTimezone(date, timeZone);
}
export const randomId = () => {
  const randomBytes = crypto.getRandomValues(new Uint16Array(1));
  const randomValue = randomBytes[0];
  const randomDigit = 1000 + (randomValue % 9000);
  return randomDigit;
};

export const handleValidImage = async Placeholder => {
  const updatedPlaceholders = [];

  for (const placeholder of Placeholder || []) {
    //Clean and format signerPtr
    let signerPtr = placeholder.signerPtr;
    // Check if signerPtr exists and has an id
    if (signerPtr?.id) {
      // Case 1: If signerPtr is a Parse Object instance
      if (signerPtr instanceof Parse.Object) {
        // If signerPtr has no attributes, it’s a plain pointer already
        if (!signerPtr.attributes || Object.keys(signerPtr.attributes).length === 0) {
          // Convert to a clean pointer using Parse’s built-in method
          signerPtr = signerPtr.toPointer();
        } else {
          // If it has attributes, manually construct the pointer object
          signerPtr = {
            __type: 'Pointer',
            className: signerPtr.className,
            objectId: signerPtr.id,
          };
        }
        // Case 2: If signerPtr is already a plain JS object resembling a pointer
      } else if (typeof signerPtr === 'object' && signerPtr.className && signerPtr.objectId) {
        // Normalize it to a valid Parse pointer object
        signerPtr = {
          __type: 'Pointer',
          className: signerPtr.className,
          objectId: signerPtr.objectId,
        };
      }
    }

    //Process placeHolder if Role is 'prefill'
    if (placeholder?.Role === 'prefill') {
      const updatedRole = [];
      for (const item of placeholder.placeHolder || []) {
        const updatedPos = [];
        for (const posItem of item.pos || []) {
          if (
            (posItem?.type === 'image' || posItem?.type === 'draw') &&
            posItem?.options?.response
          ) {
            const validUrl = await getPresignedUrl(posItem?.options?.response);
            updatedPos.push({
              ...posItem,
              ...(item.SignUrl !== undefined && { SignUrl: validUrl }),
              options: { ...posItem.options, response: validUrl },
            });
          } else {
            updatedPos.push(posItem);
          }
        }
        updatedRole.push({ ...item, pos: updatedPos });
      }

      updatedPlaceholders.push({ ...placeholder, signerPtr, placeHolder: updatedRole });
    } else {
      // Not prefill role, just push as-is
      updatedPlaceholders.push({ ...placeholder, signerPtr });
    }
  }
  return updatedPlaceholders;
};
