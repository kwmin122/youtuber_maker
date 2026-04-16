import type { BenchmarkAnalysisResult } from "./types";

/**
 * Build the benchmarking analysis prompt.
 * Input: array of transcript texts from the channel's top videos.
 * Output: structured JSON matching BenchmarkAnalysisResult.
 */
export function buildBenchmarkAnalysisPrompt(
  channelTitle: string,
  transcripts: Array<{ videoTitle: string; fullText: string }>
): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `You are a YouTube Shorts content strategist. Analyze the provided video transcripts from the channel "${channelTitle}" and extract actionable patterns. Always respond in Korean unless the transcripts are in another language. Return ONLY valid JSON matching the specified schema.`;

  const transcriptBlock = transcripts
    .map(
      (t, i) =>
        `--- 영상 ${i + 1}: "${t.videoTitle}" ---\n${t.fullText.slice(0, 3000)}`
    )
    .join("\n\n");

  const userPrompt = `다음은 유튜브 채널 "${channelTitle}"의 인기 영상 자막입니다. 이 자막들을 분석하여 아래 JSON 스키마에 맞게 결과를 반환해주세요.

## 분석 대상 자막

${transcriptBlock}

## 반환 JSON 스키마

{
  "toneAnalysis": {
    "style": "전체적인 말투 스타일 설명 (2-3문장)",
    "sentenceEndings": ["자주 사용하는 문장 끝 패턴 3-5개"],
    "frequentExpressions": ["자주 등장하는 표현/단어 5-10개"],
    "formality": "formal | casual | mixed",
    "emotionalTone": "energetic | calm | humorous | serious | mixed"
  },
  "hookingPatterns": [
    {
      "type": "후킹 패턴 유형 (question, shock-stat, controversy, story-opening, direct-address 등)",
      "description": "이 패턴의 설명",
      "example": "실제 자막에서 가져온 예시",
      "frequency": 60
    }
  ],
  "structurePatterns": [
    {
      "name": "구조 패턴명 (problem-solution, story-arc, list-format, before-after 등)",
      "sections": ["도입", "전개", "클라이맥스", "마무리"],
      "sectionDurations": [10, 20, 20, 10],
      "frequency": 40
    }
  ],
  "topicRecommendations": [
    {
      "title": "추천 주제 제목",
      "description": "주제 설명 (1-2문장)",
      "rationale": "이 채널에 맞는 이유",
      "suggestedHookType": "추천 후킹 유형",
      "suggestedStructure": "추천 구조",
      "viralPotential": "high | medium | low"
    }
  ]
}

## 지시사항
1. toneAnalysis: 자막에서 실제로 사용된 말투/표현 패턴을 추출합니다.
2. hookingPatterns: 영상 시작 부분(첫 5-10초)의 시청자 유인 패턴을 2-4개 식별합니다.
3. structurePatterns: 영상의 기승전결 구조를 2-3개 패턴으로 정리합니다. 60초 쇼츠 기준으로 sectionDurations를 설정합니다.
4. topicRecommendations: 분석된 채널의 결(tone & manner)에 맞는 유사 주제 5-10개를 추천합니다. 각 주제에 적합한 후킹과 구조를 제안합니다.
5. 모든 텍스트는 한국어로 작성합니다 (원본 자막이 한국어가 아닌 경우 원본 언어 사용).

JSON만 반환하세요. 다른 텍스트는 포함하지 마세요.`;

  return { systemInstruction, userPrompt };
}

/**
 * Parse the AI response into a typed BenchmarkAnalysisResult.
 * Handles both clean JSON and markdown-wrapped JSON (```json ... ```).
 */
export function parseBenchmarkAnalysisResponse(
  response: string
): BenchmarkAnalysisResult {
  // Strip markdown code fence if present
  let cleaned = response.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned) as BenchmarkAnalysisResult;

    // Basic validation
    if (!parsed.toneAnalysis) throw new Error("Missing toneAnalysis");
    if (!Array.isArray(parsed.hookingPatterns))
      throw new Error("Missing hookingPatterns");
    if (!Array.isArray(parsed.structurePatterns))
      throw new Error("Missing structurePatterns");
    if (!Array.isArray(parsed.topicRecommendations))
      throw new Error("Missing topicRecommendations");

    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to parse AI analysis response: ${err instanceof Error ? err.message : "Invalid JSON"}`
    );
  }
}

// ---------- Script Generation ----------

export interface ScriptGenerationInput {
  topicTitle: string;
  topicDescription: string;
  toneAnalysis: BenchmarkAnalysisResult["toneAnalysis"];
  hookType: string;
  structureType: string;
  variant: "A" | "B" | "C";
  /** Hook/structure combos to differentiate variants */
  variantStrategy: string;
}

/**
 * Build the script generation prompt.
 * Generates a 60-second YouTube Shorts script (~150-200 words Korean).
 */
export function buildScriptGenerationPrompt(
  input: ScriptGenerationInput
): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `You are a professional YouTube Shorts scriptwriter. Write compelling, engaging scripts that match the provided tone and structure. Always respond in Korean. Return ONLY the script text — no JSON, no markdown headers, no metadata.`;

  const userPrompt = `## 대본 생성 요청

