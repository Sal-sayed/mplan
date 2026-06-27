'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import HeroScreen from '@/components/HeroScreen';
import LoadingScreen from '@/components/LoadingScreen';
import SuccessScreen from '@/components/SuccessScreen';
import ConfirmBusinessModel from '@/components/ConfirmBusinessModel';
import { useStreamingClaude } from '@/lib/stream-client';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Stage = 'idle' | 'scraping' | 'scoring' | 'generating' | 'confirm' | 'delivering' | 'complete' | 'error';
type Mode = 'new' | 'audit';
type BusinessModel = 'ecommerce' | 'saas' | 'lead_gen' | 'media_content' | 'marketplace';

// Derive the new generate-plan request (url + pages + forms) from the scraper's
// ScrapeResult. The new pipeline classifies and grounds the plan on these.
function buildNewPlanRequest(scrapeData: any, businessModel?: BusinessModel) {
  const homepage = scrapeData?.homepage || {};
  const subPages = scrapeData?.subPages || {};

  const pageTitle = (p: any) => p?.meta?.title || p?.headings?.h1?.[0] || undefined;
  const pages = [
    { path: '/', title: pageTitle(homepage) },
    ...Object.entries(subPages).map(([path, p]: [string, any]) => ({ path, title: pageTitle(p) })),
  ];

  const collectForms = (p: any) =>
    (p?.forms || []).map((f: any) => ({
      action: f.action || undefined,
      fields: (f.fields || [])
        .map((field: any) => field?.name || field?.label || field?.placeholder || field?.type)
        .filter(Boolean),
      purpose: f.submitText || f.name || f.id || undefined,
    }));
  const forms = [
    ...collectForms(homepage),
    ...Object.values(subPages).flatMap((p: any) => collectForms(p)),
  ];

  return {
    url: scrapeData?.url || '',
    pages,
    forms,
    detectedStack: homepage?.tech ? Object.keys(homepage.tech) : undefined,
    ...(businessModel ? { businessModel } : {}),
  };
}

