// templates.ts — a base MeasurementTemplate per BusinessModel.
//
// These ground the LLM so it TAILORS a proven template to the specific site
// rather than inventing a plan from scratch. Each template lists the core KPIs
// and the GA4-standard events that define the model. classify.ts also reads
// `coreKpis` to populate a Classification's primaryKpis.

import type { BusinessModel, EventCategory } from './types.ts';

export interface TemplateEvent {
  name: string; // GA4 snake_case
  category: EventCategory;
  isKeyEvent: boolean;
  why: string;
}

export interface MeasurementTemplate {
  businessModel: BusinessModel;
  vertical: string;
  coreKpis: string[];
  coreEvents: TemplateEvent[];
}

const TEMPLATES: Record<BusinessModel, MeasurementTemplate> = {
  ecommerce: {
    businessModel: 'ecommerce',
    vertical: 'retail',
    coreKpis: [
      'Conversion rate',
      'Average order value',
      'Revenue',
      'Cart abandonment rate',
      'Product detail view rate',
    ],
    coreEvents: [
      { name: 'view_item', category: 'ecommerce', isKeyEvent: false, why: 'Measures product interest and merchandising effectiveness.' },
      { name: 'add_to_cart', category: 'ecommerce', isKeyEvent: false, why: 'Mid-funnel purchase intent signal.' },
      { name: 'begin_checkout', category: 'ecommerce', isKeyEvent: false, why: 'Late-funnel intent; pairs with checkout drop-off analysis.' },
      { name: 'purchase', category: 'ecommerce', isKeyEvent: true, why: 'The primary revenue conversion.' },
    ],
  },
  saas: {
    businessModel: 'saas',
    vertical: 'software',
    coreKpis: [
      'Trial start rate',
      'Sign-up conversion rate',
      'Trial-to-paid conversion',
      'Activation rate',
      'Monthly recurring revenue',
    ],
    coreEvents: [
      { name: 'sign_up', category: 'conversion', isKeyEvent: true, why: 'Account creation — top of the product funnel.' },
      { name: 'start_trial', category: 'conversion', isKeyEvent: true, why: 'Qualified intent to evaluate the product.' },
      { name: 'purchase', category: 'ecommerce', isKeyEvent: true, why: 'Trial-to-paid / subscription conversion.' },
    ],
  },
  lead_gen: {
    businessModel: 'lead_gen',
    vertical: 'services',
    coreKpis: [
      'Lead conversion rate',
      'Cost per lead',
      'Form completion rate',
      'Qualified-lead rate',
      'Contact requests',
    ],
    coreEvents: [
      { name: 'generate_lead', category: 'conversion', isKeyEvent: true, why: 'The primary conversion — a captured lead.' },
      { name: 'form_submit', category: 'form', isKeyEvent: false, why: 'All form completions, including non-lead forms.' },
      { name: 'contact', category: 'conversion', isKeyEvent: true, why: 'Direct contact intent (call/email/demo request).' },
    ],
  },
  media_content: {
    businessModel: 'media_content',
    vertical: 'media',
    coreKpis: [
      'Articles per session',
      'Scroll depth',
      'Newsletter signup rate',
      'Subscription conversion rate',
      'Returning visitor rate',
    ],
    coreEvents: [
      { name: 'article_view', category: 'engagement', isKeyEvent: false, why: 'Core content consumption metric.' },
      { name: 'scroll', category: 'engagement', isKeyEvent: false, why: 'Reading depth and content quality signal.' },
      { name: 'newsletter_signup', category: 'conversion', isKeyEvent: true, why: 'First-party audience capture.' },
      { name: 'subscribe', category: 'conversion', isKeyEvent: true, why: 'The primary revenue conversion.' },
    ],
  },
  marketplace: {
    businessModel: 'marketplace',
    vertical: 'marketplace',
    coreKpis: [
      'Listing view rate',
      'Buyer-seller contact rate',
      'Transaction conversion rate',
      'New listings created',
      'Liquidity (supply/demand balance)',
    ],
    coreEvents: [
      { name: 'view_listing', category: 'engagement', isKeyEvent: false, why: 'Demand-side interest in inventory.' },
      { name: 'contact_seller', category: 'conversion', isKeyEvent: true, why: 'Primary marketplace intent signal.' },
      { name: 'purchase', category: 'ecommerce', isKeyEvent: true, why: 'Completed transaction (where applicable).' },
      { name: 'create_listing', category: 'conversion', isKeyEvent: true, why: 'Supply-side activation.' },
    ],
  },
};

export function getTemplate(model: BusinessModel): MeasurementTemplate {
  return TEMPLATES[model];
}
