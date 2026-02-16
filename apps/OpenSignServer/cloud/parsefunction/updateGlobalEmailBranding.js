import {
  EMAIL_BRANDING_CLASS_NAME,
  EMAIL_BRANDING_SETTINGS_KEY,
  getDefaultEmailBrandingConfig,
  sanitizeEmailBrandingPayload,
} from '../../Utils.js';

export default async function updateGlobalEmailBranding(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'User is not authenticated.');
  }
  const details = request.params?.details;
  if (!details || typeof details !== 'object') {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Missing branding details.');
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
    const config = sanitizeEmailBrandingPayload({
      ...getDefaultEmailBrandingConfig(),
      ...details,
    });

    const brandingObj = existing || new Parse.Object(EMAIL_BRANDING_CLASS_NAME);
    brandingObj.set('Key', EMAIL_BRANDING_SETTINGS_KEY);
    brandingObj.set('logoUrl', config.logoUrl);
    brandingObj.set('primaryColor', config.primaryColor);
    brandingObj.set('footerText', config.footerText);
    brandingObj.set('wrapperHtml', config.wrapperHtml);

    await brandingObj.save(null, { useMasterKey: true });
    return config;
  } catch (error) {
    throw error;
  }
}
