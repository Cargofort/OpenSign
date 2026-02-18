import axios from 'axios';
import { cloudServerUrl, serverAppId } from '../../Utils.js';
const serverUrl = cloudServerUrl; //process.env.SERVER_URL;
const APPID = serverAppId;
const masterKEY = process.env.MASTER_KEY;
const ssoApiUrl = process.env.SSO_API_URL || 'https://sso.opensignlabs.com/api';
const ssoUserinfoPath = process.env.SSO_USERINFO_PATH || '/oauth/userinfo';
const ssoRoleClaim = process.env.SSO_ROLE_CLAIM || 'opensign_role';

/** Returns { org, tenantId, team } if any organization exists (single-org mode). Otherwise null. */
async function getExistingOrgAndTeam() {
  // Single-org mode expects one org; pick earliest created deterministically when multiple exist.
  const org = await new Parse.Query('contracts_Organizations')
    .ascending('createdAt')
    .first({ useMasterKey: true });
  if (!org) return null;
  const tenantId = org.get('TenantId')?.id;
  if (!tenantId) return null;
  const team = await new Parse.Query('contracts_Teams')
    .equalTo('OrganizationId', { __type: 'Pointer', className: 'contracts_Organizations', objectId: org.id })
    .equalTo('Name', 'All Users')
    .first({ useMasterKey: true });
  if (!team) return null;
  return { org, tenantId, team };
}

async function saveUser(userDetails, request) {
  const email = userDetails?.email?.toLowerCase?.()?.replace(/\s/g, '');
  if (!email) {
    throw new Parse.Error(400, 'Email is required');
  }

  // SSO users completing signup: client passes isSsoSignup when modal is shown (authData.sso users only)
  if (request.params.isSsoSignup && request?.user) {
    const sessionToken = request.user.getSessionToken?.();
    if (sessionToken) {
      return { id: request.user.id, sessionToken };
    }
  }

  let userRes = await new Parse.Query(Parse.User).equalTo('username', email).first({ useMasterKey: true });
  if (!userRes) {
    userRes = await new Parse.Query(Parse.User).equalTo('email', email).first({ useMasterKey: true });
  }
  if (!userRes) {
    userRes = await new Parse.Query(Parse.User)
      .equalTo('authData.sso.id', email)
      .first({ useMasterKey: true });
  }

  if (userRes) {
    const url = `${serverUrl}/loginAs`;
    const axiosRes = await axios({
      method: 'POST',
      url: url,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'X-Parse-Application-Id': APPID,
        'X-Parse-Master-Key': masterKEY,
      },
      params: {
        userId: userRes.id,
      },
    });
    const login = await axiosRes.data;
    // console.log("login ", login);
    return { id: login.objectId, sessionToken: login.sessionToken };
  } else {
    const user = new Parse.User();
    user.set('username', userDetails.email);
    user.set('password', userDetails.password);
    user.set('email', userDetails?.email?.toLowerCase()?.replace(/\s/g, ''));
    if (userDetails?.phone) {
      user.set('phone', userDetails.phone);
    }
    user.set('name', userDetails.name);

    const res = await user.signUp();
    // console.log("res ", res);
    return { id: res.id, sessionToken: res.getSessionToken() };
  }
}

function mapSsoRoleToOpenSign(rawRole) {
  const role = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : '';
  if (role === 'editor' || role === 'contracts_editor') return 'contracts_Editor';
  if (
    role === 'orgadmin' || 
    role === 'org_admin' || 
    role === 'contracts_orgadmin' || 
    role === 'admin'
  )
    return 'contracts_Admin';
  return 'contracts_User';
}

