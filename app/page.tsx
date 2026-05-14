'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedBackground from '@/components/AnimatedBackground';
import HeroScreen from '@/components/HeroScreen';
import LoadingScreen from '@/components/LoadingScreen';
import SuccessScreen from '@/components/SuccessScreen';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Stage = 'idle' | 'scraping' | 'scoring' | 'generating' | 'delivering' | 'complete' | 'error';
type Mode = 'new' | 'audit';

export default function Home() {
  const [stage, setStage] = useState<Stage>('idle');
  const [mode, setMode] = useState<Mode>('new');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [progress, setProgress] = useState(0);
  const [data, setData] = useState<any>(null);
  const [emailDelivered, setEmailDelivered] = useState(true);
  const [error, setError] = useState('');

  const handleSubmitNew = async ({ url: inputUrl, email: inputEmail }: { url: string; email: string }) => {
    setMode('new');
    await runPipeline(inputUrl, inputEmail, null);
  };

  const handleSubmitExisting = async ({ url: inputUrl, email: inputEmail, planFile }: { url: string; email: string; planFile: File | null }) => {
    setMode('audit');
    await runPipeline(inputUrl, inputEmail, planFile);
  };

  const runPipeline = async (inputUrl: string, inputEmail: string, planFile: File | null) => {
    setUrl(inputUrl);
    setEmail(inputEmail);
    setError('');
    setEmailDelivered(true);

    const isAudit = planFile !== undefined && mode === 'audit' || planFile !== null;
    const currentMode: Mode = planFile !== undefined ? 'audit' : 'new';

    try {
      // Stage 1: Scrape
      setStage('scraping'); setProgress(15);
      const scrapeRes = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl }),
      });
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
      if (planFile) {
        setProgress(45);
        const formData = new FormData();
        formData.append('file', planFile);
        const parseRes = await fetch('/api/parse-existing-plan', {
          method: 'POST',
          body: formData,
        });
        const parseJson = await parseRes.json();
        existingPlanData = parseJson.success ? parseJson.parsedPlan : null;
      }

      // Stage 3: Generate plan or audit
      setStage('generating'); setProgress(65);
      const useAudit = mode === 'audit';
      const planEndpoint = useAudit ? '/api/generate-audit' : '/api/generate-plan';
      const planBody = useAudit
        ? { websiteData: scrapeJson.data, score: scoreData, existingPlan: existingPlanData }
        : { websiteData: scrapeJson.data, score: scoreData };

      const planRes = await fetch(planEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planBody),
      });
      const planJson = await planRes.json();
      if (!planJson.success) throw new Error(planJson.error || `Failed to generate ${useAudit ? 'audit' : 'plan'}`);

      const plan = useAudit ? null : planJson.plan;
      const audit = useAudit ? planJson.audit : null;

      // Stage 4: Send email
      setStage('delivering'); setProgress(85);
      try {
        const deliverRes = await fetch('/api/send-plan', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inputEmail, plan, audit, score: scoreData, scrapeData: scrapeJson.data, mode }),
        });
        const deliverJson = await deliverRes.json();
        setEmailDelivered(deliverJson.success);
      } catch {
        setEmailDelivered(false);
      }

      setData({ plan, audit, score: scoreData, scrapeData: scrapeJson.data, mode, existingPlanData });
      setProgress(100);
      setTimeout(() => setStage('complete'), 500);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : err?.message || 'An unexpected error occurred');
      setStage('error');
    }
  };

  const reset = () => {
    setStage('idle'); setData(null); setUrl(''); setEmail(''); setProgress(0); setError(''); setEmailDelivered(true);
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
    <main className="fixed inset-0 overflow-hidden">
      <AnimatedBackground />

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
            <LoadingScreen stage={stage} progress={progress} url={url} email={email} mode={mode} />
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
            />
          </motion.div>
        )}

        {stage === 'error' && (
          <motion.div key="error" className="absolute inset-0 flex items-center justify-center p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="bg-white/[0.05] backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-8 max-w-md text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button onClick={reset} className="px-6 py-2.5 bg-white/[0.1] rounded-xl text-white hover:bg-white/[0.15] transition">
                Try again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
