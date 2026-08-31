import Link from "next/link";
import { ListMusic } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Setlist } from "@/lib/song-model/types";

interface SetlistCardProps {
  setlist: Pick<Setlist, "name">;
  songCount: number;
  href: string;
}

// 카드 전체를 <Link>로 감싼다. 카드 내부에 버튼 등 인터랙티브 요소를 추가할 경우
// <a> 안에 <button>이 중첩되어 무효한 마크업이 되므로, 그때는 onClick/role 기반
// 카드 패턴으로 전환할 것.
export function SetlistCard({ setlist, songCount, href }: SetlistCardProps) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/50">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <ListMusic className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">{setlist.name}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{songCount}곡</CardContent>
      </Card>
    </Link>
  );
}
