// POST /api/uploads/delete — 고아 객체 정리용 (Task 015).
// 이미지를 R2에 업로드했지만 최종적으로 songs 레코드와 연결되지 못한 경우(사용자가 업로드
// 도중 이미지를 빼거나, 곡 생성 단계에서 실패한 경우) 클라이언트가 이 엔드포인트를 호출해
// 방금 자신이 올린 객체를 지운다. objectKey에 자기 user_id 접두어가 있는지 확인해, 다른
// 사용자가 짐작한 objectKey를 지우는 걸 막는다 — song_images 테이블에 아직 등록되지 않은
// 상태라 RLS로는 이 시점의 소유권을 확인할 수 없다(참조할 songs 레코드 자체가 없다).
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import type { DeleteUploadRequest } from "@/lib/api/contracts";
import { apiError, authenticate } from "@/lib/auth/route-guard";
import { createR2Client } from "@/lib/r2/client";
import { env } from "@/lib/env";
import { supabaseServiceClient } from "@/lib/supabase/service-client";

const requestSchema = z.object({
  objectKey: z.string().min(1),
}) satisfies z.ZodType<DeleteUploadRequest>;

export async function POST(request: Request) {
  const auth = await authenticate();
  if (auth.response) return auth.response;
  const { userId } = auth;

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return apiError("INVALID_REQUEST", "잘못된 요청입니다.", 400);

  const { objectKey } = parsed.data;
  if (!objectKey.startsWith(`uploads/${userId}/`)) {
    return apiError("FORBIDDEN", "본인이 업로드한 객체만 삭제할 수 있습니다.", 403);
  }

  // objectKey는 presign 시 한 번 발급되면 곡에 연결된 뒤로도 절대 바뀌지 않는다(경로 접두어가
  // uploads/{userId}/...로 고정, song_images.object_key도 같은 값을 그대로 저장) — 그래서 위
  // 경로 접두어 검사만으로는 "아직 어떤 곡에도 연결 안 된 고아 객체"와 "이미 자신의 곡에 붙어
  // 있는 이미지"를 구분하지 못한다. 이 엔드포인트는 원래 고아 객체 정리용으로만 설계됐는데
  // (파일 상단 주석 참고) 이미 연결된 이미지의 objectKey를 그대로 다시 보내면 소유권 검사는
  // 통과하고 R2 객체가 지워지면서도 song_images 행은 그대로 남아, 그 곡이 영구히 깨진 이미지를
  // 가리키게 된다(code review 지적, 코드 추적으로 재현 가능함을 확인). service client로 RLS와
  // 무관하게 이미 연결돼 있는지 확인해 막는다.
  const { data: linkedImage } = await supabaseServiceClient
    .from("song_images")
    .select("id")
    .eq("object_key", objectKey)
    .maybeSingle();
  if (linkedImage) {
    return apiError("FORBIDDEN", "이미 곡에 연결된 이미지는 이 방식으로 삭제할 수 없습니다.", 403);
  }

  const client = createR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: objectKey }));
  return new Response(null, { status: 204 });
}
