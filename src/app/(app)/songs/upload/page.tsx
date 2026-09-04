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
import { RotateCw, UploadCloud, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/domain/page-header";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { songRepository } from "@/lib/repositories/song-repository";
import { WriteCommittedButUnconfirmedError } from "@/lib/repositories/errors";
import { deleteUploadedImage, uploadImage } from "@/lib/uploads/upload-image";
import { triggerExtraction } from "@/lib/extraction/trigger-extraction";

const RECOMMENDED_MIN = 4;
const RECOMMENDED_MAX = 5;
const HARD_MAX_COUNT = 10;
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

type UploadStatus = "idle" | "uploading" | "uploaded" | "failed";

interface UploadImage {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  progress: number;
  objectKey?: string;
  error?: string;
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
  disabled,
  onRemove,
  onRetry,
}: {
  image: UploadImage;
  index: number;
  /** 전체 제출이 진행 중일 때 true — 그 사이 목록이 바뀌면 handleSubmit이 스냅샷해둔
   *  이미지 배열과 어긋나 이미 지운 이미지가 곡에 딸려 들어가거나, 막 지운 R2 객체를
   *  다시 참조하게 될 수 있다. 제거/재시도 버튼을 잠가 그 창을 원천 차단한다. */
  disabled: boolean;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  // 이 이미지 자체가 업로드 중이면(단독 재시도든, 전체 제출의 일부든) 지금 지우면 objectKey를
  // 어디에도 기록하지 못한 채 R2에 고아 객체가 남는다 — 그 이미지만이라도 항상 잠근다.
  const removeDisabled = disabled || image.status === "uploading";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative aspect-3/4 overflow-hidden rounded-lg border bg-card",
        isDragging && "z-10 opacity-50",
        image.status === "failed" && "border-destructive",
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
          disabled={removeDisabled}
          className="flex size-8 items-center justify-center rounded text-white hover:bg-white/20 disabled:pointer-events-none disabled:opacity-40"
          aria-label="이미지 제거"
        >
          <X className="size-4" />
        </button>
      </div>
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {index + 1}
      </span>

      {image.status === "uploading" && (
        <div className="absolute inset-x-1.5 bottom-1.5">
          <Progress value={image.progress} className="h-1" />
        </div>
      )}

      {image.status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 p-2 text-center">
          <p className="text-xs text-white">{image.error ?? "업로드 실패"}</p>
          <button
            type="button"
            onClick={() => onRetry(image.id)}
            disabled={disabled}
            className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs text-white hover:bg-white/25 disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCw className="size-3" />
            재시도
          </button>
        </div>
      )}
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
        status: "idle",
        progress: 0,
      }));
      setImages((prev) => [...prev, ...newImages]);
    },
    [images.length],
  );

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        // 이미 R2에 올라간 뒤 목록에서 뺀 이미지는 그대로 두면 고아 객체가 된다 — 베스트
        // 에포트로 정리한다(실패해도 UI 흐름을 막지 않는다).
        if (target.objectKey) void deleteUploadedImage(target.objectKey);
      }
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

  // 단독 재시도 버튼 클릭과 전체 제출의 자동 재시도가 같은 이미지를 동시에 두 번 업로드하는
  // 걸 막는다 — 두 경로 모두 uploadOne을 호출하는데, 상태 갱신이 반영되기 전 짧은 시간에
  // 둘 다 시작되면 R2 객체가 중복으로 남고 어느 objectKey가 최종 채택될지 예측할 수 없다.
  const inFlightRef = useRef<Set<string>>(new Set());

  /** 이미지 하나를 업로드하고, 이번 호출로 얻은 결과({id, objectKey})를 반환한다(실패 시 null). */
  const uploadOne = useCallback(
    async (image: UploadImage): Promise<{ id: string; objectKey: string } | null> => {
      if (inFlightRef.current.has(image.id)) return null;
      inFlightRef.current.add(image.id);
      setImages((prev) =>
        prev.map((img) =>
          img.id === image.id
            ? { ...img, status: "uploading", progress: 0, error: undefined }
            : img,
        ),
      );
      try {
        const objectKey = await uploadImage(image.file, (percent) => {
          setImages((prev) =>
            prev.map((img) => (img.id === image.id ? { ...img, progress: percent } : img)),
          );
        });
        setImages((prev) =>
          prev.map((img) =>
            img.id === image.id ? { ...img, status: "uploaded", objectKey, progress: 100 } : img,
          ),
        );
        return { id: image.id, objectKey };
      } catch (error) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === image.id
              ? {
                  ...img,
                  status: "failed",
                  error: error instanceof Error ? error.message : "업로드에 실패했습니다.",
                }
              : img,
          ),
        );
        return null;
      } finally {
        inFlightRef.current.delete(image.id);
      }
    },
    [],
  );

  const retryOne = useCallback(
    (id: string) => {
      const target = imagesRef.current.find((img) => img.id === id);
      if (target) void uploadOne(target);
    },
    [uploadOne],
  );

  const canSubmit = images.length > 0 && !isSubmitting && !!user;
  const outOfRecommendedRange =
    images.length > 0 && (images.length < RECOMMENDED_MIN || images.length > RECOMMENDED_MAX);

  const handleSubmit = useCallback(async () => {
    if (images.length === 0 || !user) return;
    setIsSubmitting(true);
    setSubmitError(null);

    // 순서는 지금 이 시점의 images 배열(드래그로 재정렬된 최신 순서)을 그대로 따른다. 이미
    // 성공한(uploaded) 이미지는 다시 올리지 않고, idle/failed만 업로드하거나 재시도한다.
    const currentImages = images;
    const alreadyUploaded = new Map(
      currentImages
        .filter((img) => img.status === "uploaded" && img.objectKey)
        .map((img) => [img.id, img.objectKey!]),
    );
    const pending = currentImages.filter((img) => !alreadyUploaded.has(img.id));
    const results = await Promise.all(pending.map((img) => uploadOne(img)));
    for (const result of results) if (result) alreadyUploaded.set(result.id, result.objectKey);

    if (alreadyUploaded.size !== currentImages.length) {
      setSubmitError("일부 이미지 업로드에 실패했습니다. 실패한 이미지를 재시도해주세요.");
      setIsSubmitting(false);
      return;
    }

    let songId: string;
    try {
      const song = await songRepository.createWithImages({
        title: "새 악보",
        images: currentImages.map((img, index) => ({
          objectKey: alreadyUploaded.get(img.id)!,
          orderIndex: index,
        })),
      });
      songId = song.id;
    } catch (error) {
      if (error instanceof WriteCommittedButUnconfirmedError) {
        // 곡 생성 자체(RPC)는 이미 커밋됐고, 그 직후 확인 조회만 실패한 경우다 — 방금 올린
        // R2 객체는 이미 song_images가 참조하고 있으니 정리(삭제)하면 안 된다(code review
        // 지적, 실제로 이 분기를 놓치면 멀쩡히 생성된 곡이 깨진 이미지를 영구히 가리키게
        // 된다). 알고 있는 songId로 그대로 진행한다.
        songId = error.id;
      } else {
        // 곡 생성이 진짜로 실패하면 방금 올린 객체들이 고아로 남는다 — 정리하고, 사용자가
        // 다시 제출 버튼을 누르면 처음부터 깨끗하게 재업로드하도록 상태를 되돌린다.
        await Promise.all([...alreadyUploaded.values()].map((key) => deleteUploadedImage(key)));
        setImages((prev) =>
          prev.map((img) => ({ ...img, status: "idle", objectKey: undefined, progress: 0 })),
        );
        setSubmitError("곡 생성에 실패했습니다. 다시 시도해주세요.");
        setIsSubmitting(false);
        return;
      }
    }

    try {
      await triggerExtraction(songId);
    } catch {
      // 곡·이미지는 이미 만들어졌으니(정리하지 않고 그대로 둔다) 추출 시작만 재시도하면 되는데,
      // 지금 이 페이지엔 이 songId에 대한 재시도 진입점이 없다 — 새로 업로드를 시작하게 안내한다.
      setSubmitError("추출 시작에 실패했습니다. 다시 시도해주세요.");
      setIsSubmitting(false);
      return;
    }

    router.push(routes.songExtracting(songId));
  }, [images, router, user, uploadOne]);

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
                    disabled={isSubmitting}
                    onRemove={removeImage}
                    onRetry={retryOne}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-fit">
        {isSubmitting ? "업로드 중..." : "업로드 및 추출 시작"}
      </Button>
    </div>
  );
}
