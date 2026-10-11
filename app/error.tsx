"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="p-12">
      <p className="eyebrow">WORKSPACE ERROR</p>
      <h1 className="text-2xl font-semibold mt-2">
        The workspace could not load.
      </h1>
      <p className="muted mt-3 mb-6">
        Check database connectivity and server configuration, then try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
