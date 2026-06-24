/* eslint-disable @typescript-eslint/no-explicit-any */
// Tag Manager API v2 WRITER for Phase B (workspace-only, NO publish). Raw fetch,
// no SDK — mirrors gtm-config.ts. Creates dataLayer variables, triggers, and GA4
// event tags in a NEW, UNPUBLISHED workspace. It deliberately has NO publish /
// create-version call: the user reviews and publishes in GTM themselves. Needs a
// token with tagmanager.edit.containers (the "Connect for write" consent).

const GTM_BASE = 'https://tagmanager.googleapis.com/tagmanager/v2';

async function gtmGet(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${GTM_BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function gtmPost(path: string, body: unknown, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${GTM_BASE}/${path}`, {
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
  if (r.status === 403) throw new Error('Your connected Google account lacks Tag Manager write access — use “Connect for write”.');
  throw new Error(`${what} failed (${r.status}): ${r.json?.error?.message || 'unknown'}`);
}

export interface GtmContainerRef {
  path: string; // accounts/{a}/containers/{c}
  name: string;
  publicId: string;
}

export interface GtmAccountRef {
  accountId: string;
  name: string;
}

// The Tag Manager accounts the token can see. A container is created UNDER an
// account — the API cannot create an account itself (that's done once in the GTM
// UI), so the caller must have at least one.
export async function listAccounts(token: string): Promise<GtmAccountRef[]> {
  const r = await gtmGet('accounts', token);
  ensureOk(r, 'List Tag Manager accounts');
  const arr: any[] = Array.isArray(r.json?.account) ? r.json.account : [];
  return arr.map((a) => ({ accountId: String(a.accountId), name: String(a.name ?? a.accountId) }));
}

// Create a NEW web container under an existing account. Returns its public id
// (GTM-XXXX) + API path. Does NOT publish anything — a new container's live
// version is empty until the user publishes a workspace.
export async function createContainer(accountId: string, name: string, token: string): Promise<GtmContainerRef> {
  const r = await gtmPost(`accounts/${accountId}/containers`, { name, usageContext: ['web'] }, token);
  ensureOk(r, 'Create container');
  return { path: r.json.path, name: r.json.name, publicId: r.json.publicId };
}

// Resolve a public GTM-XXXX id to its API container path (list accounts → containers).
export async function resolveContainer(publicId: string, token: string): Promise<GtmContainerRef | null> {
  const want = publicId.trim().toUpperCase();
  const accountsRes = await gtmGet('accounts', token);
  ensureOk(accountsRes, 'List Tag Manager accounts');
  const accounts: any[] = Array.isArray(accountsRes.json?.account) ? accountsRes.json.account : [];
  for (const acc of accounts) {
    const contRes = await gtmGet(`accounts/${acc.accountId}/containers`, token);
    if (contRes.status !== 200) continue;
    const containers: any[] = Array.isArray(contRes.json?.container) ? contRes.json.container : [];
    const match = containers.find((c) => String(c.publicId).toUpperCase() === want);
    if (match) return { path: match.path, name: match.name, publicId: match.publicId };
  }
  return null;
}

export async function createWorkspace(containerPath: string, name: string, token: string): Promise<{ path: string; workspaceId: string }> {
  const r = await gtmPost(`${containerPath}/workspaces`, { name, description: 'Created by Sirah measurement plan (review, then publish).' }, token);
  ensureOk(r, 'Create workspace');
  return { path: r.json.path, workspaceId: r.json.workspaceId };
}

// Existing workspaces by name — lets a re-run REUSE a same-named workspace
// instead of failing on GTM's "duplicate name" (and the skip-existing logic then
// only adds what's missing).
export async function listWorkspaces(containerPath: string, token: string): Promise<Map<string, { path: string; workspaceId: string }>> {
  const r = await gtmGet(`${containerPath}/workspaces`, token);
  const arr: any[] = Array.isArray(r.json?.workspace) ? r.json.workspace : [];
  return new Map(arr.map((w) => [w.name as string, { path: w.path as string, workspaceId: w.workspaceId as string }]));
}

// ── existing-name lookups (idempotency within the workspace) ──
async function listNames(workspacePath: string, kind: 'variables' | 'triggers' | 'tags', key: string, token: string): Promise<Set<string>> {
  const r = await gtmGet(`${workspacePath}/${kind}`, token);
  const arr: any[] = Array.isArray(r.json?.[key]) ? r.json[key] : [];
  return new Set(arr.map((x) => x.name));
}
export const listVariableNames = (wp: string, t: string) => listNames(wp, 'variables', 'variable', t);
export const listTagNames = (wp: string, t: string) => listNames(wp, 'tags', 'tag', t);

// Triggers keyed name → triggerId, so a tag can reuse an existing trigger.
export async function listTriggers(workspacePath: string, token: string): Promise<Map<string, string>> {
  const r = await gtmGet(`${workspacePath}/triggers`, token);
  const arr: any[] = Array.isArray(r.json?.trigger) ? r.json.trigger : [];
  return new Map(arr.map((x) => [x.name as string, x.triggerId as string]));
}

// Data Layer Variable named `dlv.<key>` (so tags can reference {{dlv.<key>}}).
export async function createDataLayerVariable(workspacePath: string, dlKey: string, token: string): Promise<{ name: string }> {
  const name = `dlv.${dlKey}`;
  const r = await gtmPost(`${workspacePath}/variables`, {
    name,
    type: 'v',
    parameter: [
      { type: 'integer', key: 'dataLayerVersion', value: '2' },
      { type: 'boolean', key: 'setDefaultValue', value: 'false' },
      { type: 'template', key: 'name', value: dlKey },
    ],
  }, token);
  ensureOk(r, `Create variable ${name}`);
  return { name };
}

export interface TriggerSpec {
  name: string;
  kind: 'pageview' | 'customEvent';
  eventName?: string; // required for customEvent — the dataLayer `event` value
}

export async function createTrigger(workspacePath: string, spec: TriggerSpec, token: string): Promise<{ triggerId: string; name: string }> {
  const body: any =
    spec.kind === 'pageview'
      ? { name: spec.name, type: 'pageview' }
      : {
          name: spec.name,
          type: 'customEvent',
          customEventFilter: [
            { type: 'equals', parameter: [
              { type: 'template', key: 'arg0', value: '{{_event}}' },
              { type: 'template', key: 'arg1', value: spec.eventName },
            ] },
          ],
        };
  const r = await gtmPost(`${workspacePath}/triggers`, body, token);
  ensureOk(r, `Create trigger ${spec.name}`);
  return { triggerId: r.json.triggerId, name: r.json.name };
}

export interface Ga4TagSpec {
  name: string;
  eventName: string; // GA4 event name
  measurementId: string; // G-XXXXXXX
  firingTriggerId: string;
  parameters: { name: string; value: string }[]; // value is a {{dlv.x}} reference
}

export async function createGa4EventTag(workspacePath: string, spec: Ga4TagSpec, token: string): Promise<{ name: string }> {
  const parameter: any[] = [
    { type: 'template', key: 'eventName', value: spec.eventName },
    { type: 'template', key: 'measurementIdOverride', value: spec.measurementId },
  ];
  if (spec.parameters.length > 0) {
    parameter.push({
      type: 'list',
      key: 'eventParameters',
      list: spec.parameters.map((p) => ({
        type: 'map',
        map: [
          { type: 'template', key: 'name', value: p.name },
          { type: 'template', key: 'value', value: p.value },
        ],
      })),
    });
  }
  const r = await gtmPost(`${workspacePath}/tags`, { name: spec.name, type: 'gaawe', parameter, firingTriggerId: [spec.firingTriggerId] }, token);
  ensureOk(r, `Create tag ${spec.name}`);
  return { name: r.json.name };
}

// A Custom HTML tag — used for the Meta Pixel (base loader + per-event fbq calls),
// since GTM has no first-class Meta tag template. Fires on the given trigger.
export async function createCustomHtmlTag(
  workspacePath: string,
  spec: { name: string; html: string; firingTriggerId: string },
  token: string
): Promise<{ name: string }> {
  const r = await gtmPost(
    `${workspacePath}/tags`,
    {
      name: spec.name,
      type: 'html',
      parameter: [{ type: 'template', key: 'html', value: spec.html }],
      firingTriggerId: [spec.firingTriggerId],
    },
    token
  );
  ensureOk(r, `Create tag ${spec.name}`);
  return { name: r.json.name };
}
