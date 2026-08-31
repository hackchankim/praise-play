"use client";

import { useEffect, useMemo, useState } from "react";
import { Music2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/domain/empty-state";
import { songRepository } from "@/lib/repositories/song-repository";
import type { Song } from "@/lib/song-model/types";

const STATUS_LABEL: Record<Song["status"], string> = {
  draft: "임시저장",
  extracted: "추출완료",
  corrected: "교정완료",
};

interface AddSongDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeSongIds: string[];
  onSelect: (songId: string) => void;
  addingSongId: string | null;
}

export function AddSongDialog({
  open,
  onOpenChange,
  excludeSongIds,
  onSelect,
  addingSongId,
}: AddSongDialogProps) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    songRepository.list().then(({ songs: list }) => {
      if (!cancelled) setSongs(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const excluded = new Set(excludeSongIds);
    return songs
      .filter((song) => !excluded.has(song.id))
      .filter((song) => song.title.toLowerCase().includes(query.trim().toLowerCase()));
  }, [songs, excludeSongIds, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>곡 추가</DialogTitle>
          <DialogDescription>찬양콘티에 추가할 곡을 검색하세요.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="곡 제목 검색"
            className="pl-8"
            autoFocus
          />
        </div>

        <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {filtered.length === 0 && (
            <EmptyState
              icon={Music2}
              title="추가할 곡이 없습니다"
              description="검색어를 바꾸거나 새 곡을 업로드해보세요."
              className="border-none p-6"
            />
          )}
          {filtered.map((song) => (
            <button
              key={song.id}
              type="button"
              onClick={() => onSelect(song.id)}
              disabled={addingSongId === song.id}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{song.title}</p>
                <p className="text-xs text-muted-foreground">
                  {song.key} · {song.tempo} BPM
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                {addingSongId === song.id ? "추가 중..." : STATUS_LABEL[song.status]}
              </Badge>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
