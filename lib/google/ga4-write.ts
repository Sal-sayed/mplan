/* eslint-disable @typescript-eslint/no-explicit-any */
// GA4 Admin API v1beta WRITER. Raw fetch (no SDK) — mirrors ga4-config.ts (the
// read counterpart). Creates a GA4 property under an existing account and a web
// data stream (which yields the Measurement ID, G-XXXX). Needs a token with the
// analytics.edit scope (the "Connect for write" consent). It does NOT delete or
// modify existing properties.

const GA4_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';

async function ga4Get(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${GA4_ADMIN_BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function ga4Post(path: string, body: unknown, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${GA4_ADMIN_BASE}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function ensureOk(r: { status: number; json: any }, what: string): void {
  if (r.status === 200 || r.status === 201) return;
  if (r.status === 401) throw new Error('Google authorization expired or invalid — reconnect Google.');
  if (r.status === 403) throw new Error('Your connected Google account lacks GA4 edit access — use “Connect for write”.');
  throw new Error(`${what} failed (${r.status}): ${r.json?.error?.message || 'unknown'}`);
}

export interface Ga4AccountRef {
  accountId: string; // the numeric id (without the "accounts/" prefix)
  name: string; // displayName
}

// The GA4 accounts the token can see. A property is created UNDER an account —
// the API cannot create an account (done once in the GA UI), so one must exist.
export async function listAccounts(token: string): Promise<Ga4AccountRef[]> {
  const r = await ga4Get('accounts', token);
  ensureOk(r, 'List GA4 accounts');
  const arr: any[] = Array.isArray(r.json?.accounts) ? r.json.accounts : [];
  return arr.map((a) => ({
    accountId: String(a.name ?? '').replace(/^accounts\//, ''),
    name: String(a.displayName ?? a.name ?? ''),
  })).filter((a) => a.accountId);
}

export interface Ga4PropertyRef {
  propertyId: string; // numeric id (without the "properties/" prefix)
  displayName: string;
}

// Every property the user can see (across accounts), via accountSummaries — used
// to CHECK whether a property for this site already exists (matched by name)
// before creating one.
export async function listProperties(token: string): Promise<Ga4PropertyRef[]> {
  const r = await ga4Get('accountSummaries', token);
  ensureOk(r, 'List GA4 properties');
  const summaries: any[] = Array.isArray(r.json?.accountSummaries) ? r.json.accountSummaries : [];
  const out: Ga4PropertyRef[] = [];
  for (const acc of summaries) {
    const props: any[] = Array.isArray(acc.propertySummaries) ? acc.propertySummaries : [];
    for (const p of props) {
      const propertyId = String(p.property ?? '').replace(/^properties\//, '');
      if (propertyId) out.push({ propertyId, displayName: String(p.displayName ?? '') });
    }
  }
  return out;
}

// The Measurement ID (G-XXXX) of a property's first web data stream, or null.
export async function getMeasurementId(propertyId: string, token: string): Promise<string | null> {
  const r = await ga4Get(`properties/${propertyId}/dataStreams`, token);
  if (r.status !== 200) return null;
  const streams: any[] = Array.isArray(r.json?.dataStreams) ? r.json.dataStreams : [];
  for (const s of streams) {
    const mid = s?.webStreamData?.measurementId;
    if (mid) return String(mid);
  }
  return null;
}

// Create a new GA4 property under an account. timeZone is an IANA zone (e.g.
// "Etc/UTC"); currencyCode is ISO-4217 (e.g. "USD").
export async function createProperty(
  args: { accountId: string; displayName: string; timeZone: string; currencyCode: string },
  token: string
): Promise<Ga4PropertyRef> {
  const r = await ga4Post(
    'properties',
    {
      parent: `accounts/${args.accountId}`,
      displayName: args.displayName,
      timeZone: args.timeZone,
      currencyCode: args.currencyCode,
    },
    token
  );
  ensureOk(r, 'Create GA4 property');
  return { propertyId: String(r.json?.name ?? '').replace(/^properties\//, ''), displayName: r.json?.displayName ?? args.displayName };
}

// Create a WEB data stream on a property. Its measurementId (G-XXXX) is what the
// site / GTM uses to send data.
export async function createWebDataStream(
  args: { propertyId: string; displayName: string; defaultUri: string },
  token: string
): Promise<{ measurementId: string; streamId: string }> {
  const r = await ga4Post(
    `properties/${args.propertyId}/dataStreams`,
    {
      type: 'WEB_DATA_STREAM',
      displayName: args.displayName,
      webStreamData: { defaultUri: args.defaultUri },
    },
    token
  );
  ensureOk(r, 'Create web data stream');
  const measurementId = r.json?.webStreamData?.measurementId ?? '';
  if (!measurementId) throw new Error('GA4 created the stream but returned no Measurement ID.');
  return { measurementId, streamId: String(r.json?.name ?? '').replace(/.*\/dataStreams\//, '') };
}
