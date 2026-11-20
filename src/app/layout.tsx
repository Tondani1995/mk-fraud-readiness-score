import localFont from "next/font/local";
import { ClientErrorCapture } from "@/components/monitoring/ClientErrorCapture";
import "./globals.css";
import "./clarity.css";

const poppins = localFont({
  src: [
    { path: "../../public/fonts/poppins-regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/poppins-medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/poppins-semibold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-poppins", display: "swap",
});
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-ZA" className={poppins.variable}>
      <body className="antialiased">
        {children}
        <ClientErrorCapture />
      </body>
    </html>
  );
}
