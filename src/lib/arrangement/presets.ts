// 장르 프리셋별 화성 보이싱 매핑 (Task 019, 이후 편곡 단순화 리팩터로 축소).
//
// 예전에는 여기서 프리셋×섹션 타입마다 악기별 연주 스타일(컴핑/워킹베이스/스트럼 등)까지
// 분기했지만, 리듬 패턴 자체를 단일화하면서(instruments.ts 참고) 그 분기는 모두 제거했다.
// 프리셋은 이제 화성 보이싱(3화음만 쓸지 7화음까지 쓸지, 음역대)만 다르게 한다.
import { VoicingDictionary } from "tonal";
import type { GenrePreset } from "@/lib/song-model/types";

export interface VoicingOptions {
  range: [string, string];
  dictionary: Record<string, string[]>;
}

/**
 * 프리셋별 화성 보이싱 어휘. 찬송가/어쿠스틱은 단순 3화음만, 나머지는 7화음까지 허용한다.
 *
 * 리듬 패턴이 프리셋과 무관하게 항상 같아진 뒤로는(instruments.ts 참고) 이 표가 프리셋 간
 * 유일한 차이점이다 — hymn_traditional과 acoustic_intimate에 같은 range를 주면 두 프리셋의
 * 생성 결과가 완전히 똑같아져 사실상 하나가 무의미해진다(code review에서 실측 확인). 그래서
 * acoustic_intimate는 hymn_traditional보다 완전4도 낮은 음역(G2~G3, 한 옥타브 폭)을 써서
 * "더 낮고 조용하게 깔리는" 보이싱으로 구분되게 한다 — 단순히 한두 음 차이가 아니라 코드마다
 * 옥타브 배치 자체가 달라지도록, 겹치지 않는 별도 옥타브 대역을 준다.
 */
export const VOICING_OPTIONS: Record<GenrePreset, VoicingOptions> = {
  praise_upbeat: { range: ["C3", "E5"], dictionary: VoicingDictionary.all },
  ccm_ballad: { range: ["C3", "C5"], dictionary: VoicingDictionary.all },
  hymn_traditional: { range: ["C3", "C4"], dictionary: VoicingDictionary.triads },
  acoustic_intimate: { range: ["G2", "G3"], dictionary: VoicingDictionary.triads },
};
