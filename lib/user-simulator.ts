/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Universal user simulator — aggressive 9-phase interaction pass.
 *
 * Goal: click *every* interactive element on the page so analytics events
 * that depend on user interaction (event_buy_now, view_item, select_item,
 * search, etc.) actually fire and get captured by Tracking Spy + Playwright.
 *
 * Strategy: dispatch a full mouseenter → mouseover → mousedown → mouseup →
 * click sequence AND call native `node.click()` on every target. Block
 * navigation in a capture-phase listener so click handlers still execute
 * but the page never reloads.
 *
 * Safe by design — destructive text patterns are skipped, dialogs/alerts
 * are stubbed, forms are blocked from submission, anchor navigation is
 * cancelled.
 */
import type { Page } from 'playwright';

export interface SimResult {
  elementsClicked: number;
  eventMarkersTriggered: number;
  ctasClicked: number;
  productsClicked: number;
  linksClicked: number;
  scrolls: number;
  hovers: number;
  formInteractions: number;
  searchesPerformed: number;
  mediaTriggered: number;
  phasesCompleted: number;
  errors: string[];
  durationMs: number;
}

const DESTRUCTIVE_RE = /delete|remove|unsubscribe|log\s*out|logout|sign\s*out|close\s*account|delete\s*account|reject\s*all|decline|cancel/i;

const CTA_TEXT_PATTERNS = [
  // Commerce
  'Buy Now', 'Buy now', 'Add to Cart', 'Add to cart', 'Add to Bag', 'Add to Basket',
  'Shop Now', 'Order Now', 'Purchase',
  // Engagement
  'Learn More', 'Read More', 'View Details', 'See Details', 'View More', 'See More',
  'Show More', 'Discover', 'Discover More', 'Explore',
  // Conversion
  'Get Started', 'Sign Up', 'Sign In', 'Register', 'Subscribe', 'Join',
  'Try Free', 'Start Free Trial', 'Get Demo', 'Request Demo', 'Get Quote',
  'Contact Us', 'Talk to Sales', 'Book Now', 'Book a Demo', 'Request Quote',
  // Content / media
  'Watch', 'Play', 'Listen', 'Download', 'Share',
];

const PRODUCT_CARD_SELECTORS = [
  "[class*='product-card']:visible",
  "[class*='product-tile']:visible",
  "[class*='product-item']:visible",
  "[class*='ProductCard']:visible",
  "[class*='ProductTile']:visible",
  '[data-product-id]:visible',
  '[data-product]:visible',
  "article[class*='product']:visible",
];

const EVENT_MARKER_SELECTOR = [
  "[class*='event_']:visible",
  "[class*='ga-event']:visible",
  "[class*='gtm-event']:visible",
  "[class*='track-']:visible",
  '[data-event]:visible',
  '[data-track]:visible',
  '[data-gtm-event]:visible',
  '[data-ga-event]:visible',
  '[data-analytics]:visible',
  '[data-tracking]:visible',
  '[data-action]:visible',
].join(', ');

function newResult(): SimResult {
  return {
    elementsClicked: 0,
    eventMarkersTriggered: 0,
    ctasClicked: 0,
    productsClicked: 0,
    linksClicked: 0,
    scrolls: 0,
    hovers: 0,
    formInteractions: 0,
    searchesPerformed: 0,
    mediaTriggered: 0,
    phasesCompleted: 0,
    errors: [],
    durationMs: 0,
  };
}

/**
 * Two-layer safety install:
 *  1) page.evaluate — applies to the CURRENT page now
 *  2) addInitScript — applies to any future navigation that leaks through
 * Both are idempotent via `__userSimSafety` flag.
 */
