// gtm-apply.ts — Phase B orchestration (workspace-only, NO publish).
//
// Turns an approved MeasurementPlan into a NEW, UNPUBLISHED GTM workspace: the
// dataLayer variables, triggers, and (when a GA4 Measurement ID is given) GA4
// event tags the plan needs. It NEVER publishes and NEVER creates a container
// version — the user reviews the workspace in GTM and publishes there. Per-item
// failures are isolated (one bad tag doesn't abort the rest). The GTM client is
// injectable so this is testable without the live API.
//
// Two entry points:
//   - applyPlanToGtm        — populate an EXISTING container (user supplies GTM-XXXX).
//   - createContainerAndApply — CREATE a new container under the user's GTM account,
//                               then populate it. Returns the new GTM-XXXX.
// Both stop at an unpublished workspace.

import type { MeasurementPlan } from './types.ts';
import * as gtmWrite from '../google/gtm-write.ts';

export interface GtmApplyClient {
  resolveContainer: typeof gtmWrite.resolveContainer;
  listWorkspaces: typeof gtmWrite.listWorkspaces;
  createWorkspace: typeof gtmWrite.createWorkspace;
  listVariableNames: typeof gtmWrite.listVariableNames;
  listTriggers: typeof gtmWrite.listTriggers;
  listTagNames: typeof gtmWrite.listTagNames;
  createDataLayerVariable: typeof gtmWrite.createDataLayerVariable;
  createTrigger: typeof gtmWrite.createTrigger;
  createGa4EventTag: typeof gtmWrite.createGa4EventTag;
}

// The create-container flow needs two more capabilities. Kept as a SEPARATE
// interface so the existing GtmApplyClient (and its tests) are unchanged.
export interface CreateContainerClient extends GtmApplyClient {
  listAccounts: typeof gtmWrite.listAccounts;
  createContainer: typeof gtmWrite.createContainer;
}

const defaultClient: GtmApplyClient = {
  resolveContainer: gtmWrite.resolveContainer,
  listWorkspaces: gtmWrite.listWorkspaces,
  createWorkspace: gtmWrite.createWorkspace,
  listVariableNames: gtmWrite.listVariableNames,
  listTriggers: gtmWrite.listTriggers,
  listTagNames: gtmWrite.listTagNames,
  createDataLayerVariable: gtmWrite.createDataLayerVariable,
  createTrigger: gtmWrite.createTrigger,
  createGa4EventTag: gtmWrite.createGa4EventTag,
};

const defaultCreateClient: CreateContainerClient = {
  ...defaultClient,
  listAccounts: gtmWrite.listAccounts,
  createContainer: gtmWrite.createContainer,
};

export interface GtmApplyInput {
  plan: MeasurementPlan;
  containerId: string; // public GTM-XXXX
  measurementId: string; // G-XXXXXXX
  token: string;
  now?: Date;
}

export interface GtmApplyResult {
  workspaceName: string;
  reviewUrl: string;
  created: { variables: string[]; triggers: string[]; tags: string[] };
  skipped: { variables: string[]; triggers: string[]; tags: string[] }; // already in the container
  failures: { item: string; error: string }[];
  published: false; // INVARIANT: Phase B never publishes
  note: string;
}

const msg = (e: unknown) => (e as Error)?.message || 'failed';

