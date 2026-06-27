// Placeholder Privacy policy page (public, additive). Exists so the footer link
// resolves and can be supplied for Google OAuth verification. Replace the body
// copy with your real policy before launch.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy policy — mplan',
  description: 'How mplan handles your data.',
};

export default function PrivacyPage() {
  return (
    <main className="h-full overflow-y-auto bg-[#0a0613] text-white">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <Link href="/home" className="inline-flex items-center gap-1.5 text-sm font-normal text-slate-400 transition-colors hover:text-white">
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <h1 className="mt-6 text-3xl font-normal tracking-tight text-white">Privacy policy</h1>
        <p className="mt-2 text-sm font-normal text-slate-500">Placeholder — replace with your real policy before launch.</p>

        <div className="mt-8 space-y-5 text-sm font-normal leading-relaxed text-slate-300">
          <p>
            This is a placeholder privacy policy for mplan. It describes, at a high level, how the
            product handles your information so the page exists for review and verification. Final,
            legally-reviewed copy will replace this text.
          </p>
          <p>
            <span className="font-medium text-white">Data we use.</span> The website URL and email you
            provide, and the analytics configuration we generate or read on your behalf.
          </p>
          <p>
            <span className="font-medium text-white">Data isolation.</span> Each customer’s data is kept
            separate. One customer never sees another customer’s data.
          </p>
          <p>
            <span className="font-medium text-white">Changes to your systems.</span> We never modify your
            code silently. Code changes are delivered as pull requests you review and merge.
          </p>
          <p>
            <span className="font-medium text-white">Contact.</span> Questions about this policy can be
            sent to your configured support address.
          </p>
        </div>
      </div>
    </main>
  );
}
