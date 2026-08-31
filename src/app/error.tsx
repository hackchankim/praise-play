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

  // 프로덕션에서는 서버/DB 구현 세부사항이 새어나가지 않도록 원본 메시지를 숨긴다.
  const description = process.env.NODE_ENV === "development" ? error.message : undefined;

  return <ErrorState description={description} onRetry={reset} className="flex-1" />;
}
