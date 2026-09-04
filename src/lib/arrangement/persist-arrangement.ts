import "server-only";
// 편곡 생성 → 저장 오케스트레이션 (Task 019). generate.ts(핵심 IP)를 실제로 부르는 유일한
// 지점이라 여기 server-only 가드를 둔다 — 클라이언트 컴포넌트가 실수로 이 파일을 import하면
// 빌드 타임에 바로 에러가 난다. POST /api/songs/[songId]/arrangements 라우트 핸들러가 이
// 함수 하나만 부른다.
import type { GenerateArrangementRequest, GenerateArrangementResponse } from "@/lib/api/contracts";
import { generateArrangement } from "@/lib/arrangement/generate";
import { createId } from "@/lib/repositories/mock-utils";
import { songRepository } from "@/lib/repositories/song-repository";
import { arrangementRepository } from "@/lib/repositories/arrangement-repository";
import { NotFoundError, ValidationError } from "@/lib/repositories/errors";
import { supabaseRepositoryClient } from "@/lib/supabase/repository-client";

export async function persistGeneratedArrangement(
  songId: string,
  request: GenerateArrangementRequest,
): Promise<GenerateArrangementResponse> {
  const tree = await songRepository.getTree(songId);
  if (!tree) {
    throw new NotFoundError("곡", songId);
  }
  if (tree.song.status === "draft") {
    // 추출이 끝나지 않은 곡은 코드 진행이 없어 편곡을 만들 수 없다. FK 제약만으로는
    // 걸러지지 않는 비즈니스 규칙이라 여기서 명시적으로 막는다.
    throw new ValidationError(
      `아직 추출되지 않은 곡은 편곡을 생성할 수 없습니다: ${songId} (status=${tree.song.status})`,
    );
  }

  const generatedTracks = generateArrangement(tree.song, request.genrePreset);
  const arrangementId = createId("arrangement");
  const trackRows = generatedTracks.map((track) => ({
    id: createId(`${arrangementId}-${track.instrument}`),
    instrument: track.instrument,
    notes: track.notes,
  }));

  // arrangements/instrument_tracks 두 테이블 insert를 하나의 함수 호출(=하나의 트랜잭션)로
  // 묶는다 — 따로 두 번 호출하면 첫 insert 성공 후 두 번째가 실패했을 때 트랙 없는 편곡이
  // 고아로 남는다 (Task 013 code-review 지적, save_song_correction과 동일한 이유).
  const { error } = await supabaseRepositoryClient.rpc("create_arrangement_with_tracks", {
    p_arrangement_id: arrangementId,
    p_song_id: songId,
    p_genre_preset: request.genrePreset,
    p_tracks: trackRows,
  });
  if (error) throw new Error(`편곡 생성 실패: ${error.message}`);

  const created = await arrangementRepository.getById(arrangementId);
  if (!created) throw new Error(`편곡 생성 직후 재조회에 실패했습니다: ${arrangementId}`);
  return { arrangement: created };
}
