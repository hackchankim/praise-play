// 실시간 재생 화면의 순수 상태 타입과 파생 함수 (Task 011 → Task 022).
// Task 011은 더미 마디 시계(가짜 타이머로 elapsedBeats를 흘려보내는)로 상태 전이를 흉내냈지만,
// Task 022부터는 실제 smplr 오디오가 진짜 시계다 — 그래서 상태는 "곡 안에서의 절대 beat
// 위치(absoluteBeat)"만 명시적으로 들고, 지금 몇 번째 섹션·몇 번째 줄인지는 매번 그 값에서
// 파생시킨다(sectionIndexAtBeat/currentLineIndex). 예전처럼 sectionIndex/elapsedBeats를 상태에
// 직접 넣고 tick()마다 갱신하지 않는 이유: 오디오가 실제로 어디 있는지와 "우리가 계산한 섹션
// 인덱스"가 어긋날 여지를 원천 차단하기 위해서다 — 유일한 진실 공급원은 오디오 엔진이 보고하는
// absoluteBeat뿐이다. 실제 지연 점프 스케줄링(다음 마디 경계 계산, 타이머)은
// src/lib/playback/section-jump.ts + use-live-playback.ts가 담당한다.

import type { Section, SectionWithLines, SongTree } from "@/lib/song-model/types";
import { SECTION_LABEL } from "@/components/domain/section-badge";

export interface QueueEntry {
  song: SongTree;
  arrangementId: string;
}

export interface PendingTransition {
  songIndex: number;
  sectionIndex: number;
  /** 점프 목표 절대 beat(목표 곡 기준) — 섹션 시작 또는 특정 줄의 시작. */
  targetBeat: number;
}

export interface PlaybackState {
  songIndex: number;
  /** 현재 곡 안에서의 절대 beat 위치 — 오디오 엔진이 보고하는 실제 값을 그대로 담는다. */
  absoluteBeat: number;
  isPlaying: boolean;
  loopSection: boolean;
  pending: PendingTransition | null;
  /** 세트리스트 마지막 곡의 마지막 섹션이 자연히 끝났는지. */
  ended: boolean;
}

export function createInitialPlaybackState(): PlaybackState {
  return {
    songIndex: 0,
    absoluteBeat: 0,
    isPlaying: false,
    loopSection: false,
    pending: null,
    ended: false,
  };
}

/**
 * beat 기준으로 정렬된 항목 배열에서 "startBeat이 x 이하인 것 중 가장 큰 startBeat을 가진
 * 항목의 인덱스"를 찾는다 — 섹션 배열에서 지금 섹션을 찾는 것과 줄 배열에서 지금 줄을 찾는
 * 것이 완전히 같은 탐색이라(sectionIndexAtBeat/currentLineIndex 둘 다 이 로직을 그대로
 * 복붙하고 있었다, code review 지적) 하나로 합쳤다. 동률 처리·부동소수 규칙을 나중에 바꿔야
 * 하면 여기 한 곳만 고치면 된다.
 */
function findLastAtOrBefore<T>(
  items: T[],
  startBeatOf: (item: T) => number,
  beat: number,
  defaultIndex: number,
): number {
  let bestIndex = defaultIndex;
  let bestStartBeat = -Infinity;
  items.forEach((item, i) => {
    const startBeat = startBeatOf(item);
    if (startBeat <= beat && startBeat > bestStartBeat) {
      bestStartBeat = startBeat;
      bestIndex = i;
    }
  });
  return bestIndex;
}

/**
 * absoluteBeat가 속한 섹션의 인덱스를 찾는다. 섹션 시작 전이면 첫 섹션(0)으로, 배열이 비어
 * 있으면 0을 돌려준다(호출부가 sections.length === 0을 미리 걸러내는 것을 전제하지 않는
 * 방어적 기본값).
 */
export function sectionIndexAtBeat(sections: Section[], absoluteBeat: number): number {
  return findLastAtOrBefore(sections, (section) => section.startBeat, absoluteBeat, 0);
}

/**
 * 현재 재생 중인(또는 마지막으로 재생했던) 줄의 인덱스. 첫 줄에 닿기 전이면 -1.
 * Line.startBeat은 섹션 시작 기준 상대값이라(types.ts 주석 참고) elapsedBeats도 같은 좌표계여야
 * 한다 — 호출부가 absoluteBeat - section.startBeat로 변환해서 넘긴다.
 */
export function currentLineIndex(section: SectionWithLines, elapsedBeats: number): number {
  return findLastAtOrBefore(section.lines, (line) => line.startBeat, elapsedBeats, -1);
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

/** 지금 곡 전체(모든 섹션 합산) 길이 대비 현재 위치를 beat 단위로 반환한다 — 진행 바 표시용. */
export function songProgressBeats(
  state: PlaybackState,
  queue: QueueEntry[],
): { elapsedBeats: number; totalBeats: number } {
  const sections = queue[state.songIndex].song.sections;
  const totalBeats = sections.reduce((sum, sec) => sum + sec.lengthBeats, 0);
  return { elapsedBeats: state.absoluteBeat, totalBeats };
}

function songDurationSeconds(song: QueueEntry["song"]): number {
  if (song.tempo <= 0) return 0;
  const totalBeats = song.sections.reduce((sum, sec) => sum + sec.lengthBeats, 0);
  return (totalBeats / song.tempo) * 60;
}

/**
 * 세트리스트 전체(모든 곡 합산) 길이 대비 현재 위치를 초 단위로 반환한다. 곡마다 템포가 달라
 * beat를 그대로 이어붙일 수 없으므로, 곡별로 beat를 각자의 템포로 초 환산한 뒤 이어붙인다.
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
