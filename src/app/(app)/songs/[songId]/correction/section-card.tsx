"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Combine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionBadge } from "@/components/domain/section-badge";
import { LineRow } from "./line-row";
import {
  SECTION_TYPE_OPTIONS,
  type EditableChordEvent,
  type EditableSection,
} from "./correction-types";
import type { SectionType } from "@/lib/song-model/types";

const NO_REPEAT_VALUE = "__none__";

// base-ui Select.Value는 items(맵)이 없으면 선택된 항목의 라벨 대신 원시 value를 그대로 보여준다
// (예: "verse" 대신 "절"이 아니라 "verse"가 표시됨). items를 넘겨 라벨이 제대로 뜨게 한다.
const sectionTypeItems = Object.fromEntries(
  SECTION_TYPE_OPTIONS.map((option) => [option.type, option.label]),
);

interface RepeatOption {
  clientKey: string;
  label: string;
}

interface SectionCardProps {
  section: EditableSection;
  displayLabel: string;
  startBeat: number;
  repeatOptions: RepeatOption[];
  canMergeNext: boolean;
  charWidthPx: number;
  highlightedChordUiKey: string | null;
  onChangeType: (type: SectionType) => void;
  onChangeLengthBeats: (lengthBeats: number) => void;
  onChangeRepeatTarget: (repeatTarget: string | null) => void;
  onMergeNext: () => void;
  onAddLine: () => void;
  onRemoveLine: (lineUiKey: string) => void;
  onReorderLines: (activeUiKey: string, overUiKey: string) => void;
  onSplitAt: (lineIndex: number) => void;
  onLyricsChange: (lineUiKey: string, lyrics: string) => void;
  onLineStartBeatChange: (lineUiKey: string, startBeat: number) => void;
  onAddChord: (lineUiKey: string, charOffset: number) => void;
  onUpdateChord: (
    lineUiKey: string,
    chordUiKey: string,
    patch: Partial<Pick<EditableChordEvent, "chord" | "charOffset" | "beatOffset" | "needsReview">>,
  ) => void;
  onRemoveChord: (lineUiKey: string, chordUiKey: string) => void;
  registerChordNode: (chordUiKey: string, node: HTMLDivElement | null) => void;
}

export function SectionCard({
  section,
  displayLabel,
  startBeat,
  repeatOptions,
  canMergeNext,
  charWidthPx,
  highlightedChordUiKey,
  onChangeType,
  onChangeLengthBeats,
  onChangeRepeatTarget,
  onMergeNext,
  onAddLine,
  onRemoveLine,
  onReorderLines,
  onSplitAt,
  onLyricsChange,
  onLineStartBeatChange,
  onAddChord,
  onUpdateChord,
  onRemoveChord,
  registerChordNode,
}: SectionCardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorderLines(String(active.id), String(over.id));
  };

  const repeatTargetItems = {
    [NO_REPEAT_VALUE]: "없음",
    ...Object.fromEntries(repeatOptions.map((option) => [option.clientKey, option.label])),
  };

  return (
    <section
      id={`section-${section.clientKey}`}
      className="flex flex-col gap-3 rounded-lg border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SectionBadge type={section.type} label={displayLabel} />
        <span className="text-xs text-muted-foreground">
          시작 {startBeat}박 · 총 {section.lengthBeats}박
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            items={sectionTypeItems}
            value={section.type}
            onValueChange={(value) => onChangeType(value as SectionType)}
          >
            <SelectTrigger size="sm" aria-label="섹션 타입">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SECTION_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.type} value={option.type}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            길이(박)
            <Input
              type="number"
              min={1}
              value={section.lengthBeats}
              onChange={(e) => onChangeLengthBeats(Math.max(1, Number(e.target.value) || 1))}
              className="h-7 w-16 px-1.5 text-xs"
            />
          </label>

          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            반복
            <Select
              items={repeatTargetItems}
              value={section.repeatTarget ?? NO_REPEAT_VALUE}
              onValueChange={(value) =>
                onChangeRepeatTarget(value === NO_REPEAT_VALUE ? null : value)
              }
            >
              <SelectTrigger size="sm" aria-label="반복 대상 섹션">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_REPEAT_VALUE}>없음</SelectItem>
                {repeatOptions.map((option) => (
                  <SelectItem key={option.clientKey} value={option.clientKey}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onMergeNext}
            disabled={!canMergeNext}
            title="다음 섹션과 병합"
          >
            <Combine />
            병합
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={section.lines.map((line) => line.uiKey)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-0.5">
            {section.lines.map((line, lineIndex) => (
              <LineRow
                key={line.uiKey}
                line={line}
                lineIndex={lineIndex}
                canSplit={lineIndex > 0}
                charWidthPx={charWidthPx}
                highlightedChordUiKey={highlightedChordUiKey}
                onLyricsChange={(lyrics) => onLyricsChange(line.uiKey, lyrics)}
                onStartBeatChange={(startBeatValue) =>
                  onLineStartBeatChange(line.uiKey, startBeatValue)
                }
                onRemoveLine={() => onRemoveLine(line.uiKey)}
                onSplitHere={() => onSplitAt(lineIndex)}
                onAddChord={(charOffset) => onAddChord(line.uiKey, charOffset)}
                onUpdateChord={(chordUiKey, patch) => onUpdateChord(line.uiKey, chordUiKey, patch)}
                onRemoveChord={(chordUiKey) => onRemoveChord(line.uiKey, chordUiKey)}
                registerChordNode={registerChordNode}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button type="button" variant="ghost" size="sm" onClick={onAddLine} className="w-fit">
        <Plus />줄 추가
      </Button>
    </section>
  );
}
