// 박자표 문자열 파싱 — 재생 엔진(playback-state.ts)과 편곡 엔진(arrangement/instruments.ts)
// 둘 다 "한 마디가 몇 beat인지"가 필요해서 공유한다(원래 각자 따로 구현하고 있었다 —
// Task 019 code-review에서 지적받아 하나로 합쳤다. 나중에 6/8처럼 분모까지 고려해야 하는 경우가
// 생기면 여기 한 곳만 고치면 양쪽에 다 반영된다).
export function beatsPerBar(timeSignature: string): number {
  const numerator = Number.parseInt(timeSignature.split("/")[0] ?? "4", 10);
  return Number.isFinite(numerator) && numerator > 0 ? numerator : 4;
}
