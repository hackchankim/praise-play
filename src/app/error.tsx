"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/domain/error-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState description={error.message} onRetry={reset} className="flex-1" />;
}
