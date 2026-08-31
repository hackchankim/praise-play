// SongRepository — 곡 데이터 액세스 인터페이스와 목 구현체 (Task 006).
// 메서드 시그니처는 src/lib/api/contracts.ts의 Phase 3 Route Handler 계약(ListSongsResponse,
// GetSongTreeResponse, SaveCorrectionRequest/Response)과 그대로 대응한다. Phase 3(Task 013)에서는
// 이 인터페이스는 유지한 채 구현체만 Supabase 쿼리 기반으로 교체한다.

import type {
  GetSongTreeResponse,
  ListSongsResponse,
  SaveCorrectionResponse,
  SaveCorrectionRequest,
} from "@/lib/api/contracts";
import {
  MOCK_CHORD_EVENTS,
  MOCK_LINES,
  MOCK_SECTIONS,
  MOCK_SONGS,
} from "@/lib/song-model/mock-songs";
import type {
  ChordEvent,
  Line,
  LineWithChords,
  Section,
  SectionWithLines,
  Song,
  SongTree,
} from "@/lib/song-model/types";
import { createId, delay } from "@/lib/repositories/mock-utils";
import { NotFoundError, OptimisticLockError, ValidationError } from "@/lib/repositories/errors";

// ===== 인메모리 상태 (모듈 스코프) =====
// 관계형 테이블을 흉내내 곡/섹션/줄/코드를 평평한 배열 4개로 나눠 보관한다.
// Supabase 구현체도 결국 4개 테이블을 조인해 트리를 조립해야 하므로, 이 구조가 그대로 대응된다.

let songs: Song[] = [...MOCK_SONGS];
let sections: Section[] = [...MOCK_SECTIONS];
let lines: Line[] = [...MOCK_LINES];
let chordEvents: ChordEvent[] = [...MOCK_CHORD_EVENTS];

function assembleTree(song: Song): SongTree {
  const songSections = sections
    .filter((section) => section.songId === song.id)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const sectionsWithLines: SectionWithLines[] = songSections.map((section) => {
    const sectionLines = lines
      .filter((line) => line.sectionId === section.id)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const linesWithChords: LineWithChords[] = sectionLines.map((line) => ({
      ...line,
      chordEvents: chordEvents
        .filter((chord) => chord.lineId === line.id)
        .sort((a, b) => a.beatOffset - b.beatOffset),
    }));

    return { ...section, lines: linesWithChords };
  });

  return { ...song, sections: sectionsWithLines };
}

/**
 * 원본 악보 이미지의 서명 URL을 생성한다. SongImage 엔티티/R2 서명 로직은 Task 015 소관이라
 * Task 006에서는 GetSongTreeResponse.imageUrls 계약 형태만 맞춘 플레이스홀더를 반환한다.
 */
function buildPlaceholderImageUrls(songId: string): string[] {
  return [1, 2].map((page) => `https://picsum.photos/seed/${songId}-${page}/900/1200`);
}

export interface ListSongsParams {
  cursor?: string | null;
  limit?: number;
}

export interface CreateSongInput {
  title: string;
  createdBy: string;
}

export interface SongRepository {
  /** 최신순 곡 목록 조회 (GET /api/songs 계약과 대응) */
  list(params?: ListSongsParams): Promise<ListSongsResponse>;
  /** 곡 전체 트리 조회. 존재하지 않으면 null — 라우트 핸들러가 이를 404로 변환한다 */
  getTree(songId: string): Promise<GetSongTreeResponse | null>;
  /** 업로드 시작 시 draft 상태의 곡 레코드를 생성한다 */
  create(input: CreateSongInput): Promise<Song>;
  /**
   * 교정 저장(PATCH /api/songs/[songId]/correction 계약과 대응). 섹션/줄/코드를 통째로 upsert하며
   * 요청에 포함되지 않은 기존 항목은 삭제로 반영된다. updatedAt이 일치하지 않으면 낙관적 잠금 충돌.
   */
  saveCorrection(songId: string, request: SaveCorrectionRequest): Promise<SaveCorrectionResponse>;
  delete(songId: string): Promise<void>;
}

