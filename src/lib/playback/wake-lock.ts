// 화면 꺼짐 방지 관리자 (Task 025, F014).
// 예배 중 화면이 꺼지면 인도자가 재생 상태를 확인하거나 다음 곡/섹션을 탭할 수 없게 된다 —
// 이 자체는 오디오 소리가 끊기는 문제(그건 별도로 engine.ts의 AudioContext 재개 로직이
// 처리한다)와는 다르지만, 예배 진행에는 똑같이 치명적이다.
//
// Wake Lock API의 스펙 동작: 탭이 백그라운드로 가는 순간(visibilitychange → hidden) 브라우저가
// sentinel을 스스로 해제해버린다. 그래서 이 클래스는 "계속 켜져 있어야 한다"는 의도(wantsActive)
// 와 실제 sentinel의 수명을 분리해서 관리한다 — 탭이 다시 보이면(visible) 의도가 여전히
// 유효한지 확인해 재획득한다(reacquireIfNeeded, use-live-playback.ts의 visibilitychange
// 핸들러가 호출).
export type WakeLockStatus = "unsupported" | "inactive" | "active" | "error";

export function isWakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export class WakeLockManager {
  private sentinel: WakeLockSentinel | null = null;
  private wantsActive = false;
  /**
   * 진행 중인 request() 호출(있다면). visibilitychange가 짧은 시간에 여러 번
   * 연달아 발동하는 경우(일부 모바일 브라우저에서 실제로 관찰되는 현상)를 대비한다 — 이
   * 가드가 없으면 두 acquire() 호출이 동시에 각자 request()를 부르고, 나중에 대입되는 쪽이
   * 이전 sentinel을 덮어써 그 sentinel은 release()로도 다시 닿을 수 없는 채 영원히 켜진
   * 상태로 남는다(code review 지적, 재현 시나리오 확인).
   */
  private pendingAcquire: Promise<WakeLockStatus> | null = null;

  /** active=true면 획득을 시도하고, false면 해제한다. 최종 상태를 돌려준다. */
  async setActive(active: boolean): Promise<WakeLockStatus> {
    this.wantsActive = active;
    if (!isWakeLockSupported()) return "unsupported";
    if (!active) {
      await this.release();
      return "inactive";
    }
    return this.acquire();
  }

  /**
   * 탭이 다시 보일 때(visibilitychange → visible) 호출한다. wantsActive가 아니거나 이미
   * sentinel을 들고 있으면(브라우저가 해제하지 않은 경우) 아무 일도 하지 않는다 — 재획득이
   * 필요한 경우에만 실제로 request()를 다시 부른다.
   */
  async reacquireIfNeeded(): Promise<WakeLockStatus> {
    if (!this.wantsActive || this.sentinel) return this.currentStatus();
    return this.acquire();
  }

  currentStatus(): WakeLockStatus {
    if (!isWakeLockSupported()) return "unsupported";
    if (this.sentinel) return "active";
    return this.wantsActive ? "error" : "inactive";
  }

  private acquire(): Promise<WakeLockStatus> {
    if (this.sentinel) return Promise.resolve("active");
    // 이미 request()가 진행 중이면 새 요청을 또 보내지 않고 그 결과에 합류한다.
    if (this.pendingAcquire) return this.pendingAcquire;

    const request = (async (): Promise<WakeLockStatus> => {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        // acquire() 진행 중(await 도중) setActive(false)가 먼저 끝났을 수 있다 — 그새 의도가
        // 바뀌었으면 방금 받은 sentinel을 즉시 반납한다(그렇지 않으면 "꺼야 한다"고 결정한 뒤에도
        // 화면이 계속 켜져 있게 된다).
        if (!this.wantsActive) {
          await sentinel.release().catch(() => {});
          return "inactive";
        }
        this.sentinel = sentinel;
        sentinel.addEventListener("release", () => {
          if (this.sentinel === sentinel) this.sentinel = null;
        });
        return "active";
      } catch {
        return "error";
      } finally {
        this.pendingAcquire = null;
      }
    })();
    this.pendingAcquire = request;
    return request;
  }

  private async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;
    await sentinel?.release().catch(() => {});
  }
}
