// API 클라이언트 호출 실패를 사용자에게 보여줄 메시지로 바꾸는 공용 헬퍼 (Task 026).
//
// 처음엔 `error instanceof TypeError`로 "fetch() 자체가 실패했다(오프라인 등)"를 추론했는데,
// TypeError는 관계없는 순수 코드 버그(예: undefined 프로퍼티 접근)도 던지는 타입이라, 같은
// try 블록 안에 요청 조립 로직이 함께 있으면 진짜 버그를 "네트워크 연결을 확인하라"는
// 엉뚱하고 오해를 부르는 안내로 가려버릴 위험이 있다(code review 두 차례 지적 — 두 번째는
// res.json()이 성공(2xx) 응답에서도 실패할 수 있다는 구체적 재현까지 포함). 그래서 지금은
// 타입으로 추론하지 않고, 아래 fetchOrThrowNetworkError/parseJsonOrThrowNetworkError가
// "네트워크·서버 왕복 자체가 실패했다"고 확실히 아는 지점에서만 명시적으로 NetworkError를
// 만들어 던진다 — 이 코드베이스의 모든 API 클라이언트(song-correction-client.ts,
// songs-client.ts, setlists-client.ts, arrangement-client.ts, upload-image.ts,
// trigger-extraction.ts)가 raw fetch()/res.json() 대신 이 두 헬퍼를 통해서만 네트워크
// I/O를 한다.
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("네트워크 요청을 완료하지 못했습니다.", { cause });
    this.name = "NetworkError";
  }
}

/**
 * fetch() 자체가 실패하면(오프라인·DNS·CORS 등) 브라우저가 항상 TypeError를 던지고, 그
 * 메시지는 브라우저 엔진마다 다른 영어 원문이다(Chromium "Failed to fetch", Firefox
 * "NetworkError...", Safari "Load failed" 등) — 여기서 잡아 NetworkError로 통일한다.
 */
export async function fetchOrThrowNetworkError(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (cause) {
    throw new NetworkError(cause);
  }
}

/**
 * 2xx 응답이라도 연결이 중간에 끊겨 본문이 잘렸으면 res.json()이 SyntaxError를 던질 수
 * 있다 — 이것도 사용자 입장에선 "요청이 온전히 끝나지 못했다"는 같은 부류의 실패이므로
 * NetworkError로 통일한다.
 */
export async function parseJsonOrThrowNetworkError<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch (cause) {
    throw new NetworkError(cause);
  }
}

export function toUserFacingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) {
    return "네트워크에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.";
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
