// 마디 경계 정렬 지연 점프 (Task 022). smplr Sequencer의 position setter(seek)는 즉시형이라
// (node_modules/smplr README 확인), 사용자가 재생 중 임의 시점에 다른 섹션을 탭해도 그 즉시
// 점프해버리면 프레이즈 중간이 뚝 끊긴다. 그래서 "현재 섹션 안에서 다음 마디 경계까지 기다렸다가
// seek를 실행"하는 지연 래퍼를 여기서 구현한다. 오디오 스케줄링 자체(노트 재생)는 그대로
// engine.ts(PlaybackEngine)가 맡고, 이 모듈은 "언제 seek를 실행할지"만 계산·예약한다.
//
// 마디 그리드는 섹션 시작 기준 상대 그리드다(Task 011 playback-state.ts의 barIndexOf와 동일한
// 관례) — 곡 전체의 절대 beat 0을 기준으로 한 마디 그리드가 아니라, 지금 재생 중인 섹션이
// 시작하는 순간을 마디 1의 시작으로 삼는다. 섹션 길이가 실제 박자표상 마디 배수가 아닐 수도
// 있어(교정 화면에서 자유롭게 섹션 경계를 설정할 수 있다) 곡 전체 그리드로 계산하면 섹션마다
// 어긋난다.

/**
 * 현재 위치(절대 beat) 기준으로, 지금 섹션 안에서 다음 마디가 시작하는 절대 beat를 계산한다.
 * 정확히 마디 경계 위에 있으면(부동소수 오차 감안한 근접 포함) 그 자리에서 바로("지금") 실행해도
 * 되므로 currentBeat 자신을 돌려준다 — 굳이 한 마디를 통째로 더 기다릴 필요가 없다.
 */
export function nextBarBoundaryBeat(
  currentBeat: number,
  sectionStartBeat: number,
  beatsPerBar: number,
): number {
  const elapsedInSection = currentBeat - sectionStartBeat;
  const barsElapsed = elapsedInSection / beatsPerBar;
  const roundedBars = Math.round(barsElapsed);
  // 부동소수 오차(폴링으로 읽은 값이라 완전히 정수가 아닐 수 있음)를 흡수한다 — 1e-6 beat는
  // 음악적으로 무의미한 오차라 "이미 경계에 있다"로 취급한다.
  if (Math.abs(barsElapsed - roundedBars) < 1e-6) {
    return sectionStartBeat + roundedBars * beatsPerBar;
  }
  const nextBarIndex = Math.floor(barsElapsed) + 1;
  return sectionStartBeat + nextBarIndex * beatsPerBar;
}

/** targetBeat까지 남은 시간(초). targetBeat가 currentBeat보다 과거면 음수를 그대로 반환한다 — 호출부가 0으로 clamp할지는 상황에 따라 다르다. */
export function secondsUntilBeat(targetBeat: number, currentBeat: number, bpm: number): number {
  return ((targetBeat - currentBeat) * 60) / bpm;
}

/**
 * "다음 마디 경계까지 대기 후 콜백 실행"을 감싼 범용 지연 스케줄러. 오디오/beat 계산과는 무관한
 * 순수 타이머 래퍼라 section-jump.ts 밖(예: 다른 지연 전환 종류)에서도 재사용할 수 있게 클래스로
 * 분리했다. 동시에 하나만 예약 가능 — 새로 schedule()하면 이전 예약은 자동으로 취소된다(사용자가
 * 연속으로 다른 섹션을 빠르게 탭해도 마지막 탭만 유효해야 하므로).
 */
export class DelayedJumpScheduler {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  schedule(delayMs: number, onArrive: () => void): void {
    this.cancel();
    this.timeoutId = setTimeout(
      () => {
        this.timeoutId = null;
        onArrive();
      },
      Math.max(0, delayMs),
    );
  }

  cancel(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  get isPending(): boolean {
    return this.timeoutId !== null;
  }
}
