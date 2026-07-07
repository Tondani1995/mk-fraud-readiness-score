import type { Metadata } from 'next';
import './globals.css';
import { siteConfig } from '@/lib/config/site';

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
