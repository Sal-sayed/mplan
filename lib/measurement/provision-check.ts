// provision-check.ts — CHECK-BEFORE-CREATE. Before offering to create a GTM
// container / GA4 property for a site, look up whether one already exists on the
// user's connected account (matched by name = the site host, which is the default
// name the create flow uses). Read-only: reuses the GTM/GA4 list readers, so it
// works with the read scopes the connection already has. Per-user (the token's
// own accounts only).
//
// Meta pixels can't be auto-checked (no Meta integration / read), so they're
// reported as 'unknown' rather than guessed.

import * as gtmWrite from '../google/gtm-write.ts';
import * as ga4Write from '../google/ga4-write.ts';

export interface GtmExistence {
  exists: boolean;
  containerId?: string; // GTM-XXXX
  name?: string;
}
export interface Ga4Existence {
  exists: boolean;
  propertyId?: string;
  measurementId?: string; // G-XXXX (best-effort)
  name?: string;
}
export interface MetaExistence {
  status: 'unknown'; // not auto-checkable without a Meta integration
}
export interface ProvisionStatus {
  gtm: GtmExistence;
  ga4: Ga4Existence;
  meta: MetaExistence;
}

export interface ProvisionCheckClient {
  listContainers: typeof gtmWrite.listContainers;
  listProperties: typeof ga4Write.listProperties;
  getMeasurementId: typeof ga4Write.getMeasurementId;
}

const defaultClient: ProvisionCheckClient = {
  listContainers: gtmWrite.listContainers,
  listProperties: ga4Write.listProperties,
  getMeasurementId: ga4Write.getMeasurementId,
};

// The site host, lower-cased — the default name the create flow gives a new
// container/property, so it's how we match an existing one.
export function siteHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim().toLowerCase();
}

const nameMatches = (a: string | undefined, host: string) => (a ?? '').trim().toLowerCase() === host;

// True when nothing exists yet — i.e. when it's safe to offer a "Create" button.
export function canCreate(e: { exists: boolean }): boolean {
  return !e.exists;
}

// Detect Google's duplicate-name failure (e.g. "Found entity with duplicate
// name") so a blind create can be converted into a friendly "already exists".
export function isDuplicateNameError(err: unknown): boolean {
  return /duplicate name/i.test((err as Error)?.message || '');
}

export async function checkProvisionStatus(
  siteUrl: string,
  token: string,
  client: ProvisionCheckClient = defaultClient
): Promise<ProvisionStatus> {
  const host = siteHost(siteUrl);

  let gtm: GtmExistence = { exists: false };
  try {
    const containers = await client.listContainers(token);
    const match = containers.find((c) => nameMatches(c.name, host));
    if (match) gtm = { exists: true, containerId: match.publicId, name: match.name };
  } catch {
    /* read failed — treat as "unknown / not found" rather than blocking */
  }

  let ga4: Ga4Existence = { exists: false };
  try {
    const props = await client.listProperties(token);
    const match = props.find((p) => nameMatches(p.displayName, host));
    if (match) {
      let measurementId: string | undefined;
      try {
        measurementId = (await client.getMeasurementId(match.propertyId, token)) || undefined;
      } catch {
        /* best-effort — property still counts as existing without the G-id */
      }
      ga4 = { exists: true, propertyId: match.propertyId, measurementId, name: match.displayName };
    }
  } catch {
    /* read failed — treat as not found */
  }

  return { gtm, ga4, meta: { status: 'unknown' } };
}
