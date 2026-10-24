import axios from 'axios';
import { SSOAuth } from '../auth/authadapter.js';

const SSO_ENV_KEYS = ['SSO_API_URL', 'SSO_USERINFO_PATH', 'SSO_ALLOWED_GROUPS', 'SSO_GROUPS_CLAIM'];

describe('SSOAuth.validateAuthData', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = Object.fromEntries(SSO_ENV_KEYS.map(key => [key, process.env[key]]));
    SSO_ENV_KEYS.forEach(key => delete process.env[key]);
    process.env.SSO_API_URL = 'https://sso.example.com/api/';
  });

  afterEach(() => {
    SSO_ENV_KEYS.forEach(key => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
  });

  const authData = { id: 'jane@example.com', access_token: 'token-123' };

  it('calls the default userinfo path with the bearer token and accepts a matching email', async () => {
    const getSpy = spyOn(axios, 'get').and.resolveTo({
      data: { sub: 'u1', email: 'Jane@Example.com' },
    });

    await expectAsync(SSOAuth.validateAuthData(authData)).toBeResolved();
    expect(getSpy).toHaveBeenCalledWith('https://sso.example.com/api/oauth/userinfo', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('uses SSO_USERINFO_PATH when set', async () => {
    process.env.SSO_USERINFO_PATH = '/application/o/userinfo/';
    const getSpy = spyOn(axios, 'get').and.resolveTo({
      data: { sub: 'u1', email: 'jane@example.com' },
    });

    await SSOAuth.validateAuthData(authData);
    expect(getSpy.calls.mostRecent().args[0]).toBe(
      'https://sso.example.com/api/application/o/userinfo/'
    );
  });

  it('rejects when the userinfo email does not match the auth data id', async () => {
    spyOn(axios, 'get').and.resolveTo({ data: { sub: 'u1', email: 'other@example.com' } });

    await expectAsync(SSOAuth.validateAuthData(authData)).toBeRejectedWith(
      jasmine.objectContaining({ code: Parse.Error.OBJECT_NOT_FOUND })
    );
  });

  it('rejects when the SSO provider call fails', async () => {
    spyOn(axios, 'get').and.rejectWith(new Error('network down'));

    await expectAsync(SSOAuth.validateAuthData(authData)).toBeRejectedWith(
      jasmine.objectContaining({ code: Parse.Error.OBJECT_NOT_FOUND })
    );
  });

  it('rejects users outside SSO_ALLOWED_GROUPS', async () => {
    process.env.SSO_ALLOWED_GROUPS = 'staff, admins';
    spyOn(axios, 'get').and.resolveTo({
      data: { sub: 'u1', email: 'jane@example.com', groups: ['guests'] },
    });

    await expectAsync(SSOAuth.validateAuthData(authData)).toBeRejectedWith(
      jasmine.objectContaining({
        message: 'Only internal users are allowed to sign in. Contact your administrator.',
      })
    );
  });

  it('accepts users in SSO_ALLOWED_GROUPS using a custom SSO_GROUPS_CLAIM', async () => {
    process.env.SSO_ALLOWED_GROUPS = 'staff,admins';
    process.env.SSO_GROUPS_CLAIM = 'roles';
    spyOn(axios, 'get').and.resolveTo({
      data: { sub: 'u1', email: 'jane@example.com', roles: ['admins'] },
    });

    await expectAsync(SSOAuth.validateAuthData(authData)).toBeResolved();
  });
});
