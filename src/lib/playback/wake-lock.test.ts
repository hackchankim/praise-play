import { afterEach, describe, expect, it, vi } from "vitest";
import { WakeLockManager, isWakeLockSupported } from "@/lib/playback/wake-lock";

function makeSentinel() {
  const listeners: Record<string, (() => void)[]> = {};
  const sentinel = {
    release: vi.fn(async () => {
      listeners["release"]?.forEach((fn) => fn());
    }),
    addEventListener: vi.fn((type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
    }),
  };
  return sentinel;
}

function stubWakeLock(request: (...args: unknown[]) => unknown) {
  Object.defineProperty(navigator, "wakeLock", {
    value: { request },
    configurable: true,
  });
}

afterEach(() => {
  // @ts-expect-error 테스트에서 심어둔 스텁 제거
  delete navigator.wakeLock;
  vi.restoreAllMocks();
});

describe("isWakeLockSupported", () => {
  it("navigator.wakeLock이 없으면 false다", () => {
    expect(isWakeLockSupported()).toBe(false);
  });

  it("navigator.wakeLock이 있으면 true다", () => {
    stubWakeLock(async () => makeSentinel());
    expect(isWakeLockSupported()).toBe(true);
  });
});

describe("WakeLockManager", () => {
  it("미지원 브라우저에서는 setActive(true)를 호출해도 unsupported를 반환한다", async () => {
    const manager = new WakeLockManager();
    const status = await manager.setActive(true);
    expect(status).toBe("unsupported");
    expect(manager.currentStatus()).toBe("unsupported");
  });

  it("지원 브라우저에서 setActive(true)는 request()를 호출하고 active를 반환한다", async () => {
    const sentinel = makeSentinel();
    const request = vi.fn(async () => sentinel);
    stubWakeLock(request);

    const manager = new WakeLockManager();
    const status = await manager.setActive(true);

    expect(request).toHaveBeenCalledWith("screen");
    expect(status).toBe("active");
    expect(manager.currentStatus()).toBe("active");
  });

  it("request()가 실패하면(권한 거부 등) error를 반환한다", async () => {
    stubWakeLock(async () => {
      throw new Error("denied");
    });

    const manager = new WakeLockManager();
    const status = await manager.setActive(true);

    expect(status).toBe("error");
    expect(manager.currentStatus()).toBe("error");
  });

  it("setActive(false)는 획득한 sentinel을 release()하고 inactive를 반환한다", async () => {
    const sentinel = makeSentinel();
    stubWakeLock(async () => sentinel);

    const manager = new WakeLockManager();
    await manager.setActive(true);
    const status = await manager.setActive(false);

    expect(sentinel.release).toHaveBeenCalledOnce();
    expect(status).toBe("inactive");
    expect(manager.currentStatus()).toBe("inactive");
  });

  it("이미 active면 reacquireIfNeeded는 다시 request()하지 않는다", async () => {
    const sentinel = makeSentinel();
    const request = vi.fn(async () => sentinel);
    stubWakeLock(request);

    const manager = new WakeLockManager();
    await manager.setActive(true);
    await manager.reacquireIfNeeded();

    expect(request).toHaveBeenCalledOnce();
  });

  it("브라우저가 sentinel을 스스로 해제한 뒤(탭 숨김 등) wantsActive였다면 reacquireIfNeeded가 다시 획득한다", async () => {
    const firstSentinel = makeSentinel();
    const secondSentinel = makeSentinel();
    const request = vi
      .fn()
      .mockResolvedValueOnce(firstSentinel)
      .mockResolvedValueOnce(secondSentinel);
    stubWakeLock(request);

    const manager = new WakeLockManager();
    await manager.setActive(true);
    // 브라우저가 hidden 전환 시 스스로 release한 상황을 흉내낸다.
    await firstSentinel.release();
    expect(manager.currentStatus()).toBe("error"); // 원하는데(wantsActive) 없어졌으니 error

    const status = await manager.reacquireIfNeeded();

    expect(request).toHaveBeenCalledTimes(2);
    expect(status).toBe("active");
    expect(manager.currentStatus()).toBe("active");
  });

  it("wantsActive가 false면 reacquireIfNeeded는 아무것도 하지 않는다", async () => {
    const request = vi.fn(async () => makeSentinel());
    stubWakeLock(request);

    const manager = new WakeLockManager();
    const status = await manager.reacquireIfNeeded();

    expect(request).not.toHaveBeenCalled();
    expect(status).toBe("inactive");
  });

  it("acquire 도중 setActive(false)로 의도가 바뀌면 방금 받은 sentinel을 즉시 반납한다", async () => {
    const sentinel = makeSentinel();
    let resolveRequest!: (value: typeof sentinel) => void;
    const request = vi.fn(
      () => new Promise<typeof sentinel>((resolve) => (resolveRequest = resolve)),
    );
    stubWakeLock(request);

    const manager = new WakeLockManager();
    const activatePromise = manager.setActive(true);
    await manager.setActive(false); // request()가 아직 pending인 상태에서 의도를 바꾼다
    resolveRequest(sentinel);
    await activatePromise;

    expect(sentinel.release).toHaveBeenCalledOnce();
    expect(manager.currentStatus()).toBe("inactive");
  });

  it("request()가 진행 중일 때 겹쳐 들어온 호출은 새 request()를 또 보내지 않고 같은 결과에 합류한다", async () => {
    // 일부 모바일 브라우저는 짧은 시간에 visibilitychange를 여러 번 연달아 발동한다 —
    // reacquireIfNeeded가 두 번 거의 동시에 불려도 실제 request()는 한 번만 나가야 한다.
    // 그렇지 않으면 두 sentinel이 모두 발급되고 나중 것에 덮어써진 sentinel은 release()로도
    // 다시 닿을 수 없이 영원히 켜진 채로 남는다(code review 지적).
    const sentinel = makeSentinel();
    let resolveRequest!: (value: typeof sentinel) => void;
    const request = vi.fn(
      () => new Promise<typeof sentinel>((resolve) => (resolveRequest = resolve)),
    );
    stubWakeLock(request);

    const manager = new WakeLockManager();
    const first = manager.setActive(true);
    const second = manager.reacquireIfNeeded();
    resolveRequest(sentinel);
    const [firstStatus, secondStatus] = await Promise.all([first, second]);

    expect(request).toHaveBeenCalledOnce();
    expect(firstStatus).toBe("active");
    expect(secondStatus).toBe("active");
    expect(manager.currentStatus()).toBe("active");
  });
});