// Shared core: create/reuse a workspace in `container` and populate it from the
// plan. GA4 event tags are created ONLY when measurementId is provided (so a
// GTM-only flow can skip them and add GA4 later). Never publishes.
async function populateWorkspace(
  client: GtmApplyClient,
  plan: MeasurementPlan,
  container: gtmWrite.GtmContainerRef,
  measurementId: string | undefined,
  token: string,
  now: Date
): Promise<GtmApplyResult> {
  const host = plan.meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const workspaceName = `Sirah — ${host} — ${now.toISOString().slice(0, 10)}`;
  // Reuse a same-named workspace if it exists (a re-run), else create one — GTM
  // rejects duplicate workspace names, so don't blindly create.
  const existingWorkspaces = await client.listWorkspaces(container.path, token);
  const ws = existingWorkspaces.get(workspaceName) ?? (await client.createWorkspace(container.path, workspaceName, token));

  const created = { variables: [] as string[], triggers: [] as string[], tags: [] as string[] };
  const skipped = { variables: [] as string[], triggers: [] as string[], tags: [] as string[] };
  const failures: { item: string; error: string }[] = [];

  // A new workspace starts from the live container, so it may already contain
  // some of these — skip rather than duplicate.
  const existingVars = await client.listVariableNames(ws.path, token);
  const existingTriggers = await client.listTriggers(ws.path, token); // name → triggerId
  const existingTags = await client.listTagNames(ws.path, token);

  // 1) dataLayer variables for every parameter the events reference (dedup by key).
  const dlKeys = new Set<string>();
  for (const ev of plan.events) for (const p of ev.parameters) dlKeys.add(p.name);
  for (const key of dlKeys) {
    const name = `dlv.${key}`;
    if (existingVars.has(name)) {
      skipped.variables.push(name);
      continue;
    }
    try {
      await client.createDataLayerVariable(ws.path, key, token);
      created.variables.push(name);
      existingVars.add(name);
    } catch (e) {
      failures.push({ item: `variable ${name}`, error: msg(e) });
    }
  }

  // 2) per event: a trigger (always) + a GA4 event tag wired to it (only when a
  //    measurement id is supplied). Key events first.
  const events = [...plan.events].sort((a, b) => (b.isKeyEvent ? 1 : 0) - (a.isKeyEvent ? 1 : 0));
  for (const ev of events) {
    const triggerName = `${ev.name} trigger`;
    const tagName = `GA4 — ${ev.name}`;
    try {
      let triggerId = existingTriggers.get(triggerName);
      if (triggerId) {
        skipped.triggers.push(triggerName);
      } else {
        const trig =
          ev.category === 'page'
            ? await client.createTrigger(ws.path, { name: triggerName, kind: 'pageview' }, token)
            : await client.createTrigger(ws.path, { name: triggerName, kind: 'customEvent', eventName: ev.name }, token);
        triggerId = trig.triggerId;
        created.triggers.push(triggerName);
        existingTriggers.set(triggerName, triggerId);
      }

      // GA4 tags deferred when no measurement id (GTM-only creation).
      if (!measurementId) continue;

      if (existingTags.has(tagName)) {
        skipped.tags.push(tagName);
        continue;
      }
      await client.createGa4EventTag(
        ws.path,
        {
          name: tagName,
          eventName: ev.name,
          measurementId,
          firingTriggerId: triggerId,
          parameters: ev.parameters.map((p) => ({ name: p.name, value: `{{dlv.${p.name}}}` })),
        },
        token
      );
      created.tags.push(tagName);
      existingTags.add(tagName);
    } catch (e) {
      failures.push({ item: ev.name, error: msg(e) });
    }
  }

  const note = measurementId
    ? 'Created in a new, UNPUBLISHED GTM workspace. Review it in Tag Manager and Publish there — nothing is live yet.'
    : 'Created in a new, UNPUBLISHED GTM workspace (variables & triggers; no GA4 tags — add a GA4 Measurement ID to include them). Review and Publish in Tag Manager — nothing is live yet.';

  return {
    workspaceName,
    reviewUrl: `https://tagmanager.google.com/#/container/${ws.path}`,
    created,
    skipped,
    failures,
    published: false,
    note,
  };
}

export async function applyPlanToGtm(input: GtmApplyInput, client: GtmApplyClient = defaultClient): Promise<GtmApplyResult> {
  const { plan, containerId, measurementId, token } = input;
  const container = await client.resolveContainer(containerId, token);
  if (!container) throw new Error(`GTM container ${containerId} not found or not accessible by your account.`);
  return populateWorkspace(client, plan, container, measurementId, token, input.now ?? new Date());
}

// ── Create a brand-new container, then populate it ──

export interface CreateContainerInput {
  plan: MeasurementPlan;
  token: string;
  accountId?: string; // which GTM account to create under; omitted = the only one
  containerName?: string; // default: the site host
  measurementId?: string; // optional — GA4 tags added only if provided
  now?: Date;
}

export interface CreateContainerResult extends GtmApplyResult {
  newContainerId: string; // the new public GTM-XXXX
  accountName: string;
}

// Thrown when the user has >1 GTM account and didn't pick one. The route turns
// this into a 409 { needsAccount, accounts } so the UI can prompt a choice.
export class NeedsAccountSelection extends Error {
  readonly needsAccount = true as const;
  accounts: gtmWrite.GtmAccountRef[];
  constructor(accounts: gtmWrite.GtmAccountRef[]) {
    super('Choose which Tag Manager account to create the container in.');
    this.name = 'NeedsAccountSelection';
    this.accounts = accounts;
  }
}

export async function createContainerAndApply(
  input: CreateContainerInput,
  client: CreateContainerClient = defaultCreateClient
): Promise<CreateContainerResult> {
  const accounts = await client.listAccounts(input.token);
  if (accounts.length === 0) {
    throw new Error('No Google Tag Manager account found — create one (free) at tagmanager.google.com, then try again.');
  }

  let account: gtmWrite.GtmAccountRef;
  if (input.accountId) {
    const found = accounts.find((a) => a.accountId === input.accountId);
    if (!found) throw new Error('The selected Tag Manager account was not found on your Google account.');
    account = found;
  } else if (accounts.length === 1) {
    account = accounts[0];
  } else {
    throw new NeedsAccountSelection(accounts);
  }

  const host = input.plan.meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const name = input.containerName?.trim() || host || 'Sirah container';

  const container = await client.createContainer(account.accountId, name, input.token);
  const base = await populateWorkspace(client, input.plan, container, input.measurementId, input.token, input.now ?? new Date());

  return { ...base, newContainerId: container.publicId, accountName: account.name };
}