export class MockSongRepository implements SongRepository {
  async list(params: ListSongsParams = {}): Promise<ListSongsResponse> {
    await delay();
    const sorted = [...songs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = params.limit ?? sorted.length;
    // 목 구현체는 커서를 실제로 해석하지 않고 항상 첫 페이지 전체를 반환한다.
    // Supabase 구현체에서 created_at/id 기반 keyset 페이지네이션으로 대체될 자리.
    return { songs: sorted.slice(0, limit), nextCursor: null };
  }

  async getTree(songId: string): Promise<GetSongTreeResponse | null> {
    await delay();
    const song = songs.find((s) => s.id === songId);
    if (!song) {
      return null;
    }
    return { song: assembleTree(song), imageUrls: buildPlaceholderImageUrls(song.id) };
  }

  async create(input: CreateSongInput): Promise<Song> {
    await delay(200);
    const now = new Date().toISOString();
    const newSong: Song = {
      id: createId("song"),
      title: input.title,
      // 추출 전 잠정값. 실제 값은 Task016 추출 파이프라인과 Task009 교정 페이지에서 확정된다.
      key: "C",
      tempo: 100,
      timeSignature: "4/4",
      status: "draft",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    songs = [...songs, newSong];
    return newSong;
  }

  async saveCorrection(
    songId: string,
    request: SaveCorrectionRequest,
  ): Promise<SaveCorrectionResponse> {
    await delay(400);

    const existing = songs.find((s) => s.id === songId);
    if (!existing) {
      throw new NotFoundError("곡", songId);
    }
    if (existing.updatedAt !== request.updatedAt) {
      // 낙관적 잠금: 클라이언트가 들고 있던 updatedAt과 현재 값이 다르면 그 사이 다른 저장이 있었던 것
      throw new OptimisticLockError();
    }

    // 이 곡에 속했던 기존 섹션/줄 id를 미리 기록해 두어야, 교체 후 "요청에서 빠진 항목"을 삭제할 수 있다.
    const oldSectionIds = new Set(sections.filter((s) => s.songId === songId).map((s) => s.id));
    const oldLineIds = new Set(
      lines.filter((l) => oldSectionIds.has(l.sectionId)).map((l) => l.id),
    );

    // 1단계: 섹션 id 확정(기존 id 유지 / 신규는 발급) 후 clientKey → 확정 id 매핑을 만든다.
    // 병합·분할로 같은 요청 안에서 새 섹션끼리 반복 관계를 맺을 수 있어(id가 아직 없으므로)
    // clientKey로 서로를 참조하는 SaveCorrectionRequest의 계약을 그대로 반영한 처리다.
    const idByClientKey = new Map<string, string>();
    const resolvedSections = request.sections.map((section) => {
      const id = section.id ?? createId(`${songId}-section`);
      idByClientKey.set(section.clientKey, id);
      return { ...section, id };
    });

    // repeatTarget이 가리킬 수 있는 유효한 대상: 이번 요청으로 살아남는 섹션 id 전체.
    // 여기 없는 id/clientKey를 그대로 저장하면(오타, 방금 삭제된 섹션 참조 등) "요청에 없는
    // 기존 섹션은 삭제된다"는 이 메서드의 설계와 충돌해 죽은 참조가 조용히 만들어진다.
    const finalSectionIds = new Set(resolvedSections.map((section) => section.id));

    const newSections: Section[] = resolvedSections.map((section) => {
      let repeatTargetSectionId: string | null = null;
      if (section.repeatTarget) {
        // repeatTarget은 기존 섹션 id 또는 같은 요청 내 clientKey일 수 있다.
        repeatTargetSectionId = idByClientKey.get(section.repeatTarget) ?? section.repeatTarget;
        if (!finalSectionIds.has(repeatTargetSectionId)) {
          throw new ValidationError(
            `섹션 "${section.clientKey}"의 repeatTarget이 유효하지 않습니다: ${section.repeatTarget}`,
          );
        }
      }
      return {
        id: section.id,
        songId,
        type: section.type,
        orderIndex: section.orderIndex,
        startBeat: section.startBeat,
        lengthBeats: section.lengthBeats,
        repeatTargetSectionId,
      };
    });

    const newLines: Line[] = [];
    const newChordEvents: ChordEvent[] = [];

    for (const section of resolvedSections) {
      for (const line of section.lines) {
        const lineId = line.id ?? createId(`${section.id}-line`);
        newLines.push({
          id: lineId,
          sectionId: section.id,
          lyrics: line.lyrics,
          orderIndex: line.orderIndex,
          startBeat: line.startBeat,
        });
        for (const chordEvent of line.chordEvents) {
          newChordEvents.push({
            id: chordEvent.id ?? createId(`${lineId}-chord`),
            lineId,
            chord: chordEvent.chord,
            charOffset: chordEvent.charOffset,
            beatOffset: chordEvent.beatOffset,
            needsReview: chordEvent.needsReview,
          });
        }
      }
    }

    sections = [...sections.filter((s) => s.songId !== songId), ...newSections];
    lines = [...lines.filter((l) => !oldSectionIds.has(l.sectionId)), ...newLines];
    chordEvents = [...chordEvents.filter((c) => !oldLineIds.has(c.lineId)), ...newChordEvents];

    const updatedSong: Song = {
      ...existing,
      key: request.song.key,
      tempo: request.song.tempo,
      timeSignature: request.song.timeSignature,
      status: "corrected",
      updatedAt: new Date().toISOString(),
    };
    songs = songs.map((s) => (s.id === songId ? updatedSong : s));

    return { song: assembleTree(updatedSong) };
  }

  async delete(songId: string): Promise<void> {
    await delay(200);
    const sectionIds = new Set(sections.filter((s) => s.songId === songId).map((s) => s.id));
    const lineIds = new Set(lines.filter((l) => sectionIds.has(l.sectionId)).map((l) => l.id));
    chordEvents = chordEvents.filter((c) => !lineIds.has(c.lineId));
    lines = lines.filter((l) => !sectionIds.has(l.sectionId));
    sections = sections.filter((s) => s.songId !== songId);
    songs = songs.filter((s) => s.id !== songId);
  }
}

export const songRepository: SongRepository = new MockSongRepository();
