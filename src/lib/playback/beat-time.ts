// beat(우리 도메인의 유일한 타이밍 단위) ↔ smplr Sequencer의 tick/오디오 시각 환산 순수 함수
// 모음 (Task 021). 실제 AudioContext/Sequencer 없이 단위 테스트가 가능하도록 engine.ts의
// 오케스트레이션 코드에서 이 계산만 분리했다 — generate.ts가 server-only 오케스트레이션과
// 순수 로직을 나눈 것과 같은 이유.
//
// 1 beat = 1/4음표 = ppq(pulses per quarter note) tick. Sequencer 생성 시 넘기는
// timeSignature의 분자(=beatsPerBar)와 우리 도메인의 beatsPerBar(time-signature.ts)가
// 정확히 같은 값이어야 "bar:beat:tick" 파싱이 어긋나지 않는다.

/** beat → tick. ppq가 소수를 낳을 수 있는 셋잇단음표 등도 반올림으로 정수 tick에 맞춘다. */
export function beatsToTicks(beat: number, ppq: number): number {
  return Math.round(beat * ppq);
}

/** tick → beat. */
export function ticksToBeats(ticks: number, ppq: number): number {
  return ticks / ppq;
}

/**
 * smplr Sequencer.position 게터가 주는 "bar:beat:tick"(모두 1-indexed) 문자열을 우리 도메인의
 * 절대 beat(곡 시작 기준, 0-indexed)로 변환한다. tick 구간(":48" 부분)은 생략될 수 있다.
 */
export function positionStringToBeats(position: string, ppq: number, beatsPerBar: number): number {
  const [barStr, beatStr, tickStr] = position.split(":");
  const bar = Number(barStr) - 1;
  const beat = Number(beatStr) - 1;
  const tick = tickStr === undefined ? 0 : Number(tickStr);
  return bar * beatsPerBar + beat + tick / ppq;
}

/** 1 tick이 몇 초인지. bpm이 바뀌면 이 값도 바뀐다(템포 변경은 engine.ts가 실시간 반영). */
export function secondsPerTick(bpm: number, ppq: number): number {
  return 60 / bpm / ppq;
}

/**
 * 재생 위치 기준점(reference: 특정 tick이 실제로 울린/울릴 AudioContext 시각)을 알고 있을 때,
 * 다른 임의의 tick이 울릴 오디오 시각을 계산한다. Task 022의 마디 경계 지연 점프("다음 마디
 * 경계까지 기다렸다가 seek")가 "그 경계 tick이 정확히 몇 초 뒤인가"를 구하려고 쓸 유틸이라
 * 여기서 미리 만들어 둔다(ROADMAP Task 021 완료 기준의 tickToAudioTime()).
 */
export function tickToAudioTime(
  reference: { audioTime: number; tick: number },
  targetTick: number,
  bpm: number,
  ppq: number,
): number {
  return reference.audioTime + (targetTick - reference.tick) * secondsPerTick(bpm, ppq);
}
