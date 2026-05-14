export const LOADING_MESSAGES = {
  tactical: [
    { text: 'Scanning your website...', icon: 'Search' },
    { text: 'Reading every button, link, and form...', icon: 'MousePointerClick' },
    { text: 'Mapping your site structure...', icon: 'GitBranch' },
    { text: 'Detecting your business model...', icon: 'Briefcase' },
    { text: 'Analyzing user touchpoints...', icon: 'Users' },
    { text: 'Auditing your current analytics setup...', icon: 'Activity' },
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
  if (elapsedSeconds < 15) return 'tactical';
  if (elapsedSeconds < 45) return 'permission';
  return 'value';
}
