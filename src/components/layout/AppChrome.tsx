'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export function AppChrome({ children }: { children: React.ReactNode }) {
  const [isEmbedded, setIsEmbedded] = useState<boolean | null>(null);

  useEffect(() => {
    setIsEmbedded(window.self !== window.top);
  }, []);

  // The public MK website already supplies the approved website navigation,
  // logo and footer around the /score iframe. Do not render a second,
  // conflicting product shell inside that embedded journey.
  if (isEmbedded === true) return <main>{children}</main>;

  // Avoid briefly flashing the standalone header/footer inside the iframe
  // before the browser confirms whether this page is embedded.
  if (isEmbedded === null) return <main>{children}</main>;

  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