### 주제
- 제목: ${input.topicTitle}
- 설명: ${input.topicDescription}

### 채널 말투 분석
- 스타일: ${input.toneAnalysis.style}
- 격식: ${input.toneAnalysis.formality}
- 감정 톤: ${input.toneAnalysis.emotionalTone}
- 자주 쓰는 문장 끝 패턴: ${input.toneAnalysis.sentenceEndings.join(", ")}
- 자주 쓰는 표현: ${input.toneAnalysis.frequentExpressions.join(", ")}

### 변형 전략 (Variant ${input.variant})
- 후킹 방식: ${input.hookType}
- 구조: ${input.structureType}
- 차별화 전략: ${input.variantStrategy}

### 규칙
1. **분량**: 60초 기준, 150~200단어 (한국어 기준)
2. **후킹**: 처음 3초 내에 시청자의 주의를 끌 것 (위 후킹 방식 사용)
3. **말투**: 위 채널 말투 분석을 정확히 반영할 것
4. **구조**: 위 구조 패턴을 따를 것
5. **CTA**: 마지막에 자연스러운 행동 유도 (구독, 좋아요, 댓글 중 하나)
6. **형식**: 대본 텍스트만 작성. 장면 지시, 번호 매기기, 메타데이터 금지.

대본을 작성하세요:`;

  return { systemInstruction, userPrompt };
}

/**
 * Variant strategy descriptions for A/B/C differentiation.
 * Used to generate diverse scripts for the same topic.
 */
export function getVariantStrategies(
  hookingPatterns: Array<{ type: string; description: string }>,
  structurePatterns: Array<{ name: string; sections: string[] }>
): Array<{
  variant: "A" | "B" | "C";
  hookType: string;
  structureType: string;
  strategy: string;
}> {
  const hooks = hookingPatterns.length > 0
    ? hookingPatterns
    : [{ type: "question", description: "질문으로 시작" }];
  const structures = structurePatterns.length > 0
    ? structurePatterns
    : [{ name: "problem-solution", sections: ["문제", "해결"] }];

  const strategies: Array<{
    variant: "A" | "B" | "C";
    hookType: string;
    structureType: string;
    strategy: string;
  }> = [];

  // Variant A: most common hook + most common structure
  strategies.push({
    variant: "A",
    hookType: hooks[0].type,
    structureType: structures[0].name,
    strategy: `가장 검증된 조합: "${hooks[0].description}" 후킹 + "${structures[0].name}" 구조`,
  });

  // Variant B: second hook (or rotated) + second structure (or rotated)
  strategies.push({
    variant: "B",
    hookType: hooks[Math.min(1, hooks.length - 1)].type,
    structureType: structures[Math.min(1, structures.length - 1)].name,
    strategy: `대안 조합: 다른 후킹/구조로 신선한 접근`,
  });

  // Variant C: creative mix
  if (hooks.length >= 2 || structures.length >= 2) {
    strategies.push({
      variant: "C",
      hookType: hooks[hooks.length - 1].type,
      structureType: structures[structures.length - 1].name,
      strategy: `실험적 조합: 가장 독특한 후킹 + 구조 패턴 조합`,
    });
  }

  return strategies;
}

// ---------- Phase 9: Gap Rationale ----------

/**
 * Phase 9 R-05 — gap keyword rationale prompt.
 *
 * Given a set of trend keywords the user's benchmark channels do NOT
 * cover, ask Gemini to return short Korean rationales + suggested
 * angles. The handler calls this in batch for up to 10 keywords per
 * user; the response is stored in `trend_gap_analyses.rationale_cache`.
 */
export function buildGapRationalePrompt(
  benchmarkChannelTitles: string[],
  gapKeywords: Array<{ keyword: string; categoryId: number }>
): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `You are a YouTube Shorts content strategist. The user benchmarks the listed Korean channels. For each GAP keyword (a current trend that these channels do NOT cover), explain in Korean why it is an opportunity for the user, and suggest a specific content angle. Always respond in Korean. Return ONLY valid JSON matching the specified schema.`;

  const channelBlock = benchmarkChannelTitles
    .map((t, i) => `  ${i + 1}. ${t}`)
    .join("\n");
  const keywordBlock = gapKeywords
    .map((k) => `- "${k.keyword}" (YouTube category ${k.categoryId})`)
    .join("\n");

  const userPrompt = `## 벤치마크 채널
${channelBlock}

## 갭 키워드 (현재 트렌드 중 위 채널이 다루지 않는 키워드)
${keywordBlock}

## 반환 JSON 스키마

{
  "items": [
    {
      "keyword": "갭 키워드 문자열",
      "rationale": "이 키워드가 왜 기회인지 2-3문장 설명 (한국어)",
      "suggestedAngle": "구체적인 쇼츠 콘텐츠 각도 1문장 (한국어)"
    }
  ]
}

