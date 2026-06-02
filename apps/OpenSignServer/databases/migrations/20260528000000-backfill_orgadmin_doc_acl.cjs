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
 * Resilient: a failure for one org is logged and skipped; others continue.
 */

const PAGE = 1000;
const DOC_BATCH = 200;

/** Paginate any query and return all results. */
async function findAll(buildQuery) {
  const results = [];
  let skip = 0;
  while (true) {
    const q = buildQuery();
    q.limit(PAGE);
    q.skip(skip);
    const batch = await q.find({ useMasterKey: true });
    results.push(...batch);
    skip += batch.length;
    if (batch.length < PAGE) break;
  }
  return results;
}

/**
 * @param {Parse} Parse
 */
exports.up = async Parse => {
  // Paginate through all organisations
  let orgSkip = 0;
  while (true) {
    const orgsQuery = new Parse.Query('contracts_Organizations');
    orgsQuery.ascending('objectId');
    orgsQuery.limit(PAGE);
    orgsQuery.skip(orgSkip);
    const orgs = await orgsQuery.find({ useMasterKey: true });
    if (orgs.length === 0) break;

    for (const org of orgs) {
      const orgId = org.id;
      try {
        // Paginate OrgAdmin _User ids for this org
        const adminRows = await findAll(() => {
          const q = new Parse.Query('contracts_Users');
          q.equalTo('OrganizationId', {
            __type: 'Pointer',
            className: 'contracts_Organizations',
            objectId: orgId,
          });
          q.equalTo('UserRole', 'contracts_OrgAdmin');
          q.select('UserId');
          return q;
        });
        const orgAdminIds = adminRows
          .map(r => r.get('UserId')?.id || r.get('UserId')?.objectId)
          .filter(Boolean);

        if (orgAdminIds.length === 0) continue;

        // Paginate all member _User ids for this org
        const memberRows = await findAll(() => {
          const q = new Parse.Query('contracts_Users');
          q.equalTo('OrganizationId', {
            __type: 'Pointer',
            className: 'contracts_Organizations',
            objectId: orgId,
          });
          q.select('UserId');
          return q;
        });
        const memberIds = [
          ...new Set(
            memberRows
              .map(r => r.get('UserId')?.id || r.get('UserId')?.objectId)
              .filter(Boolean)
          ),
        ];

        if (memberIds.length === 0) continue;

        const memberPointers = memberIds.map(id => ({
          __type: 'Pointer',
          className: '_User',
          objectId: id,
        }));

        // Paginate through all documents created by org members and update ACL
        let docSkip = 0;
        let updated = 0;
        let failed = 0;
        while (true) {
          const docQuery = new Parse.Query('contracts_Document');
          docQuery.containedIn('CreatedBy', memberPointers);
          docQuery.limit(DOC_BATCH);
          docQuery.skip(docSkip);
          const docs = await docQuery.find({ useMasterKey: true });
          if (docs.length === 0) break;

          const settled = await Promise.allSettled(
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

          settled.forEach((result, i) => {
            if (result.status === 'rejected') {
              failed++;
              console.error(
                `[backfill_orgadmin_doc_acl] org=${orgId} doc=${docs[i]?.id} error=`,
                result.reason
              );
            }
          });

          updated += docs.length - settled.filter(r => r.status === 'rejected').length;
          docSkip += docs.length;
          if (docs.length < DOC_BATCH) break;
        }

        console.log(
          `[backfill_orgadmin_doc_acl] org=${orgId} admins=${orgAdminIds.length} updated=${updated} failed=${failed}`
        );
      } catch (error) {
        console.error(`[backfill_orgadmin_doc_acl] org=${orgId} error=`, error);
        // Continue to next org
      }
    }

    orgSkip += orgs.length;
    if (orgs.length < PAGE) break;
  }
};

/**
 * @param {Parse} Parse
 */
exports.down = async _Parse => {
  // ACL changes are not trivially reversible without knowing prior state.
  console.log('[backfill_orgadmin_doc_acl] down: no-op (ACL changes are not reversed automatically)');
};
