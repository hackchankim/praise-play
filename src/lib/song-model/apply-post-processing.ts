// 추출 잡 후단의 검증·추론 단계 (Task 017). Task 016의 병합 결과(MergedExtractionResult)를
// 받아 코드 문법 검증(chord-validator.ts)과 섹션 자동 추론(infer-sections.ts)을 적용한 뒤
// 영속화 직전 최종 형태로 돌려준다. 둘 다 순수 함수라 이 함수도 순수 함수다 — LLM 호출도,
// DB 접근도 하지 않는다(그래서 Inngest step.run()에 그대로 넣어도 재시도 시 부작용이 없다).
import { validateChord } from "@/lib/song-model/chord-validator";
import { inferSections, type InferSectionsInputSection } from "@/lib/song-model/infer-sections";
import type { MergedExtractionResult, MergedSection } from "@/lib/song-model/merge-extraction";

export function applyPostProcessing(merged: MergedExtractionResult): MergedExtractionResult {
  // 1) 코드 문법 검증 — 정규화된 표기로 교체하고, self-consistency(Task 016)가 이미 세워둔
  //    needsReview에 문법 검증 결과를 OR로 더한다(둘 중 하나라도 걸리면 검토 대상).
  const sectionsWithValidatedChords: MergedSection[] = merged.sections.map((section) => ({
    ...section,
    lines: section.lines.map((line) => ({
      ...line,
      chordEvents: line.chordEvents.map((chordEvent) => {
        const validation = validateChord(chordEvent.chord, merged.key);
        return {
          ...chordEvent,
          chord: validation.normalized,
          needsReview: chordEvent.needsReview || validation.needsReview,
        };
      }),
    })),
  }));

  // 2) 섹션 자동 추론 — 반복 구간에 repeatTargetSectionId를 채우고, 보칼리제이션 구간을
  //    interlude로 재라벨링한다.
  const inferenceInput: InferSectionsInputSection[] = sectionsWithValidatedChords.map(
    (section) => ({
      id: section.id,
      type: section.type,
      lines: section.lines.map((line) => ({
        lyrics: line.lyrics,
        chords: line.chordEvents.map((chordEvent) => ({ chord: chordEvent.chord })),
      })),
    }),
  );
  const inferred = inferSections(inferenceInput);
  const inferredById = new Map(inferred.map((item) => [item.id, item]));

  const sections: MergedSection[] = sectionsWithValidatedChords.map((section) => {
    const result = inferredById.get(section.id);
    return {
      ...section,
      type: result?.type ?? section.type,
      repeatTargetSectionId: result?.repeatTargetSectionId ?? null,
    };
  });

  return { ...merged, sections };
}
