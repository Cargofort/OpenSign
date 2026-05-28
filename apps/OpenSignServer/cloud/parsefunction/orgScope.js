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
 */
export async function listUserIdsInOrg(orgId) {
  const query = new Parse.Query('contracts_Users');
  query.equalTo('OrganizationId', {
    __type: 'Pointer',
    className: 'contracts_Organizations',
    objectId: orgId,
  });
  query.select('UserId');
  query.limit(1000);
  const results = await query.find({ useMasterKey: true });
  return results
    .map(r => r.get('UserId')?.id || r.get('UserId')?.objectId)
    .filter(Boolean);
}

/**
 * Returns _User objectIds of OrgAdmin contracts_Users in the given org.
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
  query.limit(1000);
  const results = await query.find({ useMasterKey: true });
  return results
    .map(r => r.get('UserId')?.id || r.get('UserId')?.objectId)
    .filter(Boolean);
}
