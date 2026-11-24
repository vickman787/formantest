import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { APP_MODE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Forma — Your next big idea. Ready to launch.",
  description: "Websites, videos, flyers and market insights for small businesses. 1 QUSDC per service on QIE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className={`mode-banner${APP_MODE === "demo" ? " demo" : ""}`} role="status">
          {APP_MODE === "demo"
            ? "Demo mode — no funds move. Payments are simulated and receipts are labelled demo."
            : "Live on QIE Mainnet · QUSDC · 1 QUSDC per service"}
        </div>
        <header className="wrap nav">
          <Link href="/" className="logo"><span className="mark" aria-hidden />forma</Link>
          <Link href="/#services" className="navlink">Services</Link>
          <Link href="/help" className="navlink">How it works</Link>
          <Link href="/projects" className="navlink">My projects</Link>
          <span className="spacer" />
          <Link href="/projects" className="btn light">Connect wallet ↗</Link>
        </header>
        <main>{children}</main>
        <footer className="wrap" style={{ padding: "32px 24px", borderTop: "1px solid var(--line)", marginTop: 48, fontSize: 12, color: "var(--muted)" }}>
          Forma — an AI business studio for small businesses. AI powered by OpenAI. Settlement in QUSDC on QIE Mainnet (chain 1990).
        </footer>
      </body>
    </html>
  );
}
