"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { UploadCloud, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/domain/page-header";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { songRepository } from "@/lib/repositories/song-repository";

const RECOMMENDED_MIN = 4;
const RECOMMENDED_MAX = 5;
const HARD_MAX_COUNT = 10;
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

interface UploadImage {
  id: string;
  file: File;
  previewUrl: string;
}

function validateFiles(files: File[]): { accepted: File[]; errors: string[] } {
  const errors: string[] = [];
  const accepted: File[] = [];
  for (const file of files) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      errors.push(`${file.name}: 지원하지 않는 파일 형식입니다 (JPEG/PNG/WEBP/HEIC만 가능).`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push(`${file.name}: 파일 용량이 15MB를 초과합니다.`);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, errors };
}

function SortableThumbnail({
  image,
  index,
  onRemove,
}: {
  image: UploadImage;
  index: number;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative aspect-3/4 overflow-hidden rounded-lg border bg-card",
        isDragging && "z-10 opacity-50",
      )}
    >
      {/* 블롭 URL 미리보기라 next/image 최적화 대상이 아니므로 일반 img 태그를 쓴다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 bg-linear-to-b from-black/60 to-transparent p-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex size-8 cursor-grab touch-none items-center justify-center rounded text-white active:cursor-grabbing"
          aria-label="순서 변경"
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onRemove(image.id)}
          className="flex size-8 items-center justify-center rounded text-white hover:bg-white/20"
          aria-label="이미지 제거"
        >
          <X className="size-4" />
        </button>
      </div>
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {index + 1}
      </span>
    </div>
  );
}

export default function SongsUploadPage() {
  const router = useRouter();
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<UploadImage[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 언마운트 시(예: 제출 성공으로 페이지를 벗어나는 경우 포함) 남아있는 블롭 URL을 전부 정리한다.
  // ref로 최신 images를 추적하는 이유: 빈 배열을 deps로 쓰는 useEffect의 cleanup 클로저는
  // 마운트 시점 값(빈 배열)을 캡처해버려 실제로는 아무것도 정리하지 못하는 흔한 함정이 있다.
  const imagesRef = useRef<UploadImage[]>(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.previewUrl);
    };
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      const { accepted, errors } = validateFiles(incoming);

      // setState updater 함수는 순수해야 하므로(Strict Mode에서 두 번 호출될 수 있음),
      // availableSlots 계산과 setFileErrors 호출은 updater 밖(이벤트 핸들러 본문)에서 한다.
      const availableSlots = Math.max(0, HARD_MAX_COUNT - images.length);
      const toAdd = accepted.slice(0, availableSlots);
      const allErrors =
        accepted.length > toAdd.length
          ? [...errors, `최대 ${HARD_MAX_COUNT}장까지만 업로드할 수 있습니다.`]
          : errors;
      setFileErrors(allErrors);

      const newImages: UploadImage[] = toAdd.map((file) => ({
        id: `img-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setImages((prev) => [...prev, ...newImages]);
    },
    [images.length],
  );

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((image) => image.id !== id);
    });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setImages((prev) => {
      const oldIndex = prev.findIndex((image) => image.id === active.id);
      const newIndex = prev.findIndex((image) => image.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDraggingOver(false);
      if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
    },
    [addFiles],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) addFiles(event.target.files);
      event.target.value = "";
    },
    [addFiles],
  );

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  const handleDropzoneKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFilePicker();
      }
    },
    [openFilePicker],
  );

  const canSubmit = images.length > 0 && !isSubmitting && !!user;
  const outOfRecommendedRange =
    images.length > 0 && (images.length < RECOMMENDED_MIN || images.length > RECOMMENDED_MAX);

  const handleSubmit = useCallback(async () => {
    if (images.length === 0 || !user) return;
    setIsSubmitting(true);
    setUploadProgress(0);
    setSubmitError(null);

    try {
      // 실제 R2 presigned PUT 업로드는 Task 015에서 구현된다. 여기서는 진행률 UI만 흉내낸다.
      await new Promise<void>((resolve) => {
        const start = Date.now();
        const durationMs = 900;
        const interval = setInterval(() => {
          const pct = Math.min(100, Math.round(((Date.now() - start) / durationMs) * 100));
          setUploadProgress(pct);
          if (pct >= 100) {
            clearInterval(interval);
            resolve();
          }
        }, 80);
      });

      const song = await songRepository.create({ title: "새 악보", createdBy: user.id });
      router.push(`${routes.songExtracting(song.id)}?count=${images.length}`);
    } catch {
      setSubmitError("업로드를 시작하지 못했습니다. 다시 시도해주세요.");
      setIsSubmitting(false);
    }
  }, [images.length, router, user]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="악보 업로드"
        description="리드시트 이미지를 업로드해 반주 생성을 시작하세요."
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        onClick={openFilePicker}
        onKeyDown={handleDropzoneKeyDown}
        role="button"
        tabIndex={0}
        aria-label="이미지 업로드 영역"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
          isDraggingOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        )}
      >
        <UploadCloud className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">이미지를 드래그하거나 클릭해 선택하세요</p>
        <p className="text-xs text-muted-foreground">
          JPEG/PNG/WEBP/HEIC · 장당 최대 15MB · {RECOMMENDED_MIN}~{RECOMMENDED_MAX}장 권장
        </p>
        {/*
          파일 선택은 openFilePicker()의 프로그래밍적 click()으로만 트리거된다. input 자체가
          포커스/클릭 가능한 채로 남아있으면(sr-only는 시각적으로만 숨길 뿐 상호작용은 그대로라)
          키보드 사용자가 부모 div 대신 input에 직접 포커스해 Space/Enter를 누를 때 클릭 이벤트가
          부모로 버블링되어 openFilePicker()가 다시 호출되는 이중 발화가 생길 수 있다.
          tabIndex/aria-hidden으로 포커스·스크린리더 트리 밖으로 완전히 빼둔다.
        */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={handleInputChange}
        />
      </div>

      {fileErrors.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {fileErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-col gap-3">
          {outOfRecommendedRange && (
            <p className="text-sm text-muted-foreground">
              {RECOMMENDED_MIN}~{RECOMMENDED_MAX}장을 권장합니다 (현재 {images.length}장).
            </p>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={images.map((image) => image.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {images.map((image, index) => (
                  <SortableThumbnail
                    key={image.id}
                    image={image}
                    index={index}
                    onRemove={removeImage}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {isSubmitting && (
        <div className="flex max-w-sm flex-col gap-2">
          <p className="text-sm text-muted-foreground">업로드 중... {uploadProgress}%</p>
          <Progress value={uploadProgress} />
        </div>
      )}

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-fit">
        업로드 및 추출 시작
      </Button>
    </div>
  );
}
