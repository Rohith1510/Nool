"use client";
import { Button } from "@/components/ui/button";
export default function ErrorScreen({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>Workspace could not load</h1>
      <p>Check your connection and Supabase configuration, then try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
