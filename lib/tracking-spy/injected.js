/*
 * Tracking Spy — in-page capture script.
 *
 * Loaded via Playwright's `page.addInitScript()`, so it runs BEFORE any page
 * script on every navigation (and, since hooks persist on `window`, continues
 * catching analytics through SPA route changes too).
 *
 * Strategy: monkey-patch every transport used by analytics vendors and push a
 * raw record onto `window.__trackingSpy.events`. Parsing into normalized events
 * happens later in lib/tracking-spy/parsers.ts (Node side) so we don't risk
 * crashing the page on a malformed payload.
 */

(function trackingSpyInit() {
  if (typeof window === 'undefined') return;
  // Idempotent — re-injection on navigation should not double-wrap.
  if (window.__trackingSpy && window.__trackingSpy.__installed) return;

  var spy = {
    __installed: true,
    events: [],
    metadata: {
      startedAt: Date.now(),
      initialUrl: location.href,
      userAgent: navigator.userAgent,
    },
    // Counters help downstream sanity-check that hooks fired at all.
    counters: { fetch: 0, xhr: 0, beacon: 0, image: 0, dataLayer: 0 },
  };
  window.__trackingSpy = spy;

  // ─── URL → likely vendor (used to filter noise + tag the raw record) ───
  // Keep this list conservative; final vendor classification lives in parsers.ts.
  var VENDOR_PATTERNS = [
    { vendor: 'GA4',                  re: /google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/ },
    { vendor: 'UA',                   re: /google-analytics\.com\/(r\/)?collect(?!\/)/ },
    { vendor: 'GTM',                  re: /googletagmanager\.com\/(gtm|gtag)/ },
    { vendor: 'MetaPixel',            re: /facebook\.com\/tr/ },
    { vendor: 'TikTokPixel',          re: /analytics\.tiktok\.com/ },
    { vendor: 'LinkedInInsight',      re: /px\.ads\.linkedin\.com|snap\.licdn\.com/ },
    { vendor: 'GoogleAds',            re: /googleadservices\.com|googleads\.g\.doubleclick\.net|google\.com\/pagead/ },
    { vendor: 'BingUET',              re: /bat\.bing\.com\/action/ },
    { vendor: 'PinterestTag',         re: /ct\.pinterest\.com/ },
    { vendor: 'TwitterPixel',         res: /analytics\.twitter\.com|t\.co\/i\/adsct/ },
    { vendor: 'Hotjar',               re: /\.hotjar\.com\/api/ },
    { vendor: 'Segment',              re: /api\.segment\.io/ },
    { vendor: 'Mixpanel',             re: /api\.mixpanel\.com|api-js\.mixpanel\.com/ },
    { vendor: 'Amplitude',            re: /api\.amplitude\.com|api2\.amplitude\.com/ },
    { vendor: 'AdobeAnalytics',       re: /\.sc\.omtrdc\.net|\/b\/ss\// },
    { vendor: 'MicrosoftClarity',     re: /clarity\.ms\/collect/ },
    { vendor: 'Posthog',              re: /posthog\.com|app\.posthog\.com/ },
    { vendor: 'Heap',                 re: /heap\.io|heapanalytics\.com/ },
  ];

  function detectVendor(url) {
    if (!url) return null;
    for (var i = 0; i < VENDOR_PATTERNS.length; i++) {
      var p = VENDOR_PATTERNS[i];
      var re = p.re || p.res;
      try { if (re && re.test(url)) return p.vendor; } catch (_) { /* skip */ }
    }
    return null;
  }

  function record(rec) {
    try {
      spy.events.push(rec);
      // Cap to avoid runaway memory on long-lived SPA sessions.
      if (spy.events.length > 5000) spy.events.splice(0, 1000);
    } catch (_) { /* never break the page */ }
  }

  function safeText(body) {
    try {
      if (body == null) return null;
      if (typeof body === 'string') return body.slice(0, 8000);
      if (body instanceof FormData) {
        var pairs = [];
        body.forEach(function (v, k) { pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v))); });
        return pairs.join('&').slice(0, 8000);
      }
      if (body instanceof URLSearchParams) return body.toString().slice(0, 8000);
      if (body instanceof Blob) return '[Blob ' + body.size + 'B type=' + body.type + ']';
      if (body instanceof ArrayBuffer) {
        try { return new TextDecoder().decode(new Uint8Array(body)).slice(0, 8000); } catch (_) { return '[ArrayBuffer ' + body.byteLength + 'B]'; }
      }
      if (ArrayBuffer.isView && ArrayBuffer.isView(body)) {
        try { return new TextDecoder().decode(body).slice(0, 8000); } catch (_) { return '[TypedArray]'; }
      }
      return null;
    } catch (_) { return null; }
  }

  // ─── fetch ───
  try {
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function patchedFetch(input, init) {
        var url, method;
        try {
          url = (typeof input === 'string') ? input : (input && input.url) || '';
          method = (init && init.method) || (input && input.method) || 'GET';
        } catch (_) { url = ''; method = 'GET'; }
        var vendor = detectVendor(url);
        if (vendor) {
          spy.counters.fetch++;
          record({
            transport: 'fetch',
            vendor: vendor,
            url: url,
            method: String(method).toUpperCase(),
            body: init ? safeText(init.body) : null,
            timestamp: Date.now(),
          });
        }
        return origFetch.apply(this, arguments);
      };
    }
  } catch (_) { /* fetch hook failed */ }

  // ─── XMLHttpRequest ───
  try {
    var XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      var origOpen = XHR.prototype.open;
      var origSend = XHR.prototype.send;
      XHR.prototype.open = function patchedOpen(method, url) {
        try {
          this.__ts_url = url;
          this.__ts_method = String(method || 'GET').toUpperCase();
        } catch (_) {}
        return origOpen.apply(this, arguments);
      };
      XHR.prototype.send = function patchedSend(body) {
        try {
          var vendor = detectVendor(this.__ts_url);
          if (vendor) {
            spy.counters.xhr++;
            record({
              transport: 'xhr',
              vendor: vendor,
              url: this.__ts_url,
              method: this.__ts_method || 'GET',
              body: safeText(body),
              timestamp: Date.now(),
            });
          }
        } catch (_) {}
        return origSend.apply(this, arguments);
      };
    }
  } catch (_) { /* xhr hook failed */ }

  // ─── navigator.sendBeacon (GA4, Meta Pixel default transport) ───
  try {
    if (navigator && typeof navigator.sendBeacon === 'function') {
      var origBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function patchedBeacon(url, data) {
        try {
          var vendor = detectVendor(url);
          if (vendor) {
            spy.counters.beacon++;
            record({
              transport: 'beacon',
              vendor: vendor,
              url: String(url || ''),
              method: 'POST',
              body: safeText(data),
              timestamp: Date.now(),
            });
          }
        } catch (_) {}
        return origBeacon(url, data);
      };
    }
  } catch (_) { /* beacon hook failed */ }

  // ─── Image() pixel beacons (Meta noscript fallback, classic UA pixel) ───
  try {
    var imgSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (imgSrcDescriptor && imgSrcDescriptor.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: imgSrcDescriptor.enumerable,
        get: imgSrcDescriptor.get,
        set: function patchedImgSrc(value) {
          try {
            var url = String(value || '');
            var vendor = detectVendor(url);
            if (vendor) {
              spy.counters.image++;
              record({
                transport: 'image',
                vendor: vendor,
                url: url,
                method: 'GET',
                body: null,
                timestamp: Date.now(),
              });
            }
          } catch (_) {}
          return imgSrcDescriptor.set.call(this, value);
        },
      });
    }
  } catch (_) { /* image hook failed */ }

  // ─── dataLayer.push (GTM) ───
  // Watch for dataLayer creation, then patch push() to capture each event object.
  function patchDataLayer(arr) {
    try {
      if (!arr || arr.__ts_patched) return;
      Object.defineProperty(arr, '__ts_patched', { value: true, enumerable: false });
      var origPush = arr.push.bind(arr);
      arr.push = function patchedDlPush() {
        try {
          for (var i = 0; i < arguments.length; i++) {
            var item = arguments[i];
            if (item && typeof item === 'object') {
              spy.counters.dataLayer++;
              var evtName = (!Array.isArray(item) && item.event) ||
                            (Array.isArray(item) && item[0] === 'event' && item[1]) ||
                            null;
              record({
                transport: 'dataLayer',
                vendor: 'GTM',
                url: location.href,
                method: 'push',
                body: null,
                eventName: evtName,
                payload: serializeShallow(item),
                timestamp: Date.now(),
              });
            }
          }
        } catch (_) {}
        return origPush.apply(this, arguments);
      };
    } catch (_) {}
  }

  function serializeShallow(obj) {
    try {
      var out = {};
      if (Array.isArray(obj)) {
        for (var i = 0; i < Math.min(obj.length, 16); i++) {
          var v = obj[i];
          out[i] = (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') ? v : (v == null ? null : '[obj]');
        }
        return out;
      }
      var keys = Object.keys(obj || {}).slice(0, 32);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k]; var val = obj[key];
        if (val == null) out[key] = null;
        else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') out[key] = val;
        else if (Array.isArray(val)) out[key] = '[array len=' + val.length + ']';
        else out[key] = '[obj]';
      }
      return out;
    } catch (_) { return null; }
  }

  // If dataLayer already exists, patch immediately.
  try { if (Array.isArray(window.dataLayer)) patchDataLayer(window.dataLayer); } catch (_) {}

  // Otherwise watch for assignment.
  try {
    var dlBacking = Array.isArray(window.dataLayer) ? window.dataLayer : null;
    Object.defineProperty(window, 'dataLayer', {
      configurable: true,
      get: function () { return dlBacking; },
      set: function (val) {
        dlBacking = val;
        if (Array.isArray(val)) patchDataLayer(val);
      },
    });
    if (dlBacking) patchDataLayer(dlBacking);
  } catch (_) { /* property already defined, fall back to interval */ }

  // Safety net — poll briefly in case dataLayer gets re-created after our defineProperty.
  try {
    var pollStart = Date.now();
    var pollId = setInterval(function () {
      try {
        if (Array.isArray(window.dataLayer) && !window.dataLayer.__ts_patched) patchDataLayer(window.dataLayer);
        if (Date.now() - pollStart > 15000) clearInterval(pollId);
      } catch (_) { clearInterval(pollId); }
    }, 250);
  } catch (_) {}

  // Expose snapshot helper for the Node side.
  try {
    spy.snapshot = function () {
      return { events: spy.events.slice(), metadata: spy.metadata, counters: spy.counters };
    };
  } catch (_) {}
})();
