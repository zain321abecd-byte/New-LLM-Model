import type { Metadata } from "next";
import { lpMono, lpSans } from "@/components/landing/fonts";
import "./globals.css";

export const metadata: Metadata = {
  // Makes the generated icon and share-image URLs absolute.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3003"),
  title: "Theron",
  description: "Theron: an AI sales employee inside WhatsApp: finds leads, qualifies them and writes outreach.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lpSans.variable} ${lpMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