async function resolveSsoRole(request) {
  const fallbackRole = 'contracts_User';
  if (!request.params.isSsoSignup || !request?.user) return fallbackRole;
  try {
    const authData = request.user.get('authData') || {};
    const accessToken = authData?.sso?.access_token;
    if (!accessToken) return fallbackRole;
    const userinfoUrl = ssoApiUrl.replace(/\/$/, '') + ssoUserinfoPath;
    const response = await axios.get(userinfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const userInfo = response.data || {};
    const claimVal = userInfo[ssoRoleClaim];
    const rawRole = Array.isArray(claimVal) ? claimVal[0] : claimVal;
    return mapSsoRoleToOpenSign(rawRole);
  } catch (e) {
    console.warn('[usersignup] Could not resolve role from SSO claim:', e?.message);
    return fallbackRole;
  }
}
const looksLikeHash = (v) =>
  v &&
  typeof v === 'string' &&
  ((v.length > 20 && !v.includes('@') && !/\s/.test(v)) || /^[a-f0-9]{32,64}$/i.test(v));

export default async function usersignup(request) {
  const userDetails = request.params.userDetails;

  if (request.params.isSsoSignup) {
    if (!userDetails?.email || looksLikeHash(userDetails.email) || !userDetails.email.includes('@')) {
      throw new Parse.Error(400, 'Valid email from SSO provider is required.');
    }
    if (userDetails.name && looksLikeHash(userDetails.name)) {
      throw new Parse.Error(400, 'Name appears invalid. Please use your display name from SSO.');
    }
  }

  try {
    const user = await saveUser(userDetails, request);
    const effectiveRole = request.params.isSsoSignup
      ? await resolveSsoRole(request)
      : userDetails.role;
    const extClass = effectiveRole.split('_')[0];

    const extQuery = new Parse.Query(extClass + '_Users');
    extQuery.equalTo('UserId', {
      __type: 'Pointer',
      className: '_User',
      objectId: user.id,
    });
    const extUser = await extQuery.first({ useMasterKey: true });
    if (extUser) {
      // SSO signup: user already has profile (e.g. double-submit or refresh) — treat as success
      if (request.params.isSsoSignup) {
        return { message: 'User sign up', sessionToken: user.sessionToken };
      }
      return { message: 'User already exist' };
    } else {
      const extCls = Parse.Object.extend(extClass + '_Users');
      const newObj = new extCls();
      newObj.set('UserId', {
        __type: 'Pointer',
        className: '_User',
        objectId: user.id,
      });
      newObj.set('UserRole', effectiveRole);
      newObj.set('Email', userDetails?.email?.toLowerCase()?.replace(/\s/g, ''));
      newObj.set('Name', userDetails.name);
      if (userDetails?.phone) {
        newObj.set('Phone', userDetails?.phone);
      }
      if (userDetails && userDetails.company) {
        newObj.set('Company', userDetails.company);
      }
      if (userDetails && userDetails.jobTitle) {
        newObj.set('JobTitle', userDetails.jobTitle);
      }
      if (userDetails && userDetails?.timezone) {
        newObj.set('Timezone', userDetails.timezone);
      }

      const existing = await getExistingOrgAndTeam();
      let tenantRes;

      if (existing) {
        tenantRes = { id: existing.tenantId };
        newObj.set('TenantId', {
          __type: 'Pointer',
          className: 'partners_Tenant',
          objectId: existing.tenantId,
        });
        newObj.set('OrganizationId', {
          __type: 'Pointer',
          className: 'contracts_Organizations',
          objectId: existing.org.id,
        });
        newObj.set('TeamIds', [
          { __type: 'Pointer', className: 'contracts_Teams', objectId: existing.team.id },
        ]);
      } else {
        const partnerCls = Parse.Object.extend('partners_Tenant');
        const partnerQuery = new partnerCls();
        partnerQuery.set('UserId', {
          __type: 'Pointer',
          className: '_User',
          objectId: user.id,
        });
        if (userDetails?.phone) partnerQuery.set('ContactNumber', userDetails.phone);
        partnerQuery.set('TenantName', userDetails.company || 'Default');
        partnerQuery.set('EmailAddress', userDetails?.email?.toLowerCase()?.replace(/\s/g, ''));
        partnerQuery.set('IsActive', true);
        partnerQuery.set('CreatedBy', {
          __type: 'Pointer',
          className: '_User',
          objectId: user.id,
        });
        if (userDetails?.pincode) partnerQuery.set('PinCode', userDetails.pincode);
        if (userDetails?.country) partnerQuery.set('Country', userDetails.country);
        if (userDetails?.state) partnerQuery.set('State', userDetails.state);
        if (userDetails?.city) partnerQuery.set('City', userDetails.city);
        if (userDetails?.address) partnerQuery.set('Address', userDetails.address);
        tenantRes = await partnerQuery.save(null, { useMasterKey: true });

        newObj.set('TenantId', {
          __type: 'Pointer',
          className: 'partners_Tenant',
          objectId: tenantRes.id,
        });
      }

      const extRes = await newObj.save(null, { useMasterKey: true });

      if (!existing) {
        const orgCls = new Parse.Object('contracts_Organizations');
        orgCls.set('Name', userDetails.company || 'Default');
        orgCls.set('IsActive', true);
        orgCls.set('ExtUserId', {
          __type: 'Pointer',
          className: 'contracts_Users',
          objectId: extRes.id,
        });
        orgCls.set('TenantId', {
          __type: 'Pointer',
          className: 'partners_Tenant',
          objectId: tenantRes.id,
        });
        orgCls.set('CreatedBy', {
          __type: 'Pointer',
          className: '_User',
          objectId: user.id,
        });
        const orgRes = await orgCls.save(null, { useMasterKey: true });

        const teamCls = new Parse.Object('contracts_Teams');
        teamCls.set('Name', 'All Users');
        teamCls.set('OrganizationId', {
          __type: 'Pointer',
          className: 'contracts_Organizations',
          objectId: orgRes.id,
        });
        teamCls.set('IsActive', true);
        const teamRes = await teamCls.save(null, { useMasterKey: true });

        newObj.set('OrganizationId', {
          __type: 'Pointer',
          className: 'contracts_Organizations',
          objectId: orgRes.id,
        });
        newObj.set('TeamIds', [
          { __type: 'Pointer', className: 'contracts_Teams', objectId: teamRes.id },
        ]);
        await newObj.save(null, { useMasterKey: true });
      }

      // Update Parse _User with email/name so profile displays correctly (SSO users often lack these)
      if (request.params.isSsoSignup && user.id) {
        try {
          const parseUser = await new Parse.Query(Parse.User).get(user.id, { useMasterKey: true });
          if (parseUser) {
            const emailVal = userDetails?.email?.toLowerCase?.()?.replace(/\s/g, '');
            if (emailVal) parseUser.set('email', emailVal);
            if (userDetails?.name) parseUser.set('name', userDetails.name);
            await parseUser.save(null, { useMasterKey: true });
          }
        } catch (e) {
          console.warn('Could not update Parse user email/name:', e?.message);
        }
      }

      return { message: 'User sign up', sessionToken: user.sessionToken };
    }
  } catch (err) {
    console.log('Err ', err);
    throw err;
  }
}
