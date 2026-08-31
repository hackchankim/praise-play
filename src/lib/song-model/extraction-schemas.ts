// 비전 LLM 악보 추출 결과 스키마 (Task 016).
// 텍스트 판독(가사·코드·조표)과 공간 추론/카운팅(마디·박자 구조)은 신뢰도가 달라
// 별도 호출로 분리하고, 병합은 추출 잡(Task 016/017)에서 lineIndex로 대응시킨다.

import { z } from "zod";
import { SECTION_TYPES } from "@/lib/song-model/types";

// ===== 1) 텍스트 추출: 가사·코드·조표 =====

export const textExtractionChordSchema = z.object({
  chord: z.string().min(1),
  /** 가사 문자열 내 삽입 위치 (0-indexed) */
  charOffset: z.number().int().min(0),
});

export const textExtractionLineSchema = z.object({
  lyrics: z.string(),
  chords: z.array(textExtractionChordSchema),
});

export const textExtractionSectionSchema = z.object({
  type: z.enum(SECTION_TYPES),
  lines: z.array(textExtractionLineSchema),
});

export const textExtractionResultSchema = z.object({
  key: z.string().min(1),
  sections: z.array(textExtractionSectionSchema).min(1),
});

export type TextExtractionResult = z.infer<typeof textExtractionResultSchema>;

// ===== 2) 구조 추출: 마디 경계·박자·도돌이표 =====
// LLM 환각으로 인한 비현실적인 값(초고속 템포, 비정상적으로 긴 줄)을 조기에 걸러내기 위해
// 현실적인 상한을 둔다. 정확한 상한은 Task 027 실측 이후 조정 가능.

export const structureExtractionLineSchema = z.object({
  /** textExtractionResult의 sections[].lines[] 순서와 대응 */
  lineIndex: z.number().int().min(0),
  beatsInLine: z.number().positive().max(64),
  isRepeatStart: z.boolean().optional(),
  /** 도돌이표로 되돌아갈 대상 줄의 lineIndex */
  repeatTargetLineIndex: z.number().int().min(0).optional(),
});

export const structureExtractionSectionSchema = z
  .object({
    /** textExtractionResult의 sections[] 순서와 대응 */
    sectionIndex: z.number().int().min(0),
    lines: z.array(structureExtractionLineSchema),
  })
  .superRefine((section, ctx) => {
    const lineIndexes = section.lines.map((line) => line.lineIndex);
    if (new Set(lineIndexes).size !== lineIndexes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lineIndex는 섹션 내에서 중복될 수 없습니다.",
        path: ["lines"],
      });
    }
  });

export const structureExtractionResultSchema = z
  .object({
    tempo: z.number().positive().max(300),
    timeSignature: z.string().min(1),
    sections: z.array(structureExtractionSectionSchema).min(1),
  })
  .superRefine((result, ctx) => {
    const sectionIndexes = result.sections.map((section) => section.sectionIndex);
    if (new Set(sectionIndexes).size !== sectionIndexes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sectionIndex는 결과 내에서 중복될 수 없습니다.",
        path: ["sections"],
      });
    }
  });

export type StructureExtractionResult = z.infer<typeof structureExtractionResultSchema>;
