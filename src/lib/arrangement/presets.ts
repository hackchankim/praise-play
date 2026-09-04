// 장르 프리셋별 악기 스타일 매핑 (Task 019).
// 여기 나열된 스타일·섹션별 분기는 src/app/(app)/songs/[songId]/arrangement/genre-presets.ts의
// GENRE_PRESET_META(Task 008에서 먼저 작성된 프리셋 설명 카피)를 그대로 코드로 옮긴 것이다 —
// 설명 문구와 실제 생성 로직이 어긋나지 않도록 이 파일을 수정할 땐 그쪽 설명도 같이 봐야 한다.
import { VoicingDictionary } from "tonal";
import type { GenrePreset, SectionType } from "@/lib/song-model/types";

export type PianoStyle = "comping" | "arpeggio" | "block" | "sparse";
export type GuitarStyle = "strum" | "fingerpick" | "sparse";
export type BassStyle = "walking" | "longtone" | "downbeat" | "sparse";
export type DrumsStyle = "active" | "minimal" | "off";

export interface InstrumentStyles {
  piano: PianoStyle;
  guitar: GuitarStyle;
  bass: BassStyle;
  drums: DrumsStyle;
}

export interface VoicingOptions {
  range: [string, string];
  dictionary: Record<string, string[]>;
}

/** 프리셋별 화성 보이싱 어휘. 찬송가/어쿠스틱은 단순 3화음만, 나머지는 7화음까지 허용한다. */
export const VOICING_OPTIONS: Record<GenrePreset, VoicingOptions> = {
  praise_upbeat: { range: ["C3", "E5"], dictionary: VoicingDictionary.all },
  ccm_ballad: { range: ["C3", "C5"], dictionary: VoicingDictionary.all },
  hymn_traditional: { range: ["C3", "C4"], dictionary: VoicingDictionary.triads },
  acoustic_intimate: { range: ["C3", "C4"], dictionary: VoicingDictionary.triads },
};

/**
 * (프리셋, 섹션 타입) 조합마다 각 악기가 어떤 스타일로 연주할지 정한다 — genre-presets.ts의
 * sectionDensity 설명을 그대로 구현한 지점.
 */
export function stylesFor(preset: GenrePreset, sectionType: SectionType): InstrumentStyles {
  switch (preset) {
    case "praise_upbeat":
      // "절부터 전 악기 참여, 후렴에서 다이나믹 최고조" — 항상 풀밴드로 참여하되, 후렴에서
      // 피아노를 comping(더 조밀한 리듬)으로 유지해 밀도 차이를 낸다. 절대적인 "다이나믹
      // 최고조"는 velocity로 다시 손보기보다, 이미 전 악기가 참여하는 것 자체로 표현한다.
      return { piano: "comping", guitar: "strum", bass: "walking", drums: "active" };

    case "hymn_traditional":
      // "전 섹션 동일한 밀도로 안정적으로 진행" — 섹션 타입과 무관하게 항상 같은 스타일.
      return { piano: "block", guitar: "sparse", bass: "downbeat", drums: "minimal" };

    case "acoustic_intimate": {
      // "브릿지·간주에서도 다이나믹 변화를 최소화" — 섹션에 따라 스타일 자체를 바꾸지 않는다.
      // 베이스만 원래 설명대로 "간헐적으로만 등장"(매 구간이 아니라 하나 걸러 하나) 하도록
      // bassSparse가 이미 구간 시작에만 짧게 찍는 방식이라 별도 섹션 분기가 필요 없다.
      return { piano: "sparse", guitar: "fingerpick", bass: "sparse", drums: "off" };
    }

    case "ccm_ballad": {
      // "1절은 피아노 중심, 후렴에서 풀밴드로 확장" — chorus/bridge에서만 기타 스트로크와
      // 드럼이 합류한다. 피아노 아르페지오와 베이스 롱톤은 전 섹션에서 유지해 "잔잔하게
      // 시작"하는 기본 바탕을 이룬다.
      const isFull = sectionType === "chorus" || sectionType === "bridge";
      return {
        piano: "arpeggio",
        guitar: isFull ? "strum" : "fingerpick",
        bass: "longtone",
        drums: isFull ? "active" : "off",
      };
    }
  }
}
