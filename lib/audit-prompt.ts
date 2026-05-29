export const AUDIT_PROMPT = (
  websiteData: string,
  scoreData: string,
  existingPlan: string | null,
  context: {
    siteType?: 'ecommerce' | 'lead-gen' | 'saas' | 'content' | 'marketplace' | 'other';
    firingEvents?: Array<{ eventName: string; source: string; confidenceSource?: string; capturedFromPages?: string[] }>;
    configuredEvents?: Array<{ eventName: string; source: string; gtmContainer?: string | null }>;
    pagesScanned?: Array<{ type: string; url: string; eventsFound: number; success: boolean }>;
    businessModel?: {
      primaryType: string;
      reasoning: string;
      hasOwnCheckout: boolean;
      redirectsToRetailers: boolean;
      retailers: string[];
      hasShoppingCart: boolean;
      hasUserAccounts: boolean;
      hasLeadForms: boolean;
    };
  } = {}
) => {
  const hasUploadedPlan = existingPlan !== null && existingPlan !== 'null';
  const siteType = context.siteType || 'ecommerce';
  const firingEvents = context.firingEvents || [];
  const configuredEvents = context.configuredEvents || [];
  const pagesScanned = context.pagesScanned || [];
  const scannedTypes = new Set(pagesScanned.filter(p => p.success).map(p => p.type));
  const bm = context.businessModel || {
    primaryType: 'unknown', reasoning: 'Not detected',
    hasOwnCheckout: false, redirectsToRetailers: false, retailers: [],
    hasShoppingCart: false, hasUserAccounts: false, hasLeadForms: false,
  };

  // Industry-standard event catalogs per site type — Claude uses these as the
  // baseline expectation when deciding which events are "missing".
  const STANDARD_BY_SITETYPE: Record<string, string[]> = {
    'ecommerce':   ['view_item', 'view_item_list', 'select_item', 'view_promotion', 'select_promotion', 'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase', 'refund', 'add_to_wishlist', 'search'],
    'lead-gen':    ['generate_lead', 'form_start', 'form_submit', 'contact', 'sign_up', 'demo_request', 'schedule_demo', 'newsletter_signup', 'file_download'],
    'saas':        ['sign_up', 'login', 'trial_start', 'subscribe', 'cancel_subscription', 'feature_used', 'invite_sent', 'plan_changed', 'onboarding_complete'],
    'content':     ['view_content', 'scroll', 'share', 'video_start', 'video_progress', 'video_complete', 'subscribe_newsletter', 'comment_submit', 'time_on_page_milestone'],
    'marketplace': ['view_listing', 'select_listing', 'message_seller', 'add_to_favourites', 'begin_checkout', 'purchase', 'review_submit', 'search', 'filter_apply'],
    'other':       ['page_view', 'scroll', 'click', 'form_submit', 'sign_up', 'contact'],
  };
  const expected = STANDARD_BY_SITETYPE[siteType] || STANDARD_BY_SITETYPE['ecommerce'];

  return `
You are a Senior Digital Analytics Auditor. This is an AUDIT task, NOT a planning task. The website is already live with tracking installed.

SITE TYPE: ${siteType}

YOUR JOB:
1. Identify WHAT IS CURRENTLY TRACKED on the live site (from the scrape data)
2. ${hasUploadedPlan ? "Cross-reference the user's uploaded measurement plan against the live tracking" : "Compare the live tracking against industry-standard events for this business type"}
3. Identify gaps: what's missing, what's broken, what's documented but not actually firing
4. Output recommendations to FIX existing tracking, not rebuild from scratch
5. Populate the THIRD CATEGORY — "missingEvents" — with industry-standard events for site type "${siteType}" that are NOT already in the firing list AND NOT already configured in GTM

CRITICAL RULES — DO NOT VIOLATE:
- This is NOT a new measurement plan. Never recommend a complete event taxonomy from scratch.
- Use the IDs and events from the scrape data verbatim — quote them exactly.
- If audit.ga4.measurementIds contains IDs, your response must include those exact IDs — not placeholders.
- List ALL events from audit.eventsCurrentlyFiring and audit.ga4.allEventsDetected in your response.
- NEVER recommend an event that's already in the firing events list OR the configured events list (case-insensitive comparison). Check both audit.eventsCurrentlyFiring AND audit.eventsConfigured.
- Events come in TWO categories: "configured" (in GTM containers or HTML markers, may not fire until user interaction) and "firing" (caught in real-time). List BOTH in currentlyFiringEvents with a "status" field: "configured" or "firing".
- If an event like event_buy_now is CONFIGURED but not FIRING, do NOT add a new buy_now event. Instead, add it to eventsToFix with the fix: "Configure GTM trigger to activate this existing event marker."
${hasUploadedPlan ? "- The uploaded plan's events are in existingPlan.detectedEvents. Cross-reference each one against live events. Events in plan but not firing = critical issue." : ''}

INPUT DATA:

SCRAPE DATA (live tracking detected):
${websiteData}

CURRENT TRACKING HEALTH SCORE:
${scoreData}

EVENT CATEGORIES (already determined by Tracking Spy + GTM container parser — DO NOT re-list these as recommendations):

A) firingEvents — events that fired LIVE during the scan (verified by Tracking Spy).
   Each entry has \`capturedFromPages\`: which page types fired it (homepage / product / category / cart / etc.).
${JSON.stringify(firingEvents.slice(0, 100), null, 2)}

B) configuredEvents — events configured in GTM containers but did NOT fire during the scan:
${JSON.stringify(configuredEvents.slice(0, 100), null, 2)}

C) Industry-standard events expected for a "${siteType}" site:
${JSON.stringify(expected)}

D) Pages actually scanned by the scraper (multi-page deep scan):
${JSON.stringify(pagesScanned, null, 2)}

MULTI-PAGE COVERAGE RULES — READ CAREFULLY:
- The captured events represent the FULL user journey across pages scanned, not just the homepage.
- If a page type was scanned successfully (success: true), missing events on that page surface ARE legitimately missing.
- If a page type was NOT scanned (e.g. no product page in pagesScanned), do NOT confidently recommend product-only events as missing — instead include a caveat: "Could not auto-discover a <type> page from homepage links. If <event> fires on those pages, this may be a false positive."
- An event captured on ANY scanned page (check capturedFromPages) is NOT missing — never recommend it.
- Typical page → event mapping (use as a guide only):
    - product page → view_item, view_item_list, add_to_cart, add_to_wishlist
    - category page → view_item_list, select_item, view_promotion
    - cart page → view_cart, begin_checkout
    - checkout → add_shipping_info, add_payment_info, purchase
- Pages scanned this run: ${JSON.stringify(Array.from(scannedTypes))}

${hasUploadedPlan ? `UPLOADED MEASUREMENT PLAN (the user's existing documentation):
${existingPlan}` : 'NO UPLOADED PLAN — analyze live site only.'}

OUTPUT FORMAT (return ONLY this JSON, no markdown):

{
  "websiteInfo": {
    "url": "string from scrape",
    "title": "string from scrape",
    "industry": "string",
    "businessType": "string"
  },

  "detectedSetup": {
    "ga4": {
      "installed": true,
      "measurementIds": ["exact IDs from scrape"],
      "status": "Active | Inactive | Misconfigured"
    },
    "gtm": {
      "installed": true,
      "containerIds": ["exact IDs from scrape"]
    },
    "universalAnalytics": {
      "installed": true,
      "propertyIds": ["exact IDs from scrape"],
      "warning": "Universal Analytics was deprecated July 2023"
    },
    "metaPixel": {
      "installed": false,
      "ids": []
    },
    "googleAds": {
      "installed": false,
      "ids": []
    },
    "consentMode": {
      "enabled": false,
      "cmpDetected": "OneTrust | Cookiebot | null",
      "issue": "description or null"
    }
  },

  "currentlyFiringEvents": [
    {
      "eventName": "exact name from scrape",
      "source": "GA4 Network | dataLayer (GTM) | GTM Container Config | Meta Pixel | Universal Analytics",
      "isStandard": true,
      "isDocumented": ${hasUploadedPlan ? 'true or false' : 'null'},
      "notes": "context"
    }
  ],

  ${hasUploadedPlan ? `"planVsReality": {
    "documentedButNotFiring": [
      {
        "eventName": "from uploaded plan",
        "documentedIn": "sheet name or section",
        "severity": "Critical | High | Medium",
        "businessImpact": "what data is being lost"
      }
    ],
    "firingButNotDocumented": [
      {
        "eventName": "live event not in plan",
        "recommendation": "Document or remove"
      }
    ],
    "namingInconsistencies": [
      {
        "planName": "name in upload",
        "liveName": "name firing on site",
        "fix": "standardize to snake_case"
      }
    ]
  },` : ''}

  "criticalIssues": [
    "Plain English — reference actual IDs e.g. 'GA4 (G-XXX) installed but only N events firing'"
  ],

  "eventsToAdd": [
    {
      "id": "ADD1",
      "eventName": "snake_case_name",
      "category": "Engagement | Ecommerce | Lead Gen | Navigation",
      "trigger": "Exact element/action on the site",
      "parameters": [
        { "name": "string", "type": "string|number|boolean", "description": "string" }
      ],
      "rationale": "Why this matters",
      "priority": "Critical | High | Medium",
      "estimatedImpact": "Plain language impact",
      "implementationMethod": "GTM trigger | Direct gtag call | Server-side"
    }
  ],

  "eventsToFix": [
    {
      "currentName": "what's firing now",
      "currentIssue": "what's wrong",
      "recommendedFix": "specific fix",
      "fixType": "Rename | Add parameters | Change trigger | Remove duplicate"
    }
  ],

  "quickWins": [
    {
      "action": "Specific action",
      "impact": "What this unlocks",
      "timeRequired": "30 minutes | 2 hours | 1 day",
      "difficulty": "Easy | Moderate"
    }
  ],

  "implementationRoadmap": [
    {
      "phase": 1,
      "name": "Critical fixes",
      "duration": "Week 1",
      "tasks": ["specific tasks"],
      "rationale": "why first"
    }
  ],

  "missingEvents": [
    {
      "id": "MISS_1",
      "eventName": "view_item",
      "category": "Ecommerce | Engagement | Lead Gen | Navigation | Media",
      "whyMissing": "Plain English explanation referencing what the site has (e.g. 'Site has 43 product cards but no view_item event detected')",
      "recommendedTrigger": "Specific trigger description (e.g. 'Page View on /products/* OR Click on .product-card element')",
      "parameters": [
        { "name": "currency", "type": "string", "required": true },
        { "name": "value", "type": "number", "required": true },
        { "name": "items", "type": "array", "required": true }
      ],
      "priority": "Critical | High | Medium",
      "estimatedImpact": "What this unlocks (e.g. 'Enables product affinity analysis and remarketing audiences')",
      "implementationEffort": "30 minutes | 2-4 hours | 1 day"
    }
  ],

  "executiveSummary": "3-4 sentences. MUST reference actual measurement IDs found. Be specific to this site."
}

GENERATE AT LEAST:
- 5 events in eventsToAdd
- 3 quick wins
- 2 implementation phases
- All currently firing events listed
- All detected IDs listed exactly
- AT LEAST 5 entries in missingEvents (more if the site type genuinely demands them)

═══════════════════════════════════════════
BUSINESS MODEL ANALYSIS — CRITICAL CONTEXT (READ FIRST)
═══════════════════════════════════════════

The site has been analyzed and classified as:
- Primary type:           ${bm.primaryType}
- Reasoning:              ${bm.reasoning}
- Has own checkout:       ${bm.hasOwnCheckout}
- Redirects to retailers: ${bm.redirectsToRetailers}
- Retailers detected:     ${bm.retailers.length ? bm.retailers.join(', ') : 'none'}
- Has shopping cart:      ${bm.hasShoppingCart}
- Has user accounts:      ${bm.hasUserAccounts}
- Has lead forms:         ${bm.hasLeadForms}

RECOMMEND EVENTS BASED ON BUSINESS MODEL — NOT GENERIC CATEGORY.
The standard GA4 e-commerce schema (view_item / add_to_cart / purchase / etc.)
only applies if the user can ACTUALLY transact on this domain. If the site
redirects users to Amazon/Flipkart/other retailers, those events live on the
retailer's domain — recommending them here is a hard FALSE POSITIVE.

────────────────────────────────────────────
EVENTS BY BUSINESS MODEL
────────────────────────────────────────────

A) direct_ecommerce — own cart + checkout
   RECOMMEND: view_item, view_item_list, select_item, add_to_cart, remove_from_cart,
              view_cart, begin_checkout, add_payment_info, add_shipping_info, purchase, refund

B) brand_catalog_with_retailers — Oral-B / P&G / many CPG brands (redirects to retailers)
   DO NOT RECOMMEND: add_to_cart, remove_from_cart, view_cart, begin_checkout,
                     add_payment_info, add_shipping_info, purchase, refund
                     (these all happen on the retailer's domain, not here)
   RECOMMEND INSTEAD:
   - view_item — viewing product detail page (still relevant)
   - view_item_list — viewing category / collection
   - select_item — clicking a product card
   - retailer_click / outbound_retailer_click — clicking "Buy on Amazon" etc. (CRITICAL — this IS the conversion)
   - find_store / find_retailer — store locator usage
   - generate_lead — newsletter signup, contact form
   - share — social sharing
   - file_download — manuals, brochures, instruction PDFs
   - view_promotion, select_promotion — banner interactions

C) lead_generation — no cart, has contact/demo forms
   DO NOT RECOMMEND: add_to_cart, purchase, view_item, view_item_list, view_cart, begin_checkout
   RECOMMEND INSTEAD: form_start, form_submit, generate_lead, contact, request_demo,
                      file_download, schedule_call, newsletter_signup

D) saas — pricing page + free signup
   DO NOT RECOMMEND: add_to_cart, purchase, begin_checkout, view_item, view_item_list
   RECOMMEND INSTEAD: sign_up, login, trial_start, subscribe, feature_used,
                      plan_selected, view_pricing, demo_requested, upgrade_clicked

E) content_publisher — articles, blog
   DO NOT RECOMMEND: any ecommerce events
   RECOMMEND INSTEAD: article_view, scroll_depth, content_share, comment_submit,
                      newsletter_signup, premium_subscribe, video_start, video_complete

F) marketplace — multi-vendor
   RECOMMEND: view_listing, contact_seller, save_listing, view_item, select_item, send_inquiry

G) service_booking — appointments
   DO NOT RECOMMEND: add_to_cart, view_item_list, view_cart
   RECOMMEND INSTEAD: view_service, select_service, schedule_appointment,
                      booking_complete, reschedule_attempt, cancellation

H) informational — no transactions
   RECOMMEND: scroll_depth, content_share, video_engagement, file_download (skip ecommerce)

────────────────────────────────────────────
PRIORITY RULES FOR THIS SITE (primaryType: ${bm.primaryType})
────────────────────────────────────────────
${bm.primaryType === 'brand_catalog_with_retailers' ? `
- CRITICAL: retailer_click / outbound_retailer_click, find_store
- HIGH:     view_item, select_item, view_item_list
- MEDIUM:   generate_lead, share, newsletter_signup
- FORBIDDEN: add_to_cart, begin_checkout, purchase, refund, view_cart, add_payment_info, add_shipping_info
` : bm.primaryType === 'direct_ecommerce' ? `
- CRITICAL: add_to_cart, purchase, begin_checkout
- HIGH:     view_item, view_cart, view_item_list
- MEDIUM:   select_item, share
` : bm.primaryType === 'lead_generation' ? `
- CRITICAL: form_submit, generate_lead
- HIGH:     form_start, contact, request_demo
- MEDIUM:   newsletter_signup, file_download
- FORBIDDEN: add_to_cart, purchase, view_item, view_item_list
` : bm.primaryType === 'saas' ? `
- CRITICAL: sign_up, trial_start, subscribe
- HIGH:     login, feature_used, view_pricing
- MEDIUM:   demo_requested, upgrade_clicked
- FORBIDDEN: add_to_cart, purchase, view_item
` : bm.primaryType === 'content_publisher' ? `
- CRITICAL: article_view, scroll_depth
- HIGH:     newsletter_signup, content_share
- MEDIUM:   video_start, video_complete, comment_submit
- FORBIDDEN: add_to_cart, purchase, view_item, view_item_list
` : `
- Use site type "${siteType}" defaults below.
`}

EVERY entry in missingEvents MUST satisfy:
1. whyMissing references the businessModel reasoning above (mention the model type explicitly)
2. The event is appropriate for primaryType "${bm.primaryType}" — never recommend a FORBIDDEN event
3. recommendedTrigger is concrete (specific button text or page pattern), not generic

────────────────────────────────────────────
WORKED EXAMPLE — BRAND CATALOG SITE (Oral-B style)
────────────────────────────────────────────
✓ CORRECT:
{
  "eventName": "retailer_click",
  "category": "Ecommerce",
  "whyMissing": "Site is a brand_catalog_with_retailers — it redirects users to ${bm.retailers.join(', ') || 'Amazon/Flipkart'} for purchases. Outbound retailer clicks ARE the conversion metric for this model; without them there's no way to measure marketing ROI.",
  "recommendedTrigger": "Click on 'Buy on Amazon' / 'Shop on Flipkart' / similar retailer buttons",
  "parameters": [
    { "name": "retailer_name", "type": "string", "required": true },
    { "name": "product_name", "type": "string", "required": true },
    { "name": "product_id", "type": "string", "required": false }
  ],
  "priority": "Critical",
  "estimatedImpact": "Enables conversion tracking + retailer-channel performance attribution",
  "implementationEffort": "2-4 hours"
}

✗ INCORRECT (the false-positive bug this prompt prevents):
{ "eventName": "add_to_cart", "whyMissing": "Site is an ecommerce store...", "priority": "Critical" }
— No cart exists on this brand site. add_to_cart fires on Amazon/Flipkart, not here.

═══════════════════════════════════════════
UNIVERSAL EVENT EQUIVALENCE — DO NOT NAÏVELY EXACT-MATCH
═══════════════════════════════════════════

A downstream filter will re-check your recommendations using normalization,
keyword-intent matching, and an AI fallback. But you should apply the same
reasoning yourself first — every false positive you avoid here saves API cost
and produces a tighter report.

RULE 1 — Strip prefixes/suffixes before comparing:
  event_*, ga_event_*, gtm_event_*, track_*, on_*, ev_*
  trailing *_event, *_action, *_click, *_submit
Examples:
  event_buy_now           → buy_now
  ga_event_view_pdp       → view_pdp
  track_purchase_action   → purchase

RULE 2 — Keyword-intent matching. Each GA4 standard maps to intent keywords:
  add_to_cart      ← buy, cart, bag, basket, addtocart, addtobag, purchase_intent, shop_now, buy_now
  view_item        ← detail, product_view, pdp, more_details, item_detail, view_details, product_detail
  view_item_list   ← list, category, collection, grid, browse, products_list, plp, category_page
  select_item      ← product_click, click_product, tap_product, item_click, product_card
  purchase         ← order_complete, transaction, order_placed, checkout_complete, buy_complete, order_success
  begin_checkout   ← start_checkout, proceed_checkout, checkout_start, go_to_checkout
  view_cart        ← view_bag, view_basket, open_cart, bag_view, cart_open
  share            ← social_share, socialmedia_exit, tweet, facebook_share, whatsapp_share
  sign_up          ← register, create_account, join_now, signup
  generate_lead    ← lead, contact_form, request_quote, submit_inquiry, demo_request
  search           ← site_search, query_submit, search_query

If a detected event name (after RULE 1) contains an intent keyword for a
standard event, treat that standard as ALREADY COVERED.

RULE 3 — Domain context (use input C and siteType):
  - For ecommerce: assume cart/checkout flows likely exist
  - For lead-gen: assume forms/contact flows exist
  - For saas: assume signup/login/subscribe flows exist
  - For content: assume scroll/share/video flows exist
  Don't recommend events from a category the site type doesn't have.

CORRECT REASONING EXAMPLE:
  Detected events: ['page_view', 'event_buy_now', 'event_view_more_details', 'event_search']
  Considering add_to_cart:
    Step 1 — strip prefixes → ['page_view', 'buy_now', 'view_more_details', 'search']
    Step 2 — add_to_cart intent keywords include 'buy', 'buy_now'
    Step 3 — 'buy_now' contains 'buy' → INTENT MATCH ✓
    Step 4 — DO NOT add add_to_cart to missingEvents
    Step 5 — Add to eventsToFix: { currentName: 'event_buy_now', recommendedName: 'add_to_cart', fixType: 'Rename', currentIssue: 'Custom name — GA4 expects add_to_cart' }

If you must recommend an event in missingEvents/eventsToAdd:
  - Verify it's NOT functionally covered by any detected event (apply RULES 1+2 yourself)
  - whyMissing must explicitly state which intent keywords you checked
  - Example: "No detected event matches purchase intent (purchase, order, transaction, checkout_complete). Site has a cart flow but no completion tracking."

MISSING EVENTS RULES (HARD CONSTRAINTS — do not violate):
- NEVER recommend an event whose name (case-insensitive, trimmed) appears in firingEvents
- NEVER recommend an event whose name (case-insensitive, trimmed) appears in configuredEvents
- NEVER recommend an event whose intent is already covered per the universal rules above
- Prefer event names from input C (industry-standard list) when they fit; only invent new names if no standard event fits the gap
- For each missing event, the whyMissing must reference specific evidence from the scrape (e.g. cart button found, X product cards, search input present)
- For a "${siteType}" site, prioritize the events in input C that are missing

Return ONLY the JSON object.
`;
};
