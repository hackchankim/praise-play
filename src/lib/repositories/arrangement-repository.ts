// ArrangementRepository — 편곡 데이터 액세스 인터페이스와 목 구현체 (Task 006).
// generate()의 요청/응답 형태는 src/lib/api/contracts.ts의 GenerateArrangementRequest/Response
// (Task019 POST /api/songs/[songId]/arrangements 계약)와 그대로 대응한다.

import type { GenerateArrangementRequest, GenerateArrangementResponse } from "@/lib/api/contracts";
import {
  buildArrangementBlueprint,
  MOCK_ARRANGEMENTS,
  MOCK_INSTRUMENT_TRACKS,
} from "@/lib/song-model/arrangement-blueprint";
import type { Arrangement, ArrangementWithTracks, InstrumentTrack } from "@/lib/song-model/types";
import { createId, delay } from "@/lib/repositories/mock-utils";
import { songRepository } from "@/lib/repositories/song-repository";
import { NotFoundError, ValidationError } from "@/lib/repositories/errors";

let arrangements: Arrangement[] = [...MOCK_ARRANGEMENTS];
let instrumentTracks: InstrumentTrack[] = [...MOCK_INSTRUMENT_TRACKS];

function assemble(arrangement: Arrangement): ArrangementWithTracks {
  return {
    ...arrangement,
    instrumentTracks: instrumentTracks.filter((track) => track.arrangementId === arrangement.id),
  };
}

export interface ArrangementRepository {
  /** 장르 프리셋 기반 편곡 생성 (POST /api/songs/[songId]/arrangements 계약과 대응) */
  generate(
    songId: string,
    request: GenerateArrangementRequest,
  ): Promise<GenerateArrangementResponse>;
  getById(arrangementId: string): Promise<ArrangementWithTracks | null>;
  listBySong(songId: string): Promise<ArrangementWithTracks[]>;
}

export class MockArrangementRepository implements ArrangementRepository {
  async generate(
    songId: string,
    request: GenerateArrangementRequest,
  ): Promise<GenerateArrangementResponse> {
    const tree = await songRepository.getTree(songId);
    if (!tree) {
      throw new NotFoundError("곡", songId);
    }
    if (tree.song.status === "draft") {
      // 추출이 끝나지 않은 곡은 코드 진행이 없어 편곡을 만들 수 없다. Supabase 구현체로
      // 교체해도 FK 제약만으로는 걸러지지 않는 비즈니스 규칙이라 여기서 명시적으로 막는다.
      throw new ValidationError(
        `아직 추출되지 않은 곡은 편곡을 생성할 수 없습니다: ${songId} (status=${tree.song.status})`,
      );
    }

    // 실제 편곡 엔진(Task019, Tonal.js 기반 다악기 생성)의 연산 시간을 흉내낸 지연
    await delay(900);

    const blueprint = buildArrangementBlueprint(songId, request.genrePreset);
    const arrangementId = createId("arrangement");
    const arrangement: Arrangement = {
      id: arrangementId,
      songId,
      genrePreset: request.genrePreset,
      createdAt: new Date().toISOString(),
    };
    const tracks: InstrumentTrack[] = blueprint.tracks.map((track) => ({
      id: createId(`${arrangementId}-${track.instrument}`),
      arrangementId,
      instrument: track.instrument,
      notes: track.notes,
    }));

    arrangements = [...arrangements, arrangement];
    instrumentTracks = [...instrumentTracks, ...tracks];

    return { arrangement: assemble(arrangement) };
  }

  async getById(arrangementId: string): Promise<ArrangementWithTracks | null> {
    await delay();
    const found = arrangements.find((a) => a.id === arrangementId);
    return found ? assemble(found) : null;
  }

  async listBySong(songId: string): Promise<ArrangementWithTracks[]> {
    await delay();
    return arrangements.filter((a) => a.songId === songId).map(assemble);
  }
}

export const arrangementRepository: ArrangementRepository = new MockArrangementRepository();
