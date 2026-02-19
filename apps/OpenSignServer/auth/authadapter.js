import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const ssoApiUrl = process.env.SSO_API_URL || 'https://sso.opensignlabs.com/api';
const ssoUserinfoPath = process.env.SSO_USERINFO_PATH || '/oauth/userinfo';
const ssoAllowedGroups = process.env.SSO_ALLOWED_GROUPS
  ? process.env.SSO_ALLOWED_GROUPS.split(',').map((g) => g.trim()).filter(Boolean)
  : null;
const ssoGroupsClaim = process.env.SSO_GROUPS_CLAIM || 'groups';

function assertInternalUser(userInfo) {
  if (!ssoAllowedGroups || ssoAllowedGroups.length === 0) return;
  const userGroups = userInfo[ssoGroupsClaim];
  const groups = Array.isArray(userGroups) ? userGroups : [];
  const hasAllowedGroup = groups.some((g) =>
    ssoAllowedGroups.includes(typeof g === 'string' ? g : String(g))
  );
  if (!hasAllowedGroup) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[SSO] Group check failed. userinfo keys:', Object.keys(userInfo), '| groups claim:', ssoGroupsClaim, '| received:', groups, '| allowed:', ssoAllowedGroups);
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Only internal users are allowed to sign in. Contact your administrator.'
    );
  }
}

export const SSOAuth = {
  // Returns a promise that fulfills if this user mail is valid.
  validateAuthData: async authData => {
    try {
      const userinfoUrl = ssoApiUrl.replace(/\/$/, '') + ssoUserinfoPath;
      const response = await axios.get(userinfoUrl, {
        headers: {
          Authorization: `Bearer ${authData.access_token}`,
        },
      });
      const data = response.data;
      const userId = data.id || data.sub;
      if (userId && data.email?.toLowerCase?.()?.replace(/\s/g, '') === authData.id) {
        assertInternalUser(data);
        return;
      }
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'SSO auth is invalid for this user.');
    } catch (error) {
      if (error instanceof Parse.Error) throw error;
      console.log('error in sso adapter', error?.response);
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'SSO auth is invalid for this user.');
    }
  },

  // Returns a promise that fulfills if this app id is valid.
  validateAppId: () => {
    return Promise.resolve();
  },
};
