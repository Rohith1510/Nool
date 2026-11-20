import type { Metadata } from "next";
import "./globals.css";
import { Suspense } from "react";
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
    <html lang="en">
      <body>
        <Suspense
          fallback={
            <div className="loading-state main-container" role="status">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-row" />
              <p>Loading Nool workspace…</p>
            </div>
          }
        >
          {children}
        </Suspense>
      </body>
    </html>
  );
}
