// 곡 트리(sections/lines/chordEvents)를 편곡 엔진이 다루기 쉬운 "코드 구간" 목록으로 평탄화한다
// (Task 019). ChordEvent.beatOffset은 줄 시작 기준 상대값이라, section.startBeat + line.startBeat +
// chordEvent.beatOffset으로 곡 전체 기준 절대 beat을 구한 뒤 정렬하고, 각 구간의 길이는
// "다음 코드가 시작하기 전까지"로 계산한다 — 그래야 이전 코드의 노트가 다음 코드 시작 이후까지
// 겹쳐 울리지 않는다(테스트 체크리스트 항목).
import type { SectionType, SongTree } from "@/lib/song-model/types";

export interface ChordSegment {
  chord: string;
  /** 곡 시작 기준 절대 beat */
  startBeat: number;
  endBeat: number;
  sectionId: string;
  sectionType: SectionType;
}

export function extractChordSegments(song: SongTree): ChordSegment[] {
  interface FlatEvent {
    chord: string;
    beat: number;
    sectionId: string;
    sectionType: SectionType;
  }

  const flat: FlatEvent[] = [];
  const sortedSections = [...song.sections].sort((a, b) => a.orderIndex - b.orderIndex);
  let songTotalBeats = 0;

  for (const section of sortedSections) {
    songTotalBeats = Math.max(songTotalBeats, section.startBeat + section.lengthBeats);
    const sortedLines = [...section.lines].sort((a, b) => a.orderIndex - b.orderIndex);
    for (const line of sortedLines) {
      const sortedChords = [...line.chordEvents].sort((a, b) => a.beatOffset - b.beatOffset);
      for (const chordEvent of sortedChords) {
        flat.push({
          chord: chordEvent.chord,
          beat: section.startBeat + line.startBeat + chordEvent.beatOffset,
          sectionId: section.id,
          sectionType: section.type,
        });
      }
    }
  }

  flat.sort((a, b) => a.beat - b.beat);

  const segments: ChordSegment[] = [];
  for (const event of flat) {
    // 같은 beat 위치에 코드가 중복(교정 데이터 이상 등)되면 뒤엣것으로 덮어쓴다 — 0박자짜리
    // 유령 구간이 생기는 걸 막는다.
    if (segments.length > 0 && segments[segments.length - 1]!.startBeat === event.beat) {
      segments.pop();
    }
    segments.push({
      chord: event.chord,
      startBeat: event.beat,
      // 다음 이벤트가 확정되면 아래에서 덮어쓴다 — 배열의 마지막 항목만 이 초기값이 그대로
      // 최종 endBeat이 된다. event.beat이 songTotalBeats와 같거나 그보다 크면(한 줄의 마지막
      // 코드가 그 줄/섹션의 끝 beat에 정확히 걸린 경우 등) endBeat=songTotalBeats<=startBeat인
      // 0박자(또는 음수 길이) 구간이 되어 아래 filter에서 그 코드가 조용히 통째로 사라진다
      // (code review 지적, 코드 추적으로 재현 가능함을 확인). 최소 1박자는 보장해 마지막
      // 코드가 항상 소리 나게 한다.
      endBeat: Math.max(songTotalBeats, event.beat + 1),
      sectionId: event.sectionId,
      sectionType: event.sectionType,
    });
  }

  for (let i = 0; i < segments.length - 1; i += 1) {
    segments[i]!.endBeat = segments[i + 1]!.startBeat;
  }

  return segments.filter((segment) => segment.endBeat > segment.startBeat);
}
