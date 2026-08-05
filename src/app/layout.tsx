import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: "Mistral Impianti",
  description: "Pratiche assistenza e rapportini intervento — Mistral Impianti",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mistral Impianti",
  },
};

export const viewport: Viewport = {
  themeColor: "#0369a1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="h-full">
      <body className={`${inter.className} h-full bg-gray-50`}>
        {children}
        <Toaster richColors position="top-right" />
        <Script
          defer
          src="https://umami.bitora.it/script.js"
          data-website-id="c125b3b3-6ffa-4cd1-bd2d-930b7692492a"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
