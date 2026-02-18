import { useEffect, useState } from "react";
import Parse from "parse";
import { useNavigate, useSearchParams } from "react-router";
import { appInfo } from "../constant/appinfo";
import Loader from "../primitives/Loader";

const PKCE_CODE_VERIFIER_KEY = "oauth_code_verifier";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const authError = searchParams.get("error");

    if (authError) {
      setError(searchParams.get("error_description") || authError);
      return;
    }

    if (!code) {
      setError("Missing authorization code");
      return;
    }

    const issuer = appInfo.oauthIssuer;
    const clientId = appInfo.oauthClientId;
    if (!issuer || !clientId) {
      setError("OAuth is not configured");
      return;
    }

    const codeVerifier = sessionStorage.getItem(PKCE_CODE_VERIFIER_KEY);
    sessionStorage.removeItem(PKCE_CODE_VERIFIER_KEY);
    if (!codeVerifier) {
      setError("Session expired. Please try again.");
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;
    const tokenUrl = `${issuer.replace(/\/$/, "")}/token/`;
    const userinfoUrl = `${issuer.replace(/\/$/, "")}/userinfo/`;

    (async () => {
      try {
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: codeVerifier,
        });

        const tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        if (!tokenRes.ok) {
          const errData = await tokenRes.json().catch(() => ({}));
          throw new Error(
            errData.error_description || errData.error || `Token error: ${tokenRes.status}`
          );
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        const userinfoRes = await fetch(userinfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!userinfoRes.ok) {
          throw new Error("Failed to fetch user info");
        }
        const userInfo = await userinfoRes.json();
        if (!userInfo.email || typeof userInfo.email !== "string" || !userInfo.email.includes("@")) {
          throw new Error("Email not found in user info. Ensure your Authentik provider includes the email claim.");
        }
        const email = userInfo.email.toLowerCase().replace(/\s/g, "");

        // Try existing-user SSO flow first (avoids "User not found" for email/password users)
        let user;
        try {
          const ssoResult = await Parse.Cloud.run("ssoLogin", {
            access_token: accessToken,
          });
          if (ssoResult?.sessionToken) {
            user = await Parse.User.become(ssoResult.sessionToken);
          }
        } catch (ssoErr) {
          console.warn("ssoLogin failed, falling back to logInWith:", ssoErr);
        }

        if (!user) {
          user = await Parse.User.logInWith("sso", {
            authData: { id: email, access_token: accessToken },
          });
        }

        // Enrich with userinfo from Authentik — never use sub (it's a hash, not human-readable)
        const authEmail = email;
        const authName =
          userInfo.name || userInfo.given_name || userInfo.preferred_username || authEmail;
        localStorage.setItem("sso_userinfo", JSON.stringify({ name: authName, email: authEmail }));

        const userJson = user.toJSON();
        const enriched = {
          ...userJson,
          name: user.get("name") || authName,
          email: user.get("email") || authEmail,
        };
        localStorage.setItem("accesstoken", user.getSessionToken());
        localStorage.setItem("UserInformation", JSON.stringify(enriched));
        localStorage.setItem("userEmail", enriched.email);
        localStorage.setItem("username", enriched.name);
        if (user.get("ProfilePic")) {
          localStorage.setItem("profileImg", user.get("ProfilePic"));
        } else {
          localStorage.setItem("profileImg", "");
        }

        localStorage.setItem("appLogo", appInfo.applogo);
        navigate(state || "/", { replace: true });
        window.location.reload();
      } catch (err) {
        console.error("Auth callback error:", err);
        setError(err.message || "Authentication failed");
      }
    })();
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
        <p className="text-error font-semibold">{error}</p>
        <button
          type="button"
          className="op-btn op-btn-primary"
          onClick={() => navigate("/", { replace: true })}
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader />
    </div>
  );
}
