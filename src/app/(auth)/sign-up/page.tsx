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

// 실제 회원가입 연동은 Task 014(Clerk)에서 이뤄진다. 여기서는 클라이언트 측 검증만 동작한다.
const signUpSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요."),
  email: emailField,
  password: passwordField,
});

type SignUpValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = (values: SignUpValues) => {
    // Task 014 전까지는 실제 가입 요청을 보내지 않는다.
    console.log("[sign-up] submit", values);
  };

  return (
    <div className="flex flex-col gap-6 rounded-lg border bg-card p-6">
      <div>
        <h1 className="text-xl font-semibold">회원가입</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          이름, 이메일, 비밀번호를 입력해 가입하세요.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>이름</FormLabel>
                <FormControl>
                  <Input placeholder="홍길동" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
            가입하기
          </Button>
        </form>
      </Form>

      <Link
        href={routes.signIn()}
        className="text-center text-sm text-primary underline underline-offset-4"
      >
        이미 계정이 있으신가요? 로그인
      </Link>
    </div>
  );
}
