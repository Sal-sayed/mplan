// materiality.ts
// Reuses the existing business-model intelligence: not every event matters
// equally. A `retailer_click` drop on a brand catalog is a five-alarm fire;
// the same drop on a SaaS site is irrelevant. This map mirrors the logic the
// auditor already uses in filterByBusinessModel(), but inverted: instead of
// "which events are impossible for this model", it's "which events are the
// money moments for this model" — so a regression on them is high severity.

import type { BusinessModel } from "./monitor-types";

// Critical = the conversion/value events. Their disappearance is high severity.
// Important = strong leading indicators. Medium severity.
// Anything else = informational; a change is logged, not alarmed.
interface ModelEventWeights {
  critical: string[];
  important: string[];
}

export const EVENT_MATERIALITY: Record<BusinessModel, ModelEventWeights> = {
  direct_ecommerce: {
    critical: ["purchase", "begin_checkout"],
    important: ["add_to_cart", "add_payment_info", "view_item"],
  },
  brand_catalog_with_retailers: {
    // The defining insight: no on-site purchase. Money = leaving for a retailer.
    critical: ["retailer_click", "find_store", "event_buy_now"],
    important: ["event_view_product_detail_page", "event_view_more_details"],
  },
  lead_generation: {
    critical: ["generate_lead", "form_submit", "contact"],
    important: ["form_start", "phone_click"],
  },
  saas: {
    critical: ["sign_up", "start_trial", "subscribe"],
    important: ["view_pricing", "demo_request"],
  },
  content_publisher: {
    critical: ["newsletter_signup", "subscription_start"],
    important: ["scroll_depth", "article_read", "ad_impression"],
  },
  marketplace: {
    critical: ["purchase", "listing_contact", "begin_checkout"],
    important: ["search", "view_item", "add_to_cart"],
  },
  service_booking: {
    critical: ["booking_complete", "appointment_request"],
    important: ["select_service", "view_availability"],
  },
  informational: {
    critical: [], // no conversion; nothing is "critical" — avoids false alarms by design
    important: ["contact_click", "outbound_click"],
  },
};

export type Severity = "critical" | "warning" | "info";

export function severityForEvent(
  eventName: string,
  model: BusinessModel
): Severity {
  const weights = EVENT_MATERIALITY[model];
  if (weights.critical.includes(eventName)) return "critical";
  if (weights.important.includes(eventName)) return "warning";
  return "info";
}
