// 가사 문자 위치 ↔ 박자 위치 근사 변환 (Task 016에서 처음 필요해졌고, Task 018 교정 페이지의
// 코드 칩 드래그 동기화도 정확히 같은 문제라 공유한다).
//
// 리드시트 코드 배치가 가사 길이에 대략 비례한다는 흔한 가정이다 — 정확도 100%를 노리지
// 않는다(교정 UI가 최종 방어선). 가사가 없는 간주 줄이면(lyricsLength === 0) 코드들을 줄 전체
// 박자에 걸쳐 균등 분배한다.
export function estimateBeatOffset(
  charOffset: number,
  lyricsLength: number,
  beatsInLine: number,
  chordIndex: number,
  chordCount: number,
): number {
  if (lyricsLength > 0) {
    const ratio = Math.min(1, charOffset / lyricsLength);
    return Math.round(ratio * beatsInLine * 100) / 100;
  }
  if (chordCount <= 1) return 0;
  return Math.round((chordIndex / chordCount) * beatsInLine * 100) / 100;
}
