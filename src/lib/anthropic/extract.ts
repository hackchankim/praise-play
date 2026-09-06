// 비전 LLM 악보 추출 호출 3종 (Task 016, Task 032).
// docs/PLAN.md의 정확도 유의사항 — Claude Vision은 텍스트 판독보다 공간 추론/카운팅(마디 경계,
// 줄당 박자 수, 코드의 글자 위치)의 신뢰도가 낮다 — 을 반영해 프롬프트와 호출을 분리한다.
// 신뢰도가 다른 정보를 한 호출에 섞으면 한쪽의 불확실성이 다른 쪽 판독까지 끌고 내려갈 위험이
// 있다. 구조 추출(beatsInLine/chordBeats)과 코드 위치 추출(charOffset)은 둘 다 텍스트 추출
// (primary)이 확정한 줄+코드 목록을 고정 입력으로 받아 자기 self-consistency 판단에만 집중한다
// (extraction-schemas.ts 헤더 주석 참고) — 구획을 스스로 나누는 부담까지 지지 않는다.
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
  charOffsetResultSchema,
  type TextExtractionResult,
  type StructureExtractionResult,
  type CharOffsetResult,
} from "@/lib/song-model/extraction-schemas";

// 대부분의 리드시트는 이 안에 들어가지만, 여러 페이지에 걸친 긴 곡은 넘칠 수 있다 — 넘치면
// 아래 stop_reason 체크로 감지해 재시도 대신 바로 실패시킨다(같은 입력이면 잘리는 지점도
// 같아서 재시도해도 결과가 달라지지 않는다).
const MAX_OUTPUT_TOKENS = 16384;

// Claude Sonnet 5는 thinking 필드를 안 주면 기본으로 "adaptive thinking"이 켜진다 — 그런데
// max_tokens는 thinking과 실제 답변(JSON)을 합친 총 출력에 대한 하드 리밋이라, 짧고 단순한
// 리드시트조차 모델이 답을 내놓기 전에 thinking에서 예산을 다 써버려 max_tokens에서 잘리는
// 사례를 Task 026 통합 테스트로 실측했다(실패한 이미지로 직접 재현·수정 검증: thinking을 끄니
// thinking_tokens=0·stop_reason="end_turn"·총 출력 약 1000토큰으로 정상 완료됨을 확인).
//
// 텍스트 추출(가사·코드·조표를 있는 그대로 옮겨 적는 기계적 판독)은 열린 추론이 필요
// 없으므로 여기서만 thinking을 아예 꺼서 max_tokens 전체가 답변에만 쓰이게 한다. 구조 추출은
// 다르다 — buildStructureExtractionPrompt 자체가 "마디 단위로 나눠서 계산하라"는 다단계 산술을
// 명시적으로 요구하는, 이 파이프라인에서 정확도가 가장 취약한 부분이다(docs/PLAN.md의 공간
// 추론 신뢰도 유의사항, 그리고 이번 세션에서 chordBeats·마디 단위 카운팅 지시를 여러 차례
// 보강한 이유이기도 하다) — thinking을 꺼서 모델의 단계별 계산 능력까지 함께 없애면 truncation
// 버그는 고쳐도 정확도가 조용히 나빠질 위험이 있다(code review 지적). 그래서 구조 추출은
// adaptive thinking을 그대로 두고 대신 max_tokens만 넉넉히 올려 thinking+답변 둘 다 들어갈
// 여유를 준다 — 상한을 올리는 것 자체는 실제로 쓴 토큰만큼만 과금되므로 비용 부담이 없다.
// 단, Anthropic SDK는 max_tokens가 크면(대략 예상 소요 시간이 10분을 넘을 것으로 추정되면,
// client.ts의 calculateNonstreamingTimeout 참고 — 이 모델 기준 대략 21,333 초과 시)
// 논스트리밍 호출 자체를 거부한다(실측 확인: 32768로 시도하니 "Streaming is required..."
// 에러 발생). 그 한도 안에서 넉넉히 잡는다.
const DISABLED_THINKING = { type: "disabled" } as const;
const STRUCTURE_MAX_OUTPUT_TOKENS = 20000;
// 코드 위치(charOffset)는 구조 추출과 달리 thinking을 켜둔 채로 실측했더니 20000에서도
// truncation이 재현됐다(3번 중 2번 — 코드가 많은 줄이 여러 개인 곡에서 코드별 카운팅을 아주
// 장황하게 사고하는 것으로 보인다. 나머지 1번은 콘텐츠 필터링 400으로 실패). 그런데 이 정확히
// 같은 "음표 개수 세기" 알고리즘은 원래(Task 016) TEXT_EXTRACTION_PROMPT 안에 번들로
// 들어있었고, 그때는 thinking이 꺼진 채로 한 번도 truncation 없이 안정적으로 동작했다 —
// thinking을 켜는 게 이 특정 작업에서는 정확도 개선이 아니라 오히려 새로운 실패(끝없이 길어지는
// 사고 과정)를 만든 셈이다. 그래서 여기서도 thinking을 끈다 — 구조 추출(마디 단위 누적 산술이
// 실제로 필요한 작업)과는 사정이 다르다. thinking을 끄면 출력이 순수 숫자 배열뿐이라 훨씬
// 작아도 충분하다.
const CHAR_OFFSET_MAX_OUTPUT_TOKENS = 8192;

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

