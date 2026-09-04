// 섹션 자동 추론기 (Task 017).
// Task 016의 비전 LLM은 섹션 종류(verse/chorus/...)를 이미지별로 독립적으로 판단할 뿐, 반복
// 구조(같은 후렴이 여러 번 나오는가, 어떤 구간이 실질적으로 앞 구간의 반복인가)는 전혀 모른다.
// 이 모듈은 이미 추출된 가사·코드만 보고(LLM을 다시 부르지 않고) 결정론적으로 반복을 찾아
// repeatTargetSectionId를 채운다 — Task 016 merge-extraction.ts가 이 필드를 항상 null로 남겨둔
// 이유가 이 모듈이다.
//
// "도돌이표 위치"를 문자 그대로 인식하지는 않는다 — 원본 리드시트의 도돌이표 기호(𝄆𝄇, D.S. 등)는
// 텍스트 추출 결과에 별도로 남지 않으므로, 대신 가사·코드 진행이 앞선 구간과 실질적으로 동일한지
// 비교하는 콘텐츠 시그니처 방식으로 같은 효과(반복 구간 식별)를 낸다.
import type { SectionType } from "@/lib/song-model/types";

export interface InferSectionsInputLine {
  lyrics: string;
  chords: Array<{ chord: string }>;
}

export interface InferSectionsInputSection {
  id: string;
  type: SectionType;
  lines: InferSectionsInputLine[];
}

export interface InferredSection {
  id: string;
  type: SectionType;
  repeatTargetSectionId: string | null;
}

/**
 * 줄 전체가 짧은 음절의 단순 반복인지 확인한다("라라라", "라 라 라", "na na na", "오오오오").
 * 이런 줄만으로 이루어진 섹션은 실제 가사가 아니라 보칼리제이션(허밍/간주 구간)일 가능성이 높다.
 */
function isVocalizationLine(lyrics: string): boolean {
  const trimmed = lyrics.trim();
  if (!trimmed) return false;

  const tokens = trimmed.split(/[\s~-]+/).filter(Boolean);
  if (tokens.length >= 2) {
    return tokens.every((token) => token.length <= 3 && token === tokens[0]);
  }

  // 공백 없이 붙어있는 경우("라라라")는 짧은 반복 단위로 나뉘는지 확인한다.
  for (const unitLength of [1, 2, 3]) {
    if (trimmed.length % unitLength !== 0) continue;
    const unit = trimmed.slice(0, unitLength);
    const repeatCount = trimmed.length / unitLength;
    if (repeatCount >= 2 && unit.repeat(repeatCount) === trimmed) return true;
  }
  return false;
}

function hasContent(section: InferSectionsInputSection): boolean {
  return section.lines.some((line) => line.lyrics.trim().length > 0 || line.chords.length > 0);
}

/** 가사와 코드 진행을 합친 콘텐츠 시그니처. 이게 같으면 사실상 같은 구간의 반복으로 본다. */
function sectionSignature(section: InferSectionsInputSection): string {
  return section.lines
    .map((line) => `${line.lyrics.trim()}|${line.chords.map((c) => c.chord).join(",")}`)
    .join("\n");
}

export function inferSections(sections: InferSectionsInputSection[]): InferredSection[] {
  const signatureToFirstIndex = new Map<string, number>();
  const results: InferredSection[] = [];

  sections.forEach((section, index) => {
    const meaningful = hasContent(section);
    const signature = meaningful ? sectionSignature(section) : null;
    const firstIndex = signature ? signatureToFirstIndex.get(signature) : undefined;

    if (firstIndex !== undefined) {
      const target = results[firstIndex];
      results.push({ id: section.id, type: target.type, repeatTargetSectionId: target.id });
      return;
    }

    if (signature) signatureToFirstIndex.set(signature, index);

    const allVocalization =
      section.lines.length > 0 && section.lines.every((line) => isVocalizationLine(line.lyrics));
    results.push({
      id: section.id,
      type: allVocalization ? "interlude" : section.type,
      repeatTargetSectionId: null,
    });
  });

  return results;
}
