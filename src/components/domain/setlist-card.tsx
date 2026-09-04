import Link from "next/link";
import { ListMusic } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteSetlistButton } from "@/components/domain/delete-setlist-button";
import type { Setlist } from "@/lib/song-model/types";

interface SetlistCardProps {
  setlist: Pick<Setlist, "id" | "name">;
  songCount: number;
  href: string;
}

// song-card.tsx와 같은 이유·같은 패턴(카드를 덮는 절대 위치 <Link> + 콘텐츠는
// pointer-events-none으로 투명하게, 삭제 버튼만 pointer-events-auto로 다시 켬)으로
// 삭제 버튼을 추가한다.
export function SetlistCard({ setlist, songCount, href }: SetlistCardProps) {
  return (
    <Card className="relative transition-colors hover:border-primary/50">
      <Link href={href} className="absolute inset-0" aria-label={setlist.name} />
      <CardHeader className="pointer-events-none relative flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <ListMusic className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">{setlist.name}</CardTitle>
        </div>
        <DeleteSetlistButton
          setlistId={setlist.id}
          setlistName={setlist.name}
          className="pointer-events-auto"
        />
      </CardHeader>
      <CardContent className="pointer-events-none relative text-sm text-muted-foreground">
        {songCount}곡
      </CardContent>
    </Card>
  );
}
