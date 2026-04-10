"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { SEOResult } from "@/lib/distribution/types";

interface SEOPreviewProps {
  seo: SEOResult | null;
  onUpdate: (updated: Partial<SEOResult>) => void;
  isLoading?: boolean;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-muted ${className ?? "h-4 w-full"}`}
    />
  );
}

export function SEOPreview({ seo, onUpdate, isLoading }: SEOPreviewProps) {
  const [newHashtag, setNewHashtag] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-4 rounded-lg border p-6" data-testid="seo-skeleton">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-5 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-14" />
        </div>
      </div>
    );
  }

  if (!seo) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm font-medium">Generate SEO</p>
        <p className="mt-1 text-xs text-muted-foreground">
          AI will generate an optimized title, description, hashtags, and tags
          for your video.
        </p>
      </div>
    );
  }

  const titleVariants = seo.titleVariants ?? [];
  const tagsString = (seo.tags ?? []).join(", ");
  const tagsCharCount = tagsString.length;

  function handleRemoveHashtag(index: number) {
    const updated = [...(seo?.hashtags ?? [])];
    updated.splice(index, 1);
    onUpdate({ hashtags: updated });
  }

  function handleAddHashtag() {
    const tag = newHashtag.trim().replace(/^#/, "");
    if (!tag) return;
    onUpdate({ hashtags: [...(seo?.hashtags ?? []), `#${tag}`] });
    setNewHashtag("");
  }

  return (
    <div className="space-y-6 rounded-lg border p-6">
      {/* Title */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="seo-title">Title</Label>
          <span className="text-xs text-muted-foreground">
            {seo.title.length}/100
          </span>
        </div>
        <Input
          id="seo-title"
          value={seo.title}
          maxLength={100}
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
        {titleVariants.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {titleVariants.map((variant, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onUpdate({ title: variant })}
                className="rounded-full border bg-muted/50 px-3 py-1 text-xs transition-colors hover:bg-muted"
                title={variant}
              >
                Variant {String.fromCharCode(65 + i)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="seo-description">Description</Label>
          <span className="text-xs text-muted-foreground">
            {seo.description.length}/5000
          </span>
        </div>
        <Textarea
          id="seo-description"
          value={seo.description}
          maxLength={5000}
          rows={4}
          onChange={(e) => onUpdate({ description: e.target.value })}
        />
      </div>

      {/* Hashtags */}
      <div className="space-y-2">
        <Label>Hashtags</Label>
        <div className="flex flex-wrap gap-1.5">
          {(seo.hashtags ?? []).map((hashtag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {hashtag}
              <button
                type="button"
                onClick={() => handleRemoveHashtag(i)}
                className="rounded-full p-0.5 hover:bg-primary/20"
                aria-label={`Remove ${hashtag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add hashtag"
            value={newHashtag}
            onChange={(e) => setNewHashtag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddHashtag();
              }
            }}
            className="max-w-[200px]"
          />
          <button
            type="button"
            onClick={handleAddHashtag}
            className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            Add
          </button>
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="seo-tags">Tags (comma-separated)</Label>
          <span className="text-xs text-muted-foreground">
            {tagsCharCount}/500
          </span>
        </div>
        <Input
          id="seo-tags"
          value={tagsString}
          onChange={(e) => {
            const tags = e.target.value
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
            onUpdate({ tags });
          }}
          placeholder="tag1, tag2, tag3"
        />
      </div>

      {/* YouTube Preview Card */}
      <div className="space-y-2">
        <Label className="text-muted-foreground">YouTube Preview</Label>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex gap-3">
            <div className="h-20 w-36 flex-shrink-0 rounded bg-muted" />
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-medium text-primary">
                {seo.title || "Untitled"}
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {seo.description.slice(0, 120) || "No description"}
                {seo.description.length > 120 ? "..." : ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
