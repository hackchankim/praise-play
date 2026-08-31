"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Music2, Play, Repeat, SkipForward, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import { ErrorState } from "@/components/domain/error-state";
import { SectionBadge } from "@/components/domain/section-badge";
import { ChordChip } from "@/components/domain/chord-chip";
import { SongCard } from "@/components/domain/song-card";
import { SetlistCard } from "@/components/domain/setlist-card";

import { SECTION_TYPES, INSTRUMENTS, type SongStatus } from "@/lib/song-model/types";

const BUTTON_VARIANTS = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
] as const;
const SONG_STATUSES: SongStatus[] = ["draft", "extracted", "corrected"];

const gallerySongFormSchema = z.object({
  title: z.string().min(1, "곡 제목을 입력하세요."),
});

function GallerySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-4 rounded-lg border p-5">{children}</div>
    </section>
  );
}

function SongTitleForm() {
  const form = useForm<z.infer<typeof gallerySongFormSchema>>({
    resolver: zodResolver(gallerySongFormSchema),
    defaultValues: { title: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(() => toast.success("저장되었습니다."))}
        className="flex max-w-sm flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>곡 제목</FormLabel>
              <FormControl>
                <Input placeholder="예: 나 무엇과 주 바꾸리" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-fit">
          저장
        </Button>
      </form>
    </Form>
  );
}

export default function ComponentGalleryPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Dialog/Select/DropdownMenu 등은 document.body에 Portal로 렌더링되므로, 이 페이지 안에서만
  // 클래스를 적용하는 방식으로는 팝업 콘텐츠까지 테마가 반영되지 않는다. 대신 html 요소 자체의
  // 클래스를 토글해 팝업까지 포함한 전체를 검증한다. 페이지를 벗어나면 앱 기본값(dark)으로 되돌린다.
  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="컴포넌트 갤러리"
          description="Task 005 디자인 시스템 검증용 내부 페이지. 프로덕션 라우트에 노출되지 않음."
        />
        <div className="flex gap-2">
          <Button
            variant={theme === "dark" ? "default" : "outline"}
            onClick={() => setTheme("dark")}
          >
            다크
          </Button>
          <Button
            variant={theme === "light" ? "default" : "outline"}
            onClick={() => setTheme("light")}
          >
            라이트
          </Button>
        </div>
      </div>

      <GallerySection title="Button">
        <div className="flex flex-col gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-xs text-muted-foreground">{variant}</span>
              <Button variant={variant} size="xs">
                xs
              </Button>
              <Button variant={variant} size="sm">
                sm
              </Button>
              <Button variant={variant}>default</Button>
              <Button variant={variant} size="lg">
                lg
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <span className="text-xs text-muted-foreground">
            실시간 재생용 대형 터치 타깃 (최소 64px, Task 011에서 사용)
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="playback">
              <Play />
              다음 섹션
            </Button>
            <Button size="playback" variant="secondary">
              <Repeat />
              구간 반복
            </Button>
            <Button size="playback" variant="outline">
              <SkipForward />
              다음 곡
            </Button>
            <Button size="playback-icon" variant="ghost" aria-label="설정">
              <Settings />
            </Button>
          </div>
        </div>
      </GallerySection>

      <GallerySection title="Badge / SectionBadge">
        <div className="flex flex-wrap gap-2">
          <Badge>default</Badge>
          <Badge variant="secondary">secondary</Badge>
          <Badge variant="outline">outline</Badge>
          <Badge variant="destructive">destructive</Badge>
          <Badge variant="ghost">ghost</Badge>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {SECTION_TYPES.map((type) => (
            <SectionBadge key={type} type={type} />
          ))}
          <SectionBadge type="verse" label="2절" />
        </div>
      </GallerySection>

      <GallerySection title="ChordChip">
        <div className="flex flex-wrap items-center gap-2">
          <ChordChip chord="G" />
          <ChordChip chord="Cmaj7" />
          <ChordChip chord="D/F#" />
          <ChordChip chord="X?" needsReview />
        </div>
      </GallerySection>

      <GallerySection title="Card / SongCard / SetlistCard">
        <div className="grid gap-3 sm:grid-cols-2">
          {SONG_STATUSES.map((status) => (
            <SongCard
              key={status}
              song={{ title: "나 무엇과 주 바꾸리", status, key: "G", tempo: 76 }}
              href="#"
            />
          ))}
          <SetlistCard setlist={{ name: "주일 1부 예배" }} songCount={4} href="#" />
        </div>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>기본 Card</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            CardHeader/CardContent 조합 예시
          </CardContent>
        </Card>
      </GallerySection>

      <GallerySection title="Input / Select">
        <div className="flex max-w-sm flex-col gap-3">
          <Input placeholder="곡 제목" />
          <Select defaultValue="piano">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSTRUMENTS.map((instrument) => (
                <SelectItem key={instrument} value={instrument}>
                  {instrument}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </GallerySection>

      <GallerySection title="Tabs">
        <Tabs defaultValue="verse1" className="max-w-sm">
          <TabsList>
            <TabsTrigger value="verse1">1절</TabsTrigger>
            <TabsTrigger value="chorus">후렴</TabsTrigger>
            <TabsTrigger value="bridge">브릿지</TabsTrigger>
          </TabsList>
          <TabsContent value="verse1">1절 가사·코드 편집 영역</TabsContent>
          <TabsContent value="chorus">후렴 가사·코드 편집 영역</TabsContent>
          <TabsContent value="bridge">브릿지 가사·코드 편집 영역</TabsContent>
        </Tabs>
      </GallerySection>

      <GallerySection title="Progress / Skeleton">
        <div className="flex max-w-sm flex-col gap-4">
          <Progress value={60} />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </GallerySection>

      <GallerySection title="Dialog / Sheet / DropdownMenu / Tooltip">
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>다이얼로그 열기</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>세트리스트 삭제</DialogTitle>
                <DialogDescription>이 작업은 되돌릴 수 없습니다.</DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton>
                <Button variant="destructive">삭제</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger render={<Button variant="outline" />}>시트 열기</SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>섹션 점프</SheetTitle>
                <SheetDescription>이동할 섹션을 선택하세요.</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              메뉴 열기
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>곡 옵션</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>편곡 재생성</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">삭제</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" size="icon" />}>
              <Music2 />
            </TooltipTrigger>
            <TooltipContent>편곡 미리듣기</TooltipContent>
          </Tooltip>

          <Button variant="outline" onClick={() => toast.success("저장되었습니다.")}>
            토스트 표시
          </Button>
        </div>
      </GallerySection>

      <GallerySection title="EmptyState / LoadingState / ErrorState">
        <div className="grid gap-4 sm:grid-cols-3">
          <EmptyState title="곡이 없습니다" description="악보를 업로드해보세요." />
          <LoadingState />
          <ErrorState description="다시 시도해주세요." onRetry={() => {}} />
        </div>
      </GallerySection>

      <GallerySection title="Form (React Hook Form + Zod)">
        <SongTitleForm />
      </GallerySection>
    </div>
  );
}
