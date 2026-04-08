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
