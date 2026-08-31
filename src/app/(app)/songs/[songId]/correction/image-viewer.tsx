"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

interface ImageViewerProps {
  imageUrls: string[];
}

/** 좌측 원본 악보 뷰어 — 확대/축소, 페이지 이동. 실제 팬은 스크롤 컨테이너에 위임한다. */
export function ImageViewer({ imageUrls }: ImageViewerProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);

  const currentUrl = imageUrls[pageIndex];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            disabled={pageIndex === 0}
            aria-label="이전 페이지"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-14 text-center text-xs text-muted-foreground">
            {imageUrls.length === 0 ? "0/0" : `${pageIndex + 1}/${imageUrls.length}`}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setPageIndex((i) => Math.min(imageUrls.length - 1, i + 1))}
            disabled={pageIndex >= imageUrls.length - 1}
            aria-label="다음 페이지"
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
            aria-label="축소"
          >
            <ZoomOut />
          </Button>
          <span className="min-w-10 text-center text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
            aria-label="확대"
          >
            <ZoomIn />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border bg-muted/30">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={`원본 악보 이미지 ${pageIndex + 1}페이지`}
            className="max-w-none origin-top-left transition-transform"
            style={{ width: `${zoom * 100}%` }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
            원본 이미지가 없습니다.
          </div>
        )}
      </div>

      {imageUrls.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {imageUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setPageIndex(index)}
              aria-label={`${index + 1}페이지로 이동`}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                index === pageIndex ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
