import Link from "next/link";
import { Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteSongButton } from "@/components/domain/delete-song-button";
import type { Song } from "@/lib/song-model/types";

const STATUS_LABEL: Record<Song["status"], string> = {
  draft: "임시저장",
  extracted: "추출완료",
  corrected: "교정완료",
};

const STATUS_VARIANT: Record<Song["status"], "outline" | "secondary" | "default"> = {
  draft: "outline",
  extracted: "secondary",
  corrected: "default",
};

interface SongCardProps {
  song: Pick<Song, "id" | "title" | "status" | "key" | "tempo">;
  href: string;
}

// 삭제 버튼을 두려고 카드를 <Link>로 감싸는 대신, 카드 전체를 덮는 절대 위치 <Link>를 깔고
// 그 위에 콘텐츠·삭제 버튼을 올리는 패턴을 쓴다 — <a> 안에 <button>을 중첩하면 무효한
// 마크업이 되기 때문(이전 버전의 주석에서 예고한 전환). 콘텐츠 쪽에 z-index만 주고
// pointer-events는 그대로 두면 CardHeader/CardContent의 넓은 히트박스가 클릭을 전부
// 가로채 밑에 깔린 Link가 죽는다(카드 제목을 클릭해도 이동하지 않는 버그로 실제 확인) —
// 그래서 콘텐츠 쪽을 통째로 pointer-events-none으로 "투명"하게 만들어 클릭이 Link까지
// 그대로 통과하게 하고, 실제로 클릭받아야 하는 삭제 버튼에만 pointer-events-auto로 다시
// 켜준다.
export function SongCard({ song, href }: SongCardProps) {
  return (
    <Card className="relative transition-colors hover:border-primary/50">
      <Link href={href} className="absolute inset-0" aria-label={song.title} />
      <CardHeader className="pointer-events-none relative flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Music2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">{song.title}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={STATUS_VARIANT[song.status]}>{STATUS_LABEL[song.status]}</Badge>
          <DeleteSongButton
            songId={song.id}
            songTitle={song.title}
            className="pointer-events-auto"
          />
        </div>
      </CardHeader>
      <CardContent className="pointer-events-none relative text-sm text-muted-foreground">
        {song.key} · {song.tempo} BPM
      </CardContent>
    </Card>
  );
}
