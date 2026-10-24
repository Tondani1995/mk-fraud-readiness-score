import localFont from "next/font/local";
import { ClientErrorCapture } from "@/components/monitoring/ClientErrorCapture";
import "./globals.css";
import "./clarity.css";
const manrope = localFont({
  src: [
    {
      path: "../../public/fonts/manrope-regular.ttf",
      weight: "400 500",
      style: "normal",
    },
    {
      path: "../../public/fonts/manrope-bold.ttf",
      weight: "600 800",
      style: "normal",
    },
  ],
  variable: "--font-poppins",
  display: "swap",
});
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-ZA" className={manrope.variable}>
      <body className={`${manrope.className} antialiased`}>
        {children}
        <ClientErrorCapture />
      </body>
    </html>
  );
}
