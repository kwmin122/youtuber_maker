"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AvatarPreset } from "./avatar-sub-tab";

interface Props {
  presets: AvatarPreset[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type Gender = "all" | "male" | "female" | "neutral";
type Age = "all" | "youth" | "adult" | "senior";
type Style = "all" | "realistic" | "cartoon" | "anime" | "business";

export function AvatarLibraryGrid({ presets, loading, selectedId, onSelect }: Props) {
  const [gender, setGender] = useState<Gender>("all");
  const [age, setAge] = useState<Age>("all");
  const [style, setStyle] = useState<Style>("all");

  const filtered = useMemo(() => {
    return presets.filter((p) => {
      if (gender !== "all" && p.gender !== gender) return false;
      if (age !== "all" && p.ageGroup !== age) return false;
      if (style !== "all" && p.style !== style) return false;
      return true;
    });
  }, [presets, gender, age, style]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">라이브러리를 불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm" data-testid="avatar-filters">
        <FilterRow
          label="성별"
          options={["all", "male", "female", "neutral"]}
          value={gender}
          onChange={(v) => setGender(v as Gender)}
        />
        <FilterRow
          label="연령"
          options={["all", "youth", "adult", "senior"]}
          value={age}
          onChange={(v) => setAge(v as Age)}
        />
        <FilterRow
          label="스타일"
          options={["all", "realistic", "cartoon", "anime", "business"]}
          value={style}
          onChange={(v) => setStyle(v as Style)}
        />
      </div>
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6"
        data-testid="avatar-grid"
      >
        {filtered.map((p) => (
          <Card
            key={p.id}
            data-testid={`avatar-card-${p.id}`}
            onClick={() => onSelect(p.id)}
            className={cn(
              "cursor-pointer transition-all hover:scale-[1.02]",
              selectedId === p.id && "ring-2 ring-primary"
            )}
          >
            <CardContent className="p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewImageUrl}
                alt={`${p.gender} ${p.ageGroup} ${p.style}`}
                className="h-36 w-full rounded object-cover"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-xs">{p.provider}</Badge>
                <Badge variant="secondary" className="text-xs">{p.gender}</Badge>
                <Badge variant="secondary" className="text-xs">{p.ageGroup}</Badge>
                <Badge variant="outline" className="text-xs">{p.style}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground">
            조건에 맞는 아바타가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          data-testid={`filter-${label}-${o}`}
          className={cn(
            "rounded px-2 py-0.5 text-xs",
            value === o
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/70"
          )}
        >
          {o === "all" ? "전체" : o}
        </button>
      ))}
    </div>
  );
}