/**
 * 구조 추출·코드 위치 추출이 주어진 줄 목록과 다른 개수로 답하면(지시를 어기고 줄을 합치거나
 * 빠뜨림) merge-extraction.ts가 이 결과 전체를 통째로 버린다 — 그 대가가 곡 전체 needsReview인
 * 만큼(code review 지적), 여기서 미리 잡아 일반 Error로 던져 Inngest가 재시도하게 한다.
 * "이미 정해진 N개 줄에 정확히 N개로 답하라"는 기계적 지시라 한 번 어겼다고 다시 어길 확률이
 * 높은 종류의 실수가 아니므로(예전의 "스스로 구획을 판단하라"는 지시와 달리), 재시도가 실제로
 * 도움될 가능성이 있다 — assertNotTruncated처럼 NonRetriableError로 즉시 포기하지 않는다.
 */
function assertLineCountMatches(
  label: string,
  actualLineCount: number,
  expectedLineCount: number,
): void {
  if (actualLineCount !== expectedLineCount) {
    throw new Error(
      `${label}이 주어진 줄 개수(${expectedLineCount})와 다른 개수(${actualLineCount})로 응답했습니다.`,
    );
  }
}

function buildImageBlocks(images: ExtractionImage[]): ImageBlockParam[] {
  return images.map((image) => ({
    type: "image",
    source: { type: "base64", media_type: image.mediaType, data: image.base64 },
  }));
}

interface ExtractionInputLine {
  lyrics: string;
  /** 코드 기호만, 왼쪽부터 나타나는 순서대로. */
  chords: string[];
}

/**
 * 텍스트 추출 결과를 구획 구분 없이 하나의 순서 있는 줄 목록으로 편다 — 구조 추출·코드 위치
 * 추출은 이제 이 순서를 고정 입력으로 받아 그대로 따르기만 하면 되고(extraction-schemas.ts
 * 헤더 주석 참고), 스스로 구획을 나눌 필요가 없다.
 */
function flattenTextExtractionLines(text: TextExtractionResult): ExtractionInputLine[] {
  return text.sections.flatMap((section) =>
    section.lines.map((line) => ({
      lyrics: line.lyrics,
      chords: line.chords.map((chord) => chord.chord),
    })),
  );
}

function buildExtractionInputText(lines: ExtractionInputLine[]): string {
  return lines
    .map((line, index) => {
      const lyricsText = line.lyrics.length > 0 ? `"${line.lyrics}"` : "(가사 없음 — 간주/연주)";
      const chordList = line.chords.length > 0 ? line.chords.join(", ") : "(코드 없음)";
      return `${index}: 가사=${lyricsText} / 코드(왼쪽부터 순서대로)=[${chordList}]`;
    })
    .join("\n");
}

