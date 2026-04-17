export const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_SCOPE = "user.info.basic,video.publish,video.upload";

function requireEnvVars(): { clientKey: string; clientSecret: string } {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error("TikTok OAuth env vars not configured");
  }
  return { clientKey, clientSecret };
}

export function buildTikTokAuthUrl(state: string): string {
  const { clientKey } = requireEnvVars();
  const redirectUri =
    (process.env.NEXT_PUBLIC_APP_URL ?? "") + "/api/auth/tiktok/callback";

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPE,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });

  return `${TIKTOK_AUTH_URL}?${params.toString()}`;
}

export async function exchangeTikTokCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  openId: string;
  expiresIn: number;
  refreshExpiresIn: number;
  scope: string;
}> {
  const { clientKey, clientSecret } = requireEnvVars();
  const redirectUri =
    (process.env.NEXT_PUBLIC_APP_URL ?? "") + "/api/auth/tiktok/callback";

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`TikTok token exchange failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    error?: string;
    error_description?: string;
    access_token?: string;
    refresh_token?: string;
    open_id?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    scope?: string;
  };

  if (data.error) {
    throw new Error(
      `TikTok token exchange error: ${data.error} — ${data.error_description ?? ""}`
    );
  }

  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token!,
    openId: data.open_id!,
    expiresIn: data.expires_in!,
    refreshExpiresIn: data.refresh_expires_in!,
    scope: data.scope ?? TIKTOK_SCOPE,
  };
}

export async function refreshTikTokToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}> {
  const { clientKey, clientSecret } = requireEnvVars();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_key: clientKey,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`TikTok token refresh failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    error?: string;
    error_description?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
  };

  if (data.error) {
    throw new Error(
      `TikTok token refresh error: ${data.error} — ${data.error_description ?? ""}`
    );
  }

  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token!,
    expiresIn: data.expires_in!,
    refreshExpiresIn: data.refresh_expires_in!,
  };
}
