/**
 * Shared helpers for org-scoped access control.
 * Used by listing queries (getReport, getDrive, filterDocs)
 * and DocumentAftersave ACL grants.
 */

/**
 * Returns { extUserRow, role, orgId } for a given _User objectId,
 * or null if no contracts_Users row exists.
 */
export async function getCallerOrgContext(userId) {
  const query = new Parse.Query('contracts_Users');
  query.equalTo('UserId', { __type: 'Pointer', className: '_User', objectId: userId });
  const extUser = await query.first({ useMasterKey: true });
  if (!extUser) return null;
  const role = extUser.get('UserRole');
  const orgPtr = extUser.get('OrganizationId');
  const orgId = orgPtr?.id || orgPtr?.objectId;
  return { extUserRow: extUser, role, orgId };
}

/**
 * Returns _User objectIds of all contracts_Users in the given org.
 * Uses query.each() to page through all rows regardless of org size.
 */
export async function listUserIdsInOrg(orgId) {
  const query = new Parse.Query('contracts_Users');
  query.equalTo('OrganizationId', {
    __type: 'Pointer',
    className: 'contracts_Organizations',
    objectId: orgId,
  });
  query.select('UserId');
  const ids = [];
  await query.each(
    r => {
      const id = r.get('UserId')?.id || r.get('UserId')?.objectId;
      if (id) ids.push(id);
    },
    { useMasterKey: true, batchSize: 1000 }
  );
  return [...new Set(ids)];
}

/**
 * Returns _User objectIds of OrgAdmin contracts_Users in the given org.
 * Uses query.each() to page through all rows regardless of org size.
 */
export async function listOrgAdminUserIdsForOrg(orgId) {
  const query = new Parse.Query('contracts_Users');
  query.equalTo('OrganizationId', {
    __type: 'Pointer',
    className: 'contracts_Organizations',
    objectId: orgId,
  });
  query.equalTo('UserRole', 'contracts_OrgAdmin');
  query.select('UserId');
  const ids = [];
  await query.each(
    r => {
      const id = r.get('UserId')?.id || r.get('UserId')?.objectId;
      if (id) ids.push(id);
    },
    { useMasterKey: true, batchSize: 1000 }
  );
  return [...new Set(ids)];
}

/**
 * Grants read+write ACL on every org document to a newly promoted OrgAdmin.
 * Paginates through all documents; call fire-and-forget from addUser/usersignup.
 */
export async function backfillOrgAdminAcl(newUserId, orgId) {
  const orgUserIds = await listUserIdsInOrg(orgId);
  if (orgUserIds.length === 0) return;
  const BATCH = 200;
  let skip = 0;
  while (true) {
    const docQuery = new Parse.Query('contracts_Document');
    docQuery.containedIn(
      'CreatedBy',
      orgUserIds.map(id => ({ __type: 'Pointer', className: '_User', objectId: id }))
    );
    docQuery.limit(BATCH);
    docQuery.skip(skip);
    const docs = await docQuery.find({ useMasterKey: true });
    if (docs.length === 0) break;
    await Promise.all(
      docs.map(async doc => {
        const acl = doc.getACL() || new Parse.ACL();
        acl.setReadAccess(newUserId, true);
        acl.setWriteAccess(newUserId, true);
        doc.setACL(acl);
        await doc.save(null, { useMasterKey: true });
      })
    );
    skip += docs.length;
    if (docs.length < BATCH) break;
  }
}
