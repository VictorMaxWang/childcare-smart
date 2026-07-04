# Childcare Knowledge Base V1

Last updated: 2026-06-01

## Status

SmartChildcare Agent now has a demo-ready childcare knowledge base skeleton. It is intentionally lightweight: the system surfaces `knowledgeHints` as professional reference prompts, not as a full retrieval pipeline.

## Implemented

- Added structured childcare entries under `docs/knowledge/childcare/entries.json`.
- Covered 8 topics: 情绪安抚、分离焦虑、社交退缩、饮食睡眠、家园沟通、安全边界、勇敢表达、规则意识。
- Added the shared `KnowledgeEntry` contract with `id`、`topic`、`ageRange`、`scenario`、`principle`、`suggestedAction`、`riskBoundary`、`sourceNote`.
- Added `lib/knowledge/childcare-knowledge.ts` with topic, scenario and age-range retrieval plus a conservative fallback hint.
- Connected high-risk consultation results to `knowledgeHints` and rendered them as “专业依据提示” in the teacher consultation result card.

## Source Boundary

The current `sourceNote` text references the National Health Commission childcare care guidance principles, especially responsive care, safety and health, nutrition and feeding, sleep, language, emotional and social development, and home-school cooperation.

Primary public reference: 国家卫生健康委《托育机构保育指导大纲（试行）》, published via the national government service policy portal: https://zc.gjzwfw.gov.cn/art/2022/11/29/art_14_60874.html

## Demo Claim

For defense: the system has a childcare knowledge base skeleton that can provide lightweight professional basis prompts for consultation results. It can later be extended with vector retrieval, reviewed institutional cases, source versioning and stricter governance.

Do not claim this is a production knowledge base or a complete RAG implementation.

## Verification

Planned local checks:

- `node --import ./scripts/register-test-path-loader.mjs --test ./lib/knowledge/childcare-knowledge.test.ts`
- `node --import ./scripts/register-test-path-loader.mjs --test ./app/api/ai/high-risk-consultation/route.test.ts`
- `npm run typecheck`
