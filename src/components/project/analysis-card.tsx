"use client";

interface AnalysisCardProps {
  analysis: {
    id: string;
    toneAnalysis: {
      style: string;
      sentenceEndings: string[];
      frequentExpressions: string[];
      formality: string;
      emotionalTone: string;
    };
    hookingPatterns: Array<{
      type: string;
      description: string;
      example: string;
      frequency: number;
    }>;
    structurePatterns: Array<{
      name: string;
      sections: string[];
      frequency: number;
    }>;
    aiProvider: string;
    createdAt: string;
  };
}

export function AnalysisCard({ analysis }: AnalysisCardProps) {
  const { toneAnalysis, hookingPatterns, structurePatterns } = analysis;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">벤치마킹 분석 결과</h3>
        <span className="rounded bg-muted px-2 py-0.5 text-xs">
          {analysis.aiProvider}
        </span>
      </div>

      {/* Tone Analysis */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-muted-foreground">말투 분석</h4>
        <p className="text-sm">{toneAnalysis.style}</p>
        <div className="flex flex-wrap gap-1">
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            {toneAnalysis.formality}
          </span>
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
            {toneAnalysis.emotionalTone}
          </span>
        </div>
        {toneAnalysis.frequentExpressions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {toneAnalysis.frequentExpressions.slice(0, 5).map((expr, i) => (
              <span
                key={i}
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
              >
                {expr}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Hooking Patterns */}
      {hookingPatterns.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">후킹 패턴</h4>
          <div className="space-y-1">
            {hookingPatterns.map((hp, i) => (
              <div key={i} className="rounded bg-muted/50 p-2 text-xs">
                <span className="font-medium">{hp.type}</span>
                <span className="ml-1 text-muted-foreground">({hp.frequency}%)</span>
                <p className="mt-0.5 text-muted-foreground italic">
                  &quot;{hp.example}&quot;
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structure Patterns */}
      {structurePatterns.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">구조 패턴</h4>
          <div className="space-y-1">
            {structurePatterns.map((sp, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-medium">{sp.name}</span>
                <span className="text-muted-foreground">({sp.frequency}%)</span>
                <span className="text-muted-foreground">
                  {sp.sections.join(" → ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
