// 목 리포지토리 공통 에러 타입 (Task 006).
// not-found(404가 되어야 함)와 낙관적 잠금 충돌(409가 되어야 함)을 평범한 Error로 던지면
// Route Handler(Task 013 이후)가 이를 구분하려면 에러 메시지 문자열 매칭에 의존해야 한다.
// instanceof로 구분 가능하게 해 이후 라우트 핸들러가 상태 코드를 결정하기 쉽게 한다.

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity}을(를) 찾을 수 없습니다: ${id}`);
    this.name = "NotFoundError";
  }
}

export class OptimisticLockError extends Error {
  constructor(message = "다른 곳에서 먼저 저장되어 최신 데이터를 다시 불러와야 합니다.") {
    super(message);
    this.name = "OptimisticLockError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * 쓰기(RPC/트랜잭션)는 성공적으로 커밋됐는데, 그 직후 결과를 되읽는 확인 조회만 실패했을 때
 * 던진다(예: RLS 토큰 갱신 타이밍, 일시적 네트워크 오류). 일반 Error로 던지면 호출부가 "쓰기
 * 자체가 실패했다"와 구분하지 못해, 이미 커밋된 자원(예: 방금 만든 song_images가 참조하는 R2
 * 객체)을 실패 시 정리 로직으로 삭제해버리는 사고로 이어진다(code review 지적, 코드 추적으로
 * 재현 가능함을 확인 — song-repository.ts의 createWithImages). id를 실어서 호출부가 "쓰기는
 * 성공했으니 정리하지 말고 이 id로 계속 진행하라"고 판단할 수 있게 한다.
 */
export class WriteCommittedButUnconfirmedError extends Error {
  constructor(
    public readonly id: string,
    message: string,
  ) {
    super(message);
    this.name = "WriteCommittedButUnconfirmedError";
  }
}
