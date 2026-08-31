import { EXTRACTION_STAGES, type ExtractionStage } from "@/lib/repositories/extraction-progress";
import { ExtractingView } from "./extracting-view";

// upload/page.tsx의 HARD_MAX_COUNT와 동일하게 유지 — 실제 흐름에서 넘어오는 count는 이 값을
// 넘을 수 없지만, 이 페이지는 독립적으로도 접근 가능해 방어적으로 상한을 둔다.
const MAX_IMAGE_COUNT = 10;

function parseImageCount(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 4;
  return Math.min(MAX_IMAGE_COUNT, Math.floor(parsed));
}

function parseFailAtStage(raw: string | undefined): ExtractionStage | undefined {
  return (EXTRACTION_STAGES as readonly string[]).includes(raw ?? "")
    ? (raw as ExtractionStage)
    : undefined;
}

// count/fail 쿼리 파라미터는 이 페이지를 독립적으로 테스트하기 위한 것이다.
// count: 업로드 페이지에서 넘어온 이미지 장수(카드 UI용). fail: 특정 단계에서 실패 시나리오를
// 재현하고 싶을 때 사용 (예: /songs/demo/extracting?fail=merge).
export default async function SongExtractingPage({
  params,
  searchParams,
}: {
  params: Promise<{ songId: string }>;
  searchParams: Promise<{ count?: string; fail?: string }>;
}) {
  const { songId } = await params;
  const { count, fail } = await searchParams;

  return (
    <ExtractingView
      songId={songId}
      imageCount={parseImageCount(count)}
      failAtStage={parseFailAtStage(fail)}
    />
  );
}