async function installSafety(page: Page): Promise<void> {
  // Defense-in-depth: re-install on any future navigation.
  try {
    await page.addInitScript(() => {
      const w = window as any;
      if (w.__userSimSafety) return;
      w.__userSimSafety = true;
      try { window.confirm = () => false; } catch { /* sealed */ }
      try { window.alert = () => undefined; } catch { /* sealed */ }
      try { window.prompt = () => null; } catch { /* sealed */ }
      document.addEventListener('submit', (e) => {
        e.preventDefault(); e.stopImmediatePropagation();
      }, { capture: true });
      window.addEventListener('beforeunload', (e) => {
        e.preventDefault();
        (e as BeforeUnloadEvent).returnValue = '';
      });
      document.addEventListener('click', (e) => {
        const t = e.target as HTMLElement | null;
        const a = (t?.closest?.('a[href]') as HTMLAnchorElement | null) || null;
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (!href || href === '#' || href.startsWith('#') || href.startsWith('javascript:')) return;
        try {
          const url = new URL(href, window.location.href);
          if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) {
            e.preventDefault();
          }
        } catch { e.preventDefault(); }
      }, { capture: true });
    });
  } catch { /* addInitScript can fail in some edge cases */ }

  // Install for the CURRENT page (addInitScript only applies to future nav).
  try {
    await page.evaluate(() => {
      const w = window as any;
      if (w.__userSimSafety) return;
      w.__userSimSafety = true;
      try { window.confirm = () => false; } catch { /* sealed */ }
      try { window.alert = () => undefined; } catch { /* sealed */ }
      try { window.prompt = () => null; } catch { /* sealed */ }
      document.addEventListener('submit', (e) => {
        e.preventDefault(); e.stopImmediatePropagation();
      }, { capture: true });
      window.addEventListener('beforeunload', (e) => {
        e.preventDefault();
        (e as BeforeUnloadEvent).returnValue = '';
      });
      document.addEventListener('click', (e) => {
        const t = e.target as HTMLElement | null;
        const a = (t?.closest?.('a[href]') as HTMLAnchorElement | null) || null;
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (!href || href === '#' || href.startsWith('#') || href.startsWith('javascript:')) return;
        try {
          const url = new URL(href, window.location.href);
          if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) {
            e.preventDefault();
          }
        } catch { e.preventDefault(); }
      }, { capture: true });
    });
  } catch { /* page might be in a weird state */ }
}

