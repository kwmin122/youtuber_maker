"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

const importSchema = z.object({
  url: z
    .string()
    .min(1, "채널 URL 또는 @핸들을 입력하세요")
    .refine(
      (val) =>
        val.startsWith("@") ||
        val.startsWith("UC") ||
        val.includes("youtube.com"),
      "유효한 YouTube 채널 URL, @핸들, 또는 채널 ID를 입력하세요"
    ),
});

type ImportFormValues = z.infer<typeof importSchema>;

type Props = {
  onImported?: () => void;
};

export function ChannelImportForm({ onImported }: Props) {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
  });

  async function onSubmit(data: ImportFormValues) {
    setLoading(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.url }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "채널 가져오기 실패");
      }

      const channel = await res.json();
      toast.success(`"${channel.title}" 채널을 추가했습니다`);
      reset();
      onImported?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "채널 가져오기 실패"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex items-end gap-3"
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="channel-url">채널 추가</Label>
        <Input
          id="channel-url"
          placeholder="https://youtube.com/@channel 또는 @handle"
          {...register("url")}
          disabled={loading}
        />
        {errors.url && (
          <p className="text-sm text-destructive">
            {errors.url.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        <span className="ml-1.5">추가</span>
      </Button>
    </form>
  );
}
