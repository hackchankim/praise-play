"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, SplitSquareHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChordChip } from "@/components/domain/chord-chip";
import { cn } from "@/lib/utils";
import { deriveCells, type EditableChordEvent, type EditableLine } from "./correction-types";

interface LineRowProps {
  line: EditableLine;
  lineIndex: number;
  canSplit: boolean;
  /** 이 줄을 나눌 박자 칸 수 — round(lineBeatsSpan)이다. 재구성 전 원본 줄은 임의의 길이일 수
   * 있고, 재구성한 카드는 항상 measuresPerLine*박자표 분자와 같다. */
  cellCount: number;
  /** 마디 경계를 표시하기 위한 박자표 분자(예: 4/4 → 4) */
  beatsPerBarCount: number;
  highlightedChordUiKey: string | null;
  onStartBeatChange: (startBeat: number) => void;
  onRemoveLine: () => void;
  onSplitHere: () => void;
  onUpdateCellText: (cellIndex: number, text: string) => void;
  onAddChordAtCell: (cellIndex: number) => void;
  onUpdateChord: (
    chordUiKey: string,
    patch: Partial<Pick<EditableChordEvent, "chord" | "needsReview">>,
  ) => void;
  onRemoveChord: (chordUiKey: string) => void;
  registerChordNode: (chordUiKey: string, node: HTMLDivElement | null) => void;
}

export function LineRow({
  line,
  lineIndex,
  canSplit,
  cellCount,
  beatsPerBarCount,
  highlightedChordUiKey,
  onStartBeatChange,
  onRemoveLine,
  onSplitHere,
  onUpdateCellText,
  onAddChordAtCell,
  onUpdateChord,
  onRemoveChord,
  registerChordNode,
}: LineRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.uiKey,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const cells = deriveCells(line, cellCount);
  const [editingCellIndex, setEditingCellIndex] = useState<number | null>(null);

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

      {/* 박자 칸 그리드 — 칸 하나 = 1박. beatsPerBarCount칸마다 굵은 경계선으로 마디를 나눠
          보여준다. 코드는 항상 칸 하나에 최대 하나만 붙는다("칸당 코드 1개"). */}
      <div className="flex min-w-0 flex-1 gap-1">
        {cells.map((cell, index) => {
          const chord = cell.chordUiKey
            ? (line.chordEvents.find((c) => c.uiKey === cell.chordUiKey) ?? null)
            : null;
          return (
            <div
              key={index}
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-1 border-l pl-1",
                index % beatsPerBarCount === 0 ? "border-border" : "border-border/30",
              )}
            >
              <span className="text-[10px] leading-none text-muted-foreground/60">
                {(index % beatsPerBarCount) + 1}
              </span>
              <BeatCellChord
                chord={chord}
                isEditing={editingCellIndex === index}
                isHighlighted={chord !== null && highlightedChordUiKey === chord.uiKey}
                onOpenEdit={() => setEditingCellIndex(index)}
                onCloseEdit={() => setEditingCellIndex(null)}
                onAdd={() => onAddChordAtCell(index)}
                onUpdate={(patch) => chord && onUpdateChord(chord.uiKey, patch)}
                onRemove={() => {
                  setEditingCellIndex(null);
                  if (chord) onRemoveChord(chord.uiKey);
                }}
                registerNode={(node) => chord && registerChordNode(chord.uiKey, node)}
              />
              <Input
                value={cell.text}
                onChange={(e) => onUpdateCellText(index, e.target.value)}
                placeholder="가사"
                className="h-7 px-1 text-xs"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex shrink-0 items-center gap-1">
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

interface BeatCellChordProps {
  chord: EditableChordEvent | null;
  isEditing: boolean;
  isHighlighted: boolean;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onAdd: () => void;
  onUpdate: (patch: Partial<Pick<EditableChordEvent, "chord" | "needsReview">>) => void;
  onRemove: () => void;
  registerNode: (node: HTMLDivElement | null) => void;
}

/** 칸 상단의 코드 슬롯 — 코드가 없으면 추가 버튼, 있으면 칩(클릭하면 수정 패널) */
function BeatCellChord({
  chord,
  isEditing,
  isHighlighted,
  onOpenEdit,
  onCloseEdit,
  onAdd,
  onUpdate,
  onRemove,
  registerNode,
}: BeatCellChordProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) return;
    const handleOutside = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) onCloseEdit();
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [isEditing, onCloseEdit]);

  if (!chord) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="flex h-6 w-fit items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
        aria-label="이 칸에 코드 추가"
      >
        <Plus className="size-3.5" />
      </button>
    );
  }

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
