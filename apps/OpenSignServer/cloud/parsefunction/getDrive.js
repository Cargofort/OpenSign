import axios from 'axios';
import { cloudServerUrl, serverAppId } from '../../Utils.js';
import { getCallerOrgContext, listUserIdsInOrg } from './orgScope.js';
export default async function getDrive(request) {
  const serverUrl = cloudServerUrl; //process.env.SERVER_URL;
  const appId = serverAppId;
  const limit = request.params.limit;
  const skip = request.params.skip;
  const docId = request.params.docId;
  try {
    const userRes = await axios.get(serverUrl + '/users/me', {
      headers: {
        'X-Parse-Application-Id': appId,
        'X-Parse-Session-Token': request.headers['sessiontoken'],
      },
    });
    const userId = userRes.data && userRes.data.objectId;
    if (userId) {
      try {
        const query = new Parse.Query('contracts_Document');
        if (docId) {
          query.equalTo('Folder', {
            __type: 'Pointer',
            className: 'contracts_Document',
            objectId: docId,
          });
          query.include('Folder');
        } else {
          query.doesNotExist('Folder', true);
        }
        // Widen CreatedBy filter for OrgAdmin
        const orgCtx = await getCallerOrgContext(userId);
        if (orgCtx?.role === 'contracts_OrgAdmin' && orgCtx.orgId) {
          const orgUserIds = await listUserIdsInOrg(orgCtx.orgId);
          if (orgUserIds.length > 0) {
            query.containedIn(
              'CreatedBy',
              orgUserIds.map(id => ({ __type: 'Pointer', className: '_User', objectId: id }))
            );
          } else {
            query.equalTo('CreatedBy', { __type: 'Pointer', className: '_User', objectId: userId });
          }
        } else {
          query.equalTo('CreatedBy', { __type: 'Pointer', className: '_User', objectId: userId });
        }
        query.include('ExtUserPtr');
        query.include('ExtUserPtr.TenantId');
        query.include('Signers');
        query.notEqualTo('IsArchive', true);
        query.descending('updatedAt');
        query.skip(skip);
        query.limit(limit);
        query.exclude('AuditTrail');
        const res = await query.find({ useMasterKey: true });
        return res;
      } catch (err) {
        console.log('err', err);
        return { error: "You don't have access to drive" };
      }
    } else {
      return { error: 'Please provide required parameter!' };
    }
  } catch (err) {
    console.log('err', err?.response?.data || err);
    if (err.code == 209) {
      return { error: 'Invalid session token' };
    } else {
      return { error: "You don't have access!" };
    }
  }
}
