"use client";

import { Check, Trash2, ImageIcon } from "lucide-react";

interface ThumbnailGalleryProps {
  thumbnails: Array<{
    id: string;
    url: string;
    variant: string;
    isSelected: boolean;
    prompt: string;
  }>;
  onSelect: (thumbnailId: string) => void;
  onDelete: (thumbnailId: string) => void;
  isGenerating?: boolean;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border bg-muted">
      <div className="aspect-video w-full rounded-t-lg bg-muted-foreground/10" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-16 rounded bg-muted-foreground/10" />
      </div>
    </div>
  );
}

export function ThumbnailGallery({
  thumbnails,
  onSelect,
  onDelete,
  isGenerating,
}: ThumbnailGalleryProps) {
  if (isGenerating) {
    return (
      <div
        className="grid grid-cols-2 gap-4 sm:grid-cols-3"
        data-testid="thumbnail-skeletons"
      >
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!thumbnails || thumbnails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Generate thumbnails to see A/B variants here.
        </p>
      </div>
    );
  }

  const cols = thumbnails.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div className={`grid grid-cols-1 gap-4 ${cols}`}>
      {thumbnails.map((thumb) => (
        <div
          key={thumb.id}
          className={`group relative cursor-pointer rounded-lg border transition-all ${
            thumb.isSelected
              ? "ring-2 ring-primary scale-[1.02]"
              : "hover:shadow-md"
          }`}
          onClick={() => onSelect(thumb.id)}
          title={thumb.prompt}
          role="button"
          aria-label={`Thumbnail variant ${thumb.variant}`}
        >
          {/* Variant badge */}
          <span className="absolute left-2 top-2 z-10 rounded-md bg-black/70 px-2 py-0.5 text-xs font-bold text-white">
            {thumb.variant}
          </span>

          {/* Selected checkmark */}
          {thumb.isSelected && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/10"
              data-testid="selected-check"
            >
              <div className="rounded-full bg-primary p-2">
                <Check className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
          )}

          {/* Delete button */}
          <button
            type="button"
            className="absolute right-2 top-2 z-20 rounded-md bg-black/70 p-1.5 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete this thumbnail?")) {
                onDelete(thumb.id);
              }
            }}
            aria-label={`Delete thumbnail ${thumb.variant}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {/* Image */}
          <div className="aspect-video overflow-hidden rounded-t-lg">
            <img
              src={thumb.url}
              alt={`Thumbnail variant ${thumb.variant}`}
              className="h-full w-full object-cover"
            />
          </div>

          {/* Footer */}
          <div className="px-3 py-2">
            <p className="truncate text-xs text-muted-foreground">
              Variant {thumb.variant}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
