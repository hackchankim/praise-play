import Link from "next/link";
import { Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  song: Pick<Song, "title" | "status" | "key" | "tempo">;
  href: string;
}

// 카드 전체를 <Link>로 감싼다. 카드 내부에 버튼 등 인터랙티브 요소를 추가할 경우
// <a> 안에 <button>이 중첩되어 무효한 마크업이 되므로, 그때는 onClick/role 기반
// 카드 패턴으로 전환할 것.
export function SongCard({ song, href }: SongCardProps) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/50">
        <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <Music2 className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">{song.title}</CardTitle>
          </div>
          <Badge variant={STATUS_VARIANT[song.status]}>{STATUS_LABEL[song.status]}</Badge>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {song.key} · {song.tempo} BPM
        </CardContent>
      </Card>
    </Link>
  );
}