반드시 JSON만 반환하세요. 설명이나 마크다운을 추가하지 마세요.`;

  return { systemInstruction, userPrompt };
}

export type GapRationaleResponseItem = {
  keyword: string;
  rationale: string;
  suggestedAngle: string;
};

export function parseGapRationaleResponse(raw: string): GapRationaleResponseItem[] {
  // Strip markdown code fences if the provider ignored the instruction
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `gap-rationale response is not valid JSON: ${(err as Error).message}`
    );
  }
  const items = (parsed as { items?: GapRationaleResponseItem[] }).items;
  if (!Array.isArray(items)) {
    throw new Error("gap-rationale response missing 'items' array");
  }
  for (const it of items) {
    if (
      typeof it.keyword !== "string" ||
      typeof it.rationale !== "string" ||
      typeof it.suggestedAngle !== "string"
    ) {
      throw new Error("gap-rationale item has wrong shape");
    }
  }
  return items;
}

// ---------- Scene Splitting ----------

export interface SceneSplitInput {
  scriptContent: string;
  scriptTitle: string;
  /** Target number of scenes (4-8 for 60s Shorts) */
  targetSceneCount?: number;
  /** Preferred image style for prompt generation */
  imageStyle?: string;
}

/**
 * Build the scene splitting prompt.
 * Splits a 60-second Shorts script into 4-8 scenes, each with
 * narration text, image generation prompt, and video generation prompt.
 */
export function buildSceneSplitPrompt(
  input: SceneSplitInput
): { systemInstruction: string; userPrompt: string } {
  const targetCount = input.targetSceneCount ?? 6;

  const systemInstruction = `You are a professional YouTube Shorts scene director. Split scripts into visual scenes, generating precise image and video prompts for each. Always respond in valid JSON format.`;

  const userPrompt = `## 장면 분할 요청

### 대본
제목: ${input.scriptTitle}

${input.scriptContent}

### 규칙
1. **장면 수**: ${targetCount}개 (최소 4, 최대 8)
2. **각 장면**:
   - narration: 해당 장면에서 읽을 나레이션 텍스트 (원문 대본에서 분할)
   - imagePrompt: DALL-E 3용 이미지 생성 프롬프트 (영어, 상세하게, 9:16 세로 구도 명시)${input.imageStyle ? ` 스타일: ${input.imageStyle}` : ""}
   - videoPrompt: Kling용 영상 생성 프롬프트 (영어, 카메라 움직임/모션 묘사 포함)
   - estimatedDuration: 예상 소요 시간 (초, 3~8초, 전체 합 55~65초)
3. **나레이션 분할**: 원문 대본의 모든 텍스트가 빠짐없이 장면에 배분되어야 함
4. **이미지 프롬프트**: 구체적인 시각 요소 (인물, 배경, 조명, 색감, 구도) 포함. "Vertical 9:16 composition" 명시
5. **영상 프롬프트**: 카메라 움직임 (zoom in, pan, tilt 등), 모션 방향, 속도감 포함

### 응답 형식 (JSON)
\`\`\`json
{
  "scenes": [
    {
      "sceneIndex": 0,
      "narration": "장면 나레이션 텍스트",
      "imagePrompt": "Detailed English image prompt for DALL-E 3, vertical 9:16 composition, ...",
      "videoPrompt": "English video prompt for Kling: camera slowly zooms in on ..., motion direction ...",
      "estimatedDuration": 5
    }
  ],
  "totalEstimatedDuration": 60
}
\`\`\`

위 형식으로 JSON만 반환하세요:`;

  return { systemInstruction, userPrompt };
}

/**
 * Parse the scene-split AI response into a typed SceneSplitResult.
 * Handles markdown-wrapped JSON and validates required fields.
 */
export function parseSceneSplitResponse(raw: string): import("@/lib/media/types").SceneSplitResult {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse scene-split response as JSON: ${cleaned.slice(0, 200)}`);
  }

  const data = parsed as Record<string, unknown>;
  if (!Array.isArray(data.scenes) || data.scenes.length === 0) {
    throw new Error("Scene-split response missing 'scenes' array");
  }

  const scenes = data.scenes.map((s: Record<string, unknown>, i: number) => {
    if (!s.narration || !s.imagePrompt || !s.videoPrompt) {
      throw new Error(`Scene ${i} missing required fields (narration, imagePrompt, videoPrompt)`);
    }
    return {
      sceneIndex: typeof s.sceneIndex === "number" ? s.sceneIndex : i,
      narration: String(s.narration),
      imagePrompt: String(s.imagePrompt),
      videoPrompt: String(s.videoPrompt),
      estimatedDuration: typeof s.estimatedDuration === "number" ? s.estimatedDuration : 5,
    };
  });

  return {
    scenes,
    totalEstimatedDuration:
      typeof data.totalEstimatedDuration === "number"
        ? data.totalEstimatedDuration
        : scenes.reduce((sum, s) => sum + s.estimatedDuration, 0),
  };
}
