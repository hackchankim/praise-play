import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

// 악보 추출(Task 016)에 쓸 모델을 한 곳에 상수화한다.
export const ANTHROPIC_MODEL = "claude-sonnet-5" as const;

// Structured Outputs 사용법 (Task 016 구현 시점에 @anthropic-ai/sdk 0.122 문서로 검증 완료):
// client.messages.parse({ ..., output_config: { format: zodOutputFormat(schema) } })를 쓰면
// message.parsed_output에 zod로 검증된 결과가 채워진다. zodOutputFormat은
// "@anthropic-ai/sdk/helpers/zod"에서 임포트한다 (src/lib/anthropic/extract.ts 참고).

export function createAnthropicClient() {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}
