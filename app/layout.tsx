import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Installtec OS - CRM & Operations",
  description:
    "CRM & Operations Management System for Installtec Electromechanical LLC - projects, AMC, repairs, work orders, admin-driven user model.",
  // /icon.png is served from the public/ directory. We previously also had
  // app/icon.png — Next's auto-icon convention collided with the static asset
  // on the same /icon.png URL, returning 500. We now keep only the static
  // file and wire <link rel="icon"> explicitly through metadata.
  icons: { icon: "/icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
