import type { Metadata } from "next";
import { WalletProvider } from "@/lib/wallet";
import Chrome from "@/components/Chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hatchmade — outbound recall evidence gate",
  description:
    "Frozen evidence packets, independent validator inspection, and a gate that only an independent reviewer releases. Studionet.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <WalletProvider>
          <Chrome>{children}</Chrome>
        </WalletProvider>
      </body>
    </html>
  );
}
