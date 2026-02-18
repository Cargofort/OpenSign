const looksLikeHash = (v) =>
  v &&
  typeof v === 'string' &&
  ((v.length > 20 && !v.includes('@') && !/\s/.test(v)) || /^[a-f0-9]{32,64}$/i.test(v));

async function getUserDetails(request) {
  const reqEmail = request.params.email;
  if (reqEmail || request.user) {
    try {
      const userId = request.params.userId;
      const userQuery = new Parse.Query('contracts_Users');
      if (reqEmail) {
        userQuery.equalTo('Email', reqEmail);
      } else {
        // Prefer lookup by UserId (works for SSO users where email may not be set on _User)
        userQuery.equalTo('UserId', request.user);
      }
      userQuery.include('TenantId');
      userQuery.include('UserId');
      userQuery.include('CreatedBy');
      userQuery.exclude('CreatedBy.authData');
      userQuery.exclude('TenantId.FileAdapters');
      userQuery.exclude('google_refresh_token');
      userQuery.exclude('TenantId.PfxFile');
      if (userId) {
        userQuery.equalTo('CreatedBy', { __type: 'Pointer', className: '_User', objectId: userId });
      }
      const res = await userQuery.first({ useMasterKey: true });
      if (res) {
        if (reqEmail) {
          return { objectId: res.id };
        }
        const extEmail = res.get('Email') || '';
        const extName = res.get('Name') || '';
        if (looksLikeHash(extEmail) || looksLikeHash(extName)) {
          const parseUser = res.get('UserId');
          if (parseUser) {
            const pu = await new Parse.Query(Parse.User).get(parseUser.id, { useMasterKey: true });
            const puEmail = pu?.get('email') || '';
            const puName = pu?.get('name') || '';
            if (puEmail && !looksLikeHash(puEmail)) res.set('Email', puEmail);
            if (puName && !looksLikeHash(puName)) res.set('Name', puName);
            try {
              await res.save(null, { useMasterKey: true });
            } catch (e) {
              console.warn('[getUserDetails] Could not persist profile fix:', e?.message);
            }
          }
        }
        return res;
      } else {
        return '';
      }
    } catch (err) {
      console.log('Err ', err);
      const code = err?.code || 400;
      const msg = err?.message || 'Something went wrong.';
      throw new Parse.Error(code, msg);
    }
  } else {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'User is not authenticated.');
  }
}
export default getUserDetails;
