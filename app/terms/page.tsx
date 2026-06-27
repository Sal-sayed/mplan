// Placeholder Terms of service page (public, additive). Exists so the footer link
// resolves and can be supplied for Google OAuth verification. Replace the body
// copy with your real terms before launch.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms — mplan',
  description: 'The terms that govern use of mplan.',
};

export default function TermsPage() {
  return (
    <main className="h-full overflow-y-auto bg-[#0a0613] text-white">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <Link href="/home" className="inline-flex items-center gap-1.5 text-sm font-normal text-slate-400 transition-colors hover:text-white">
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <h1 className="mt-6 text-3xl font-normal tracking-tight text-white">Terms of service</h1>
        <p className="mt-2 text-sm font-normal text-slate-500">Placeholder — replace with your real terms before launch.</p>

        <div className="mt-8 space-y-5 text-sm font-normal leading-relaxed text-slate-300">
          <p>
            These are placeholder terms of service for mplan. They exist so the page is available for
            review and verification. Final, legally-reviewed terms will replace this text.
          </p>
          <p>
            <span className="font-medium text-white">Using the product.</span> mplan helps you plan and set
            up website analytics. You are responsible for reviewing anything it proposes before you
            publish or merge it.
          </p>
          <p>
            <span className="font-medium text-white">No silent changes.</span> mplan does not modify your
            code or publish analytics changes without your explicit action.
          </p>
          <p>
            <span className="font-medium text-white">Availability.</span> The service is provided as-is
            while in active development; specifics will be defined in the final terms.
          </p>
        </div>
      </div>
    </main>
  );
}