const TEXT_EXTRACTION_PROMPT = `첨부된 이미지는 찬양/CCM 리드시트(가사와 코드가 함께 표기된 악보) 사진이다. 여러 장이면 같은 곡의 연속된 페이지이므로 순서대로 읽어 하나의 곡으로 합쳐라.

다음을 추출하라:
- key: 조표 (예: "C", "G", "Bb", "Em"). 악보에 명시돼 있지 않으면 코드 진행으로 합리적으로 추정하라.
- sections: 절/후렴/브릿지/간주/인트로/아웃트로 등 구획 단위로 나누고, 각 구획을 줄(line) 단위로 나열하라.
  각 줄마다 가사 원문(lyrics)과 그 줄에 등장하는 코드(chords)를 왼쪽부터 순서대로 나열하라.
  **연속된 물리적 줄이 같은 절/후렴 등 하나의 구획에 속한다면(예: 1절이 원래 2~4줄로 이루어져
  있다면) 그 줄들을 모두 하나의 section 안에 순서대로 나열하라 — 물리적으로 줄이 바뀐다고 해서
  구획도 나누지 마라.** 구획 경계는 실제로 절/후렴/브릿지 등 역할이 바뀌는 지점, 또는 빈 줄·구획
  이름 표기(1절, 후렴 등)가 있는 지점에서만 나눠라.
- 가사가 없는 순수 간주/연주 줄이면 lyrics를 빈 문자열로 하라.
- 이미지에 실제로 보이는 내용만 추출하라. 판독 불가능하거나 가려진 부분을 추측으로 지어내지 마라.`;

