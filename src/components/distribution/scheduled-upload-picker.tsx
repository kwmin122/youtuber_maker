"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ScheduledUploadPickerProps {
  value: string | null;
  onChange: (iso: string | null) => void;
}

export function ScheduledUploadPicker({
  value,
  onChange,
}: ScheduledUploadPickerProps) {
  const [scheduled, setScheduled] = useState(value !== null);

  // Minimum: current time + 15 minutes
  const minDate = new Date(Date.now() + 15 * 60 * 1000);
  const minDateStr = minDate.toISOString().slice(0, 10);
  const minTimeStr = minDate.toISOString().slice(11, 16);

  // Parse current value
  const dateValue = value ? value.slice(0, 10) : "";
  const timeValue = value ? value.slice(11, 16) : "";

  function handleToggle() {
    const next = !scheduled;
    setScheduled(next);
    if (!next) {
      onChange(null);
    } else {
      // Default to min date
      onChange(minDate.toISOString());
    }
  }

  function handleDateChange(date: string) {
    const time = timeValue || minTimeStr;
    const iso = `${date}T${time}:00.000Z`;
    onChange(iso);
  }

  function handleTimeChange(time: string) {
    const date = dateValue || minDateStr;
    const iso = `${date}T${time}:00.000Z`;
    onChange(iso);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            scheduled ? "bg-primary" : "bg-muted"
          }`}
          role="switch"
          aria-checked={scheduled}
          aria-label="Schedule for later"
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              scheduled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <Label className="cursor-pointer" onClick={handleToggle}>
          Schedule for later
        </Label>
      </div>

      {scheduled && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <div className="flex gap-3">
            <div className="space-y-1">
              <Label htmlFor="schedule-date" className="text-xs">
                Date
              </Label>
              <Input
                id="schedule-date"
                type="date"
                value={dateValue}
                min={minDateStr}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="schedule-time" className="text-xs">
                Time
              </Label>
              <Input
                id="schedule-time"
                type="time"
                value={timeValue}
                onChange={(e) => handleTimeChange(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Scheduled uploads are set to Private until the publish time.
          </p>
        </div>
      )}
    </div>
  );
}
