import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { WalletProvider } from "@/lib/wallet";
import Chrome from "@/components/Chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hatchmade — outbound recall evidence gate",
  description:
    "Frozen evidence packets, independent validator inspection, and a gate that only an independent reviewer releases. Studionet.",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <WalletProvider>
          <Chrome>{children}</Chrome>
        </WalletProvider>
      </body>
    </html>
  );
}
