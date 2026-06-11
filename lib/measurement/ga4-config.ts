/* eslint-disable @typescript-eslint/no-explicit-any */
// GA4 Admin API reader for the launch-readiness gate. Raw fetch (no SDK),
// dynamically imported by launch-readiness.ts only when a GA4 property id is
// supplied — mirroring live-capture.ts so the pure gate module never pulls this
// into its static graph. Read-only; uses an access token from token-store.

const GA4_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';

export interface Ga4ConfigData {
  propertyExists: boolean;
  displayName?: string;
  keyEventNames: string[]; // GA4-registered key event names
  customDimensionParameters: string[]; // GA4 custom dimension parameterNames
}

// Accepts "properties/123456789", "123456789", or a value with surrounding
// text — extracts the numeric property id GA4 Admin API expects.
function normalizePropertyId(input: string): string {
  const trimmed = input.trim().replace(/^properties\//i, '');
  const m = trimmed.match(/\d{4,}/);
  return m ? m[0] : trimmed;
}

async function ga4Get(path: string, accessToken: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${GA4_ADMIN_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export async function fetchGa4Config(propertyId: string, accessToken: string): Promise<Ga4ConfigData> {
  const id = normalizePropertyId(propertyId);

  const prop = await ga4Get(`properties/${id}`, accessToken);
  if (prop.status === 401) throw new Error('Google authorization expired or invalid — reconnect Google.');
  if (prop.status === 403) throw new Error('Your connected Google account does not have access to this GA4 property.');
  if (prop.status === 404) return { propertyExists: false, keyEventNames: [], customDimensionParameters: [] };
  if (prop.status !== 200) {
    throw new Error(`GA4 Admin API error (${prop.status}): ${prop.json?.error?.message || 'unknown'}`);
  }

  const [ke, cd] = await Promise.all([
    ga4Get(`properties/${id}/keyEvents`, accessToken),
    ga4Get(`properties/${id}/customDimensions`, accessToken),
  ]);

  const keyEventNames: string[] = Array.isArray(ke.json?.keyEvents)
    ? ke.json.keyEvents.map((k: any) => k.eventName).filter(Boolean)
    : [];
  const customDimensionParameters: string[] = Array.isArray(cd.json?.customDimensions)
    ? cd.json.customDimensions.map((d: any) => d.parameterName).filter(Boolean)
    : [];

  return {
    propertyExists: true,
    displayName: prop.json?.displayName,
    keyEventNames,
    customDimensionParameters,
  };
}
