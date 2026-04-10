"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface AvatarConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms all three consent statements. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Phase 8 D-14: explicit Korean 초상권 consent flow for reference
 * photo uploads. All three boxes must be ticked before the confirm
 * button enables. The parent component owns the upload flow — this
 * modal only records the consent intent.
 */
export function AvatarConsentModal({ open, onOpenChange, onConfirm }: AvatarConsentModalProps) {
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const allChecked = c1 && c2 && c3;

  async function handleConfirm() {
    if (!allChecked) return;
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setC1(false);
      setC2(false);
      setC3(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>참조 이미지 업로드 동의</DialogTitle>
          <DialogDescription>
            아래 세 가지 항목에 모두 동의하셔야 업로드를 진행할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <Checkbox id="avatar-consent-1" checked={c1} onCheckedChange={(v) => setC1(Boolean(v))} />
            <Label htmlFor="avatar-consent-1" className="text-sm leading-relaxed">
              이 이미지는 본인이거나, 초상권을 보유한 인물입니다.
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="avatar-consent-2" checked={c2} onCheckedChange={(v) => setC2(Boolean(v))} />
            <Label htmlFor="avatar-consent-2" className="text-sm leading-relaxed">
              업로드된 이미지는 AI 아바타 생성 목적으로만 사용됩니다.
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="avatar-consent-3" checked={c3} onCheckedChange={(v) => setC3(Boolean(v))} />
            <Label htmlFor="avatar-consent-3" className="text-sm leading-relaxed">
              삭제 요청 시 즉시 영구 삭제됩니다.
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={!allChecked || submitting}>
            {submitting ? "처리 중..." : "동의 및 업로드"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
