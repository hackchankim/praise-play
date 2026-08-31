"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Plus, Play, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { PageHeader } from "@/components/domain/page-header";
import { routes } from "@/lib/routes";
import { setlistRepository } from "@/lib/repositories/setlist-repository";
import { songRepository } from "@/lib/repositories/song-repository";
import { arrangementRepository } from "@/lib/repositories/arrangement-repository";
import type { ArrangementWithTracks, Song } from "@/lib/song-model/types";
import { SetlistItemRow } from "./setlist-item-row";
import { AddSongDialog } from "./add-song-dialog";

type LoadStatus = "loading" | "not_found" | "error" | "ready";

interface WorkingItem {
  songId: string;
  arrangementId: string;
}

interface SetlistViewProps {
  setlistId: string;
}

export function SetlistView({ setlistId }: SetlistViewProps) {
  const router = useRouter();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [name, setName] = useState("");
  const [items, setItems] = useState<WorkingItem[]>([]);
  const [songMap, setSongMap] = useState<Map<string, Song>>(new Map());
  const [arrangementOptions, setArrangementOptions] = useState<
    Map<string, ArrangementWithTracks[]>
  >(new Map());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addingSongId, setAddingSongId] = useState<string | null>(null);
  const [loadRetryKey, setLoadRetryKey] = useState(0);

  // items의 "진짜 최신값"을 동기적으로 들고 있는 ref. 드래그 정렬 직후 바로 제거를 누르는 등
  // 리렌더가 끝나기 전에 연속으로 변형이 발생해도, 각 변형이 항상 이 ref를 기준으로 다음 상태를
  // 계산하게 해 서로의 변경을 덮어쓰지 않게 한다. 네트워크 요청도 같은 이유로 큐에 직렬화해
  // 늦게 도착한 이전 요청이 이후 요청의 결과를 되돌리지 못하게 막는다.
  const itemsRef = useRef<WorkingItem[]>([]);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  /** 서버에 마지막으로 반영된 이름. blur 시 되돌릴 기준값으로 쓴다. */
  const savedNameRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([setlistRepository.getById(setlistId), songRepository.list()])
      .then(async ([detail, { songs }]) => {
        if (cancelled) return;
        if (!detail) {
          setStatus("not_found");
          return;
        }
        savedNameRef.current = detail.setlist.name;
        setName(detail.setlist.name);
        setSongMap(new Map(songs.map((song) => [song.id, song])));
        const workingItems = detail.setlist.items.map((item) => ({
          songId: item.songId,
          arrangementId: item.arrangementId,
        }));
        itemsRef.current = workingItems;
        setItems(workingItems);

        const optionsBySong = new Map<string, ArrangementWithTracks[]>();
        await Promise.all(
          workingItems.map(async (item) => {
            optionsBySong.set(item.songId, await arrangementRepository.listBySong(item.songId));
          }),
        );
        if (cancelled) return;
        setArrangementOptions(optionsBySong);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [setlistId, loadRetryKey]);

  const mutateItems = useCallback(
    (updater: (current: WorkingItem[]) => WorkingItem[]) => {
      const previous = itemsRef.current;
      const next = updater(previous);
      itemsRef.current = next;
      setItems(next);

      persistQueueRef.current = persistQueueRef.current.then(async () => {
        try {
          await setlistRepository.updateItems(setlistId, {
            items: next.map((item, index) => ({
              songId: item.songId,
              arrangementId: item.arrangementId,
              orderIndex: index,
            })),
          });
        } catch {
          toast.error("찬양콘티 저장에 실패했습니다.");
          // 이 변형 이후 또 다른 변형이 이미 적용됐다면(itemsRef가 더 이상 next가 아니라면)
          // 되돌리지 않는다 — 되돌리면 그 사이의 최신 변경을 지워버리게 된다.
          if (itemsRef.current === next) {
            itemsRef.current = previous;
            setItems(previous);
          }
        }
      });
      return next;
    },
    [setlistId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    mutateItems((current) => {
      const oldIndex = current.findIndex((item) => item.songId === active.id);
      const newIndex = current.findIndex((item) => item.songId === over.id);
      if (oldIndex === -1 || newIndex === -1) return current;
      const reordered = [...current];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      return reordered;
    });
  };

  const handleRemove = (songId: string) => {
    mutateItems((current) => current.filter((item) => item.songId !== songId));
  };

  const handleChangeArrangement = (songId: string, arrangementId: string) => {
    mutateItems((current) =>
      current.map((item) => (item.songId === songId ? { ...item, arrangementId } : item)),
    );
  };

  const handleNameBlur = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === savedNameRef.current) {
      setName(savedNameRef.current);
      return;
    }
    try {
      const updated = await setlistRepository.updateName(setlistId, { name: trimmed });
      savedNameRef.current = updated.name;
      setName(updated.name);
    } catch {
      toast.error("찬양콘티 이름을 저장하지 못했습니다.");
      setName(savedNameRef.current);
    }
  };

  const handleAddSong = async (songId: string) => {
    setAddingSongId(songId);
    try {
      let options = arrangementOptions.get(songId);
      if (!options) {
        options = await arrangementRepository.listBySong(songId);
        setArrangementOptions((prev) => new Map(prev).set(songId, options!));
      }
      if (options.length === 0) {
        toast.error("편곡이 없는 곡입니다. 편곡 설정 페이지에서 먼저 편곡을 생성해주세요.");
        return;
      }
      const latest = [...options].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      mutateItems((current) => [...current, { songId, arrangementId: latest.id }]);
      setAddDialogOpen(false);
    } finally {
      setAddingSongId(null);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <ErrorState
        title="찬양콘티를 불러오지 못했습니다"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        onRetry={() => {
          setStatus("loading");
          setLoadRetryKey((key) => key + 1);
        }}
      />
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">찬양콘티를 찾을 수 없습니다</p>
        <p className="text-sm text-muted-foreground">찬양콘티 ID: {setlistId}</p>
        <Button onClick={() => router.push(routes.home())}>홈으로 이동</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="찬양콘티 구성"
        description="곡 순서를 정하고 예배를 시작하세요."
        action={
          <Button
            size="lg"
            onClick={() => router.push(routes.setlistPlay(setlistId))}
            disabled={items.length === 0}
          >
            <Play />
            예배 시작
          </Button>
        }
      />

      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <Label htmlFor="setlist-name">찬양콘티 이름</Label>
        <Input
          id="setlist-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">곡 목록 ({items.length}곡)</h2>
          <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus />곡 추가
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={Music2}
            title="아직 추가된 곡이 없습니다"
            description="곡을 검색해 찬양콘티에 추가해보세요."
            action={
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus />곡 추가
              </Button>
            }
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((item) => item.songId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <SetlistItemRow
                    key={item.songId}
                    songId={item.songId}
                    song={songMap.get(item.songId)}
                    arrangementId={item.arrangementId}
                    arrangementOptions={arrangementOptions.get(item.songId) ?? []}
                    index={index}
                    onChangeArrangement={(arrangementId) =>
                      handleChangeArrangement(item.songId, arrangementId)
                    }
                    onRemove={() => handleRemove(item.songId)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <AddSongDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        excludeSongIds={items.map((item) => item.songId)}
        onSelect={handleAddSong}
        addingSongId={addingSongId}
      />
    </div>
  );
}
