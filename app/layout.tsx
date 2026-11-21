import type { Metadata } from "next";
import "./globals.css";
import { themeScript } from "@/lib/theme";
export const metadata: Metadata = {
  title: { default: "Nool / Garment order decisions", template: "%s / Nool" },
  description:
    "Voice AI for garment teams. Understand buyer changes, compare feasible shipment plans, and approve production commitments from stored facts.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        {children}
      </body>
    </html>
  );
}
