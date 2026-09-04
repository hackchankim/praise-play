import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DelayedJumpScheduler,
  nextBarBoundaryBeat,
  secondsUntilBeat,
} from "@/lib/playback/section-jump";

describe("nextBarBoundaryBeat", () => {
  it("섹션 시작 직후(첫 마디 중간)면 첫 마디가 끝나는 지점을 반환한다", () => {
    // 4/4, 섹션이 beat 100에서 시작, 지금 102(마디 1의 3번째 beat) → 다음 경계는 104(마디 2 시작)
    expect(nextBarBoundaryBeat(102, 100, 4)).toBe(104);
  });

  it("정확히 마디 경계 위에 있으면 지금 위치를 그대로 반환한다(한 마디 더 기다리지 않음)", () => {
    expect(nextBarBoundaryBeat(104, 100, 4)).toBe(104);
    expect(nextBarBoundaryBeat(100, 100, 4)).toBe(100); // 섹션 시작 자체도 경계
  });

  it("부동소수 오차(폴링으로 읽은 값)로 경계에서 살짝 벗어난 값도 경계로 취급한다", () => {
    expect(nextBarBoundaryBeat(104.0000001, 100, 4)).toBe(104);
    expect(nextBarBoundaryBeat(103.9999999, 100, 4)).toBe(104);
  });

  it("여러 마디를 지난 위치에서도 정확히 다음 경계를 찾는다", () => {
    // 3/4, 섹션이 beat 0에서 시작, 지금 beat 10(3마디+1beat 지난 지점) → 다음 경계는 12
    expect(nextBarBoundaryBeat(10, 0, 3)).toBe(12);
  });

  it("섹션 길이가 박자표상 마디 배수가 아니어도 섹션 시작 기준 상대 그리드로 정확히 계산한다", () => {
    // 섹션이 beat 50에서 시작(곡 전체 그리드와 어긋난 임의의 시작점), 4/4, 지금 53
    expect(nextBarBoundaryBeat(53, 50, 4)).toBe(54);
  });
});

describe("secondsUntilBeat", () => {
  it("120bpm에서 4beat 앞선 목표까지는 정확히 2초다", () => {
    expect(secondsUntilBeat(104, 100, 120)).toBeCloseTo(2, 6);
  });

  it("목표가 현재 위치보다 과거면 음수를 그대로 반환한다(clamp하지 않음)", () => {
    expect(secondsUntilBeat(100, 104, 120)).toBeCloseTo(-2, 6);
  });

  it("목표와 현재 위치가 같으면 0이다", () => {
    expect(secondsUntilBeat(100, 100, 120)).toBe(0);
  });
});

describe("DelayedJumpScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("지정한 지연 시간 이후에 정확히 한 번 콜백을 실행한다", () => {
    const scheduler = new DelayedJumpScheduler();
    const onArrive = vi.fn();
    scheduler.schedule(500, onArrive);

    vi.advanceTimersByTime(499);
    expect(onArrive).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onArrive).toHaveBeenCalledTimes(1);
  });

  it("새 예약이 들어오면 이전 예약은 취소되고(콜백 실행 안 됨) 새 예약만 실행된다", () => {
    const scheduler = new DelayedJumpScheduler();
    const first = vi.fn();
    const second = vi.fn();

    scheduler.schedule(500, first);
    vi.advanceTimersByTime(200);
    scheduler.schedule(300, second); // 사용자가 다른 섹션을 다시 탭한 상황을 흉내낸다

    vi.advanceTimersByTime(300);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cancel()로 취소하면 콜백이 실행되지 않는다", () => {
    const scheduler = new DelayedJumpScheduler();
    const onArrive = vi.fn();
    scheduler.schedule(500, onArrive);
    scheduler.cancel();

    vi.advanceTimersByTime(1000);
    expect(onArrive).not.toHaveBeenCalled();
  });

  it("isPending이 예약 중에는 true, 실행/취소 후에는 false를 정확히 반영한다", () => {
    const scheduler = new DelayedJumpScheduler();
    expect(scheduler.isPending).toBe(false);

    scheduler.schedule(500, () => {});
    expect(scheduler.isPending).toBe(true);

    vi.advanceTimersByTime(500);
    expect(scheduler.isPending).toBe(false);

    scheduler.schedule(500, () => {});
    scheduler.cancel();
    expect(scheduler.isPending).toBe(false);
  });

  it("음수/0 지연 시간은 즉시(다음 tick) 실행한다 — 이미 경계 위에 있는 경우", () => {
    const scheduler = new DelayedJumpScheduler();
    const onArrive = vi.fn();
    scheduler.schedule(-5, onArrive);

    vi.advanceTimersByTime(0);
    expect(onArrive).toHaveBeenCalledTimes(1);
  });
});