export default function Home() {
  const [stage, setStage] = useState<Stage>('idle');
  const [mode, setMode] = useState<Mode>('new');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [progress, setProgress] = useState(0);
  const [data, setData] = useState<any>(null);
  const [emailDelivered, setEmailDelivered] = useState(true);
  const [error, setError] = useState('');
  // Stashed context for the low-confidence confirmation step (409 flow).
  const [confirmCtx, setConfirmCtx] = useState<{ genBody: any; downstream: any; classification: any } | null>(null);
  const stream = useStreamingClaude();

  const handleSubmitNew = async ({ url: inputUrl, email: inputEmail }: { url: string; email: string }) => {
    setMode('new');
    await runPipeline(inputUrl, inputEmail, null, 'new');
  };

  const handleSubmitExisting = async ({ url: inputUrl, email: inputEmail, planFile }: { url: string; email: string; planFile: File | null }) => {
    setMode('audit');
    await runPipeline(inputUrl, inputEmail, planFile, 'audit');
  };

  const runPipeline = async (inputUrl: string, inputEmail: string, planFile: File | null, pipelineMode: Mode) => {
    setUrl(inputUrl);
    setEmail(inputEmail);
    setError('');
    setEmailDelivered(true);

    try {
      // Stage 1: Scrape
      setStage('scraping'); setProgress(15);
      const scrapeRes = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inputUrl,
          mode: pipelineMode === 'audit' ? 'existing' : 'new',
          // siteType is optional — server defaults to 'ecommerce'. Wire a
          // selector here once the UI exposes one.
        }),
      });
      if (scrapeRes.status === 429) {
        const data = await scrapeRes.json().catch(() => ({}));
        throw new Error(data.error || "You're submitting too fast. Please wait before trying again.");
      }
      const scrapeJson = await scrapeRes.json();
      if (!scrapeJson.success) throw new Error(scrapeJson.error || 'Failed to analyze website');

      // Stage 2: Score
      setStage('scoring'); setProgress(30);
      let scoreData = null;
      try {
        const scoreRes = await fetch('/api/score', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audit: scrapeJson.data.homepage.analyticsAudit,
            siteFeatures: {
              buttonCount: scrapeJson.data.homepage.buttons?.length || 0,
              formCount: scrapeJson.data.homepage.forms?.length || 0,
              hasEcommerce: scrapeJson.data.homepage.ecommerce?.hasCart,
              hasSignup: scrapeJson.data.homepage.engagement?.hasSignup,
            },
          }),
        });
        const scoreJson = await scoreRes.json();
        if (scoreJson.success) scoreData = scoreJson.score;
      } catch { /* score is optional */ }

      // Stage 2.5: Parse uploaded Excel if Existing path with file
      let existingPlanData = null;
      let existingPlanRawBuffer: string | null = null;
      if (planFile) {
        setProgress(45);
        const formData = new FormData();
        formData.append('file', planFile);
        const parseRes = await fetch('/api/parse-existing-plan', {
          method: 'POST',
          body: formData,
        });
        const parseJson = await parseRes.json();
        if (parseJson.success) {
          existingPlanData = parseJson.parsedPlan;
          existingPlanRawBuffer = parseJson.rawBufferBase64 || null;
        }
      }

      // Stage 3: Generate plan or audit (STREAMING)
      setStage('generating'); setProgress(65);
      stream.reset();

      if (pipelineMode === 'audit') {
        // ── AUDIT PATH — unchanged from the original implementation ──
        const audit = await stream.startStream<any>('/api/generate-audit', {
          websiteData: scrapeJson.data,
          score: scoreData,
          existingPlan: existingPlanData,
        });
        if (!audit) throw new Error(stream.error || 'Failed to generate audit');

        setStage('delivering'); setProgress(85);
        try {
          const deliverRes = await fetch('/api/send-plan', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: inputEmail,
              mode: 'audit',
              plan: null,
              audit,
              score: scoreData,
              scrapeData: scrapeJson.data,
              existingPlanRawBuffer,
            }),
          });
          const deliverJson = await deliverRes.json();
          setEmailDelivered(deliverJson.success);
        } catch {
          setEmailDelivered(false);
        }

        setData({ plan: null, audit, score: scoreData, scrapeData: scrapeJson.data, mode: 'audit', existingPlanData });
        setProgress(100);
        setTimeout(() => setStage('complete'), 500);
      } else {
        // ── NEW PATH ──
        const downstream = { email: inputEmail, scoreData, scrapeData: scrapeJson.data, existingPlanData, existingPlanRawBuffer };
        const genBody = buildNewPlanRequest(scrapeJson.data);
        await generateNewPlan(genBody, downstream);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : err?.message || 'An unexpected error occurred');
      setStage('error');
    }
  };

  // Remembers the last generation request so "Regenerate with AI" (shown on a
  // template-fallback plan) can re-run it forcing the AI path.
  const lastGenRef = useRef<{ genBody: any; downstream: any } | null>(null);

  // 'new' path generation — streams the plan, or pauses for confirmation when
  // the server returns 409 (low-confidence classification).
  const generateNewPlan = async (genBody: any, downstream: any) => {
    lastGenRef.current = { genBody, downstream };
    setStage('generating'); setProgress(65); stream.reset();
    const out = await stream.startStream<any>('/api/generate-plan', genBody);
    if (!out) {
      if (stream.outcome.current.needsConfirmation) {
        setConfirmCtx({ genBody, downstream, classification: stream.outcome.current.classification });
        setStage('confirm');
        return;
      }
      throw new Error(stream.error || 'Failed to generate plan');
    }
    // The new route returns { success, classification, plan }.
    const plan = out?.plan ?? out;
    await deliverNewPlan(plan, downstream);
  };

  // User picked a business model on the confirmation screen — retry with it as
  // an override, which bypasses the low-confidence gate server-side.
  const confirmBusinessModel = async (model: BusinessModel) => {
    if (!confirmCtx) return;
    const { genBody, downstream } = confirmCtx;
    setConfirmCtx(null);
    try {
      await generateNewPlan({ ...genBody, businessModel: model }, downstream);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : err?.message || 'An unexpected error occurred');
      setStage('error');
    }
  };

  // No-AI path: build the plan deterministically from the template for the chosen
  // business model — instant, zero Gemini calls.
  const confirmBusinessModelTemplate = async (model: BusinessModel) => {
    if (!confirmCtx) return;
    const { genBody, downstream } = confirmCtx;
    setConfirmCtx(null);
    try {
      await generateNewPlan({ ...genBody, businessModel: model, templateOnly: true }, downstream);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : err?.message || 'An unexpected error occurred');
      setStage('error');
    }
  };

  // Re-run the last generation forcing the AI path (shown on a template-fallback
  // plan via the "Regenerate with AI" banner CTA).
  const regenerateWithAi = async () => {
    const last = lastGenRef.current;
    if (!last) { reset(); return; }
    try {
      const { templateOnly: _omit, ...aiBody } = last.genBody;
      void _omit;
      await generateNewPlan(aiBody, last.downstream);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : err?.message || 'An unexpected error occurred');
      setStage('error');
    }
  };

  // Stage 4 (NEW path only): email delivery + final state.
  const deliverNewPlan = async (plan: any, downstream: any) => {
    setStage('delivering'); setProgress(85);
    try {
      const deliverRes = await fetch('/api/send-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: downstream.email,
          mode: 'new',
          plan,
          audit: null,
          score: downstream.scoreData,
          scrapeData: downstream.scrapeData,
          existingPlanRawBuffer: downstream.existingPlanRawBuffer,
        }),
      });
      const deliverJson = await deliverRes.json();
      setEmailDelivered(deliverJson.success);
    } catch {
      setEmailDelivered(false);
    }

    setData({ plan, audit: null, score: downstream.scoreData, scrapeData: downstream.scrapeData, mode: 'new', existingPlanData: downstream.existingPlanData });
    setProgress(100);
    setTimeout(() => setStage('complete'), 500);
  };

  const reset = () => {
    setStage('idle'); setData(null); setUrl(''); setEmail(''); setProgress(0); setError(''); setEmailDelivered(true); setConfirmCtx(null);
  };

  // Browser tab title
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const original = 'Web Analytics Measurement Plan Agent';
    if (stage === 'scraping' || stage === 'scoring' || stage === 'generating' || stage === 'delivering') {
      document.title = `(${progress}%) ${mode === 'audit' ? 'Auditing' : 'Building plan'}...`;
    } else if (stage === 'complete') {
      document.title = `\u2713 Sent \u2014 ${original}`;
      setTimeout(() => { document.title = original; }, 5000);
    } else {
      document.title = original;
    }
  }, [stage, progress, mode]);

  // Notification permission
  useEffect(() => {
    if (stage === 'scraping' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') Notification.requestPermission();
    }
  }, [stage]);

  // Desktop notification when done
  useEffect(() => {
    if (stage === 'complete' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted' && document.hidden) {
        const label = mode === 'audit' ? 'tracking audit' : 'measurement plan';
        const notif = new Notification(`Your ${label} is ready`, {
          body: `Sent to ${email}. Check your inbox.`,
          tag: 'plan-ready',
        });
        notif.onclick = () => { window.focus(); notif.close(); };
      }
    }
  }, [stage, email, mode]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-ds-page">

      <AnimatePresence mode="wait">
        {stage === 'idle' && (
          <motion.div key="hero" className="absolute inset-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <HeroScreen onSubmitNew={handleSubmitNew} onSubmitExisting={handleSubmitExisting} />
          </motion.div>
        )}

        {(stage === 'scraping' || stage === 'scoring' || stage === 'generating' || stage === 'delivering') && (
          <motion.div key="loading" className="absolute inset-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoadingScreen
              stage={stage}
              progress={progress}
              url={url}
              email={email}
              mode={mode}
              onCancel={reset}
              streamCurrentEmoji={stage === 'generating' ? stream.currentEmoji : undefined}
              streamCurrentMessage={stage === 'generating' ? stream.currentMessage : undefined}
              streamMilestones={stage === 'generating' ? stream.milestones : undefined}
            />
          </motion.div>
        )}

        {stage === 'confirm' && confirmCtx && (
          <motion.div key="confirm" className="absolute inset-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ConfirmBusinessModel
              classification={confirmCtx.classification}
              onConfirm={confirmBusinessModel}
              onConfirmTemplate={confirmBusinessModelTemplate}
              onCancel={reset}
            />
          </motion.div>
        )}

        {stage === 'complete' && data && (
          <motion.div key="success" className="absolute inset-0"
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
            <SuccessScreen
              mode={data.mode}
              plan={data.plan}
              audit={data.audit}
              score={data.score}
              scrapeData={data.scrapeData}
              email={email}
              emailDelivered={emailDelivered}
              onReset={reset}
              onRegenerate={regenerateWithAi}
            />
          </motion.div>
        )}

        {stage === 'error' && (
          <motion.div key="error" className="absolute inset-0 flex items-center justify-center p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="bg-ds-card border border-ds-line rounded-2xl p-8 max-w-md text-center shadow-sm">
              <p className="text-ds-danger mb-4">{error}</p>
              <button onClick={reset} className="px-6 py-2.5 bg-ds-accent rounded-xl text-ds-accent-ink font-medium hover:bg-ds-accent-hover transition">
                Try again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
