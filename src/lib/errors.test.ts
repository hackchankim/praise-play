import { describe, expect, it, vi } from "vitest";
import {
  NetworkError,
  fetchOrThrowNetworkError,
  parseJsonOrThrowNetworkError,
  toUserFacingErrorMessage,
} from "@/lib/errors";

describe("toUserFacingErrorMessage", () => {
  it("NetworkError는 로컬라이즈된 네트워크 메시지로 바꾼다", () => {
    const error = new NetworkError(new TypeError("Failed to fetch"));
    expect(toUserFacingErrorMessage(error, "기본 메시지")).toBe(
      "네트워크에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.",
    );
  });

  it("일반 Error(우리 API 클라이언트가 던진 의미 있는 메시지)는 그대로 쓴다", () => {
    const error = new Error("저장에 실패했습니다 (status 500).");
    expect(toUserFacingErrorMessage(error, "기본 메시지")).toBe(
      "저장에 실패했습니다 (status 500).",
    );
  });

  it("NetworkError가 아닌 TypeError(순수 코드 버그 등)는 오분류하지 않고 그 메시지를 그대로 쓴다", () => {
    // errors.ts 헤더 주석 참고 — TypeError 자체로는 네트워크 실패를 추론하지 않는다. 실제
    // 네트워크 실패는 fetchOrThrowNetworkError/parseJsonOrThrowNetworkError를 통해서만
    // NetworkError로 변환된다.
    const bug = new TypeError("Cannot read properties of undefined (reading 'foo')");
    expect(toUserFacingErrorMessage(bug, "기본 메시지")).toBe(
      "Cannot read properties of undefined (reading 'foo')",
    );
  });

  it("Error가 아닌 값(문자열을 throw한 경우 등)은 fallback을 쓴다", () => {
    expect(toUserFacingErrorMessage("문자열 에러", "기본 메시지")).toBe("기본 메시지");
    expect(toUserFacingErrorMessage(null, "기본 메시지")).toBe("기본 메시지");
    expect(toUserFacingErrorMessage(undefined, "기본 메시지")).toBe("기본 메시지");
  });
});

describe("fetchOrThrowNetworkError", () => {
  it("fetch()가 성공하면 그 Response를 그대로 돌려준다", async () => {
    const response = new Response("ok");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    await expect(fetchOrThrowNetworkError("/api/x")).resolves.toBe(response);
    vi.unstubAllGlobals();
  });

  it("fetch()가 던지면(오프라인 등) NetworkError로 감싸 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(fetchOrThrowNetworkError("/api/x")).rejects.toBeInstanceOf(NetworkError);
    vi.unstubAllGlobals();
  });
});

describe("parseJsonOrThrowNetworkError", () => {
  it("본문이 온전하면 파싱된 값을 돌려준다", async () => {
    const response = new Response(JSON.stringify({ a: 1 }));
    await expect(parseJsonOrThrowNetworkError<{ a: number }>(response)).resolves.toEqual({ a: 1 });
  });

  it("본문이 잘려 JSON 파싱이 실패하면(연결 중단 등) NetworkError로 감싸 던진다", async () => {
    const response = new Response("{ 잘린 json");
    await expect(parseJsonOrThrowNetworkError(response)).rejects.toBeInstanceOf(NetworkError);
  });
});