export async function simulateRealUser(
  page: Page,
  opts: { maxDurationMs?: number; label?: string } = {}
): Promise<SimResult> {
  const maxDuration = opts.maxDurationMs ?? 45000;
  const label = opts.label || 'page';
  const startTime = Date.now();
  const stats = newResult();

  const timeLeft = () => maxDuration - (Date.now() - startTime);
  const log = (m: string) => console.log(`🤖 [${label}] ${m}`);

  await installSafety(page);

  try {
    // ─── PHASE 1: AGGRESSIVE SCROLL ───
    // Instant scrolls — no smooth animation — so we visit the full page fast
    // and trigger any scroll-triggered events. Then back to top.
    log('Phase 1: Aggressive page scroll');
    for (let i = 1; i <= 10 && timeLeft() > 0; i++) {
      try {
        await page.evaluate((s) => {
          window.scrollTo({ top: (document.body.scrollHeight / 10) * s, behavior: 'instant' as ScrollBehavior });
        }, i);
        await page.waitForTimeout(400);
        stats.scrolls++;
      } catch { /* skip */ }
    }
    try {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
      await page.waitForTimeout(600);
    } catch { /* skip */ }
    stats.phasesCompleted++;
    if (timeLeft() < 5000) return done();

    // ─── PHASE 2: CLICK EVERY event_* / data-event / data-track MARKER ───
    // This is THE key phase — most analytics events fire from elements
    // marked with these class/data conventions. Multi-event dispatch +
    // native node.click() maximizes trigger probability.
    log('Phase 2: Clicking ALL event-marker elements');
    try {
      const markers = await page.locator(EVENT_MARKER_SELECTOR).all();
      log(`Found ${markers.length} event markers`);
      const cap = Math.min(markers.length, 150);
      for (let i = 0; i < cap && timeLeft() > 10000; i++) {
        try {
          const visible = await markers[i].isVisible({ timeout: 400 }).catch(() => false);
          if (!visible) continue;
          const text = ((await markers[i].textContent().catch(() => '')) || '').trim();
          if (DESTRUCTIVE_RE.test(text)) continue;
          await fireAllEvents(markers[i]);
          await page.waitForTimeout(120);
          stats.eventMarkersTriggered++;
        } catch { /* skip */ }
      }
      log(`Triggered ${stats.eventMarkersTriggered} event markers`);
    } catch { /* selector failed */ }
    stats.phasesCompleted++;
    if (timeLeft() < 5000) return done();

    // ─── PHASE 3: TEXT-MATCHED CTAS ───
    log('Phase 3: Clicking CTAs by text pattern');
    for (const ctaText of CTA_TEXT_PATTERNS) {
      if (timeLeft() < 5000) break;
      try {
        const safe = ctaText.replace(/"/g, '\\"');
        const sel = `button:visible:has-text("${safe}"), a:visible:has-text("${safe}"), [role='button']:visible:has-text("${safe}")`;
        const matched = await page.locator(sel).all();
        for (let i = 0; i < Math.min(matched.length, 3) && timeLeft() > 4000; i++) {
          try {
            const text = ((await matched[i].textContent().catch(() => '')) || '').trim();
            if (DESTRUCTIVE_RE.test(text)) continue;
            await fireAllEvents(matched[i]);
            await page.waitForTimeout(200);
            stats.ctasClicked++;
          } catch { /* skip */ }
        }
      } catch { /* skip pattern */ }
    }
    log(`Clicked ${stats.ctasClicked} CTAs`);
    stats.phasesCompleted++;
    if (timeLeft() < 5000) return done();

    // ─── PHASE 4: PRODUCT CARDS ───
    // Trigger view_item / select_item by clicking product tile elements.
    log('Phase 4: Clicking product cards');
    for (const sel of PRODUCT_CARD_SELECTORS) {
      if (timeLeft() < 4000) break;
      try {
        const cards = await page.locator(sel).all();
        for (let i = 0; i < Math.min(cards.length, 5) && timeLeft() > 3000; i++) {
          try {
            await fireAllEvents(cards[i]);
            await page.waitForTimeout(200);
            stats.productsClicked++;
          } catch { /* skip */ }
        }
      } catch { /* skip selector */ }
    }
    log(`Clicked ${stats.productsClicked} product cards`);
    stats.phasesCompleted++;
    if (timeLeft() < 4000) return done();

    // ─── PHASE 5: ALL VISIBLE BUTTONS (catch-all) ───
    log('Phase 5: Clicking all visible buttons');
    try {
      const buttons = await page.locator('button:visible').all();
      log(`Found ${buttons.length} visible buttons`);
      const cap = Math.min(buttons.length, 40);
      for (let i = 0; i < cap && timeLeft() > 3000; i++) {
        try {
          const text = ((await buttons[i].textContent().catch(() => '')) || '').trim().toLowerCase();
          if (DESTRUCTIVE_RE.test(text)) continue;
          // Skip icon-only / empty buttons + obvious close/info widgets — they
          // often act as modal-dismissers that would obstruct further clicks.
          if (text.length === 0) continue;
          if (/^(×|✕|✖|×|x|\?|info)$/.test(text)) continue;
          await fireAllEvents(buttons[i]);
          await page.waitForTimeout(100);
          stats.elementsClicked++;
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    log(`Clicked ${stats.elementsClicked} generic buttons`);
    stats.phasesCompleted++;
    if (timeLeft() < 3000) return done();

    // ─── PHASE 6: NAV LINKS (without navigating away) ───
    // Anchor navigation is blocked by our capture-phase listener, so click
    // handlers fire but the page stays put.
    log('Phase 6: Clicking navigation links');
    try {
      const navLinks = await page.locator(
        "nav a:visible, header a:visible, [class*='menu'] a:visible, [class*='nav'] a:visible"
      ).all();
      for (let i = 0; i < Math.min(navLinks.length, 15) && timeLeft() > 2000; i++) {
        try {
          await fireAllEvents(navLinks[i]);
          await page.waitForTimeout(100);
          stats.linksClicked++;
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    log(`Clicked ${stats.linksClicked} nav links`);
    stats.phasesCompleted++;
    if (timeLeft() < 2000) return done();

    // ─── PHASE 7: SEARCH ───
    log('Phase 7: Search interaction');
    try {
      const searchInput = page.locator(
        "input[type='search']:visible, input[name*='search' i]:visible, input[name*='query' i]:visible, input[placeholder*='search' i]:visible, input[aria-label*='search' i]:visible"
      ).first();
      if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await searchInput.focus({ timeout: 1500 });
        await page.waitForTimeout(300);
        await searchInput.fill('product');
        await page.waitForTimeout(400);
        await searchInput.press('Enter');
        await page.waitForTimeout(2000);
        stats.searchesPerformed++;
      }
    } catch { /* skip */ }
    stats.phasesCompleted++;
    if (timeLeft() < 2000) return done();

    // ─── PHASE 8: FORM FIELDS ───
    log('Phase 8: Form field interactions');
    try {
      const inputs = await page.locator(
        "input:visible:not([type='hidden']):not([type='submit']):not([type='button']):not([type='search']), textarea:visible, select:visible"
      ).all();
      for (let i = 0; i < Math.min(inputs.length, 10) && timeLeft() > 1500; i++) {
        try {
          await inputs[i].focus({ timeout: 500 });
          await inputs[i].evaluate((node: HTMLElement) => {
            node.dispatchEvent(new Event('focus', { bubbles: true }));
            node.dispatchEvent(new Event('focusin', { bubbles: true }));
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
          });
          await page.waitForTimeout(120);
          stats.formInteractions++;
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    stats.phasesCompleted++;

    // ─── PHASE 9: FINAL DEEP SCROLL ───
    log('Phase 9: Final deep scroll');
    try {
      for (let i = 1; i <= 8 && timeLeft() > 500; i++) {
        await page.evaluate((s) => {
          window.scrollTo({ top: (document.body.scrollHeight / 8) * s, behavior: 'instant' as ScrollBehavior });
        }, i);
        await page.waitForTimeout(350);
        stats.scrolls++;
      }
    } catch { /* skip */ }
    stats.phasesCompleted++;
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    stats.errors.push(msg);
    log(`Top-level error: ${msg}`);
  }

  return done();

  function done(): SimResult {
    stats.durationMs = Date.now() - startTime;
    log(`Completed in ${stats.durationMs}ms — phases: ${stats.phasesCompleted}/9, total interactions: ${stats.eventMarkersTriggered + stats.ctasClicked + stats.productsClicked + stats.elementsClicked + stats.linksClicked}`);
    return stats;
  }
}

/**
 * Fire every plausible trigger on the element: mouseenter → mouseover →
 * mousedown → mouseup → click, AND call native .click(). Wrapped per-event
 * so a thrown handler doesn't abort the chain.
 */
async function fireAllEvents(locator: any): Promise<void> {
  await locator.evaluate((node: HTMLElement) => {
    const events: Event[] = [
      new MouseEvent('mouseenter', { bubbles: true, cancelable: true }),
      new MouseEvent('mouseover', { bubbles: true, cancelable: true }),
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }),
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    ];
    for (const evt of events) {
      try { node.dispatchEvent(evt); } catch { /* per-event swallow */ }
    }
    // Native click() — synthesizes its own click event (including the
    // default action). Our capture-phase listener cancels anchor defaults,
    // so handlers still fire but no navigation occurs.
    try {
      if (typeof (node as any).click === 'function') (node as any).click();
    } catch { /* sealed */ }
  });
}
