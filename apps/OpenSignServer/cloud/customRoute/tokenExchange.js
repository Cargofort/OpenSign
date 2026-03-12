import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const ssoApiUrl = (process.env.SSO_API_URL || '').replace(/\/$/, '');
const ssoUserinfoPath = process.env.SSO_USERINFO_PATH || '/userinfo/';
const ssoClientId = process.env.SSO_OAUTH_CLIENT_ID || process.env.REACT_APP_OAUTH_CLIENT_ID || '';
const ssoClientSecret = process.env.SSO_OAUTH_CLIENT_SECRET || '';

export default async function tokenExchange(req, res) {
  const { code, code_verifier, redirect_uri } = req.body || {};

  if (!code || !code_verifier || !redirect_uri) {
    return res.status(400).json({
      error: 'missing_parameter',
      error_description: 'code, code_verifier, and redirect_uri are required',
    });
  }

  if (!ssoApiUrl || !ssoClientId || !ssoClientSecret) {
    console.error('[token-exchange] SSO token exchange is not configured');
    return res.status(500).json({
      error: 'server_config_error',
      error_description: 'SSO token exchange is not configured',
    });
  }

  try {
    // Exchange authorization code for tokens
    // Authentik expects client_secret_basic (HTTP Basic) by default for Confidential clients
    const tokenUrl = `${ssoApiUrl}/token/`;
    const basicAuth = Buffer.from(`${ssoClientId}:${ssoClientSecret}`).toString('base64');
    const tokenRes = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        code_verifier,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        timeout: 10000,
      }
    );

    const accessToken = tokenRes.data?.access_token;
    if (!accessToken) {
      console.error('[token-exchange] No access_token in IdP response');
      return res.status(502).json({
        error: 'token_exchange_failed',
        error_description: 'Failed to exchange authorization code',
      });
    }

    // Fetch user info
    const userinfoUrl = `${ssoApiUrl}${ssoUserinfoPath}`;
    const userinfoRes = await axios.get(userinfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    });

    return res.status(200).json({
      access_token: accessToken,
      userinfo: userinfoRes.data,
    });
  } catch (err) {
    const status = err.response?.status;
    console.error('[token-exchange] Error:', status, err.response?.data || err.message);

    if (status === 400 || status === 401 || status === 403) {
      return res.status(502).json({
        error: 'token_exchange_failed',
        error_description: 'Failed to exchange authorization code',
      });
    }
    return res.status(502).json({
      error: 'token_exchange_failed',
      error_description: 'SSO provider is unavailable',
    });
  }
}
