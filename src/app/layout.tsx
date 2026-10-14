import type { Metadata } from "next";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import Header from "@/components/Header";
import "./globals.css";

const title = "Vain Wallet · A wallet address with your name on it";
const description = "Choose how your EVM wallet address starts and ends. Ground in your browser, never uploaded.";

export const metadata: Metadata = {
  metadataBase: new URL("https://getvain.lol"),
  title,
  description,
  openGraph: { title, description, url: "/", siteName: "Vain Wallet", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
          <Header />
          <main className="flex-1">{children}</main>
          <footer className="flex flex-wrap justify-between gap-2 py-8 text-sm text-muted">
            <span>Vain Wallet</span>
            <span>Keys are made in your browser and never uploaded.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
