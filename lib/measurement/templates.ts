// templates.ts — a base MeasurementTemplate per BusinessModel.
//
// These ground the LLM so it TAILORS a proven template to the specific site
// rather than inventing a plan from scratch, AND back the no-AI fallback
// (template-plan.ts). Each template now carries richer detail — GA4-recommended
// events with their parameters (and a structural triggerType), KPIs, custom
// dimensions, and dataLayer (array/object) variables — so the deterministic plan
// is genuinely useful, not just a skeleton. classify.ts reads `coreKpis`.

import type {
  BusinessModel, CustomDimension, DataLayerVariableType, EventCategory,
  EventTriggerType, ParameterSource, ParameterType,
} from './types.ts';

// A template event parameter. Scalar only (GA4 event params are string/number/
// boolean); array/object payloads go in `dataLayer` below. `source` is the
// STRUCTURAL signal the router reads: 'appState' = app-internal (GTM can't read →
// needs a dataLayer push), 'page' = readable from the DOM/URL, 'static' = literal.
export interface TemplateParam {
  name: string;
  type: ParameterType;
  source: ParameterSource;
  required: boolean;
  description?: string; // optional — a sensible default is generated when absent
}

export interface TemplateEvent {
  name: string; // GA4 snake_case
  category: EventCategory;
  isKeyEvent: boolean;
  why: string;
  triggerType?: EventTriggerType; // built-in GTM trigger hint, when one fits
  requiresConsent?: boolean;      // override; default = category !== 'page'
  parameters?: TemplateParam[];
}

// An array/object dataLayer variable (the cases event params can't express, e.g.
// the ecommerce `items` array). Scalar dataLayer vars are auto-derived from the
// events' appState params, so only the rich ones are declared here.
export interface TemplateDataLayer {
  key: string;
  type: DataLayerVariableType;
  description: string;
  example: string;
  usedByEvents: string[]; // event NAMES; the builder maps them to ids
}

export interface MeasurementTemplate {
  businessModel: BusinessModel;
  vertical: string;
  coreKpis: string[];
  coreEvents: TemplateEvent[];
  customDimensions?: CustomDimension[];
  dataLayer?: TemplateDataLayer[];
}

// ── Reusable parameter fragments ─────────────────────────────────────────────
const value = (required = true): TemplateParam => ({ name: 'value', type: 'number', source: 'appState', required, description: 'Monetary value of the event.' });
const currency = (required = true): TemplateParam => ({ name: 'currency', type: 'string', source: 'appState', required, description: 'ISO 4217 currency code, e.g. USD.' });
const ITEMS_DL: TemplateDataLayer = { key: 'items', type: 'array', description: 'Array of product objects (item_id, item_name, price, quantity, item_category).', example: '[{ "item_id": "SKU_123", "item_name": "Runner", "price": 129, "quantity": 1 }]', usedByEvents: [] };

