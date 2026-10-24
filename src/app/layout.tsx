import localFont from "next/font/local";
import { ClientErrorCapture } from "@/components/monitoring/ClientErrorCapture";
import "./globals.css";
import "./clarity.css";

const inter = localFont({
  src: "../../public/fonts/inter-latin-variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-ZA" className={inter.variable}>
      <body className="antialiased">
        {children}
        <ClientErrorCapture />
      </body>
    </html>
  );
}
