// AI Provider types -- provider-agnostic interface

export type AIProviderName = "gemini" | "openai";

export interface AIProvider {
  name: AIProviderName;
  /**
   * Generate text from a prompt. Returns the raw text response.
   * For structured output, parse the response with JSON.parse().
   */
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
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
}

export interface BenchmarkAnalysisResult {
  toneAnalysis: ToneAnalysis;
  hookingPatterns: HookingPattern[];
  structurePatterns: StructurePattern[];
  topicRecommendations: TopicRecommendation[];
}
