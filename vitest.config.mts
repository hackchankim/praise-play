// 순수 로직(코드 문법 검증기, 섹션 추론기 등) 단위 테스트용 (Task 017에서 최초 도입).
// UI 컴포넌트/Route Handler 테스트는 다루지 않는다 — 이 프로젝트는 그쪽을 Playwright MCP
// 라이브 검증으로 대신한다(각 Task의 "테스트 체크리스트" 참고).
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
