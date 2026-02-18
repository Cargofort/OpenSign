import axios from 'axios';
import { cloudServerUrl, serverAppId } from '../../Utils.js';

const serverUrl = cloudServerUrl;
const APPID = serverAppId;
const masterKEY = process.env.MASTER_KEY;
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
    console.warn('[ssoLogin] Group check failed. userinfo keys:', Object.keys(userInfo), '| groups claim:', ssoGroupsClaim, '| received:', userInfo[ssoGroupsClaim], '| allowed:', ssoAllowedGroups);
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Only internal users are allowed to sign in. Contact your administrator.'
    );
  }
}

/**
 * SSO login for existing users. Validates the OAuth access token, looks up an existing
 * Parse User by email (username), and returns a session via loginAs. This allows users
 * who signed up with email/password to log in via SSO without creating a duplicate account.
 * Returns { needSignup: true } when no existing user is found - client should use
 * logInWith for new users.
 */
export default async function ssoLogin(request) {
  const accessToken = request.params.access_token;
  if (!accessToken) {
    throw new Parse.Error(400, 'access_token is required');
  }

  try {
    const userinfoUrl = ssoApiUrl.replace(/\/$/, '') + ssoUserinfoPath;
    const response = await axios.get(userinfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userInfo = response.data;
    assertInternalUser(userInfo);

    if (!userInfo.email || typeof userInfo.email !== 'string') {
      throw new Parse.Error(400, 'Email not found in user info. Ensure your OIDC provider includes the email claim.');
    }
    const email = userInfo.email.toLowerCase().replace(/\s/g, '');
    if (!email || !email.includes('@')) {
      throw new Parse.Error(400, 'Invalid email in user info.');
    }

    const authName =
      userInfo.name || userInfo.given_name || userInfo.preferred_username || email;
    const looksLikeHash = (v) =>
      v &&
      typeof v === 'string' &&
      ((v.length > 20 && !v.includes('@') && !/\s/.test(v)) || /^[a-f0-9]{32,64}$/i.test(v));

    // Look up existing _User (may have username=email or username=sub from old SSO flow)
    let parseUser = await new Parse.Query(Parse.User).equalTo('username', email).first({ useMasterKey: true });
    if (!parseUser) {
      parseUser = await new Parse.Query(Parse.User).equalTo('email', email).first({ useMasterKey: true });
    }
    if (!parseUser && userInfo.sub) {
      parseUser = await new Parse.Query(Parse.User)
        .equalTo('authData.sso.id', userInfo.sub)
        .first({ useMasterKey: true });
    }

    if (!parseUser) {
      return { needSignup: true };
    }

    // Verify user has contracts_Users (is a proper OpenSign user)
    const extUserQuery = new Parse.Query('contracts_Users');
    extUserQuery.equalTo('UserId', parseUser);
    const extUser = await extUserQuery.first({ useMasterKey: true });

    if (!extUser) {
      return { needSignup: true };
    }

    const loginAsRes = await axios({
      method: 'POST',
      url: `${serverUrl}/loginAs`,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'X-Parse-Application-Id': APPID,
        'X-Parse-Master-Key': masterKEY,
      },
      params: {
        userId: parseUser.id,
      },
    });

    const { objectId, sessionToken } = loginAsRes.data;
    if (!sessionToken) {
      throw new Parse.Error(500, 'Failed to obtain session');
    }

    // Fix profiles that stored sub/hash instead of real name/email (existing users)
    if (extUser && userInfo.email) {
      const storedEmail = extUser.get('Email') || '';
      const storedName = extUser.get('Name') || '';
      const puEmail = parseUser.get('email') || '';
      const puUsername = parseUser.get('username') || '';
      const needsFix =
        looksLikeHash(storedEmail) ||
        looksLikeHash(storedName) ||
        looksLikeHash(puEmail) ||
        looksLikeHash(puUsername);
      if (needsFix) {
        try {
          const realEmail = userInfo.email.toLowerCase().replace(/\s/g, '');
          extUser.set('Email', realEmail);
          extUser.set('Name', authName);
          await extUser.save(null, { useMasterKey: true });
          const pu = await new Parse.Query(Parse.User).get(parseUser.id, { useMasterKey: true });
          pu.set('email', realEmail);
          pu.set('name', authName);
          if (looksLikeHash(puUsername)) pu.set('username', realEmail);
          await pu.save(null, { useMasterKey: true });
        } catch (e) {
          console.warn('[ssoLogin] Could not fix profile:', e?.message);
        }
      }
    }

    return { sessionToken, objectId };
  } catch (err) {
    if (err instanceof Parse.Error) {
      throw err;
    }
    if (err?.response?.status === 401 || err?.response?.status === 403) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'SSO token is invalid or expired.');
    }
    console.error('ssoLogin error:', err?.response?.data || err);
    throw new Parse.Error(500, err?.message || 'SSO login failed');
  }
}
