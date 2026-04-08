---
phase: 3
plan: 02
title: AI script generation, A/B variants, 4-step tab UI, script comparison
subsystem: script-generation
tags: [ai, prompts, worker, api, ui, tabs, comparison]
dependency_graph:
  requires: [03-01]
  provides: [generate-script-handler, scripts-api, workflow-tabs-ui, script-comparison]
  affects: [project-detail-page, worker-processor, jobs-api]
tech_stack:
  added: ["@radix-ui/react-tabs (shadcn Tabs)"]
  patterns: [variant-strategy-generation, composite-tab-component, A/B-comparison-ui]
key_files:
  created:
    - src/worker/handlers/generate-script.ts
    - src/app/api/projects/[id]/scripts/route.ts
    - src/app/api/projects/[id]/scripts/[scriptId]/route.ts
    - src/components/ui/tabs.tsx
    - src/components/project/workflow-tabs.tsx
    - src/components/project/analysis-card.tsx
    - src/components/project/topic-picker.tsx
    - src/components/project/script-comparison.tsx
    - src/components/project/script-tab.tsx
    - src/__tests__/ai-script-prompt.test.ts
  modified:
    - src/lib/ai/prompts.ts
    - src/app/api/jobs/route.ts
    - src/worker/processor.ts
    - src/app/(dashboard)/projects/[id]/page.tsx
decisions:
  - Sequential variant generation (not parallel) to avoid AI provider rate limits
  - Tabs 2-4 disabled in Phase 3 with placeholder content for future phases
  - Tab state persisted to workflowState.lastActiveTab via PATCH on tab change
metrics:
  tasks_completed: 12
  tasks_total: 12
  tests_added: 9
  tests_total: 101
  files_created: 10
  files_modified: 4
  completed_date: 2026-04-08
---

# Phase 3 Plan 02: AI Script Generation & 4-Step Tab UI Summary

Script generation pipeline with A/B/C variant strategies using channel tone analysis, plus 4-step workflow tab UI refactoring and side-by-side script comparison.

## Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 3-02-01 | Script generation prompt template | 8ed5b89 | src/lib/ai/prompts.ts |
| 3-02-02 | Register generate-script job type | 894a2a2 | route.ts, processor.ts |
| 3-02-03 | Generate-script job handler | 9e5943b | src/worker/handlers/generate-script.ts |
| 3-02-04 | Scripts API endpoints | 7ab041f | scripts/route.ts, [scriptId]/route.ts |
| 3-02-05 | shadcn/ui Tabs component | 5d2d394 | src/components/ui/tabs.tsx |
| 3-02-06 | Workflow tabs container | 5f4c66f | src/components/project/workflow-tabs.tsx |
| 3-02-07 | Analysis results card | 7629e28 | src/components/project/analysis-card.tsx |
| 3-02-08 | Topic picker | c116b65 | src/components/project/topic-picker.tsx |
| 3-02-09 | Script comparison | 7229b37 | src/components/project/script-comparison.tsx |
| 3-02-10 | Script tab composite | c7b0480 | src/components/project/script-tab.tsx |
| 3-02-11 | Project detail page refactor | 767a721 | projects/[id]/page.tsx |
| 3-02-12 | Unit tests | a3b878c | src/__tests__/ai-script-prompt.test.ts |

## What Was Built

### Backend
- **Script generation prompt** (`buildScriptGenerationPrompt`): Korean 60-second Shorts script with tone/hook/structure matching
- **Variant strategy engine** (`getVariantStrategies`): Generates 2-3 differentiated A/B/C variant configs from analysis patterns
- **generate-script handler**: Loads analysis, generates variant scripts sequentially via AI provider, saves to scripts table
- **Scripts API**: GET with optional analysisId filter, PATCH for variant selection (auto-deselects siblings)

### Frontend
- **WorkflowTabs**: 4-step tab UI (Script/Scene/Voice/Video) with completed step indicators, tabs 2-4 disabled
- **AnalysisCard**: Displays tone analysis, hooking patterns with frequency, structure patterns with section flow
- **TopicPicker**: Topic selection with viral potential badges, expandable rationale, hook/structure suggestions
- **ScriptComparison**: Side-by-side A/B/C comparison with word count, duration, select button
- **ScriptTab**: Composite orchestrator -- channel select -> analysis -> topic pick -> script gen -> comparison
- **Project detail page**: Refactored from test job UI to 4-step workflow tabs with persistent tab state

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- Tabs 2-4 (scene, voice, video) show placeholder text "Phase 4/5에서 구현" -- intentional, resolved in Phase 4-5 plans.

## Verification

- 101 tests passing (12 test files), 9 new tests for script prompt
- TypeScript: no new type errors (4 pre-existing unrelated errors in signin form and queuedash)

## Self-Check: PASSED
