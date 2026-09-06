// 비전 LLM 악보 추출 결과 스키마 (Task 016).
// 텍스트 판독(가사·코드·조표)과 공간 추론/카운팅(마디·박자 구조)은 신뢰도가 달라
// 별도 호출로 분리한다.
//
// 구조 추출(2번 항목)은 자기 구획/줄 경계를 스스로 매기지 않는다(Task 032) — 텍스트 추출
// 결과로 이미 확정된 줄 목록을 고정 입력으로 받아(extract.ts의 flattenTextExtractionLines
// 참고) 그 순서 그대로 대응하는 평평한 배열로만 답한다. 원래는 구조 추출도 sectionIndex/
// lineIndex를 스스로 매겨 텍스트 추출 결과와 그 좌표로 대응시켰는데, 두 호출이 이미지를 보고
// 독립적으로 구획을 나누다 보니(게다가 공간 판단은 이 파이프라인에서 가장 신뢰도가 낮다)
// 조금만 다르게 나눠도 좌표 전체가 어긋나 실사용에서 곡 전체가 needsReview로 뒤덮이는 사례가
// 나왔다(실측 확인). 구조 추출의 자체 구획 판단은 애초에 최종 저장값에 전혀 쓰이지 않았으므로
// (실제로 저장되는 sections/lines는 항상 텍스트 추출 결과 기준), 그 판단 자체를 없애 매칭
// 실패 가능성을 구조적으로 제거했다.

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
  beatsInLine: z.number().positive().max(64),
  /**
   * 이 줄에 등장하는 코드 기호들을(입력으로 준 이 줄의 코드 목록과 왼쪽부터 같은 순서로)
   * 각각 이 줄 시작 기준 몇 번째 박에 걸리는지 나열한 값. 글자 위치에 비례해 사후 추정하던
   * 것을 모델이 마디·박자 구조를 보고 직접 답하게 한다 — merge-extraction.ts가 이 배열의
   * 개수가 실제 코드 개수와 맞고 두 번째 self-consistency 호출과도 일치할 때만 신뢰하고,
   * 그렇지 않으면 예전 글자-비례 추정으로 되돌아간다.
   */
  chordBeats: z.array(z.number().min(0).max(64)).optional(),
  isRepeatStart: z.boolean().optional(),
  /** 도돌이표로 되돌아갈 대상 줄 번호 — 입력으로 준 전체 줄 목록 기준 0-indexed 전역 번호. */
  repeatTargetLineIndex: z.number().int().min(0).optional(),
});

export const structureExtractionResultSchema = z.object({
  tempo: z.number().positive().max(300),
  timeSignature: z.string().min(1),
  /**
   * 입력으로 준 줄 목록(extract.ts의 flattenTextExtractionLines)과 정확히 같은 개수·순서여야
   * 한다 — n번째 원소가 입력 목록의 n번째 줄에 대응한다. merge-extraction.ts는 길이가 다르면
   * (모델이 줄을 빠뜨리거나 합쳤다는 뜻) 이 결과 전체를 신뢰하지 않는다. min(1)을 두지 않는다 —
   * 입력 줄 목록 자체가 0개일 수 있고(텍스트 추출이 빈 줄만 있는 구획을 냈을 때), 그때는 빈
   * 배열이 정확히 맞는 응답이다(code review 지적 — min(1)을 두면 그 경우 스키마 검증이 항상
   * 실패해 재시도만 소진하고 실패로 끝난다).
   */
  lines: z.array(structureExtractionLineSchema),
});

export type StructureExtractionResult = z.infer<typeof structureExtractionResultSchema>;
