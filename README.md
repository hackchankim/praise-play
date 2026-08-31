# PraisePlay — 찬양 반주 생성 앱

코드 악보 사진 한 장으로 다악기 반주를 만들고, 예배 중 어떤 순서로 진행해도 끊김 없이 이어지는 실시간 반주 서비스.

전체 기능·기술 스택은 [`docs/PRD.md`](docs/PRD.md), 상세 개발 계획은 [`docs/PLAN.md`](docs/PLAN.md), 진행 로드맵은 [`ROADMAP.md`](ROADMAP.md)를 참고하세요.

## 로컬 실행 절차

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example`을 복사해 `.env.local`을 만들고, 각 서비스에서 발급받은 키를 채웁니다.

```bash
cp .env.example .env.local
```

필요한 서비스 계정: Clerk(인증), Supabase(DB), Cloudflare R2(이미지 저장), Anthropic(악보 추출), Inngest(비동기 잡).

### 3. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인합니다.

### 4. 그 외 스크립트

```bash
npm run build        # 프로덕션 빌드
npm run start         # 프로덕션 서버 실행
npm run lint          # ESLint 검사
npm run format        # Prettier 포맷팅 적용
npm run format:check  # Prettier 포맷팅 검사
```

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript 5.6+ · TailwindCSS v4 · shadcn/ui · Lucide React · React Hook Form + Zod · Web Audio API + `smplr` v1.0.0 · Claude Vision (Sonnet 5) · Tonal.js · Supabase (PostgreSQL) · Inngest · Cloudflare R2 · Clerk · Vercel

자세한 선택 이유는 [`docs/PLAN.md`](docs/PLAN.md)를 참고하세요.
