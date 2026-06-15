// gtm-apply.ts — Phase B orchestration (workspace-only, NO publish).
//
// Turns an approved MeasurementPlan into a NEW, UNPUBLISHED GTM workspace: the
// dataLayer variables, triggers, and GA4 event tags the plan needs. It NEVER
// publishes and NEVER creates a container version — the user reviews the workspace
// in GTM and publishes there. Per-item failures are isolated (one bad tag doesn't
// abort the rest). The GTM client is injectable so this is testable without the
// live API.

import type { MeasurementPlan } from './types.ts';
import * as gtmWrite from '../google/gtm-write.ts';

export interface GtmApplyClient {
  resolveContainer: typeof gtmWrite.resolveContainer;
  createWorkspace: typeof gtmWrite.createWorkspace;
  listVariableNames: typeof gtmWrite.listVariableNames;
  listTriggers: typeof gtmWrite.listTriggers;
  listTagNames: typeof gtmWrite.listTagNames;
  createDataLayerVariable: typeof gtmWrite.createDataLayerVariable;
  createTrigger: typeof gtmWrite.createTrigger;
  createGa4EventTag: typeof gtmWrite.createGa4EventTag;
}

const defaultClient: GtmApplyClient = {
  resolveContainer: gtmWrite.resolveContainer,
  createWorkspace: gtmWrite.createWorkspace,
  listVariableNames: gtmWrite.listVariableNames,
  listTriggers: gtmWrite.listTriggers,
  listTagNames: gtmWrite.listTagNames,
  createDataLayerVariable: gtmWrite.createDataLayerVariable,
  createTrigger: gtmWrite.createTrigger,
  createGa4EventTag: gtmWrite.createGa4EventTag,
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

export async function applyPlanToGtm(input: GtmApplyInput, client: GtmApplyClient = defaultClient): Promise<GtmApplyResult> {
  const { plan, containerId, measurementId, token } = input;

  const container = await client.resolveContainer(containerId, token);
  if (!container) throw new Error(`GTM container ${containerId} not found or not accessible by your account.`);

  const now = input.now ?? new Date();
  const host = plan.meta.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const workspaceName = `Sirah — ${host} — ${now.toISOString().slice(0, 10)}`;
  const ws = await client.createWorkspace(container.path, workspaceName, token);

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
    if (existingVars.has(name)) { skipped.variables.push(name); continue; }
    try {
      await client.createDataLayerVariable(ws.path, key, token);
      created.variables.push(name);
      existingVars.add(name);
    } catch (e) {
      failures.push({ item: `variable ${name}`, error: msg(e) });
    }
  }

  // 2) per event: a trigger + a GA4 event tag wired to it (key events first).
  const events = [...plan.events].sort((a, b) => (b.isKeyEvent ? 1 : 0) - (a.isKeyEvent ? 1 : 0));
  for (const ev of events) {
    const triggerName = `${ev.name} trigger`;
    const tagName = `GA4 — ${ev.name}`;
    try {
      let triggerId = existingTriggers.get(triggerName);
      if (triggerId) {
        skipped.triggers.push(triggerName);
      } else {
        const trig = ev.category === 'page'
          ? await client.createTrigger(ws.path, { name: triggerName, kind: 'pageview' }, token)
          : await client.createTrigger(ws.path, { name: triggerName, kind: 'customEvent', eventName: ev.name }, token);
        triggerId = trig.triggerId;
        created.triggers.push(triggerName);
        existingTriggers.set(triggerName, triggerId);
      }

      if (existingTags.has(tagName)) {
        skipped.tags.push(tagName);
        continue;
      }
      await client.createGa4EventTag(ws.path, {
        name: tagName,
        eventName: ev.name,
        measurementId,
        firingTriggerId: triggerId,
        parameters: ev.parameters.map((p) => ({ name: p.name, value: `{{dlv.${p.name}}}` })),
      }, token);
      created.tags.push(tagName);
      existingTags.add(tagName);
    } catch (e) {
      failures.push({ item: ev.name, error: msg(e) });
    }
  }

  return {
    workspaceName,
    reviewUrl: `https://tagmanager.google.com/#/container/${ws.path}`,
    created,
    skipped,
    failures,
    published: false,
    note: 'Created in a new, UNPUBLISHED GTM workspace. Review it in Tag Manager and Publish there — nothing is live yet.',
  };
}
