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
