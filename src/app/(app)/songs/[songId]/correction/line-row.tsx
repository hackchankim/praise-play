"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, SplitSquareHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChordChip } from "@/components/domain/chord-chip";
import { cn } from "@/lib/utils";
import type { EditableChordEvent, EditableLine } from "./correction-types";

// 가사 문자 오프셋과 코드 칩의 좌표를 일치시키기 위해 코드 행과 가사 입력 모두 같은
// 모노스페이스 폰트/크기/좌측 패딩을 쓴다. charOffset은 이 폰트 기준 "ch" 단위로 그대로 위치가 된다.
const ROW_FONT_CLASS = "font-mono text-sm";
const ROW_PADDING_PX = 10;
const DRAG_THRESHOLD_PX = 3;

interface LineRowProps {
  line: EditableLine;
  lineIndex: number;
  canSplit: boolean;
  charWidthPx: number;
  highlightedChordUiKey: string | null;
  onLyricsChange: (lyrics: string) => void;
  onStartBeatChange: (startBeat: number) => void;
  onRemoveLine: () => void;
  onSplitHere: () => void;
  onAddChord: (charOffset: number) => void;
  onUpdateChord: (
    chordUiKey: string,
    patch: Partial<Pick<EditableChordEvent, "chord" | "charOffset" | "beatOffset" | "needsReview">>,
  ) => void;
  onRemoveChord: (chordUiKey: string) => void;
  registerChordNode: (chordUiKey: string, node: HTMLDivElement | null) => void;
}

export function LineRow({
  line,
  lineIndex,
  canSplit,
  charWidthPx,
  highlightedChordUiKey,
  onLyricsChange,
  onStartBeatChange,
  onRemoveLine,
  onSplitHere,
  onAddChord,
  onUpdateChord,
  onRemoveChord,
  registerChordNode,
}: LineRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.uiKey,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const rowRef = useRef<HTMLDivElement>(null);
  const [editingChordUiKey, setEditingChordUiKey] = useState<string | null>(null);

  const handleRowClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target !== rowRef.current) return;
      const rect = rowRef.current.getBoundingClientRect();
      const clickX = event.clientX - rect.left - ROW_PADDING_PX;
      const offset = Math.round(clickX / charWidthPx);
      onAddChord(Math.max(0, Math.min(offset, line.lyrics.length)));
    },
    [charWidthPx, line.lyrics.length, onAddChord],
  );

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

      <div className="min-w-0 flex-1">
        {/* 코드 칩 행 — 가사 입력 위에 겹쳐 표시되며, 빈 공간을 클릭하면 그 위치에 코드가 추가된다 */}
        <div
          ref={rowRef}
          onClick={handleRowClick}
          className={cn(ROW_FONT_CLASS, "relative h-7 cursor-text leading-7 select-none")}
          style={{ paddingLeft: ROW_PADDING_PX }}
        >
          {line.chordEvents.map((chord) => (
            <ChordChipHandle
              key={chord.uiKey}
              chord={chord}
              charWidthPx={charWidthPx}
              lyricsLength={line.lyrics.length}
              isEditing={editingChordUiKey === chord.uiKey}
              isHighlighted={highlightedChordUiKey === chord.uiKey}
              onOpenEdit={() => setEditingChordUiKey(chord.uiKey)}
              onCloseEdit={() => setEditingChordUiKey(null)}
              onMove={(charOffset) => onUpdateChord(chord.uiKey, { charOffset })}
              onUpdate={(patch) => onUpdateChord(chord.uiKey, patch)}
              onRemove={() => {
                setEditingChordUiKey(null);
                onRemoveChord(chord.uiKey);
              }}
              registerNode={(node) => registerChordNode(chord.uiKey, node)}
            />
          ))}
          {line.chordEvents.length === 0 && (
            <span className="pointer-events-none text-xs text-muted-foreground/70">
              클릭해서 코드 추가
            </span>
          )}
        </div>

        <Input
          value={line.lyrics}
          onChange={(e) => onLyricsChange(e.target.value)}
          placeholder="가사를 입력하세요"
          className={cn(ROW_FONT_CLASS, "px-0")}
          style={{ paddingLeft: ROW_PADDING_PX }}
        />
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

interface ChordChipHandleProps {
  chord: EditableChordEvent;
  charWidthPx: number;
  lyricsLength: number;
  isEditing: boolean;
  isHighlighted: boolean;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onMove: (charOffset: number) => void;
  onUpdate: (
    patch: Partial<Pick<EditableChordEvent, "chord" | "beatOffset" | "needsReview">>,
  ) => void;
  onRemove: () => void;
  registerNode: (node: HTMLDivElement | null) => void;
}

function ChordChipHandle({
  chord,
  charWidthPx,
  lyricsLength,
  isEditing,
  isHighlighted,
  onOpenEdit,
  onCloseEdit,
  onMove,
  onUpdate,
  onRemove,
  registerNode,
}: ChordChipHandleProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      draggedRef.current = false;
      const startX = event.clientX;
      const startOffset = chord.charOffset;

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaPx = moveEvent.clientX - startX;
        if (Math.abs(deltaPx) > DRAG_THRESHOLD_PX) draggedRef.current = true;
        const deltaChars = Math.round(deltaPx / charWidthPx);
        const next = Math.max(0, Math.min(startOffset + deltaChars, lyricsLength));
        onMove(next);
      };
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        if (!draggedRef.current) onOpenEdit();
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [chord.charOffset, charWidthPx, lyricsLength, onMove, onOpenEdit],
  );

  // 바깥을 클릭하면 편집 패널을 닫는다.
  useEffect(() => {
    if (!isEditing) return;
    const handleOutside = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        onCloseEdit();
      }
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
      className="absolute top-0 -translate-x-1/2"
      style={{ left: `${chord.charOffset}ch` }}
    >
      <div
        onPointerDown={handlePointerDown}
        onClick={(event) => {
          // 드래그를 마친 뒤 브라우저가 합성하는 click 이벤트가 줄 컨테이너의
          // "빈 공간 클릭 시 코드 추가" 핸들러(handleRowClick)까지 버블링되면
          // 이동한 칩과 별개로 새 칩이 같은 위치에 추가되어 데이터가 중복된다.
          event.stopPropagation();
        }}
        className={cn(
          "cursor-grab touch-none active:cursor-grabbing",
          isHighlighted && "animate-pulse rounded-md ring-2 ring-primary ring-offset-1",
        )}
      >
        <ChordChip chord={chord.chord} needsReview={chord.needsReview} />
      </div>

      {isEditing && (
        // 칩(≈21px)보다 훨씬 넓은 패널(w-36)을 가운데 정렬하면 charOffset이 0에 가까운 칩에서는
        // 패널이 줄 왼쪽 바깥으로 넘어가 잘려 보인다. 칩의 왼쪽 끝에 맞춰 펼치는 편이 안전하다.
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
            줄 내 박자 위치
            <Input
              type="number"
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
