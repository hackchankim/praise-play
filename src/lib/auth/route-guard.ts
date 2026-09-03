// Route Handler 인증 가드 (Task 015에서 이 프로젝트 첫 Route Handler와 함께 도입).
// auth.protect()는 미인증 시 기본 404를 반환하는데, API 소비자 입장에서는 401 + 계약대로의
// ApiErrorBody가 더 명확하다. 앞으로 추가되는 모든 Route Handler가 이 패턴을 재사용한다.
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { ApiErrorBody } from "@/lib/api/contracts";

export class UnauthorizedError extends Error {
  constructor() {
    super("로그인이 필요합니다.");
    this.name = "UnauthorizedError";
  }
}

/** 로그인된 사용자의 Clerk user_id를 반환한다. 없으면 UnauthorizedError를 던진다. */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

export function apiError(
  code: string,
  message: string,
  status: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}