const TEMPLATES: Record<BusinessModel, MeasurementTemplate> = {
  // ── E-COMMERCE ─────────────────────────────────────────────────────────────
  ecommerce: {
    businessModel: 'ecommerce',
    vertical: 'retail',
    coreKpis: [
      'Conversion rate', 'Average order value', 'Revenue', 'Cart abandonment rate',
      'Product detail view rate', 'Add-to-cart rate', 'Checkout completion rate',
    ],
    coreEvents: [
      { name: 'view_item_list', category: 'ecommerce', isKeyEvent: false, why: 'Category/PLP impressions — top of the merchandising funnel.', parameters: [{ name: 'item_list_name', type: 'string', source: 'page', required: false }] },
      { name: 'select_item', category: 'ecommerce', isKeyEvent: false, why: 'A product clicked from a list — measures merchandising effectiveness.', triggerType: 'click' },
      { name: 'view_item', category: 'ecommerce', isKeyEvent: false, why: 'Product detail view — interest signal.', parameters: [value(), currency()] },
      { name: 'add_to_cart', category: 'ecommerce', isKeyEvent: false, why: 'Mid-funnel purchase intent.', parameters: [value(), currency()] },
      { name: 'view_cart', category: 'ecommerce', isKeyEvent: false, why: 'Cart review — pre-checkout intent.', parameters: [value(), currency()] },
      { name: 'begin_checkout', category: 'ecommerce', isKeyEvent: false, why: 'Late-funnel intent; pairs with checkout drop-off analysis.', parameters: [value(), currency()] },
      { name: 'add_payment_info', category: 'ecommerce', isKeyEvent: false, why: 'Final checkout step before purchase.', parameters: [value(), currency(), { name: 'payment_type', type: 'string', source: 'appState', required: false }] },
      { name: 'purchase', category: 'ecommerce', isKeyEvent: true, why: 'The primary revenue conversion.', parameters: [{ name: 'transaction_id', type: 'string', source: 'appState', required: true, description: 'Unique order id (dedupes revenue).' }, value(), currency(), { name: 'tax', type: 'number', source: 'appState', required: false }, { name: 'shipping', type: 'number', source: 'appState', required: false }, { name: 'coupon', type: 'string', source: 'appState', required: false }] },
    ],
    customDimensions: [
      { name: 'Customer type', scope: 'user', parameter: 'customer_type' },
      { name: 'Logged in', scope: 'user', parameter: 'logged_in' },
      { name: 'Item category', scope: 'event', parameter: 'item_category' },
    ],
    dataLayer: [{ ...ITEMS_DL, usedByEvents: ['view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'add_payment_info', 'purchase'] }],
  },

  // ── SAAS ───────────────────────────────────────────────────────────────────
  saas: {
    businessModel: 'saas',
    vertical: 'software',
    coreKpis: [
      'Trial start rate', 'Sign-up conversion rate', 'Trial-to-paid conversion',
      'Activation rate', 'Monthly recurring revenue', 'Feature adoption rate',
    ],
    coreEvents: [
      { name: 'sign_up', category: 'conversion', isKeyEvent: true, why: 'Account creation — top of the product funnel.', parameters: [{ name: 'method', type: 'string', source: 'appState', required: false, description: 'Sign-up method, e.g. google / email.' }] },
      { name: 'login', category: 'engagement', isKeyEvent: false, why: 'Returning-user engagement and retention signal.', parameters: [{ name: 'method', type: 'string', source: 'appState', required: false }] },
      { name: 'select_plan', category: 'engagement', isKeyEvent: false, why: 'Pricing intent — which tier the user is considering.', triggerType: 'click', parameters: [{ name: 'plan_tier', type: 'string', source: 'appState', required: false }] },
      { name: 'start_trial', category: 'conversion', isKeyEvent: true, why: 'Qualified intent to evaluate the product.', parameters: [{ name: 'plan_tier', type: 'string', source: 'appState', required: false }] },
      { name: 'feature_used', category: 'engagement', isKeyEvent: false, why: 'Activation/adoption — core value moment in-product.', parameters: [{ name: 'feature_name', type: 'string', source: 'appState', required: true }] },
      { name: 'purchase', category: 'ecommerce', isKeyEvent: true, why: 'Trial-to-paid / subscription conversion.', parameters: [{ name: 'transaction_id', type: 'string', source: 'appState', required: true }, value(), currency(), { name: 'plan_tier', type: 'string', source: 'appState', required: false }] },
    ],
    customDimensions: [
      { name: 'Plan tier', scope: 'user', parameter: 'plan_tier' },
      { name: 'Account type', scope: 'user', parameter: 'account_type' },
      { name: 'Feature name', scope: 'event', parameter: 'feature_name' },
    ],
  },

  // ── LEAD GENERATION ────────────────────────────────────────────────────────
  lead_gen: {
    businessModel: 'lead_gen',
    vertical: 'services',
    coreKpis: [
      'Lead conversion rate', 'Cost per lead', 'Form completion rate',
      'Qualified-lead rate', 'Contact requests', 'Phone-call click rate',
    ],
    coreEvents: [
      { name: 'form_start', category: 'form', isKeyEvent: false, why: 'Form engagement — denominator for completion rate.', triggerType: 'formSubmit', parameters: [{ name: 'form_name', type: 'string', source: 'page', required: false }] },
      { name: 'form_submit', category: 'form', isKeyEvent: false, why: 'All form completions, including non-lead forms.', triggerType: 'formSubmit', parameters: [{ name: 'form_id', type: 'string', source: 'page', required: false }, { name: 'form_name', type: 'string', source: 'page', required: false }] },
      { name: 'generate_lead', category: 'conversion', isKeyEvent: true, why: 'The primary conversion — a captured lead.', parameters: [{ name: 'lead_source', type: 'string', source: 'appState', required: false }, value(false), currency(false)] },
      { name: 'contact', category: 'conversion', isKeyEvent: true, why: 'Direct contact intent (call/email/demo request).', triggerType: 'click', parameters: [{ name: 'method', type: 'string', source: 'appState', required: false, description: 'Contact method, e.g. phone / email / form.' }] },
      { name: 'click_to_call', category: 'conversion', isKeyEvent: false, why: 'Phone-call intent from a tel: link.', triggerType: 'linkClick' },
      { name: 'file_download', category: 'engagement', isKeyEvent: false, why: 'Resource/whitepaper download — soft conversion.', triggerType: 'linkClick', parameters: [{ name: 'file_name', type: 'string', source: 'page', required: false }] },
    ],
    customDimensions: [
      { name: 'Lead source', scope: 'event', parameter: 'lead_source' },
      { name: 'Form name', scope: 'event', parameter: 'form_name' },
      { name: 'Lead quality', scope: 'event', parameter: 'lead_quality' },
    ],
  },

  // ── MEDIA / CONTENT ────────────────────────────────────────────────────────
  media_content: {
    businessModel: 'media_content',
    vertical: 'media',
    coreKpis: [
      'Articles per session', 'Scroll depth', 'Newsletter signup rate',
      'Subscription conversion rate', 'Returning visitor rate', 'Video completion rate',
    ],
    coreEvents: [
      { name: 'article_view', category: 'engagement', isKeyEvent: false, why: 'Core content consumption metric.', parameters: [{ name: 'content_category', type: 'string', source: 'page', required: false }, { name: 'author', type: 'string', source: 'page', required: false }] },
      { name: 'scroll', category: 'engagement', isKeyEvent: false, why: 'Reading depth and content quality signal.', triggerType: 'elementVisibility', parameters: [{ name: 'percent_scrolled', type: 'number', source: 'gtm', required: false }] },
      { name: 'select_content', category: 'engagement', isKeyEvent: false, why: 'Recirculation — clicks to related content.', triggerType: 'click' },
      { name: 'video_start', category: 'engagement', isKeyEvent: false, why: 'Video engagement start.', parameters: [{ name: 'video_title', type: 'string', source: 'page', required: false }] },
      { name: 'video_complete', category: 'engagement', isKeyEvent: false, why: 'Full video consumption — strong engagement.', parameters: [{ name: 'video_title', type: 'string', source: 'page', required: false }] },
      { name: 'newsletter_signup', category: 'conversion', isKeyEvent: true, why: 'First-party audience capture.', triggerType: 'formSubmit', parameters: [{ name: 'method', type: 'string', source: 'appState', required: false }] },
      { name: 'subscribe', category: 'conversion', isKeyEvent: true, why: 'The primary revenue conversion.', parameters: [{ name: 'transaction_id', type: 'string', source: 'appState', required: false }, value(false), currency(false), { name: 'plan', type: 'string', source: 'appState', required: false }] },
    ],
    customDimensions: [
      { name: 'Content category', scope: 'event', parameter: 'content_category' },
      { name: 'Author', scope: 'event', parameter: 'author' },
      { name: 'Subscriber status', scope: 'user', parameter: 'subscriber_status' },
    ],
  },

  // ── MARKETPLACE ────────────────────────────────────────────────────────────
  marketplace: {
    businessModel: 'marketplace',
    vertical: 'marketplace',
    coreKpis: [
      'Listing view rate', 'Buyer-seller contact rate', 'Transaction conversion rate',
      'New listings created', 'Liquidity (supply/demand balance)', 'Search-to-listing rate',
    ],
    coreEvents: [
      { name: 'search', category: 'engagement', isKeyEvent: false, why: 'Demand-side discovery — what buyers are looking for.', triggerType: 'formSubmit', parameters: [{ name: 'search_term', type: 'string', source: 'page', required: false }] },
      { name: 'view_listing', category: 'engagement', isKeyEvent: false, why: 'Demand-side interest in inventory.', parameters: [{ name: 'listing_id', type: 'string', source: 'appState', required: false }, { name: 'listing_category', type: 'string', source: 'page', required: false }] },
      { name: 'save_listing', category: 'engagement', isKeyEvent: false, why: 'Soft intent — saved/favourited inventory.', triggerType: 'click', parameters: [{ name: 'listing_id', type: 'string', source: 'appState', required: false }] },
      { name: 'contact_seller', category: 'conversion', isKeyEvent: true, why: 'Primary marketplace intent signal.', triggerType: 'click', parameters: [{ name: 'listing_id', type: 'string', source: 'appState', required: false }] },
      { name: 'create_listing', category: 'conversion', isKeyEvent: true, why: 'Supply-side activation.', triggerType: 'formSubmit', parameters: [{ name: 'listing_category', type: 'string', source: 'appState', required: false }] },
      { name: 'purchase', category: 'ecommerce', isKeyEvent: true, why: 'Completed transaction (where applicable).', parameters: [{ name: 'transaction_id', type: 'string', source: 'appState', required: true }, value(), currency()] },
    ],
    customDimensions: [
      { name: 'User role', scope: 'user', parameter: 'user_role' },
      { name: 'Listing category', scope: 'event', parameter: 'listing_category' },
      { name: 'Listing id', scope: 'event', parameter: 'listing_id' },
    ],
    dataLayer: [{ ...ITEMS_DL, usedByEvents: ['purchase'] }],
  },
};

export function getTemplate(model: BusinessModel): MeasurementTemplate {
  return TEMPLATES[model];
}
