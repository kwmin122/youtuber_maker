// AI Provider types -- provider-agnostic interface

export type AIProviderName = "gemini" | "openai";

export interface AIProvider {
  name: AIProviderName;
  /**
   * Generate text from a prompt. Returns the raw text response.
   * For structured output, parse the response with JSON.parse().
   */
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  /**
   * Gemini-only: upload an audio file via the Files API and run a
   * multimodal prompt that returns JSON. For OpenAI this throws
   * "not supported". Used by Phase 7 longform analysis when YouTube
   * captions are unavailable.
   */
  generateJsonFromAudio?(params: GenerateJsonFromAudioParams): Promise<string>;
  /**
   * Gemini-only: generateText with an override model (e.g. gemini-2.5-pro
   * for longform analysis while keeping gemini-2.0-flash elsewhere).
   */
  generateTextWithModel?(
    prompt: string,
    options: GenerateOptions & { model: string }
  ): Promise<string>;
}

export interface GenerateOptions {
  /** Target max tokens for the response */
  maxTokens?: number;
  /** Temperature for randomness (0.0-1.0) */
  temperature?: number;
  /** System instruction prepended to the prompt */
  systemInstruction?: string;
  /** If true, instruct model to return valid JSON */
  jsonMode?: boolean;
}

export interface GenerateJsonFromAudioParams {
  /** Absolute path to a local audio file (typically mp3/m4a) */
  audioPath: string;
  /** MIME type, e.g. 'audio/mpeg' */
  mimeType: string;
  /** User prompt (system instruction is provided separately) */
  prompt: string;
  /** Optional system instruction */
  systemInstruction?: string;
  /** Override model (default 'gemini-2.5-pro') */
  model?: string;
  /** Optional temperature (default 0.3 for structured analysis) */
  temperature?: number;
}

// ---------- Benchmarking Analysis Types ----------

export interface ToneAnalysis {
  /** Overall speaking style description */
  style: string;
  /** Common sentence-ending patterns (e.g., "~입니다", "~거든요") */
  sentenceEndings: string[];
  /** Frequently used expressions */
  frequentExpressions: string[];
  /** Formality level: 'formal' | 'casual' | 'mixed' */
  formality: "formal" | "casual" | "mixed";
  /** Emotional tone: 'energetic' | 'calm' | 'humorous' | 'serious' | 'mixed' */
  emotionalTone: string;
}

export interface HookingPattern {
  /** Hook type identifier (e.g., 'question', 'shock-stat', 'controversy') */
  type: string;
  /** Description of the pattern */
  description: string;
  /** Example from analyzed transcripts */
  example: string;
  /** How often this pattern appears (percentage) */
  frequency: number;
}

export interface StructurePattern {
  /** Structure name (e.g., 'problem-solution', 'story-arc', 'list-format') */
  name: string;
  /** Ordered sections of the structure */
  sections: string[];
  /** Typical duration per section in seconds */
  sectionDurations: number[];
  /** How often this pattern appears (percentage) */
  frequency: number;
}

/**
 * Canonical topic recommendation shape used by:
 *  - `scripts/analyses` jsonb column (analyze-benchmark handler output)
 *  - `src/components/project/topic-picker.tsx` (UI)
 *  - Phase 9 `analyze-benchmark` enrichment that attaches `trendBadge`
 *
 * Keep this file as the single source of truth. When `trendBadge` is
 * populated the topic was cross-referenced against the latest
 * `trend_snapshots` in a matching category and found to overlap with a
 * current trend keyword.
 */
export interface TopicRecommendation {
  /** Recommended topic title */
  title: string;
  /** Brief description (1-2 sentences) */
  description: string;
  /** Why this topic fits the channel's style */
  rationale: string;
  /** Suggested hook type to use */
  suggestedHookType: string;
  /** Suggested structure to use */
  suggestedStructure: string;
  /** Estimated viral potential: 'high' | 'medium' | 'low' */
  viralPotential: "high" | "medium" | "low";
  /** Phase 9 R-05 — optional trend cross-reference. */
  trendBadge?: {
    source: "youtube" | "google-trends";
    score: number; // normalized 0..100 (rank-inverted or raw score)
    keyword: string; // the matched trend keyword
    categoryId: number;
  };
}

export interface BenchmarkAnalysisResult {
  toneAnalysis: ToneAnalysis;
  hookingPatterns: HookingPattern[];
  structurePatterns: StructurePattern[];
  topicRecommendations: TopicRecommendation[];
}
