import {
  EMAIL_BRANDING_CLASS_NAME,
  EMAIL_BRANDING_SETTINGS_KEY,
  getDefaultEmailBrandingConfig,
  sanitizeEmailBrandingPayload,
} from '../../Utils.js';

export default async function getGlobalEmailBranding(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'User is not authenticated.');
  }
  try {
    const userQuery = new Parse.Query('contracts_Users');
    userQuery.equalTo('UserId', request.user);
    const extUser = await userQuery.first({ useMasterKey: true });
    const role = extUser?.get('UserRole');
    const isAdmin = role === 'contracts_Admin' || role === 'contracts_OrgAdmin';
    if (!isAdmin) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Unauthorized.');
    }

    const query = new Parse.Query(EMAIL_BRANDING_CLASS_NAME);
    query.equalTo('Key', EMAIL_BRANDING_SETTINGS_KEY);
    const existing = await query.first({ useMasterKey: true });
    if (!existing) {
      return getDefaultEmailBrandingConfig();
    }
    const existingJson = existing.toJSON?.() || {};
    return sanitizeEmailBrandingPayload({
      logoUrl: existingJson.logoUrl,
      primaryColor: existingJson.primaryColor,
      footerText: existingJson.footerText,
      wrapperHtml: existingJson.wrapperHtml,
    });
  } catch (error) {
    throw error;
  }
}
