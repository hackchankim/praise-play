"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { routes } from "@/lib/routes";
import { emailField, passwordField } from "@/lib/validation/auth";

// 실제 인증 연동은 Task 014(Clerk)에서 이뤄진다. 여기서는 클라이언트 측 검증만 동작한다.
const signInSchema = z.object({
  email: emailField,
  password: passwordField,
});

type SignInValues = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: SignInValues) => {
    // Task 014 전까지는 실제 로그인 요청을 보내지 않는다.
    console.log("[sign-in] submit", values);
  };

  return (
    <div className="flex flex-col gap-6 rounded-lg border bg-card p-6">
      <div>
        <h1 className="text-xl font-semibold">로그인</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          이메일과 비밀번호를 입력해 로그인하세요.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>이메일</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>비밀번호</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="********" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="mt-2 w-full">
            로그인
          </Button>
        </form>
      </Form>

      <Link
        href={routes.signUp()}
        className="text-center text-sm text-primary underline underline-offset-4"
      >
        계정이 없으신가요? 회원가입
      </Link>
    </div>
  );
}
