"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setlistRepository } from "@/lib/repositories/setlist-repository";
import { MOCK_USER } from "@/lib/song-model/mock-songs";
import type { Setlist } from "@/lib/song-model/types";

const NEW_SETLIST_VALUE = "__new__";

interface AddToSetlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string;
  arrangementId: string;
  /** 완료 후 이동할 세트리스트 id를 전달한다 */
  onAdded: (setlistId: string) => void;
}

export function AddToSetlistDialog({
  open,
  onOpenChange,
  songId,
  arrangementId,
  onAdded,
}: AddToSetlistDialogProps) {
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [selected, setSelected] = useState<string>(NEW_SETLIST_VALUE);
  const [newName, setNewName] = useState("새 찬양콘티");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setlistRepository
      .list()
      .then(({ setlists: list }) => {
        if (cancelled) return;
        setSetlists(list);
        setSelected(list.length > 0 ? list[0].id : NEW_SETLIST_VALUE);
      })
      .catch(() => {
        if (!cancelled) toast.error("찬양콘티 목록을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const setlistId =
        selected === NEW_SETLIST_VALUE
          ? (
              await setlistRepository.create(
                { name: newName.trim() || "새 찬양콘티" },
                MOCK_USER.id,
              )
            ).id
          : selected;

      const detail = await setlistRepository.getById(setlistId);
      const existingItems = detail?.setlist.items ?? [];
      // 이미 같은 곡이 들어 있으면 편곡만 갱신하고, 없으면 맨 뒤에 추가한다.
      const alreadyIn = existingItems.find((item) => item.songId === songId);
      const nextItems = alreadyIn
        ? existingItems.map((item) => (item.songId === songId ? { ...item, arrangementId } : item))
        : [...existingItems, { songId, arrangementId, orderIndex: existingItems.length }];

      await setlistRepository.updateItems(setlistId, {
        items: nextItems.map((item, index) => ({
          songId: item.songId,
          arrangementId: item.arrangementId,
          orderIndex: index,
        })),
      });

      toast.success("찬양콘티에 추가했습니다.");
      onOpenChange(false);
      onAdded(setlistId);
    } catch {
      toast.error("찬양콘티에 추가하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>찬양콘티에 추가</DialogTitle>
          <DialogDescription>기존 찬양콘티에 추가하거나 새로 만들어 추가하세요.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="setlist-select">찬양콘티</Label>
            <Select
              items={{
                ...Object.fromEntries(setlists.map((setlist) => [setlist.id, setlist.name])),
                [NEW_SETLIST_VALUE]: "+ 새 찬양콘티 만들기",
              }}
              value={selected}
              onValueChange={(value) => value && setSelected(value)}
            >
              <SelectTrigger id="setlist-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {setlists.map((setlist) => (
                  <SelectItem key={setlist.id} value={setlist.id}>
                    {setlist.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_SETLIST_VALUE}>+ 새 찬양콘티 만들기</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selected === NEW_SETLIST_VALUE && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-setlist-name">새 찬양콘티 이름</Label>
              <Input
                id="new-setlist-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="예: 주일 오전 예배"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
