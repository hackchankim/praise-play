// GET/POST /api/setlists — 세트리스트 목록 조회·생성 (Task 020).
// 브라우저가 setlistRepository를 직접 호출하던 것(Task 013)을 이 라우트 뒤로 옮긴다. 목록
// 조회에는 서버 재검증할 값이 없어 얇은 래퍼지만, 생성은 ownerId를 클라이언트가 보낸 값이
// 아니라 이 라우트가 인증한 현재 로그인 사용자로 고정한다 — 예전 클라이언트 코드는 useUser()의
// user.id를 그대로 넘겼는데, 그건 클라이언트가 임의로 조작할 수 있는 값이라 서버가 신뢰하면
// 안 된다(persist-arrangement.ts/create_song_with_images와 같은 이유).
import { z } from "zod";
import type { CreateSetlistRequest } from "@/lib/api/contracts";
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { setlistRepository } from "@/lib/repositories/setlist-repository";

const createSchema = z.object({
  name: z.string().min(1),
}) satisfies z.ZodType<CreateSetlistRequest>;

export async function GET() {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const result = await setlistRepository.list();
  return Response.json(result);
}

export async function POST(request: Request) {
  const auth = await authenticate();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "잘못된 요청입니다.",
      400,
    );
  }

  const setlist = await setlistRepository.create(parsed.data, auth.userId);
  return Response.json({ setlist }, { status: 201 });
}
