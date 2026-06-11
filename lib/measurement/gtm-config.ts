/* eslint-disable @typescript-eslint/no-explicit-any */
// Tag Manager API v2 reader for the launch-readiness gate. Raw fetch (no SDK),
// dynamically imported by launch-readiness.ts only when a GTM container id is
// supplied. Read-only; uses an access token from token-store.
//
// The user gives the public id (GTM-XXXX). The API addresses containers by a
// numeric path id, so we list accounts → containers, match on publicId, then
// read the LIVE (published) version to count tags.

const GTM_BASE = 'https://tagmanager.googleapis.com/tagmanager/v2';

export interface GtmConfigData {
  containerExists: boolean;
  containerName?: string;
  liveTagCount: number;
}

async function gtmGet(path: string, accessToken: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${GTM_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export async function fetchGtmConfig(containerId: string, accessToken: string): Promise<GtmConfigData> {
  const publicId = containerId.trim().toUpperCase();

  const accountsRes = await gtmGet('accounts', accessToken);
  if (accountsRes.status === 401) throw new Error('Google authorization expired or invalid — reconnect Google.');
  if (accountsRes.status === 403) throw new Error('Your connected Google account does not have access to Tag Manager.');
  if (accountsRes.status !== 200) {
    throw new Error(`Tag Manager API error (${accountsRes.status}): ${accountsRes.json?.error?.message || 'unknown'}`);
  }

  const accounts: any[] = Array.isArray(accountsRes.json?.account) ? accountsRes.json.account : [];
  for (const acc of accounts) {
    const contRes = await gtmGet(`accounts/${acc.accountId}/containers`, accessToken);
    if (contRes.status !== 200) continue;
    const containers: any[] = Array.isArray(contRes.json?.container) ? contRes.json.container : [];
    const match = containers.find((c) => String(c.publicId).toUpperCase() === publicId);
    if (match) {
      // Live (published) version — absent if the container was never published.
      const live = await gtmGet(
        `accounts/${acc.accountId}/containers/${match.containerId}/versions:live`,
        accessToken
      );
      const liveTagCount = live.status === 200 && Array.isArray(live.json?.tag) ? live.json.tag.length : 0;
      return { containerExists: true, containerName: match.name, liveTagCount };
    }
  }

  return { containerExists: false, liveTagCount: 0 };
}
