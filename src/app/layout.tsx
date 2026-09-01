import { Poppins } from 'next/font/google';
import { ClientErrorCapture } from '@/components/monitoring/ClientErrorCapture';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins'
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={poppins.variable}>
      <body className={`${poppins.className} antialiased`}>
        {children}
        <ClientErrorCapture />
      </body>
    </html>
  );
}
