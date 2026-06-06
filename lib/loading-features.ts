import {
  type LucideIcon,
  Target,
  TrendingUp,
  Layers,
  Code2,
  FileSpreadsheet,
  Zap,
  Gauge,
  BarChart3,
  Eye,
  Search,
  ShieldCheck,
  GitBranch,
  Workflow,
  Database,
  LineChart,
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  Map,
  Compass,
  Filter,
  Sparkles,
  Network,
  FileText,
  Cpu,
  Globe,
  RefreshCw,
  Award,
} from 'lucide-react';

// Color names map to a static class bundle below. Keeping `color` as a token
// (not a raw className) lets Tailwind's static analysis see every utility
// class in this file, so all variants get compiled into the bundle.
export type FeatureColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'cyan'
  | 'yellow'
  | 'emerald'
  | 'red';

export interface FeatureColorClasses {
  iconText: string;
  iconBg: string;
  badgeText: string;
  badgeBg: string;
  glow: string;
}

export const FEATURE_COLOR_CLASSES: Record<FeatureColor, FeatureColorClasses> = {
  blue:    { iconText: 'text-blue-400',    iconBg: 'bg-blue-500/10',    badgeText: 'text-blue-300',    badgeBg: 'bg-blue-500/15',    glow: 'bg-blue-500/10' },
  green:   { iconText: 'text-green-400',   iconBg: 'bg-green-500/10',   badgeText: 'text-green-300',   badgeBg: 'bg-green-500/15',   glow: 'bg-green-500/10' },
  purple:  { iconText: 'text-purple-400',  iconBg: 'bg-purple-500/10',  badgeText: 'text-purple-300',  badgeBg: 'bg-purple-500/15',  glow: 'bg-purple-500/10' },
  pink:    { iconText: 'text-pink-400',    iconBg: 'bg-pink-500/10',    badgeText: 'text-pink-300',    badgeBg: 'bg-pink-500/15',    glow: 'bg-pink-500/10' },
  orange:  { iconText: 'text-orange-400',  iconBg: 'bg-orange-500/10',  badgeText: 'text-orange-300',  badgeBg: 'bg-orange-500/15',  glow: 'bg-orange-500/10' },
  cyan:    { iconText: 'text-cyan-400',    iconBg: 'bg-cyan-500/10',    badgeText: 'text-cyan-300',    badgeBg: 'bg-cyan-500/15',    glow: 'bg-cyan-500/10' },
  yellow:  { iconText: 'text-yellow-400',  iconBg: 'bg-yellow-500/10',  badgeText: 'text-yellow-300',  badgeBg: 'bg-yellow-500/15',  glow: 'bg-yellow-500/10' },
  emerald: { iconText: 'text-emerald-400', iconBg: 'bg-emerald-500/10', badgeText: 'text-emerald-300', badgeBg: 'bg-emerald-500/15', glow: 'bg-emerald-500/10' },
  red:     { iconText: 'text-red-400',     iconBg: 'bg-red-500/10',     badgeText: 'text-red-300',     badgeBg: 'bg-red-500/15',     glow: 'bg-red-500/10' },
};

export interface LoadingFeature {
  id: string;
  icon: LucideIcon;
  color: FeatureColor;
  title: string;
  description: string;
  highlight?: string;
}

