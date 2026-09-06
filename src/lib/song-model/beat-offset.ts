// 가사 문자 위치 ↔ 박자 위치 근사 변환 (Task 016에서 처음 필요해졌고, Task 018 교정 페이지의
// 코드 칩 드래그 동기화도 정확히 같은 문제라 공유한다).
//
// 리드시트 코드 배치가 가사 길이에 대략 비례한다는 흔한 가정이다 — 정확도 100%를 노리지
// 않는다(교정 UI가 최종 방어선). 가사가 없는 간주 줄이면(lyricsLength === 0) 코드들을 줄 전체
// 박자에 걸쳐 균등 분배한다.
//
// 실제 음악에서 코드는 정박(자연수) 아니면 기껏해야 반박(.5, 당김음 등) 단위에만 걸린다 —
// 0.57이나 2.29박 같은 위치는 존재하지 않는다. 그런데 이 추정 자체가 "가사 글자 수 비례"라는
// 근사라서, 예전엔 소수 둘째 자리까지(1/100박 단위로) 그대로 반올림해 저장했다 — 실사용
// 피드백으로 그 결과가 지저분한 소수(예: 0.57, 2.29)로 나와, 교정 화면 카드가 정박 칸에
// 배정될 때(Math.round) 반올림 경계 근처에서 엉뚱한 칸으로 튀는 등 "품질이 나쁘다"는 인상을
// 줬다. 그래서 여기서 한 번 더 반박(0.5) 그리드로 양자화한다 — 정확도가 더 좋아지는 건
// 아니지만(원래도 근사치였다), 적어도 결과가 항상 실제로 있을 법한 음악적 위치에 떨어진다.
export function quantizeToHalfBeat(value: number): number {
  return Math.round(value * 2) / 2;
}

export function estimateBeatOffset(
  charOffset: number,
  lyricsLength: number,
  beatsInLine: number,
  chordIndex: number,
  chordCount: number,
): number {
  if (lyricsLength > 0) {
    const ratio = Math.min(1, charOffset / lyricsLength);
    return quantizeToHalfBeat(ratio * beatsInLine);
  }
  if (chordCount <= 1) return 0;
  return quantizeToHalfBeat((chordIndex / chordCount) * beatsInLine);
}
