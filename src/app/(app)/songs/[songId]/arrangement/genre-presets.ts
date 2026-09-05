// 장르 프리셋 카드에 쓰이는 정적 설명 메타데이터.
//
// 편곡 단순화 리팩터 이후로는 모든 프리셋이 같은 리듬 패턴(코드 패드 + 심플한 비트, Task 019
// presets.ts/instruments.ts 참고)을 쓰고, 화성 보이싱(3화음만 쓸지 7화음까지 쓸지, 음역대)만
// 다르다. 그래서 아래 카피도 "악기별 연주 스타일"이 아니라 보이싱 차이 위주로 적는다.

import type { GenrePreset, Instrument } from "@/lib/song-model/types";

export interface GenrePresetMeta {
  preset: GenrePreset;
  label: string;
  description: string;
  /** 악기별 한 줄 요약 — 프리셋 카드의 "악기 구성 미리보기"에 쓰인다 */
  instrumentSummary: Record<Instrument, string>;
  /** 이 프리셋의 화성 보이싱 특징 한 줄 */
  voicingNote: string;
}

// 리듬(기타/베이스/드럼)은 모든 프리셋에서 완전히 동일하다 — 프리셋마다 다른 건 피아노 보이싱
// 설명뿐이라, 그 한 줄만 갈아 끼우는 함수로 두고 나머지 세 줄은 한 곳에서만 관리한다(리듬
// 설명 문구가 바뀔 때 프리셋마다 따로 고쳐야 하는 걸 방지).
function instrumentSummary(pianoNote: string): Record<Instrument, string> {
  return {
    piano: pianoNote,
    guitar: "코드 패드, 피아노보다 한 옥타브 낮게",
    bass: "마디 시작 근음",
    drums: "심플한 쿼터노트 비트",
  };
}

export const GENRE_PRESET_META: Record<GenrePreset, GenrePresetMeta> = {
  praise_upbeat: {
    preset: "praise_upbeat",
    label: "경쾌한 찬양",
    description: "밝고 텐션 높은 업템포 찬양 반주",
    instrumentSummary: instrumentSummary("코드 패드 (7화음까지 포함)"),
    voicingNote: "넓은 음역(C3~E5)에 7화음까지 써서 풍성한 화성",
  },
  ccm_ballad: {
    preset: "ccm_ballad",
    label: "CCM 발라드",
    description: "서정적인 화성의 발라드 반주",
    instrumentSummary: instrumentSummary("코드 패드 (7화음까지 포함)"),
    voicingNote: "중간 음역(C3~C5)에 7화음까지 써서 서정적인 화성",
  },
  hymn_traditional: {
    preset: "hymn_traditional",
    label: "전통 찬송",
    description: "단순 3화음 중심의 전통 찬송가 반주",
    instrumentSummary: instrumentSummary("코드 패드 (3화음)"),
    voicingNote: "좁은 음역(C3~C4)에 3화음만 써서 담백한 화성",
  },
  acoustic_intimate: {
    preset: "acoustic_intimate",
    label: "어쿠스틱",
    description: "최소 편성으로 가사에 집중하게 하는 담백한 반주",
    instrumentSummary: instrumentSummary("코드 패드 (3화음)"),
    voicingNote:
      "전통 찬송보다 한 옥타브 낮은 음역(G2~G3)에 3화음만 써서 더 낮고 조용하게 깔리는 화성",
  },
};

export const GENRE_PRESET_LIST: GenrePresetMeta[] = [
  GENRE_PRESET_META.praise_upbeat,
  GENRE_PRESET_META.ccm_ballad,
  GENRE_PRESET_META.hymn_traditional,
  GENRE_PRESET_META.acoustic_intimate,
];

export { INSTRUMENT_LABEL } from "@/lib/song-model/labels";