export const NEW_WEBSITE_FEATURES: LoadingFeature[] = [
  {
    id: 'objectives',
    icon: Target,
    color: 'blue',
    title: 'Business Objectives Mapped to KPIs',
    description: 'Every KPI in your plan ties back to a specific business goal. No metric exists in isolation — they all serve a measurable outcome.',
    highlight: 'OBJECTIVE-DRIVEN',
  },
  {
    id: 'kpi_framework',
    icon: TrendingUp,
    color: 'green',
    title: '12+ Industry-Specific KPIs',
    description: 'Conversion rate, AOV, cart abandonment, session quality, engagement depth — all configured with formulas, targets, and frequency.',
  },
  {
    id: 'event_schema',
    icon: Code2,
    color: 'purple',
    title: 'GA4 Standard Event Schema',
    description: "20+ events using snake_case naming that GA4's native reports understand. No custom names that break e-commerce analytics.",
    highlight: 'GA4 COMPLIANT',
  },
  {
    id: 'data_layer',
    icon: Layers,
    color: 'pink',
    title: 'Complete dataLayer Schema',
    description: 'Production-ready JavaScript snippets for every event. Copy, paste, and your developers know exactly what to push.',
  },
  {
    id: 'gtm_config',
    icon: GitBranch,
    color: 'orange',
    title: 'GTM Tag Configuration Guide',
    description: 'Step-by-step setup for every tag, trigger, and variable. Including dataLayer variable mappings for each event.',
  },
  {
    id: 'user_journeys',
    icon: Workflow,
    color: 'cyan',
    title: 'User Journey Mapping',
    description: 'From first visit to conversion — every touchpoint mapped with the events that should fire at each step.',
  },
  {
    id: 'custom_dimensions',
    icon: Database,
    color: 'yellow',
    title: '10+ Custom Dimensions',
    description: 'Logged-in status, customer tier, subscription type — dimensions that turn flat reports into segmented insights.',
  },
  {
    id: 'conversion_goals',
    icon: Award,
    color: 'emerald',
    title: 'Conversion Goals with Values',
    description: 'Each goal assigned a monetary value so you can measure marketing ROI, not just count submissions.',
  },
  {
    id: 'implementation',
    icon: Map,
    color: 'blue',
    title: 'Phased Implementation Roadmap',
    description: 'Week 1-2 quick wins, Week 3-4 foundation, Week 5-8 advanced. Realistic timeline your team can actually execute.',
  },
  {
    id: 'excel_output',
    icon: FileSpreadsheet,
    color: 'green',
    title: 'Professional Excel Workbook',
    description: '9 sheets covering objectives, KPIs, events, dimensions, data sources, RACI, glossary. Ready to share with stakeholders.',
    highlight: 'DELIVERABLE',
  },
  {
    id: 'raci',
    icon: Network,
    color: 'purple',
    title: 'RACI & Sign-off Matrix',
    description: "Clear ownership — who's Responsible, Accountable, Consulted, Informed for every implementation step.",
  },
  {
    id: 'insights',
    icon: Lightbulb,
    color: 'yellow',
    title: 'AI-Powered Strategic Insights',
    description: 'Beyond just events — recommendations on data sources, BigQuery integration, and reporting cadence.',
  },
  {
    id: 'data_sources',
    icon: RefreshCw,
    color: 'cyan',
    title: 'Recommended Data Sources',
    description: 'GA4, GTM, Search Console, BigQuery, Looker Studio — the right tools for your specific use case.',
  },
  {
    id: 'reporting',
    icon: Gauge,
    color: 'pink',
    title: 'Reporting Cadence Framework',
    description: 'Daily ops dashboards, weekly performance reviews, monthly strategy reports — defined and templated.',
  },
  {
    id: 'glossary',
    icon: FileText,
    color: 'orange',
    title: 'Built-in Glossary',
    description: 'Every metric, dimension, and term defined in plain English. Your marketing team finally understands the data team.',
  },
  {
    id: 'ai_analysis',
    icon: Cpu,
    color: 'blue',
    title: 'AI Analysis of Your Site Type',
    description: "We detect whether you're e-commerce, lead-gen, SaaS, content, or marketplace — and tailor recommendations accordingly.",
  },
  {
    id: 'scrape_insights',
    icon: Globe,
    color: 'emerald',
    title: 'Real Site Analysis',
    description: 'Not generic templates — we actually scraped your site, analyzed structure, content, and tech stack to build this plan.',
  },
  {
    id: 'industry_benchmarks',
    icon: BarChart3,
    color: 'purple',
    title: 'Industry Benchmarking Context',
    description: "Targets aren't pulled from thin air — they're based on industry medians for your business model.",
  },
  {
    id: 'sign_off',
    icon: CheckCircle2,
    color: 'green',
    title: 'Stakeholder Sign-off Section',
    description: 'A page your team and execs can sign to officially adopt the plan. Turns a doc into a commitment.',
  },
  {
    id: 'scalable',
    icon: Sparkles,
    color: 'yellow',
    title: 'Built to Scale',
    description: 'Plan structured so adding new events, KPIs, or business units later is straightforward — no rework needed.',
  },
];

