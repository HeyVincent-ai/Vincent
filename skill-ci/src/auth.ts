/**
 * Authenticates with Stytch to get a session token, then syncs with our backend
 * to create a user session. Used for CI tests that need to claim secrets.
 *
 * Uses Stytch sandbox magic link flow:
 * 1. Send magic link to sandbox@stytch.com (no email is actually sent)
 * 2. Authenticate with the sandbox success token
 * 3. Get a real session token
 * 4. Sync with our backend to create/find the user
 */

const STYTCH_TEST_API = 'https://test.stytch.com/v1';
const SANDBOX_EMAIL = 'sandbox@stytch.com';
const SANDBOX_MAGIC_LINK_TOKEN =
  'DOYoip3rvIMMW5lgItikFK-Ak1CfMsgjuiCyI7uuU94=';

interface AuthResult {
  sessionToken: string;
}

export async function getTestSession(opts: {
  baseUrl: string;
  stytchProjectId: string;
  stytchSecret: string;
}): Promise<AuthResult> {
  const { baseUrl, stytchProjectId, stytchSecret } = opts;

  const credentials = Buffer.from(
    `${stytchProjectId}:${stytchSecret}`,
  ).toString('base64');

  const stytchHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Basic ${credentials}`,
  };

  // Step 1: Send magic link to sandbox email (triggers no actual email)
  const sendRes = await fetch(
    `${STYTCH_TEST_API}/magic_links/email/send`,
    {
      method: 'POST',
      headers: stytchHeaders,
      body: JSON.stringify({
        email: SANDBOX_EMAIL,
        // Use localhost — the redirect URL must be registered in Stytch.
        // We never actually redirect; we just need to trigger the send.
        login_magic_link_url: 'http://localhost:5173/auth/callback',
        signup_magic_link_url: 'http://localhost:5173/auth/callback',
      }),
    },
  );

  if (!sendRes.ok) {
    const body = await sendRes.text();
    throw new Error(
      `Stytch magic link send failed (${sendRes.status}): ${body}`,
    );
  }

  // Step 2: Authenticate with sandbox magic link token
  const authRes = await fetch(
    `${STYTCH_TEST_API}/magic_links/authenticate`,
    {
      method: 'POST',
      headers: stytchHeaders,
      body: JSON.stringify({
        token: SANDBOX_MAGIC_LINK_TOKEN,
        session_duration_minutes: 60,
      }),
    },
  );

  if (!authRes.ok) {
    const body = await authRes.text();
    throw new Error(
      `Stytch magic link auth failed (${authRes.status}): ${body}`,
    );
  }

  const authData = (await authRes.json()) as {
    session_token: string;
    status_code: number;
  };

  if (authData.status_code !== 200) {
    throw new Error(
      `Stytch returned status ${authData.status_code}`,
    );
  }

  const sessionToken = authData.session_token;

  // Step 3: Sync session with our backend to create/find the user
  const syncRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken }),
  });

  if (!syncRes.ok) {
    const body = await syncRes.text();
    throw new Error(
      `Backend session sync failed (${syncRes.status}): ${body}`,
    );
  }

  return { sessionToken };
}

/**
 * Claims a secret using an authenticated session.
 */
export async function claimSecret(opts: {
  baseUrl: string;
  sessionToken: string;
  secretId: string;
  claimToken: string;
}): Promise<void> {
  const { baseUrl, sessionToken, secretId, claimToken } = opts;

  const res = await fetch(`${baseUrl}/api/secrets/${secretId}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ claimToken }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claim failed (${res.status}): ${body}`);
  }
}

/**
 * Creates a DATA_SOURCES secret, authenticates, claims it, and returns
 * the ready-to-use API key. All-in-one helper for data source tests.
 */
export async function createClaimedDataSourceSecret(opts: {
  baseUrl: string;
  stytchProjectId: string;
  stytchSecret: string;
}): Promise<{ apiKey: string; secretId: string }> {
  const { baseUrl, stytchProjectId, stytchSecret } = opts;

  // Get authenticated session
  const { sessionToken } = await getTestSession({
    baseUrl,
    stytchProjectId,
    stytchSecret,
  });

  // Create the DATA_SOURCES secret
  const createRes = await fetch(`${baseUrl}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'DATA_SOURCES',
      memo: 'CI test data sources',
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Create secret failed (${createRes.status}): ${body}`);
  }

  const createBody = (await createRes.json()) as {
    data: {
      secret: { id: string };
      apiKey: { key: string };
      claimUrl: string;
    };
  };

  const { secret, apiKey, claimUrl } = createBody.data;
  const claimToken = new URL(claimUrl).searchParams.get('token')!;

  // Claim the secret
  await claimSecret({
    baseUrl,
    sessionToken,
    secretId: secret.id,
    claimToken,
  });

  return { apiKey: apiKey.key, secretId: secret.id };
}
