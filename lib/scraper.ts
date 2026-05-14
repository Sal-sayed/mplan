/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium, type Page } from 'playwright';

export interface ScrapedPage {
  meta: Record<string, string>;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  buttons: { text: string; type: string; href: string; id: string; classes: string }[];
  links: {
    nav: { text: string; href: string }[];
    footer: { text: string; href: string }[];
    social: string[];
    external: number;
    internal: number;
  };
  forms: {
    action: string; method: string; id: string; name: string;
    fields: { type: string; name: string; id: string; placeholder: string; required: boolean; label: string }[];
    submitText: string;
  }[];
  ecommerce: Record<string, any>;
  pricing: Record<string, any>;
  media: Record<string, any>;
  engagement: Record<string, any>;
  socialProof: Record<string, any>;
  tech: Record<string, any>;
  ldJson: any[];
  bodyText: string;
  analyticsAudit: Record<string, any>;
}

export interface ScrapeResult {
  url: string;
  homepage: ScrapedPage;
  subPages: Record<string, ScrapedPage>;
  pagesScraped: number;
}

async function scrapePage(page: Page, pageUrl: string): Promise<ScrapedPage> {
  const networkRequests: string[] = [];
  page.on('request', (req) => networkRequests.push(req.url()));

  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(() =>
    page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  );
  await page.waitForTimeout(1500);

  const data: ScrapedPage = await page.evaluate(() => {
    const text = (el: Element | null) => el?.textContent?.trim().slice(0, 200) || '';
    const attr = (el: Element | null, a: string) => el?.getAttribute(a) || '';

    // 1. META
    const meta = {
      title: document.title,
      description: attr(document.querySelector('meta[name="description"]'), 'content'),
      keywords: attr(document.querySelector('meta[name="keywords"]'), 'content'),
      ogType: attr(document.querySelector('meta[property="og:type"]'), 'content'),
      ogSiteName: attr(document.querySelector('meta[property="og:site_name"]'), 'content'),
      canonical: attr(document.querySelector('link[rel="canonical"]'), 'href'),
      lang: document.documentElement.lang,
    };

    // 2. HEADINGS
    const headings = {
      h1: [...document.querySelectorAll('h1')].map(text).filter(Boolean).slice(0, 15),
      h2: [...document.querySelectorAll('h2')].map(text).filter(Boolean).slice(0, 25),
      h3: [...document.querySelectorAll('h3')].map(text).filter(Boolean).slice(0, 30),
    };

    // 3. BUTTONS & CTAs
    const buttons = [...document.querySelectorAll(
      'button, [role="button"], a.btn, a.button, [class*="btn"], [class*="cta"], input[type="submit"]'
    )].map(el => ({
      text: text(el),
      type: el.tagName.toLowerCase(),
      href: attr(el, 'href'),
      id: attr(el, 'id'),
      classes: attr(el, 'class').slice(0, 100),
    })).filter(b => b.text).slice(0, 50);

    // 4. LINKS
    const allLinks = [...document.querySelectorAll('a[href]')];
    const links = {
      nav: [...document.querySelectorAll('nav a, header a, [role="navigation"] a')]
        .map(a => ({ text: text(a), href: attr(a, 'href') })).filter(l => l.text).slice(0, 30),
      footer: [...document.querySelectorAll('footer a')]
        .map(a => ({ text: text(a), href: attr(a, 'href') })).filter(l => l.text).slice(0, 30),
      social: allLinks.filter(a => /facebook|twitter|x\.com|instagram|linkedin|youtube|tiktok|github|discord/i.test(attr(a, 'href')))
        .map(a => attr(a, 'href')).slice(0, 10),
      external: allLinks.filter(a => attr(a, 'href').startsWith('http') && !attr(a, 'href').includes(location.hostname)).length,
      internal: allLinks.filter(a => attr(a, 'href').startsWith('/') || attr(a, 'href').includes(location.hostname)).length,
    };

    // 5. FORMS
    const forms = [...document.querySelectorAll('form')].map(form => ({
      action: attr(form, 'action'),
      method: attr(form, 'method') || 'GET',
      id: attr(form, 'id'),
      name: attr(form, 'name'),
      fields: [...form.querySelectorAll('input, select, textarea')].map(f => ({
        type: attr(f, 'type') || f.tagName.toLowerCase(),
        name: attr(f, 'name'),
        id: attr(f, 'id'),
        placeholder: attr(f, 'placeholder'),
        required: f.hasAttribute('required'),
        label: text(document.querySelector(`label[for="${attr(f, 'id')}"]`)),
      })),
      submitText: text(form.querySelector('button[type="submit"], input[type="submit"]')),
    })).slice(0, 15);

    // 6. ECOMMERCE
    const htmlText = document.body.innerText || '';
    const priceRegex = /[$€£¥₹]\s?\d[\d,.]*|\d[\d,.]*\s?(USD|EUR|GBP|INR|JPY)/g;
    const prices = (htmlText.match(priceRegex) || []).slice(0, 30);
    const ecommerce = {
      hasCart: !!document.querySelector('[class*="cart"], [id*="cart"], [aria-label*="cart" i]'),
      hasCheckout: /checkout/i.test(htmlText),
      hasAddToCart: !!document.querySelector('[class*="add-to-cart"], [data-add-to-cart]'),
      hasWishlist: /wishlist|favourite|save for later/i.test(htmlText),
      hasReviews: !!document.querySelector('[class*="review"], [class*="rating"], [class*="stars"]'),
      priceCount: prices.length,
      priceSamples: prices.slice(0, 10),
      productCardCount: document.querySelectorAll('[class*="product"], [class*="card"], [class*="item"], [data-product]').length,
      currencies: [...new Set(prices.map(p => (p.match(/[$€£¥₹]|USD|EUR|GBP|INR|JPY/) || [])[0]).filter(Boolean))],
    };

    // 7. PRICING
    const pricingSection = document.querySelector('[id*="pric" i], [class*="pric" i], [class*="plan" i]');
    const pricing = {
      hasPricingPage: !!pricingSection,
      tierCount: pricingSection ? pricingSection.querySelectorAll('[class*="plan"], [class*="tier"], [class*="card"]').length : 0,
      hasFreeTrial: /free trial|try free|start free|14[- ]day free|30[- ]day free/i.test(htmlText),
      hasFreemium: /free forever|free plan|free tier/i.test(htmlText),
      billingToggle: !!document.querySelector('[class*="billing"], [class*="annual"], [class*="monthly"]'),
    };

    // 8. MEDIA
    const media = {
      videoCount: document.querySelectorAll("video, iframe[src*='youtube'], iframe[src*='vimeo'], iframe[src*='wistia']").length,
      imageCount: document.querySelectorAll('img').length,
      hasGallery: !!document.querySelector('[class*="gallery"], [class*="carousel"], [class*="slider"]'),
      hasBlog: /\/blog|\/articles|\/posts|\/news/i.test([...document.querySelectorAll('a')].map(a => attr(a, 'href')).join(' ')),
      hasPodcast: /podcast|episode/i.test(htmlText),
      hasDownloads: !!document.querySelector('a[href$=".pdf"], a[href$=".zip"], a[href*="download"]'),
    };

    // 9. ENGAGEMENT
    const engagement = {
      hasNewsletter: /newsletter|subscribe|email updates|stay in the loop/i.test(htmlText),
      hasChatbot: !!document.querySelector('[class*="chat"], [class*="intercom"], [class*="drift"], [class*="zendesk"], [id*="chat"]'),
      hasLiveSearch: !!document.querySelector('[type="search"], [class*="search"][role], [class*="autocomplete"]'),
      hasLogin: /sign in|log in|login/i.test(htmlText),
      hasSignup: /sign up|register|create account|get started/i.test(htmlText),
      hasDemo: /book a demo|request demo|schedule demo|see it in action/i.test(htmlText),
      hasContactForm: forms.some(f => /contact|inquiry|message/i.test(JSON.stringify(f))),
      hasCookieBanner: !!document.querySelector('[class*="cookie"], [id*="cookie"], [class*="consent"]'),
    };

    // 10. SOCIAL PROOF
    const socialProof = {
      hasTestimonials: /testimonial|customer story|case study|what.*customers? say/i.test(htmlText),
      hasLogos: !!document.querySelector('[class*="logo-cloud"], [class*="customers"], [class*="trusted-by"]'),
      hasRatings: /\d\.\d\s?(out of|\/)\s?\d|★|stars?/i.test(htmlText),
      hasAwards: /award|recognition|featured in|as seen in/i.test(htmlText),
    };

    // 11. TECH STACK
    const scripts = [...document.querySelectorAll('script[src]')].map(s => attr(s, 'src'));
    const inlineScripts = [...document.querySelectorAll('script:not([src])')].map(s => s.innerHTML).join(' ');
    const allScripts = scripts.join(' ') + inlineScripts;
    const tech = {
      googleAnalytics: /google-analytics|googletagmanager|gtag\(/i.test(allScripts),
      gtm: /googletagmanager/i.test(allScripts),
      facebookPixel: /fbevents|connect\.facebook/i.test(allScripts),
      hotjar: /hotjar/i.test(allScripts),
      segment: /segment\.io|analytics\.js/i.test(allScripts),
      mixpanel: /mixpanel/i.test(allScripts),
      intercom: /intercom/i.test(allScripts),
      hubspot: /hubspot|hs-script/i.test(allScripts),
      shopify: /shopify/i.test(allScripts),
      wordpress: /wp-content|wp-includes/i.test(allScripts),
      hasDataLayer: /dataLayer\s*=/i.test(inlineScripts),
    };

    // 12. STRUCTURED DATA
    const ldJson = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s => { try { return JSON.parse(s.innerHTML); } catch { return null; } })
      .filter(Boolean);

    // 13. BODY TEXT
    const mainEl = document.querySelector("main, article, [role='main']") || document.body;
    const bodyText = (mainEl as HTMLElement).innerText?.replace(/\s+/g, ' ').slice(0, 4000) || '';

    // 14. ANALYTICS AUDIT
    const analyticsAudit = {
      ga4: {
        installed: /gtag\(\s*['"]config['"]\s*,\s*['"]G-/.test(inlineScripts),
        measurementId: (inlineScripts.match(/G-[A-Z0-9]{10}/) || [])[0] || null,
        sendsPageView: /gtag\(\s*['"]event['"]\s*,\s*['"]page_view/.test(inlineScripts),
        customEventsFound: [...inlineScripts.matchAll(/gtag\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/g)]
          .map(m => m[1]).filter(e => e !== 'page_view'),
      },
      ua: {
        installed: /UA-\d{4,10}-\d{1,4}/.test(allScripts),
        trackingId: (allScripts.match(/UA-\d{4,10}-\d{1,4}/) || [])[0] || null,
      },
      gtm: {
        installed: /GTM-[A-Z0-9]+/.test(allScripts),
        containerId: (allScripts.match(/GTM-[A-Z0-9]+/) || [])[0] || null,
        serverSideGTM: /server.googletagmanager|sgtm/.test(allScripts),
      },
      dataLayer: {
        exists: /window\.dataLayer\s*=|dataLayer\s*=\s*\[/.test(inlineScripts),
        pushCount: (inlineScripts.match(/dataLayer\.push/g) || []).length,
        hasEcommerceObject: /dataLayer.*ecommerce/i.test(inlineScripts),
        namingConvention: /dataLayer\.push\(\s*\{\s*['"]?event['"]?\s*:\s*['"][a-z_]+['"]/.test(inlineScripts)
          ? 'snake_case'
          : /dataLayer\.push\(\s*\{\s*['"]?event['"]?\s*:\s*['"][a-z][a-zA-Z]+['"]/.test(inlineScripts)
            ? 'camelCase' : 'unknown',
      },
      pixels: {
        metaPixel: /fbq\(\s*['"]init['"]/.test(inlineScripts) || /connect\.facebook\.net.*fbevents/.test(allScripts),
        linkedinInsight: /_linkedin_partner_id|snap\.licdn\.com/.test(allScripts),
        tiktokPixel: /ttq\.load|analytics\.tiktok\.com/.test(allScripts),
        twitterPixel: /static\.ads-twitter\.com|twq\(/.test(allScripts),
        pinterestTag: /pintrk\(/.test(inlineScripts),
        redditPixel: /rdt\(/.test(inlineScripts),
        googleAdsConversion: /AW-\d+/.test(inlineScripts),
        bingUET: /bat\.bing\.com|uetq/.test(allScripts),
      },
      behavior: {
        hotjar: /static\.hotjar\.com|hjid/.test(allScripts),
        fullstory: /fullstory\.com\/s\/fs/.test(allScripts),
        microsoftClarity: /clarity\.ms/.test(allScripts),
        mixpanel: /mixpanel/.test(allScripts),
        amplitude: /amplitude/.test(allScripts),
        segment: /cdn\.segment\.com|analytics\.js/.test(allScripts),
        posthog: /posthog/.test(allScripts),
        heap: /heap\.io|heap-/.test(allScripts),
      },
      consent: {
        hasCookieBanner: !!document.querySelector('[class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"]'),
        cmpDetected:
          /onetrust/i.test(allScripts) ? 'OneTrust' :
          /cookiebot/i.test(allScripts) ? 'Cookiebot' :
          /termly/i.test(allScripts) ? 'Termly' :
          /didomi/i.test(allScripts) ? 'Didomi' :
          /cookieyes/i.test(allScripts) ? 'CookieYes' :
          /iubenda/i.test(allScripts) ? 'Iubenda' : null,
        googleConsentMode: /gtag\(\s*['"]consent['"]/.test(inlineScripts),
        consentModeV2: /ad_user_data|ad_personalization/.test(inlineScripts),
      },
      performance: {
        totalScripts: scripts.length,
        asyncScripts: [...document.querySelectorAll('script[async]')].length,
        deferScripts: [...document.querySelectorAll('script[defer]')].length,
        inlineScriptSize: inlineScripts.length,
        headScripts: document.head.querySelectorAll('script').length,
      },
      tagsFiring: {},
    };

    return {
      meta, headings, buttons, links, forms, ecommerce, pricing,
      media, engagement, socialProof, tech, ldJson, bodyText, analyticsAudit,
    };
  });

  // Add network-based tag firing data
  data.analyticsAudit.tagsFiring = {
    ga4Hits: networkRequests.filter(u => /google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/.test(u)).length,
    gtmLoaded: networkRequests.some(u => /googletagmanager\.com\/gtm\.js/.test(u)),
    metaPixelHits: networkRequests.filter(u => /facebook\.com\/tr/.test(u)).length,
    linkedinHits: networkRequests.filter(u => /px\.ads\.linkedin\.com/.test(u)).length,
    googleAdsHits: networkRequests.filter(u => /googleadservices\.com|google\.com\/pagead/.test(u)).length,
    totalAnalyticsRequests: networkRequests.filter(u =>
      /analytics|gtm|pixel|tracking|telemetry|collect|hotjar|clarity|segment/.test(u)
    ).length,
  };

  return data;
}

export async function deepScrapeWebsite(url: string): Promise<ScrapeResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; MeasurementPlanBot/1.0)',
    viewport: { width: 1440, height: 900 },
  });

  try {
    // 1. Scrape homepage
    const homePage = await context.newPage();
    const homepage = await scrapePage(homePage, url);
    await homePage.close();

    // 2. Find sub-pages
    const candidateKeywords = ['pricing', 'product', 'feature', 'about', 'contact', 'blog', 'demo', 'signup', 'sign-up', 'login', 'shop'];
    const subPageUrls = new Set<string>();
    for (const link of homepage.links.nav) {
      if (!link.href) continue;
      const full = link.href.startsWith('http') ? link.href : new URL(link.href, url).toString();
      if (candidateKeywords.some(k => full.toLowerCase().includes(k))) subPageUrls.add(full);
      if (subPageUrls.size >= 5) break;
    }

    // 3. Scrape sub-pages
    const subPages: Record<string, ScrapedPage> = {};
    for (const subUrl of subPageUrls) {
      try {
        const label = candidateKeywords.find(k => subUrl.toLowerCase().includes(k)) || 'other';
        const subPage = await context.newPage();
        subPages[label] = await scrapePage(subPage, subUrl);
        await subPage.close();
      } catch { /* skip failed sub-pages */ }
    }

    return { url, homepage, subPages, pagesScraped: 1 + Object.keys(subPages).length };
  } finally {
    await browser.close();
  }
}
