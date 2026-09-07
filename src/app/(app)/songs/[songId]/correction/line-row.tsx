"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, SplitSquareHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChordChip } from "@/components/domain/chord-chip";
import { cn } from "@/lib/utils";
import type { EditableChordEvent, EditableLine } from "./correction-types";

interface LineRowProps {
  line: EditableLine;
  lineIndex: number;
  canSplit: boolean;
  highlightedChordUiKey: string | null;
  onStartBeatChange: (startBeat: number) => void;
  onRemoveLine: () => void;
  onSplitHere: () => void;
  onUpdateLyrics: (lyrics: string) => void;
  onAddChord: () => void;
  onUpdateChord: (
    chordUiKey: string,
    patch: Partial<Pick<EditableChordEvent, "chord" | "beatOffset" | "needsReview">>,
  ) => void;
  onRemoveChord: (chordUiKey: string) => void;
  registerChordNode: (chordUiKey: string, node: HTMLDivElement | null) => void;
}

export function LineRow({
  line,
  lineIndex,
  canSplit,
  highlightedChordUiKey,
  onStartBeatChange,
  onRemoveLine,
  onSplitHere,
  onUpdateLyrics,
  onAddChord,
  onUpdateChord,
  onRemoveChord,
  registerChordNode,
}: LineRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.uiKey,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const [editingChordUiKey, setEditingChordUiKey] = useState<string | null>(null);

  // 코드는 항상 beatOffset(실제 시간 순서) 기준으로 나열한다 — 가사 글자 위치(charOffset)에
  // 맞춰 코드 칩을 배치·정렬하려는 시도는 Task 032 3단계로 완전히 그만뒀다(실사용 피드백 —
  // 글자 단위 매핑이 실사용에서 거의 항상 신뢰할 수 없었다). 가사는 이 줄(보통 마디 하나)
  // 전체를 자유 편집 텍스트 하나로 다룬다.
  const orderedChords = [...line.chordEvents].sort((a, b) => a.beatOffset - b.beatOffset);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-1.5 rounded-md border border-transparent px-1 py-1 hover:border-border",
        isDragging && "z-10 border-border bg-card opacity-70",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-7 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
        aria-label={`${lineIndex + 1}번째 줄 순서 변경`}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {orderedChords.map((chord) => (
            <ChordChipEditor
              key={chord.uiKey}
              chord={chord}
              isEditing={editingChordUiKey === chord.uiKey}
              isHighlighted={highlightedChordUiKey === chord.uiKey}
              onOpenEdit={() => setEditingChordUiKey(chord.uiKey)}
              onCloseEdit={() => setEditingChordUiKey(null)}
              onUpdate={(patch) => onUpdateChord(chord.uiKey, patch)}
              onRemove={() => {
                setEditingChordUiKey(null);
                onRemoveChord(chord.uiKey);
              }}
              registerNode={(node) => registerChordNode(chord.uiKey, node)}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onAddChord}
            aria-label="코드 추가"
            title="코드 추가"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <Input
          value={line.lyrics}
          onChange={(e) => onUpdateLyrics(e.target.value)}
          placeholder="가사"
          className="h-8 text-sm"
        />
      </div>

      <div className="mt-1 flex shrink-0 items-center gap-1">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="hidden sm:inline">시작박자</span>
          <Input
            type="number"
            value={line.startBeat}
            onChange={(e) => onStartBeatChange(Number(e.target.value) || 0)}
            className="h-7 w-14 px-1.5 text-xs"
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onSplitHere}
          disabled={!canSplit}
          aria-label="이 줄부터 새 섹션으로 분할"
          title="이 줄부터 새 섹션으로 분할"
        >
          <SplitSquareHorizontal />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemoveLine}
          aria-label="줄 삭제"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

interface ChordChipEditorProps {
  chord: EditableChordEvent;
  isEditing: boolean;
  isHighlighted: boolean;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onUpdate: (
    patch: Partial<Pick<EditableChordEvent, "chord" | "beatOffset" | "needsReview">>,
  ) => void;
  onRemove: () => void;
  registerNode: (node: HTMLDivElement | null) => void;
}

/** 코드 칩 — 클릭하면 코드 기호·박자·검토 필요 여부를 고치는 수정 패널이 뜬다. */
function ChordChipEditor({
  chord,
  isEditing,
  isHighlighted,
  onOpenEdit,
  onCloseEdit,
  onUpdate,
  onRemove,
  registerNode,
}: ChordChipEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) return;
    const handleOutside = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) onCloseEdit();
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [isEditing, onCloseEdit]);

  return (
    <div
      ref={(node) => {
        wrapperRef.current = node;
        registerNode(node);
      }}
      className="relative w-fit"
    >
      <button
        type="button"
        onClick={onOpenEdit}
        className={cn(
          isHighlighted && "animate-pulse rounded-md ring-2 ring-primary ring-offset-1",
        )}
      >
        <ChordChip chord={chord.chord} needsReview={chord.needsReview} />
      </button>
      {isEditing && (
        <div className="absolute top-full left-0 z-20 mt-1 flex w-36 flex-col gap-1.5 rounded-lg border bg-popover p-2 text-popover-foreground shadow-md">
          <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            코드 기호
            <Input
              autoFocus
              value={chord.chord}
              onChange={(e) => onUpdate({ chord: e.target.value })}
              className="h-7 text-xs"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            박자(줄 시작 기준)
            <Input
              type="number"
              step="0.5"
              value={chord.beatOffset}
              onChange={(e) => onUpdate({ beatOffset: Number(e.target.value) || 0 })}
              className="h-7 text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={chord.needsReview}
              onChange={(e) => onUpdate({ needsReview: e.target.checked })}
              className="size-3.5"
            />
            검토 필요
          </label>
          <div className="flex justify-between gap-1 pt-0.5">
            <Button type="button" variant="destructive" size="xs" onClick={onRemove}>
              삭제
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={onCloseEdit}>
              닫기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
