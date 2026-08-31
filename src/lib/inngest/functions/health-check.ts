import { inngest } from "@/lib/inngest/client";

// 배선 확인용 더미 함수. 실제 추출/편곡 잡은 Task 016/019에서 추가된다.
export const healthCheck = inngest.createFunction(
  { id: "health-check", triggers: { event: "app/health-check.requested" } },
  async ({ step }) => {
    return step.run("respond", () => ({ ok: true, checkedAt: new Date().toISOString() }));
  },
);
