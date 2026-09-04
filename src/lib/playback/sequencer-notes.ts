// NoteEvent[] → smplr SequencerNote[] 변환 (Task 021). 순수 함수라 실제 AudioContext 없이
// 단위 테스트가 가능하다 — 같은 beat에 쌓인 화음(피아노 comping 등)이나 마디 경계에 정확히
// 걸친 노트가 변환 과정에서 누락·중복되지 않는지가 이 모듈의 테스트 대상(ROADMAP 완료 기준
// "스케줄러 경계 타이밍 유닛 테스트").
import type { SequencerNote } from "smplr";
import type { NoteEvent } from "@/lib/song-model/types";
import { beatsToTicks } from "@/lib/playback/beat-time";

/**
 * 트랙 하나(단일 악기)의 NoteEvent[]를 그대로 1:1로 SequencerNote[]로 옮긴다 — 필터링·병합을
 * 하지 않으므로 입력 개수와 출력 개수는 항상 같다.
 *
 * id는 idPrefix가 있으면 `${idPrefix}-${index}`, 없으면 배열 인덱스 그대로(smplr 기본값과
 * 동일)를 쓴다. idPrefix가 필요한 이유: smplr Sequencer는 한 인스턴스에 여러 트랙을 붙여도
 * `_activeVoices`를 트랙 구분 없이 하나의 Map으로 공유한다(node_modules/smplr/dist/index.js
 * 확인) — 인덱스만 id로 쓰면 서로 다른 트랙의 같은 인덱스 노트(피아노 note[0]과 드럼 note[0]은
 * 둘 다 beat 0에서 흔히 동시에 시작한다)가 Map 엔트리를 서로 덮어써, stop()/stopNote()가 그중
 * 하나만 멈추고 나머지는 계속 울리는 버그가 생긴다(code review 지적, smplr 소스로 재현 가능함을
 * 검증). engine.ts가 트랙마다 instrument 이름을 idPrefix로 넘겨 전역에서 고유하게 만든다.
 *
 * pitchAlias는 드럼 트랙 전용 — arrangement/instruments.ts는 특정 킷과 무관한 범용 별칭
 * ("hihat-closed", "crash")을 쓰고, 실제 로드되는 킷의 진짜 샘플 그룹 이름으로의 매핑은 이
 * 어댑터가 책임진다고 그쪽 주석에 명시돼 있다(engine.ts의 DRUM_PITCH_ALIAS 참고 — 실제 TR-808
 * 킷은 "hihat-close"/"cymbal"이라 매핑 없이는 조용히 무음 처리됐다, 라이브 검증 중 실측 확인).
 * 매핑에 없는 pitch는 그대로 통과한다.
 */
export function toSequencerNotes(
  notes: NoteEvent[],
  ppq: number,
  pitchAlias?: Record<string, string>,
  idPrefix?: string,
): SequencerNote[] {
  return notes.map((note, index) => ({
    id: idPrefix ? `${idPrefix}-${index}` : index,
    note: pitchAlias?.[note.pitch] ?? note.pitch,
    at: beatsToTicks(note.beat, ppq),
    duration: beatsToTicks(note.duration, ppq),
    velocity: note.velocity,
  }));
}
