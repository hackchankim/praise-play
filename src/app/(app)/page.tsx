import Link from "next/link";
import { Music2, ListMusic } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { SongCard } from "@/components/domain/song-card";
import { SetlistCard } from "@/components/domain/setlist-card";
import { songRepository } from "@/lib/repositories/song-repository";
import { setlistRepository } from "@/lib/repositories/setlist-repository";

export default async function HomePage() {
  const [{ songs }, { setlists }] = await Promise.all([
    songRepository.list(),
    setlistRepository.list(),
  ]);

  // 목록 화면에는 찬양콘티별 곡 수가 필요하지만 ListSetlistsResponse 계약에는 포함되지 않는다.
  // 찬양콘티 개수가 많지 않은 MVP 단계라 각 찬양콘티를 getById로 다시 조회해 items.length를 구한다.
  const setlistsWithCount = await Promise.all(
    setlists.map(async (setlist) => {
      const detail = await setlistRepository.getById(setlist.id);
      return { setlist, songCount: detail?.setlist.items.length ?? 0 };
    }),
  );

  // "새 찬양콘티 만들기" 플로우 자체(생성 폼)는 Task 010 소관이라 이 Task에서는 아직 없다.
  // 기존 찬양콘티로 보내면 "새로 만들었다고 생각했는데 실은 기존 데이터"라는 혼란을 줄 수 있어,
  // 항상 고정된 예시 id로 이동시켜 "지금은 데모 이동만 가능하다"는 걸 분명히 한다.
  const newSetlistHref = routes.setlist("demo");

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <PageHeader
        title="홈"
        description="저장된 곡과 찬양콘티를 관리하세요."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={routes.songsUpload()} className={cn(buttonVariants())}>
              악보 업로드
            </Link>
            <Link href={newSetlistHref} className={cn(buttonVariants({ variant: "outline" }))}>
              새 찬양콘티 만들기
            </Link>
          </div>
        }
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">내 곡</h2>
        {songs.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {songs.map((song) => (
              <SongCard key={song.id} song={song} href={routes.songArrangement(song.id)} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Music2}
            title="저장된 곡이 없습니다"
            description="악보를 업로드해 첫 곡을 추가해보세요."
            action={
              <Link href={routes.songsUpload()} className={cn(buttonVariants())}>
                악보 업로드
              </Link>
            }
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">찬양콘티</h2>
        {setlistsWithCount.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {setlistsWithCount.map(({ setlist, songCount }) => (
              <SetlistCard
                key={setlist.id}
                setlist={setlist}
                songCount={songCount}
                href={routes.setlist(setlist.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ListMusic}
            title="찬양콘티가 없습니다"
            description="새 찬양콘티를 만들어 곡을 구성해보세요."
            action={
              <Link href={newSetlistHref} className={cn(buttonVariants())}>
                새 찬양콘티 만들기
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
