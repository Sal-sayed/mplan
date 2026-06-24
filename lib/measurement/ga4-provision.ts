// ga4-provision.ts — create a brand-new GA4 property + web data stream for a site,
// returning the new property id and Measurement ID (G-XXXX). The GA4 client is
// injectable so this is testable without the live API. Mirrors gtm-apply's
// create-container flow (account selection, no-account error, NeedsAccountSelection).
//
// It CREATES only — it never deletes or edits existing properties. The Measurement
// ID it returns is what then feeds the GTM container's GA4 tags.

import type { MeasurementPlan } from './types.ts';
import * as ga4Write from '../google/ga4-write.ts';
import { isDuplicateNameError } from './provision-check.ts';

export interface Ga4ProvisionClient {
  listAccounts: typeof ga4Write.listAccounts;
  createProperty: typeof ga4Write.createProperty;
  createWebDataStream: typeof ga4Write.createWebDataStream;
  listProperties: typeof ga4Write.listProperties;
  getMeasurementId: typeof ga4Write.getMeasurementId;
}

const defaultClient: Ga4ProvisionClient = {
  listAccounts: ga4Write.listAccounts,
  createProperty: ga4Write.createProperty,
  createWebDataStream: ga4Write.createWebDataStream,
  listProperties: ga4Write.listProperties,
  getMeasurementId: ga4Write.getMeasurementId,
};

export interface Ga4ProvisionInput {
  plan: MeasurementPlan;
  token: string;
  accountId?: string; // which GA4 account; omitted = the only one
  displayName?: string; // default: the site host
  timeZone?: string; // IANA; default Etc/UTC
  currencyCode?: string; // ISO-4217; default USD
}

export interface Ga4ProvisionResult {
  propertyId: string; // numeric GA4 property id (new or existing)
  measurementId: string; // G-XXXXXXX
  displayName: string;
  accountName: string;
  alreadyExisted: boolean; // true → we reused an existing property, didn't create
}

// Thrown when the user has >1 GA4 account and didn't pick one. The route turns
// this into a 409 { needsAccount, accounts } so the UI can prompt a choice.
export class NeedsAccountSelection extends Error {
  readonly needsAccount = true as const;
  accounts: ga4Write.Ga4AccountRef[];
  constructor(accounts: ga4Write.Ga4AccountRef[]) {
    super('Choose which GA4 account to create the property in.');
    this.name = 'NeedsAccountSelection';
    this.accounts = accounts;
  }
}

export async function createGa4Property(
  input: Ga4ProvisionInput,
  client: Ga4ProvisionClient = defaultClient
): Promise<Ga4ProvisionResult> {
  const accounts = await client.listAccounts(input.token);
  if (accounts.length === 0) {
    throw new Error('No Google Analytics account found — create one (free) at analytics.google.com, then try again.');
  }

  let account: ga4Write.Ga4AccountRef;
  if (input.accountId) {
    const found = accounts.find((a) => a.accountId === input.accountId);
    if (!found) throw new Error('The selected Analytics account was not found on your Google account.');
    account = found;
  } else if (accounts.length === 1) {
    account = accounts[0];
  } else {
    throw new NeedsAccountSelection(accounts);
  }

  const rawUrl = input.plan.meta.url;
  const host = rawUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const displayName = input.displayName?.trim() || host || 'Sirah property';
  const timeZone = input.timeZone?.trim() || 'Etc/UTC';
  const currencyCode = input.currencyCode?.trim().toUpperCase() || 'USD';
  // GA4 wants an absolute URI for the stream.
  const defaultUri = /^https?:\/\//i.test(rawUrl) ? rawUrl.replace(/\/$/, '') : `https://${host}`;
  const wanted = displayName.trim().toLowerCase();

  // CHECK BEFORE CREATE: reuse an existing same-named property (GA4 doesn't reject
  // duplicate names, so without this it would silently create a second one).
  const findExisting = async () =>
    (await client.listProperties(input.token)).find((p) => (p.displayName ?? '').trim().toLowerCase() === wanted) ?? null;

  const reuse = async (propertyId: string, name: string): Promise<Ga4ProvisionResult> => {
    let measurementId = '';
    try {
      measurementId = (await client.getMeasurementId(propertyId, input.token)) || '';
    } catch {
      /* best-effort */
    }
    return { propertyId, measurementId, displayName: name, accountName: account.name, alreadyExisted: true };
  };

  const existing = await findExisting();
  if (existing) return reuse(existing.propertyId, existing.displayName);

  let property: ga4Write.Ga4PropertyRef;
  try {
    property = await client.createProperty({ accountId: account.accountId, displayName, timeZone, currencyCode }, input.token);
  } catch (e) {
    if (isDuplicateNameError(e)) {
      const found = await findExisting();
      if (found) return reuse(found.propertyId, found.displayName);
    }
    throw e;
  }
  const stream = await client.createWebDataStream({ propertyId: property.propertyId, displayName: `${host} (Web)`, defaultUri }, input.token);

  return {
    propertyId: property.propertyId,
    measurementId: stream.measurementId,
    displayName: property.displayName,
    accountName: account.name,
    alreadyExisted: false,
  };
}