export const EXISTING_WEBSITE_FEATURES: LoadingFeature[] = [
  {
    id: 'live_capture',
    icon: Eye,
    color: 'green',
    title: 'Live Event Capture',
    description: "We're watching events fire in real-time as our automated scraper interacts with your site. Every GA4 hit, Meta Pixel call, and dataLayer push is recorded.",
    highlight: 'LIVE',
  },
  {
    id: 'id_detection',
    icon: Search,
    color: 'blue',
    title: 'Auto-Detect Measurement IDs',
    description: 'Finding every GA4 property, GTM container, Meta Pixel, Google Ads tag, LinkedIn Insight, TikTok Pixel — even legacy UA codes.',
  },
  {
    id: 'gtm_parse',
    icon: GitBranch,
    color: 'orange',
    title: 'GTM Container Reverse-Engineering',
    description: 'We download your GTM container directly and parse every tag, trigger, and variable. We see what is configured, not just what fires.',
    highlight: 'DEEP SCAN',
  },
  {
    id: 'multi_page',
    icon: Map,
    color: 'purple',
    title: 'Multi-Page Deep Scan',
    description: 'Not just your homepage — we discover and scan product pages, category pages, cart, and checkout. Each page reveals different events.',
  },
  {
    id: 'auto_interaction',
    icon: Cpu,
    color: 'cyan',
    title: 'Automated User Simulation',
    description: 'Our bot clicks every button, hovers every CTA, fills search forms, and navigates your site — triggering events a real user would.',
  },
  {
    id: 'business_model',
    icon: Compass,
    color: 'yellow',
    title: 'Business Model Detection',
    description: "We figure out if you're direct e-commerce, a brand catalog redirecting to retailers, lead-gen, SaaS, or content — and tailor recommendations.",
  },
  {
    id: 'consent_handling',
    icon: ShieldCheck,
    color: 'green',
    title: 'Auto-Accept Cookie Consent',
    description: 'Handles OneTrust, Cookiebot, custom CMPs — accepts cookies so tracking actually loads. No half-baked scans.',
  },
  {
    id: 'gap_analysis',
    icon: AlertCircle,
    color: 'red',
    title: 'Tracking Gap Analysis',
    description: 'Comparing what is firing vs what SHOULD be firing for your business model. We surface the missing events as critical/high/medium.',
    highlight: 'INSIGHTS',
  },
  {
    id: 'event_equivalence',
    icon: Filter,
    color: 'purple',
    title: 'Smart Event Equivalence Detection',
    description: "We recognize that 'event_buy_now' is functionally 'add_to_cart' — so we suggest renames, not duplicates.",
  },
  {
    id: 'false_positive_filter',
    icon: ShieldCheck,
    color: 'cyan',
    title: 'False-Positive Filter',
    description: "Server-side guardrails remove impossible recommendations — like suggesting 'add_to_cart' on a brand site that redirects to Amazon.",
  },
  {
    id: 'configured_vs_firing',
    icon: LineChart,
    color: 'blue',
    title: 'Configured vs Firing Events',
    description: 'We separately list what is configured in GTM (could fire) versus what actually fires (does fire). The gap reveals broken tags.',
  },
  {
    id: 'quick_wins',
    icon: Zap,
    color: 'yellow',
    title: 'Quick Wins Identification',
    description: '30-minute fixes that meaningfully improve your tracking — surfaced separately from long-term initiatives.',
  },
  {
    id: 'rename_suggestions',
    icon: RefreshCw,
    color: 'pink',
    title: 'GA4-Compliant Rename Suggestions',
    description: 'Custom event names that break GA4 e-commerce reports get specific rename recommendations to fix native compatibility.',
  },
  {
    id: 'consent_mode',
    icon: ShieldCheck,
    color: 'emerald',
    title: 'Consent Mode v2 Detection',
    description: "We check if you're set up for Google's privacy framework — required for proper tracking in EU and increasingly elsewhere.",
  },
  {
    id: 'page_coverage',
    icon: Layers,
    color: 'orange',
    title: 'Pages Scanned Report',
    description: 'Full transparency — see exactly which pages we visited, what events fired on each, and which we could not reach.',
  },
  {
    id: 'excel_export',
    icon: FileSpreadsheet,
    color: 'green',
    title: 'Audit Excel Workbook',
    description: 'Complete audit report with sections for firing events, missing events, fix-it list, quick wins, and roadmap — ready to action.',
    highlight: 'DELIVERABLE',
  },
  {
    id: 'executive_summary',
    icon: FileText,
    color: 'purple',
    title: 'Executive Summary',
    description: 'Non-technical overview your CMO/CEO can read in 2 minutes — top issues, biggest opportunities, and recommended next steps.',
  },
  {
    id: 'roadmap',
    icon: Map,
    color: 'blue',
    title: 'Implementation Roadmap',
    description: 'Prioritized fix list — what to do this week, this month, this quarter. Each item with effort estimate and impact.',
  },
  {
    id: 'no_login_needed',
    icon: Globe,
    color: 'cyan',
    title: 'Public-Only Audit',
    description: 'We only audit what is publicly accessible — no credentials, no GA4 API access, no security concerns. Yet we still find everything.',
  },
  {
    id: 'actionable',
    icon: Sparkles,
    color: 'yellow',
    title: 'Specific, Actionable Output',
    description: "Not 'fix your tracking' — but 'rename event_buy_now to add_to_cart in GTM-MLL8548 trigger #7'. Every recommendation is concrete.",
    highlight: 'ACTIONABLE',
  },
];

// Existing-mode is called `audit` in this codebase (not `existing`). Keep the
// public type aligned with what page.tsx and LoadingScreen already pass.
export type LoadingMode = 'new' | 'audit';

export function getFeaturesForMode(mode: LoadingMode): LoadingFeature[] {
  return mode === 'audit' ? EXISTING_WEBSITE_FEATURES : NEW_WEBSITE_FEATURES;
}

export function shuffleFeatures(features: LoadingFeature[]): LoadingFeature[] {
  const shuffled = [...features];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
