import Link from "next/link";
import { ListMusic } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Setlist } from "@/lib/song-model/types";

interface SetlistCardProps {
  setlist: Pick<Setlist, "name">;
  songCount: number;
  href: string;
}

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
