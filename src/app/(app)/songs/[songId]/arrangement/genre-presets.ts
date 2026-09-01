// 장르 프리셋 카드에 쓰이는 정적 설명 메타데이터.
// 목 편곡 생성기(arrangement-blueprint.ts)는 아직 프리셋별로 노트를 다르게 만들지 않는다
// (실제 프리셋 반영 로직은 Task 019 소관). 그래서 여기 텍스트는 "생성된 결과를 분석해 요약한 것"이
// 아니라, 프리셋을 고르는 단계에서 보여줄 설명용 카피다.

import type { GenrePreset, Instrument } from "@/lib/song-model/types";

export interface GenrePresetMeta {
  preset: GenrePreset;
  label: string;
  description: string;
  /** 악기별 한 줄 요약 — 프리셋 카드의 "악기 구성 미리보기"에 쓰인다 */
  instrumentSummary: Record<Instrument, string>;
  /** 섹션별 밀도 요약 한 줄 */
  sectionDensity: string;
}

export const GENRE_PRESET_META: Record<GenrePreset, GenrePresetMeta> = {
  praise_upbeat: {
    preset: "praise_upbeat",
    label: "경쾌한 찬양",
    description: "밝고 텐션 높은 업템포 찬양 반주",
    instrumentSummary: {
      piano: "리듬감 있는 옥타브 컴핑",
      guitar: "다운/업 스트로크 위주",
      bass: "당김음 섞인 워킹 베이스",
      drums: "8비트 하이햇 그루브",
    },
    sectionDensity: "절부터 전 악기 참여, 후렴에서 다이나믹 최고조",
  },
  ccm_ballad: {
    preset: "ccm_ballad",
    label: "CCM 발라드",
    description: "잔잔하게 시작해 후렴에서 풍성해지는 편성",
    instrumentSummary: {
      piano: "아르페지오 위주 서정적 반주",
      guitar: "핑거피킹, 후렴에서만 스트로크 추가",
      bass: "롱톤 근음 위주",
      drums: "절에서는 생략, 후렴부터 합류",
    },
    sectionDensity: "1절은 피아노 중심, 후렴에서 풀밴드로 확장",
  },
  hymn_traditional: {
    preset: "hymn_traditional",
    label: "전통 찬송",
    description: "정박 4성부 화성 중심의 전통 찬송가 반주",
    instrumentSummary: {
      piano: "정박 블록 코드(4성부 화성)",
      guitar: "약하게 코드만 서포트",
      bass: "마디 시작 근음 위주",
      drums: "심벌 위주 절제된 박자 유지",
    },
    sectionDensity: "전 섹션 동일한 밀도로 안정적으로 진행",
  },
  acoustic_intimate: {
    preset: "acoustic_intimate",
    label: "어쿠스틱",
    description: "최소 편성으로 가사에 집중하게 하는 편안한 반주",
    instrumentSummary: {
      piano: "여백이 많은 단순 보이싱",
      guitar: "핑거피킹 중심, 주 멜로디 라인",
      bass: "간헐적으로만 등장",
      drums: "생략되거나 퍼커션 정도로만 대체",
    },
    sectionDensity: "브릿지·간주에서도 다이나믹 변화를 최소화",
  },
};

export const GENRE_PRESET_LIST: GenrePresetMeta[] = [
  GENRE_PRESET_META.praise_upbeat,
  GENRE_PRESET_META.ccm_ballad,
  GENRE_PRESET_META.hymn_traditional,
  GENRE_PRESET_META.acoustic_intimate,
];

export { INSTRUMENT_LABEL } from "@/lib/song-model/labels";
