"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";

interface MetricsChartProps {
  data: Array<{
    date: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
  }>;
  title?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function abbreviateNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function MetricsChart({ data, title }: MetricsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No data yet</p>
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    dateLabel: formatDate(d.date),
  }));

  return (
    <div>
      {title && <h3 className="mb-4 text-lg font-semibold">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={abbreviateNumber}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const labels: Record<string, string> = {
                viewCount: "Views",
                likeCount: "Likes",
                commentCount: "Comments",
              };
              const n = String(name);
              return [abbreviateNumber(Number(value)), labels[n] ?? n];
            }}
            labelFormatter={(label: unknown) => `Date: ${String(label)}`}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                viewCount: "Views",
                likeCount: "Likes",
                commentCount: "Comments",
              };
              return labels[value] ?? value;
            }}
          />
          <Line
            type="monotone"
            dataKey="viewCount"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="likeCount"
            stroke="#10B981"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="commentCount"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
