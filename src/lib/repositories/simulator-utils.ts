// 진행 상태 시뮬레이터(extraction-progress.ts, preload-progress.ts)가 공통으로 쓰는
// 취소 가능한 지연 유틸. mock-utils.ts의 delay()는 리포지토리용 고정 지연이라 AbortSignal을
// 지원하지 않으므로 별도로 둔다.

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 취소 가능한 비동기 제너레이터를 콜백 스타일로 구동하는 공통 래퍼.
 * AbortController 생성, for-await 소비, AbortError만 조용히 삼키는 로직을 한 곳에 모은다 —
 * extraction-progress.ts와 preload-progress.ts가 각자 거의 동일한 코드를 갖고 있었다.
 * 반환된 함수를 호출하면 이후 이벤트 방출을 중단한다 (언마운트 시 정리).
 */
export function runAbortableGenerator<T>(
  createGenerator: (signal: AbortSignal) => AsyncGenerator<T, void, void>,
  onEvent: (event: T) => void,
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      for await (const event of createGenerator(controller.signal)) {
        onEvent(event);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
    }
  })();

  return () => {
    controller.abort();
  };
}
