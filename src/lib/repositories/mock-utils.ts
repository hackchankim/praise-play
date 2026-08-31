// 목 리포지토리 3종(SongRepository/SetlistRepository/ArrangementRepository)이 공통으로 쓰는
// 인메모리 저장소 유틸. 네트워크 지연 흉내와 id 발급 로직을 한 곳에 모아 중복을 줄인다.
// Phase 3에서 구현체를 Supabase 버전으로 교체하면 이 파일은 더 이상 쓰이지 않는다.

/** 실제 비동기 API처럼 느껴지도록 짧은 지연을 흉내낸다 */
export function delay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 디버깅 시 어떤 엔티티의 id인지 알아볼 수 있도록 접두어를 붙인다 */
export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
