// 실시간 재생 화면(Task 011)의 순수 상태 타입과 더미 마디 시계 로직.
// 실제 오디오/스케줄러는 없고, "재생 중이면 beat가 실시간으로 흐른다"는 것만 흉내낸다.
// 다음 섹션/점프/다음 곡은 즉시 실행되지 않고 "다음 마디 경계"까지 대기(pending)한 뒤 실행된다 —
// Task 022가 실제 오디오로 구현할 지연 점프 메커니즘을 타이머 기준으로 미리 보여주는 자리다.

import type { Section, SectionWithLines, SongTree } from "@/lib/song-model/types";
import { SECTION_LABEL } from "@/components/domain/section-badge";
import { beatsPerBar } from "@/lib/song-model/time-signature";

export interface QueueEntry {
  song: SongTree;
  arrangementId: string;
}

export interface PendingTransition {
  songIndex: number;
  sectionIndex: number;
}

export interface PlaybackState {
  songIndex: number;
  sectionIndex: number;
  /** 현재 섹션 시작 기준 경과 beat */
  elapsedBeats: number;
  isPlaying: boolean;
  loopSection: boolean;
  pending: PendingTransition | null;
  /**
   * 세트리스트 마지막 곡의 마지막 섹션이 자연히 끝났는지. tick()의 반환값(순수 함수라 리턴하는
   * ended 불리언)을 setInterval 콜백 안에서 외부 변수로 빼돌려 setPhase("ended")를 호출하는
   * 예전 방식은, 그 외부 변수가 setState 업데이터 실행과 정확히 같은 타이밍에 읽힌다는 보장이
   * 약해 간헐적으로 전환이 누락됐다(재현 확인됨: isPlaying=false인데 "예배가 끝났습니다" 화면으로
   * 못 넘어가고 재생 화면에 그대로 멈춰 있는 버그). state 자체에 플래그를 둬서, 소비하는 쪽이
   * useEffect로 안정적으로 파생시키게 한다.
   */
  ended: boolean;
}

export function createInitialPlaybackState(): PlaybackState {
  return {
    songIndex: 0,
    sectionIndex: 0,
    elapsedBeats: 0,
    isPlaying: false,
    loopSection: false,
    pending: null,
    ended: false,
  };
}

export function barIndexOf(elapsedBeats: number, timeSignature: string): number {
  return Math.floor(elapsedBeats / beatsPerBar(timeSignature));
}

export function currentSection(state: PlaybackState, queue: QueueEntry[]): SectionWithLines {
  return queue[state.songIndex].song.sections[state.sectionIndex];
}

/**
 * 현재 섹션 안에서 지금 부르고 있을 가사 줄의 인덱스. 첫 줄에 닿기 전이면 -1.
 * 교정 페이지에서 줄의 startBeat은 배열 순서와 무관하게 자유 입력 가능하므로(정렬 보장 없음),
 * 배열 순서로 훑다 멈추는 대신 elapsedBeats 이하인 것 중 startBeat이 가장 큰 줄을 찾는다.
 */
export function currentLineIndex(section: SectionWithLines, elapsedBeats: number): number {
  let bestIndex = -1;
  let bestStartBeat = -Infinity;
  section.lines.forEach((line, i) => {
    if (line.startBeat <= elapsedBeats && line.startBeat > bestStartBeat) {
      bestStartBeat = line.startBeat;
      bestIndex = i;
    }
  });
  return bestIndex;
}

/**
 * 지금 곡 전체(모든 섹션 합산) 길이 대비 현재 위치를 beat 단위로 반환한다. 재생 화면의 곡 진행
 * 바 표시용 — 섹션 반복(loopSection)으로 elapsedBeats가 실제 섹션 길이를 넘나드는 경우는 없으므로
 * (tick()이 항상 [0, lengthBeats) 범위로 되돌린다) 별도 보정 없이 그대로 더하면 된다.
 */
export function songProgressBeats(
  state: PlaybackState,
  queue: QueueEntry[],
): { elapsedBeats: number; totalBeats: number } {
  const sections = queue[state.songIndex].song.sections;
  const totalBeats = sections.reduce((sum, sec) => sum + sec.lengthBeats, 0);
  const beatsBeforeSection = sections
    .slice(0, state.sectionIndex)
    .reduce((sum, sec) => sum + sec.lengthBeats, 0);
  return { elapsedBeats: beatsBeforeSection + state.elapsedBeats, totalBeats };
}

function songDurationSeconds(song: QueueEntry["song"]): number {
  if (song.tempo <= 0) return 0;
  const totalBeats = song.sections.reduce((sum, sec) => sum + sec.lengthBeats, 0);
  return (totalBeats / song.tempo) * 60;
}

/**
 * 세트리스트 전체(모든 곡 합산) 길이 대비 현재 위치를 초 단위로 반환한다. 곡마다 템포가 달라
 * beat를 그대로 이어붙일 수 없으므로(같은 1beat라도 곡마다 실제 걸리는 시간이 다르다), 곡별로
 * beat를 각자의 템포로 초 환산한 뒤 이어붙인다.
 */
