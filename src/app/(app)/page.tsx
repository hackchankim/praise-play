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
import { NewSetlistButton } from "@/components/domain/new-setlist-button";

export default async function HomePage() {
  const [{ songs }, { setlists }] = await Promise.all([
    songRepository.list(),
    setlistRepository.list(),
  ]);

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
            <NewSetlistButton variant="outline">새 찬양콘티 만들기</NewSetlistButton>
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

      <section id="setlists" className="flex flex-col gap-4 scroll-mt-20">
        <h2 className="text-lg font-semibold">찬양콘티</h2>
        {setlists.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {setlists.map((setlist) => (
              <SetlistCard
                key={setlist.id}
                setlist={setlist}
                songCount={setlist.itemCount}
                href={routes.setlist(setlist.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ListMusic}
            title="찬양콘티가 없습니다"
            description="새 찬양콘티를 만들어 곡을 구성해보세요."
            action={<NewSetlistButton>새 찬양콘티 만들기</NewSetlistButton>}
          />
        )}
      </section>
    </div>
  );
}
