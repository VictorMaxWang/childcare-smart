from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.schemas.parent_message import ParentMessageStopReason


DraftDict = dict[str, Any]


@dataclass
class GeneratorStepResult:
    draft: DraftDict
    source: str
    model: str | None = None
    provider: str | None = None
    fallback: bool = False
    stop_reason: ParentMessageStopReason | None = None
    debug_meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class EvaluationStepResult:
    score: float
    problems: list[str]
    revision_suggestions: list[str]
    can_send: bool
    retryable: bool = True
    decision: str = "revise"
    fallback: bool = False
    provider: str | None = None
    model: str | None = None
    stop_reason: ParentMessageStopReason | None = None
    debug_meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class OptimizerIteration:
    iteration: int
    generator: GeneratorStepResult
    evaluation: EvaluationStepResult
    revision_instructions: str | None = None


@dataclass
class OptimizerRunResult:
    final_iteration: OptimizerIteration
    iterations: list[OptimizerIteration] = field(default_factory=list)
    approved_iteration: int | None = None
    stop_reason: ParentMessageStopReason = "max_iterations"

    @property
    def revision_count(self) -> int:
        return max(0, len(self.iterations) - 1)

    @property
    def fallback(self) -> bool:
        return any(item.generator.fallback or item.evaluation.fallback for item in self.iterations)

    @property
    def iteration_scores(self) -> list[float]:
        return [round(float(item.evaluation.score), 2) for item in self.iterations]


class EvaluatorOptimizer:
    async def run(
        self,
        *,
        generate,
        evaluate,
        build_revision_instructions,
        max_candidates: int,
    ) -> OptimizerRunResult:
        if max_candidates <= 0:
            raise ValueError("max_candidates must be positive")

        iterations: list[OptimizerIteration] = []
        best_iteration: OptimizerIteration | None = None
        previous_output_signature: str | None = None
        previous_failure_signature: str | None = None
        revision_instructions: str | None = None
        approved_iteration: int | None = None
        stop_reason: ParentMessageStopReason = "max_iterations"

        for iteration in range(1, max_candidates + 1):
            generated: GeneratorStepResult = await generate(revision_instructions, iteration)
            evaluated: EvaluationStepResult = await evaluate(generated.draft, iteration)
            current = OptimizerIteration(
                iteration=iteration,
                generator=generated,
                evaluation=evaluated,
                revision_instructions=revision_instructions,
            )
            iterations.append(current)

            if self._should_replace_best(current, best_iteration):
                best_iteration = current

            if evaluated.can_send and evaluated.score >= 8:
                approved_iteration = iteration
                stop_reason = "passed"
                best_iteration = current
                break

            forced_stop_reason = evaluated.stop_reason or generated.stop_reason
            if forced_stop_reason is not None:
                stop_reason = forced_stop_reason
                break

            if not evaluated.retryable or evaluated.decision == "block":
                stop_reason = "non_retryable_error"
                break

            output_signature = self._candidate_signature(generated.draft)
            if output_signature and output_signature == previous_output_signature:
                stop_reason = "same_output_twice"
                break

            failure_signature = self._failure_signature(evaluated)
            if failure_signature and failure_signature == previous_failure_signature:
                stop_reason = "same_failure_twice"
                break

            previous_output_signature = output_signature
            previous_failure_signature = failure_signature

            if iteration >= max_candidates:
                stop_reason = "max_iterations"
                break

            revision_instructions = build_revision_instructions(evaluated, generated.draft, iteration)

        if best_iteration is None:
            raise RuntimeError("EvaluatorOptimizer did not produce any candidate iteration")

        return OptimizerRunResult(
            final_iteration=best_iteration,
            iterations=iterations,
            approved_iteration=approved_iteration,
            stop_reason=stop_reason,
        )

    @staticmethod
    def _candidate_signature(draft: DraftDict) -> str:
        payload = {
            "title": str(draft.get("title") or "").strip(),
            "summary": str(draft.get("summary") or "").strip(),
            "wording_for_parent": str(draft.get("wording_for_parent") or "").strip(),
            "tonight_actions": [str(item).strip() for item in draft.get("tonight_actions") or []],
        }
        rendered = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return rendered if rendered.strip("{}[]\"") else ""

    @staticmethod
    def _failure_signature(evaluated: EvaluationStepResult) -> str:
        payload = {
            "problems": sorted(item.strip() for item in evaluated.problems if item.strip()),
            "revision_suggestions": sorted(item.strip() for item in evaluated.revision_suggestions if item.strip()),
            "decision": str(evaluated.decision or "").strip(),
        }
        rendered = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return rendered if rendered.strip("{}[]\"") else ""

    @staticmethod
    def _should_replace_best(current: OptimizerIteration, best: OptimizerIteration | None) -> bool:
        if best is None:
            return True
        if current.evaluation.score != best.evaluation.score:
            return current.evaluation.score > best.evaluation.score
        if current.evaluation.can_send != best.evaluation.can_send:
            return current.evaluation.can_send and not best.evaluation.can_send
        if len(current.evaluation.problems) != len(best.evaluation.problems):
            return len(current.evaluation.problems) < len(best.evaluation.problems)
        return current.iteration > best.iteration