// 텍스트 추출과 별개로 구조 추출이 스스로 구획/줄 경계를 다시 판단하게 하면(예전 방식), 두
// 결과가 이미지를 보고 각자 독립적으로 나눈 구획 수가 어긋날 위험이 늘 있었다(공간 판단은 이
// 파이프라인에서 가장 신뢰도가 낮은 부분이다). 그 결과 구획 좌표가 조금만 어긋나도 그 아래
// 모든 줄이 도미노로 매칭 실패해 needsReview로 뒤덮이는 사례가 실사용에서 나왔다(실제 이미지로
// 재현 확인 — 텍스트/구조 추출 4회 호출이 전부 다른 구획·줄 개수로 나눔). 지금은 그 판단을
// 아예 시키지 않는다 — 텍스트 추출(primary) 결과로 이미 확정된 줄 목록을
// buildExtractionInputText로 프롬프트에 그대로 박아 넣고, "위 목록과 정확히 같은 개수로
// 답하라"는 기계적 지시만 준다.
//
// "구획을 새로 나누거나 줄을 합치거나 쪼개지 마라"처럼 병합·분리를 언급하는 지시문은 일부러
// 넣지 않는다 — TEXT_EXTRACTION_PROMPT의 "연속된 줄을 하나의 구획으로 묶어라"(하라는 지시)뿐
// 아니라 이 부정형 지시("하지 마라")도 Anthropic 콘텐츠 필터링을 유발할 수 있음을 코드 위치
// 추출(charOffsetExtractionPrompt)에서 실측으로 확인했다(400 "Output blocked by content
// filtering policy"). 구획/줄 병합이라는 주제 자체가 필터를 건드리는 것으로 보인다. 그래서
// "몇 개로 답해야 하는지"만 기계적으로 지시하고, 실제로 그 개수를 지켰는지는
// assertLineCountMatches가 검증해 어기면 재시도시킨다 — 프롬프트로 못 막는 나머지를 코드로
// 방어한다.
function buildStructureExtractionPrompt(inputLines: ExtractionInputLine[]): string {
  return `같은 리드시트 이미지에서 이번에는 마디/박자 구조만 집중해서 세어라. 가사·코드 판독보다 공간적 카운팅(줄이 몇 박인지, 마디 경계가 어디인지)이 더 어렵다는 걸 알고 있으니, 각 줄의 코드 배치 간격과 박자 기호를 근거로 신중하게 다시 세어라.

이 리드시트는 이미 다음과 같이 줄 단위로 정리되어 있다(줄 번호, 가사, 그 줄에 나타나는 코드 목록):
${buildExtractionInputText(inputLines)}

lines 배열은 위 목록과 정확히 같은 개수(${inputLines.length}개), 같은 순서로 답하라 — 배열의
n번째 원소가 위 목록의 n번째 줄에 그대로 대응한다.

결과 전체에 딱 한 번만 답하면 되는 값(줄마다 반복하지 마라):
- tempo: BPM 추정치. 악보에 명시돼 있으면 그 값, 없으면 곡 스타일로 합리적으로 추정하라.
- timeSignature: 박자 기호 (예: "4/4", "6/8").

lines 배열의 각 원소(=각 줄)마다 다음을 추출하라:
- beatsInLine: 그 줄 전체가 차지하는 박 수.
- 그 줄에 왼쪽부터 순서대로 나타나는 코드 기호마다, 그 코드가 이 줄 시작을 0으로 했을 때 몇 번째
  박에 걸리는지(소수 가능, 예: 2.5)를 chordBeats 배열로 답하라. 가사 글자 수가 아니라 마디 경계와
  박자 기호, 그리고 그 코드 기호가 음표·가사 위 어느 위치에 적혀 있는지를 근거로 세어라 — 코드
  기호 사이 간격이 넓으면(예: 한 코드가 마디 전체를 차지) 그만큼 뒤 코드의 박 위치도 커야 한다.
  배열의 길이는 위 목록에서 알려준 그 줄의 코드 개수와 반드시 같아야 하고, 순서도 같아야 한다.
  코드가 하나도 없는 줄이면 빈 배열로 두거나 생략하라.
  이 줄이 여러 마디로 이어져 있으면, 줄 전체를 한 번에 누적해서 세지 말고 마디 단위로 나눠서
  계산하라: 한 마디당 박수는 박자 기호의 분자 값 그대로다(예: 4/4→4박, 3/4→3박, 6/8→6박 — 실제
  연주 리듬과 무관하게 이 숫자를 쓴다). 이 줄이 총 몇 마디인지를 먼저 정하고(줄 시작이 마디
  중간부터 시작하는 픽업이면 그 짧은 도입부도 마디 하나로 세고 실제 박 수만 반영하라), 각 마디
  안에서 코드가 몇 번째 박에 있는지(그 마디 시작을 0으로) 센 다음, 그 앞에 있는 마디들의 박수
  합을 더해 최종 chordBeats 값을 구하라 — 마디마다 새로 세면 긴 줄에서 누적 오차가 쌓이지 않는다.
- 도돌이표(𝄆𝄇, D.S., Coda 등) 표기로 되돌아가는 지점이 있으면 그 줄에 isRepeatStart: true와
  repeatTargetLineIndex(되돌아갈 대상 줄의 번호 — 위 목록의 줄 번호 기준)를 표시하라. 없으면 생략하라.`;
}

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
    thinking: DISABLED_THINKING,
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
  textPrimary: TextExtractionResult,
): Promise<StructureExtractionResult> {
  const client = createAnthropicClient();
  const inputLines = flattenTextExtractionLines(textPrimary);
  const content: (ImageBlockParam | TextBlockParam)[] = [
    ...buildImageBlocks(images),
    { type: "text", text: buildStructureExtractionPrompt(inputLines) },
  ];
  const message = await client.messages.parse({
    model: ANTHROPIC_MODEL,
    max_tokens: STRUCTURE_MAX_OUTPUT_TOKENS,
    // 위 STRUCTURE_MAX_OUTPUT_TOKENS 주석 참고 — 여기는 thinking을 끄지 않는다(adaptive
    // thinking 기본값 유지).
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(structureExtractionResultSchema) },
  });
  assertNotTruncated(message.stop_reason, "구조 추출");
  if (!message.parsed_output) {
    throw new Error("구조 추출 응답이 스키마 검증을 통과하지 못했습니다.");
  }
  assertLineCountMatches("구조 추출", message.parsed_output.lines.length, inputLines.length);
  return message.parsed_output;
}

