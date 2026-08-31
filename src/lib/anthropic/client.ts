import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

// 악보 추출(Task 016)에 쓸 모델을 한 곳에 상수화한다.
export const ANTHROPIC_MODEL = "claude-sonnet-5" as const;

// Structured Outputs 파라미터명은 Task 016 구현 시점에 최신 Anthropic API 문서로
// 재검증할 것 (docs/PLAN.md에 미검증 상태로 기록되어 있음).
export const STRUCTURED_OUTPUT_OPTION_KEY = "output_config" as const;

export function createAnthropicClient() {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}
