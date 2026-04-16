export const INSTAGRAM_AUTH_URL = "https://api.instagram.com/oauth/authorize";
export const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const INSTAGRAM_LONGTERM_URL = "https://graph.instagram.com/access_token";
export const INSTAGRAM_SCOPE = "instagram_basic,instagram_content_publish";

function requireEnvVars(): { appId: string; appSecret: string } {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Instagram OAuth env vars not configured");
  }
  return { appId, appSecret };
}

export function buildInstagramAuthUrl(state: string): string {
  const { appId } = requireEnvVars();
  const redirectUri =
    (process.env.NEXT_PUBLIC_APP_URL ?? "") + "/api/auth/instagram/callback";

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: INSTAGRAM_SCOPE,
    response_type: "code",
    state,
  });

  return `${INSTAGRAM_AUTH_URL}?${params.toString()}`;
}

export async function exchangeInstagramCode(
  code: string
): Promise<{ shortLivedToken: string; userId: string }> {
  const { appId, appSecret } = requireEnvVars();
  const redirectUri =
    (process.env.NEXT_PUBLIC_APP_URL ?? "") + "/api/auth/instagram/callback";

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Instagram code exchange failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    user_id?: string;
    error_type?: string;
    error_message?: string;
  };

  if (!data.access_token) {
    throw new Error(
      `Instagram code exchange error: ${data.error_type ?? "unknown"} — ${data.error_message ?? ""}`
    );
  }

  return {
    shortLivedToken: data.access_token,
    userId: String(data.user_id!),
  };
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const { appSecret } = requireEnvVars();

  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortLivedToken,
  });

  const url = `${INSTAGRAM_LONGTERM_URL}?${params.toString()}`;

  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    throw new Error(`Instagram long-lived token exchange failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message: string; type: string };
  };

  if (data.error || !data.access_token) {
    throw new Error(
      `Instagram long-lived token error: ${data.error?.message ?? "unknown"}`
    );
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 5184000, // ~60 days default
  };
}
