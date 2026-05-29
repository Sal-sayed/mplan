export const LOADING_MESSAGES = {
  tactical: [
    { text: 'Scanning your website...', icon: 'Search' },
    { text: 'Reading every button, link, and form...', icon: 'MousePointerClick' },
    { text: 'Mapping your site structure...', icon: 'GitBranch' },
    { text: 'Detecting your business model...', icon: 'Briefcase' },
    { text: 'Analyzing user touchpoints...', icon: 'Users' },
    { text: 'Auditing your current analytics setup...', icon: 'Activity' },
    // ─── Aggressive-simulation tier — surfaced during the click-everything pass ───
    { text: 'Clicking every button on your site...', icon: 'MousePointerClick' },
    { text: 'Triggering 50+ interactive elements...', icon: 'Zap' },
    { text: 'Hovering through navigation menus...', icon: 'Compass' },
    { text: 'Tapping product cards to fire events...', icon: 'Layers' },
    { text: 'Simulating purchase intent flows...', icon: 'ShoppingCart' },
    { text: 'Activating all configured tracking...', icon: 'Radio' },
    { text: 'Forcing every GTM trigger to fire...', icon: 'Bolt' },
    { text: 'Capturing dynamic event firing...', icon: 'Activity' },
  ],
  permission: [
    { text: 'This usually takes under a minute — feel free to grab a coffee', icon: 'Coffee' },
    { text: 'Take a quick break, we\'ll have it ready when you\'re back', icon: 'Pause' },
    { text: 'Sit back, your plan is on its way to your inbox', icon: 'Mail' },
    { text: 'You can switch tabs — we\'ll keep working in the background', icon: 'AppWindow' },
    { text: 'Step away if you\'d like, your plan will be waiting', icon: 'Bookmark' },
  ],
  value: [
    { text: 'Designing 25+ custom tracking events for your site...', icon: 'Code2' },
    { text: 'Crafting your GTM configuration...', icon: 'Settings2' },
    { text: 'Building your phased implementation roadmap...', icon: 'Map' },
    { text: 'Calculating your tracking health score...', icon: 'Gauge' },
    { text: 'Generating your Excel workbook...', icon: 'FileSpreadsheet' },
    { text: 'Delivering to your inbox now...', icon: 'Send' },
    { text: 'Finalizing your measurement plan — almost there', icon: 'Sparkles' },
  ],
} as const;

export function getMessageTier(elapsedSeconds: number): keyof typeof LOADING_MESSAGES {
  // The existing-mode scrape now runs ~3-4 minutes (45s sim × 4 pages + GTM
  // container fetches), so the tactical/permission windows widened.
  if (elapsedSeconds < 90) return 'tactical';
  if (elapsedSeconds < 180) return 'permission';
  return 'value';
}
