/**
 * Backfill OrgAdmin ACL on existing contracts_Document records.
 *
 * For each org that has at least one OrgAdmin:
 *   1. Resolve all _User ids of org members (to find their documents).
 *   2. Resolve all _User ids of org OrgAdmins.
 *   3. For each document whose CreatedBy is an org member, add read+write
 *      ACL entries for every OrgAdmin in that org.
 *
 * Idempotent: setting an existing ACL entry is a no-op.
 */

const BATCH = 200;

/**
 * @param {Parse} Parse
 */
exports.up = async Parse => {
  const orgsQuery = new Parse.Query('contracts_Organizations');
  orgsQuery.limit(1000);
  const orgs = await orgsQuery.find({ useMasterKey: true });

  for (const org of orgs) {
    const orgId = org.id;

    // Find OrgAdmin _User ids for this org
    const adminQuery = new Parse.Query('contracts_Users');
    adminQuery.equalTo('OrganizationId', {
      __type: 'Pointer',
      className: 'contracts_Organizations',
      objectId: orgId,
    });
    adminQuery.equalTo('UserRole', 'contracts_OrgAdmin');
    adminQuery.select('UserId');
    adminQuery.limit(1000);
    const adminRows = await adminQuery.find({ useMasterKey: true });
    const orgAdminIds = adminRows
      .map(r => r.get('UserId')?.id || r.get('UserId')?.objectId)
      .filter(Boolean);

    if (orgAdminIds.length === 0) continue;

    // Find all _User ids that are members of this org
    const memberQuery = new Parse.Query('contracts_Users');
    memberQuery.equalTo('OrganizationId', {
      __type: 'Pointer',
      className: 'contracts_Organizations',
      objectId: orgId,
    });
    memberQuery.select('UserId');
    memberQuery.limit(1000);
    const memberRows = await memberQuery.find({ useMasterKey: true });
    const memberIds = memberRows
      .map(r => r.get('UserId')?.id || r.get('UserId')?.objectId)
      .filter(Boolean);

    if (memberIds.length === 0) continue;

    const memberPointers = memberIds.map(id => ({
      __type: 'Pointer',
      className: '_User',
      objectId: id,
    }));

    // Paginate through all documents created by org members and update ACL
    let skip = 0;
    let updated = 0;
    while (true) {
      const docQuery = new Parse.Query('contracts_Document');
      docQuery.containedIn('CreatedBy', memberPointers);
      docQuery.limit(BATCH);
      docQuery.skip(skip);
      const docs = await docQuery.find({ useMasterKey: true });
      if (docs.length === 0) break;

      await Promise.all(
        docs.map(async doc => {
          const acl = doc.getACL() || new Parse.ACL();
          orgAdminIds.forEach(id => {
            acl.setReadAccess(id, true);
            acl.setWriteAccess(id, true);
          });
          doc.setACL(acl);
          await doc.save(null, { useMasterKey: true });
        })
      );

      updated += docs.length;
      skip += docs.length;
      if (docs.length < BATCH) break;
    }

    console.log(`[backfill_orgadmin_doc_acl] org=${orgId} admins=${orgAdminIds.length} docs updated=${updated}`);
  }
};

/**
 * @param {Parse} Parse
 */
exports.down = async _Parse => {
  // ACL changes are not trivially reversible without knowing prior state.
  // This migration is intentionally non-reversible.
  console.log('[backfill_orgadmin_doc_acl] down: no-op (ACL changes are not reversed automatically)');
};