export function setlistProgressSeconds(
  state: PlaybackState,
  queue: QueueEntry[],
): { elapsedSeconds: number; totalSeconds: number } {
  const totalSeconds = queue.reduce((sum, entry) => sum + songDurationSeconds(entry.song), 0);
  const secondsBeforeCurrentSong = queue
    .slice(0, state.songIndex)
    .reduce((sum, entry) => sum + songDurationSeconds(entry.song), 0);
  const song = queue[state.songIndex].song;
  const { elapsedBeats } = songProgressBeats(state, queue);
  const elapsedInSongSeconds = song.tempo > 0 ? (elapsedBeats / song.tempo) * 60 : 0;
  return { elapsedSeconds: secondsBeforeCurrentSong + elapsedInSongSeconds, totalSeconds };
}

export function computeSectionDisplayLabels(sections: Section[]): string[] {
  const seenByType = new Map<Section["type"], number>();
  return sections.map((section) => {
    if (section.type !== "verse") return SECTION_LABEL[section.type];
    const count = (seenByType.get(section.type) ?? 0) + 1;
    seenByType.set(section.type, count);
    return `${count}절`;
  });
}

/** 다음 섹션(없으면 다음 곡의 첫 섹션) 목표 위치. 둘 다 없으면 null(세트리스트 끝) */
export function nextSectionTarget(
  state: PlaybackState,
  queue: QueueEntry[],
): { songIndex: number; sectionIndex: number } | null {
  const sections = queue[state.songIndex].song.sections;
  if (state.sectionIndex < sections.length - 1) {
    return { songIndex: state.songIndex, sectionIndex: state.sectionIndex + 1 };
  }
  if (state.songIndex < queue.length - 1) {
    return { songIndex: state.songIndex + 1, sectionIndex: 0 };
  }
  return null;
}

/**
 * 재생 중 매 tick마다 호출한다. deltaBeats만큼 시간을 흘려보내고, 그 결과로 상태가 어떻게
 * 바뀌어야 하는지 계산해 새 상태를 반환한다(순수 함수 — 실제 setState는 호출부에서 한다).
 * "세트리스트가 끝났다"는 사실도 반환값이 아니라 state.ended 필드로 담아 보낸다 — 예전엔 호출부의
 * 외부 변수로 따로 빼돌렸는데, setState 업데이터 실행 타이밍과 그 변수를 읽는 타이밍이 항상
 * 정확히 맞는다는 보장이 약해 간헐적으로 "예배가 끝났습니다" 화면 전환이 누락되는 버그가 있었다.
 * state 안에 있으면 소비하는 쪽이 useEffect로 안정적으로 파생시킬 수 있다.
 *
 * 우선순위: (1) 예약된 전환이 있고 마디 경계를 넘었다면 그 목표로 즉시 커밋한다.
 * (2) 예약이 없는데 섹션이 자연히 끝났다면 구간 반복 여부에 따라 반복하거나 다음으로 진행한다.
 */
export function tick(state: PlaybackState, queue: QueueEntry[], deltaBeats: number): PlaybackState {
  if (!state.isPlaying) return state;

  const section = currentSection(state, queue);
  const song = queue[state.songIndex].song;
  const nextElapsed = state.elapsedBeats + deltaBeats;

  if (state.pending) {
    const prevBar = barIndexOf(state.elapsedBeats, song.timeSignature);
    const nextBar = barIndexOf(nextElapsed, song.timeSignature);
    // 마디 경계를 넘었거나(정상 케이스), 섹션 길이가 마디 배수가 아니어서 경계를 만나기 전에
    // 섹션이 먼저 끝나버렸다면(방어적 케이스) — 어느 쪽이든 예약된 목표로 전환한다. 그렇지 않으면
    // elapsedBeats가 lengthBeats를 넘어선 채로 pending이 계속 남아있게 되어, 사용자가 그 사이
    // 전환을 취소했을 때 되돌아갈 "현재 섹션 안"이 사라져 곧장 다음으로 튕겨나가게 된다.
    if (nextBar > prevBar || nextElapsed >= section.lengthBeats) {
      return {
        ...state,
        songIndex: state.pending.songIndex,
        sectionIndex: state.pending.sectionIndex,
        elapsedBeats: 0,
        pending: null,
      };
    }
    return { ...state, elapsedBeats: nextElapsed };
  }

  if (nextElapsed >= section.lengthBeats) {
    if (state.loopSection) {
      return { ...state, elapsedBeats: nextElapsed - section.lengthBeats };
    }
    const target = nextSectionTarget(state, queue);
    if (!target) {
      return { ...state, elapsedBeats: nextElapsed, isPlaying: false, ended: true };
    }
    return {
      ...state,
      songIndex: target.songIndex,
      sectionIndex: target.sectionIndex,
      elapsedBeats: 0,
    };
  }

  return { ...state, elapsedBeats: nextElapsed };
}
