import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { routes } from "@/lib/routes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PraisePlay",
  description: "코드 악보 사진으로 다악기 반주를 만들고 실시간으로 재생하는 예배 반주 서비스",
};

// 앱이 항상 다크 테마로 렌더링되므로(<html className="dark">), Clerk 컴포넌트도 별도
// baseTheme 없이 CSS 변수만 참조해 같은 팔레트를 쓰게 한다 — globals.css의 .dark 토큰이
// 실제 렌더링 시점 값을 그대로 공급하므로 색상을 중복 정의할 필요가 없다.
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--card)",
    colorForeground: "var(--card-foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorMuted: "var(--muted)",
    colorInput: "var(--input)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorDanger: "var(--destructive)",
    colorRing: "var(--ring)",
    borderRadius: "var(--radius)",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      // 안 주면 auth.protect()가 비로그인 사용자를 Clerk 호스팅 Account Portal로 보낸다 —
      // Task007에서 만든 우리 자체 /sign-in, /sign-up 페이지로 대신 보내게 명시한다.
      signInUrl={routes.signIn()}
      signUpUrl={routes.signUp()}
      signInFallbackRedirectUrl={routes.home()}
      signUpFallbackRedirectUrl={routes.home()}
    >
      <html
        lang="ko"
        className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster theme="dark" />
        </body>
      </html>
    </ClerkProvider>
  );
}