// 코드 위치(charOffset)도 구조 추출과 똑같은 이유로 별도 호출로 분리했다(Task 032) — 원래는
// TEXT_EXTRACTION_PROMPT 안에서 가사·코드 판독과 함께 한 번에 물었는데, charOffset은 사실
// "코드 기호가 몇 번째 음표에 걸리는지 세는" 공간 판단이라 순수 판독(가사·코드 식별)과 신뢰도
// 성격이 다르다(실사용 피드백으로 이 값이 자주 부정확했다 — 이 파이프라인에서 정확도가 가장
// 취약한 두 번째 지점). 게다가 self-consistency를 위해 텍스트 추출을 두 번 통째로 다시 호출하면
// (예전 방식) 그 두 호출이 구획/줄 경계를 각자 독립적으로 다시 판단해 어긋날 위험까지 떠안는다
// (buildStructureExtractionPrompt 위 주석과 같은 문제). 그래서 이제는 텍스트 추출(primary)이
// 확정한 줄+코드 목록을 고정 입력으로 받는 좁은 self-consistency 호출 2회로 대체한다 — 텍스트
// 추출 자체는 한 번만 하면 되고, 그 결과의 charOffset 필드는 애초에 없앴다
// (extraction-schemas.ts 참고).
function buildCharOffsetExtractionPrompt(inputLines: ExtractionInputLine[]): string {
  return `같은 리드시트 이미지에서 이번에는 각 코드가 가사의 몇 번째 글자에 걸리는지만 집중해서 세어라. 픽셀 정렬만으로 눈대중하지 말고 음표 개수를 세어서 신중하게 정하라.

이 리드시트는 이미 다음과 같이 줄 단위로 정리되어 있다(줄 번호, 가사, 그 줄에 나타나는 코드 목록):
${buildExtractionInputText(inputLines)}

lines 배열은 위 목록과 정확히 같은 개수(${inputLines.length}개), 같은 순서로 답하라 — 배열의
n번째 원소가 위 목록의 n번째 줄에 그대로 대응한다.

lines 배열의 각 원소(=각 줄)마다 charOffsets를 답하라: 위에서 알려준 그 줄의 코드 목록과 같은
개수·순서로, 각 코드가 그 줄 가사 문자열 내에서 걸리는 위치에 해당하는 0-indexed 문자 인덱스를
나열하라(악보에서 코드가 가사 위쪽에 표기돼 있으면, 그 코드 바로 아래에 오는 가사 문자의
인덱스로 매핑하라). 가사가 없는 순수 간주/연주 줄이면 그 줄의 모든 코드는 0으로 하라.
세는 방법: 이전 코드(그 줄의 첫 코드면 줄 시작)가 걸린 음표는 포함하지 말고, 그다음 음표부터
이 코드가 걸린 음표까지(이 코드의 음표도 포함) 음표가 몇 개 있는지 센 뒤, 그 개수만큼 이전
코드의 charOffset(줄 시작 기준이면 0)에 더하라. 단, 한 음을 길게 끄는 음표(새 가사 글자가
붙지 않는 음표)는 세지 마라. 코드가 하나도 없는 줄이면 빈 배열로 두거나 생략하라.`;
}

export async function extractCharOffsets(
  images: ExtractionImage[],
  textPrimary: TextExtractionResult,
): Promise<CharOffsetResult> {
  const client = createAnthropicClient();
  const inputLines = flattenTextExtractionLines(textPrimary);
  const content: (ImageBlockParam | TextBlockParam)[] = [
    ...buildImageBlocks(images),
    { type: "text", text: buildCharOffsetExtractionPrompt(inputLines) },
  ];
  const message = await client.messages.parse({
    model: ANTHROPIC_MODEL,
    max_tokens: CHAR_OFFSET_MAX_OUTPUT_TOKENS,
    // 위 CHAR_OFFSET_MAX_OUTPUT_TOKENS 주석 참고 — 구조 추출과 달리 여기는 thinking을 끈다.
    thinking: DISABLED_THINKING,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(charOffsetResultSchema) },
  });
  assertNotTruncated(message.stop_reason, "코드 위치 추출");
  if (!message.parsed_output) {
    throw new Error("코드 위치 추출 응답이 스키마 검증을 통과하지 못했습니다.");
  }
  assertLineCountMatches("코드 위치 추출", message.parsed_output.lines.length, inputLines.length);
  return message.parsed_output;
}
