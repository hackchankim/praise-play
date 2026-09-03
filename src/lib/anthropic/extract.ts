// 비전 LLM 악보 추출 호출 2종 (Task 016).
// docs/PLAN.md의 정확도 유의사항 — Claude Vision은 텍스트 판독보다 공간 추론/카운팅(마디 경계,
// 줄당 박자 수)의 신뢰도가 낮다 — 을 반영해 프롬프트와 호출을 분리한다. 신뢰도가 다른 두 정보를
// 한 호출에 섞으면 한쪽의 불확실성이 다른 쪽 판독까지 끌고 내려갈 위험이 있다.
//
// 여러 이미지(리드시트 여러 페이지)는 한 메시지 안에 순서대로 나열해 한 번에 넘긴다 — 페이지
// 경계에서 잘린 줄/섹션을 이어붙이는 "병합" 자체를 모델이 전체 맥락을 보고 하게 하는 편이,
// 페이지별로 따로 추출한 JSON을 사후에 문자열 유사도 등으로 이어붙이는 것보다 신뢰도가 높다
// (extraction-schemas.ts에 페이지/이미지 인덱스 필드가 없는 것도 이 설계를 전제한다).
import { NonRetriableError } from "inngest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { ANTHROPIC_MODEL, createAnthropicClient } from "@/lib/anthropic/client";
import {
  textExtractionResultSchema,
  structureExtractionResultSchema,
  type TextExtractionResult,
  type StructureExtractionResult,
} from "@/lib/song-model/extraction-schemas";

// 대부분의 리드시트는 이 안에 들어가지만, 여러 페이지에 걸친 긴 곡은 넘칠 수 있다 — 넘치면
// 아래 stop_reason 체크로 감지해 재시도 대신 바로 실패시킨다(같은 입력이면 잘리는 지점도
// 같아서 재시도해도 결과가 달라지지 않는다).
const MAX_OUTPUT_TOKENS = 16384;

export interface ExtractionImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

/**
 * R2에 저장된 실제 Content-Type을 근거로 미디어 타입을 정한다(확장자 추측보다 신뢰도가 높다).
 * NonRetriableError를 던진다 — 같은 이미지는 재시도해도 형식이 바뀌지 않으므로(예: 브라우저가
 * HEIC을 디코드하지 못해 원본을 그대로 올린 경우) Inngest의 3회 재시도를 낭비할 이유가 없다.
 */
export function mediaTypeFromContentType(contentType: string | null): ExtractionImage["mediaType"] {
  if (contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp") {
    return contentType;
  }
  throw new NonRetriableError(
    `비전 LLM이 지원하지 않는 이미지 형식입니다: ${contentType ?? "알 수 없음"} (JPEG/PNG/WEBP만 가능).`,
  );
}

/** 응답이 max_tokens에서 잘렸으면 같은 입력으로 재시도해도 동일하게 잘린다 — 재시도를 건너뛴다. */
function assertNotTruncated(stopReason: string | null, label: string): void {
  if (stopReason === "max_tokens") {
    throw new NonRetriableError(
      `${label} 응답이 최대 출력 길이를 초과해 잘렸습니다 — 곡이 너무 길거나 복잡할 수 있습니다.`,
    );
  }
}

function buildImageBlocks(images: ExtractionImage[]): ImageBlockParam[] {
  return images.map((image) => ({
    type: "image",
    source: { type: "base64", media_type: image.mediaType, data: image.base64 },
  }));
}

const TEXT_EXTRACTION_PROMPT = `첨부된 이미지는 찬양/CCM 리드시트(가사와 코드가 함께 표기된 악보) 사진이다. 여러 장이면 같은 곡의 연속된 페이지이므로 순서대로 읽어 하나의 곡으로 합쳐라.

다음을 추출하라:
- key: 조표 (예: "C", "G", "Bb", "Em"). 악보에 명시돼 있지 않으면 코드 진행으로 합리적으로 추정하라.
- sections: 절/후렴/브릿지/간주/인트로/아웃트로 등 구획 단위로 나누고, 각 구획을 줄(line) 단위로 나열하라.
  각 줄마다 가사 원문(lyrics)과 그 줄에 등장하는 코드(chords)를 왼쪽부터 순서대로 나열하라.
- 각 코드의 charOffset은 그 줄 가사 문자열 내에서 코드가 걸리는 위치에 해당하는 0-indexed 문자 인덱스다
  (악보에서 코드가 가사 위쪽에 표기돼 있으면, 그 코드 바로 아래에 오는 가사 문자의 인덱스로 매핑하라).
  가사가 없는 순수 간주/연주 줄이면 lyrics를 빈 문자열로 하고, 그 줄의 모든 코드는 charOffset을 0으로 하라.
- 이미지에 실제로 보이는 내용만 추출하라. 판독 불가능하거나 가려진 부분을 추측으로 지어내지 마라.`;

const STRUCTURE_EXTRACTION_PROMPT = `같은 리드시트 이미지에서 이번에는 마디/박자 구조만 집중해서 세어라. 가사·코드 판독보다 공간적 카운팅(줄이 몇 박인지, 마디 경계가 어디인지)이 더 어렵다는 걸 알고 있으니, 각 줄의 코드 배치 간격과 박자 기호를 근거로 신중하게 다시 세어라.

다음을 추출하라:
- tempo: BPM 추정치. 악보에 명시돼 있으면 그 값, 없으면 곡 스타일로 합리적으로 추정하라.
- timeSignature: 박자 기호 (예: "4/4", "6/8").
- sections: 가사와 동일한 구획 순서로 나열하되, sectionIndex는 0부터 시작하는 구획 순번이다.
  각 구획의 각 줄마다 lineIndex(그 구획 내에서 0부터 시작하는 줄 순번)와 beatsInLine(그 줄 전체가
  차지하는 박 수)을 산출하라.
- 도돌이표(𝄆𝄇, D.S., Coda 등) 표기로 되돌아가는 지점이 있으면 그 줄에 isRepeatStart: true와
  repeatTargetLineIndex(되돌아갈 대상 줄의 lineIndex — 같은 구획 내 기준)를 표시하라. 없으면 생략하라.`;

export async function extractLyricsAndChords(
  images: ExtractionImage[],
): Promise<TextExtractionResult> {
  const client = createAnthropicClient();
  const content: (ImageBlockParam | TextBlockParam)[] = [
    ...buildImageBlocks(images),
    { type: "text", text: TEXT_EXTRACTION_PROMPT },
  ];
  const message = await client.messages.parse({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(textExtractionResultSchema) },
  });
  assertNotTruncated(message.stop_reason, "텍스트 추출");
  if (!message.parsed_output) {
    throw new Error("텍스트 추출 응답이 스키마 검증을 통과하지 못했습니다.");
  }
  return message.parsed_output;
}

export async function extractStructure(
  images: ExtractionImage[],
): Promise<StructureExtractionResult> {
  const client = createAnthropicClient();
  const content: (ImageBlockParam | TextBlockParam)[] = [
    ...buildImageBlocks(images),
    { type: "text", text: STRUCTURE_EXTRACTION_PROMPT },
  ];
  const message = await client.messages.parse({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(structureExtractionResultSchema) },
  });
  assertNotTruncated(message.stop_reason, "구조 추출");
  if (!message.parsed_output) {
    throw new Error("구조 추출 응답이 스키마 검증을 통과하지 못했습니다.");
  }
  return message.parsed_output;
}
