"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Song } from "@/lib/song-model/types";
import { GENRE_PRESET_META } from "@/app/(app)/songs/[songId]/arrangement/genre-presets";
import type { ArrangementWithTracks } from "@/lib/song-model/types";

interface SetlistItemRowProps {
  songId: string;
  song: Song | undefined;
  arrangementId: string;
  arrangementOptions: ArrangementWithTracks[];
  index: number;
  onChangeArrangement: (arrangementId: string) => void;
  onRemove: () => void;
}

export function SetlistItemRow({
  songId,
  song,
  arrangementId,
  arrangementOptions,
  index,
  onChangeArrangement,
  onRemove,
}: SetlistItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: songId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const arrangementItems = Object.fromEntries(
    arrangementOptions.map((option) => [
      option.id,
      GENRE_PRESET_META[option.genrePreset]?.label ?? option.genrePreset,
    ]),
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card p-3",
        isDragging && "z-10 opacity-70",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
        aria-label={`${index + 1}번째 곡 순서 변경`}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-6 shrink-0 text-center text-sm text-muted-foreground tabular-nums">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{song?.title ?? `알 수 없는 곡 (${songId})`}</p>
        {song && (
          <p className="text-xs text-muted-foreground">
            {song.key} · {song.tempo} BPM
          </p>
        )}
      </div>

      <Select
        items={arrangementItems}
        value={arrangementId}
        onValueChange={(value) => value && onChangeArrangement(value)}
        disabled={arrangementOptions.length === 0}
      >
        <SelectTrigger size="sm" aria-label="사용할 편곡">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {arrangementOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {GENRE_PRESET_META[option.genrePreset]?.label ?? option.genrePreset}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label={`${song?.title ?? songId} 제거`}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
