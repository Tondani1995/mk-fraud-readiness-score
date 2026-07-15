'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

function isEmbeddedExperience() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('embed') === '1' || window.self !== window.top;
}

export function Footer() {
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    setEmbedded(isEmbeddedExperience());
  }, []);

  if (embedded) return null;

  return (
    <footer className="border-t border-mk-line bg-mk-charcoal text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 text-sm md:grid-cols-[1.2fr_0.8fr_0.8fr] md:px-8">
        <div>
          <Image src="/logo.png" alt="MK Fraud Insights" width={236} height={66} className="h-12 w-auto brightness-0 invert" />
          <p className="mt-4 max-w-md leading-6 text-white/75">
            Specialist fraud risk and strategy support for organisations that need clearer visibility of fraud exposure, control gaps and practical next steps.
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">Services</p>
          <div className="mt-3 space-y-2 text-white/70">
            <p>Fraud Readiness Score</p>
            <p>Fraud Health Checks</p>
            <p>Threat Intelligence</p>
          </div>
        </div>
        <div>
          <p className="font-semibold text-white">Contact</p>
          <div className="mt-3 space-y-2 text-white/70">
            <p>hello@mkfraud.co.za</p>
            <p>South Africa</p>
            <a href="/fraud-readiness-score#start-score" className="inline-block text-white hover:text-mk-line">Assess Your Organisation</a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-4 text-center text-xs text-white/55">
        © {new Date().getFullYear()} MK Fraud Insights. All rights reserved.
      </div>
    </footer>
  );
}
