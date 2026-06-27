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
    <main className="h-full overflow-y-auto bg-ds-page text-ds-ink">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <Link href="/home" className="inline-flex items-center gap-1.5 text-sm font-normal text-ds-secondary transition-colors hover:text-ds-ink">
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <h1 className="mt-6 text-3xl font-medium tracking-tight text-ds-ink">Privacy policy</h1>
        <p className="mt-2 text-sm font-normal text-ds-muted">Placeholder — replace with your real policy before launch.</p>

        <div className="mt-8 space-y-5 text-sm font-normal leading-relaxed text-ds-secondary">
          <p>
            This is a placeholder privacy policy for mplan. It describes, at a high level, how the
            product handles your information so the page exists for review and verification. Final,
            legally-reviewed copy will replace this text.
          </p>
          <p>
            <span className="font-medium text-ds-ink">Data we use.</span> The website URL and email you
            provide, and the analytics configuration we generate or read on your behalf.
          </p>
          <p>
            <span className="font-medium text-ds-ink">Data isolation.</span> Each customer’s data is kept
            separate. One customer never sees another customer’s data.
          </p>
          <p>
            <span className="font-medium text-ds-ink">Changes to your systems.</span> We never modify your
            code silently. Code changes are delivered as pull requests you review and merge.
          </p>
          <p>
            <span className="font-medium text-ds-ink">Contact.</span> Questions about this policy can be
            sent to your configured support address.
          </p>
        </div>
      </div>
    </main>
  );
}
