// implementation-proposal.ts — PHASE A of "implementation guidance" (DISPLAY ONLY).
//
// Pure derivation: given an existing MeasurementPlan, propose, for each tracked
// event, the GTM trigger + GA4 tag + dataLayer push that WOULD implement it, plus
// a plain-English "why this event matters". It is a description the user reviews
// and copies manually — it makes NO Google/GTM API call, requests NO write scope,
// and writes NOTHING. Auto-applying to GTM (with edit/publish scopes) is Phase B,
// explicitly NOT here.
//
// Input plan → output proposal. No IO, no external calls.

import type { BusinessModel, DataLayerVariable, EventCategory, MeasurementPlan, TrackedEvent } from './types.ts';

// A proposed GTM trigger — a DESCRIPTION, not a GTM API object.
export interface ProposedTrigger {
  type: string; // GTM trigger type, e.g. 'Page View', 'Custom Event'
  condition: string; // plain-English: when it fires
  matchEventName: string | null; // the dataLayer `event` value a Custom Event trigger matches
}

// A proposed GA4 Event tag config — a DESCRIPTION, not a GTM API object.
export interface ProposedTag {
  name: string; // e.g. 'GA4 Event — purchase'
  type: 'GA4 Event'; // GTM tag type "Google Analytics: GA4 Event"
  ga4EventName: string; // the GA4 event name this tag sends (= the planned event name)
  parameters: { name: string; value: string }[]; // event params → dataLayer-variable refs
}

export interface ProposalItem {
  eventId: string;
  eventName: string;
  category: EventCategory;
  isKeyEvent: boolean;
  trigger: ProposedTrigger;
  tag: ProposedTag;
  dataLayerSnippet: string; // the dataLayer.push({...}) the site needs, as code
  explanation: string; // why this event matters / why track it
}

export interface ImplementationProposal {
  items: ProposalItem[];
  summary: {
    totalEvents: number;
    keyEvents: number;
    tagCount: number;
    note: string;
  };
}

// Most GA4 events fire from a GTM Custom Event trigger matching the dataLayer
// `event` value the site pushes; page views use the built-in Page View trigger.
function deriveTrigger(ev: TrackedEvent): ProposedTrigger {
  if (ev.category === 'page') {
    return { type: 'Page View', condition: 'Fires on every page load (GTM “All Pages” / Page View trigger).', matchEventName: null };
  }
  return {
    type: 'Custom Event',
    condition: `Fires when the site pushes the “${ev.name}” event to the dataLayer.`,
    matchEventName: ev.name,
  };
}

function deriveTag(ev: TrackedEvent): ProposedTag {
  return {
    name: `GA4 Event — ${ev.name}`,
    type: 'GA4 Event',
    ga4EventName: ev.name,
    // GTM convention: pull each parameter from a dataLayer variable of the same name.
    parameters: ev.parameters.map((p) => ({ name: p.name, value: `{{dlv.${p.name}}}` })),
  };
}

function exampleValue(type: string, example: string | undefined): string {
  if (type === 'number') return example && /^-?\d+(\.\d+)?$/.test(example) ? example : '0';
  if (type === 'boolean') return example === 'true' || example === 'false' ? example : 'false';
  return example ? `'${example.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : "''";
}

function buildDataLayerSnippet(ev: TrackedEvent, dlByKey: Map<string, DataLayerVariable>): string {
  const lines = [`  'event': '${ev.name}',`];
  for (const p of ev.parameters) {
    lines.push(`  '${p.name}': ${exampleValue(p.type, dlByKey.get(p.name)?.example)},`);
  }
  return `dataLayer.push({\n${lines.join('\n')}\n});`;
}

const CATEGORY_WHY: Record<EventCategory, string> = {
  page: 'how many people reach each page — the denominator for every funnel.',
  engagement: 'how visitors interact, so you can see what actually holds attention.',
  ecommerce: 'a step in the purchase funnel, tying on-site behavior to revenue.',
  form: 'submission volume — a primary conversion signal for this site.',
  conversion: 'a completed conversion — the outcome this site exists to drive.',
  custom: 'a site-specific interaction worth measuring.',
};

// Prefer the plan's own description (which IS the "why"); fall back to a clear
// sentence derived from the event's category + the business model.
function deriveExplanation(ev: TrackedEvent, businessModel: BusinessModel): string {
  const why = ev.description?.trim();
  if (why) return why;
  return `On a ${businessModel.replace(/_/g, ' ')} site, tracking “${ev.name}” captures ${CATEGORY_WHY[ev.category]}`;
}

export function buildImplementationProposal(plan: MeasurementPlan): ImplementationProposal {
  const dlByKey = new Map(plan.dataLayer.map((d) => [d.key, d]));
  const businessModel = plan.meta.businessModel;

  // Key events first, otherwise preserve plan order (stable sort).
  const ordered = [...plan.events].sort((a, b) => (b.isKeyEvent ? 1 : 0) - (a.isKeyEvent ? 1 : 0));

  const items: ProposalItem[] = ordered.map((ev) => ({
    eventId: ev.id,
    eventName: ev.name,
    category: ev.category,
    isKeyEvent: ev.isKeyEvent,
    trigger: deriveTrigger(ev),
    tag: deriveTag(ev),
    dataLayerSnippet: buildDataLayerSnippet(ev, dlByKey),
    explanation: deriveExplanation(ev, businessModel),
  }));

  return {
    items,
    summary: {
      totalEvents: items.length,
      keyEvents: items.filter((i) => i.isKeyEvent).length,
      tagCount: items.length, // one GA4 event tag per planned event
      note: 'Review-only proposal derived from your plan. Nothing is written to GTM — auto-apply is a separate, later step.',
    },
  };
}
