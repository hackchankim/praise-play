import { Skeleton } from "@/components/ui/skeleton";

// 홈 화면(Server Component)이 곡·세트리스트 목록을 페칭하는 동안 보여줄 스켈레톤.
// 실제 카드 그리드와 동일한 개수/배치로 그려 레이아웃 시프트를 최소화한다.
function CardGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function HomeLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-20" />
        <CardGridSkeleton />
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-28" />
        <CardGridSkeleton />
      </div>
    </div>
  );
}
