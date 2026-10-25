"use client";
import { useState } from "react";
import { AssessmentOrientation } from "@/components/adaptive/AssessmentOrientation";
import {
  AdaptiveAssessmentExperience,
  SubmissionProcessingCard,
} from "@/components/adaptive/AdaptiveAssessmentExperience";
import { buildAdaptiveVisualReviewState } from "@/lib/visual-review/fixtures";
import { resolveAdaptivePath } from "@/lib/adaptive/engine";
export function FlowPresentationReview({
  initialStage,
}: {
  initialStage: string;
}) {
  const [stage, setStage] = useState(initialStage);
  const state = buildAdaptiveVisualReviewState(
    stage === "late" ? "late" : "early",
  );
  if (stage === "area") {
    state.gatewayAnswers =
      buildAdaptiveVisualReviewState("review").gatewayAnswers;
    state.controlResponses = {};
    state.path = resolveAdaptivePath({
      graph: state.graph,
      gatewayAnswers: state.gatewayAnswers,
      controlResponses: {},
    });
    state.navigation = {
      ...state.navigation,
      current_screen: "question",
      current_question_id: state.path.currentNextNode,
    };
  }
  return (
    <main className="mk-product mx-auto max-w-6xl px-5 py-8">
      <p className="mb-6 text-sm leading-relaxed text-mk-muted">
        Local/preview presentation fixture. Synthetic data only; no assessment,
        legal acceptance, payment or message is submitted.
      </p>
      {stage === "orientation" ? (
        <AssessmentOrientation
          scale={state.responseScale}
          onBegin={() => setStage("early")}
        />
      ) : stage === "completion" ? (
        <SubmissionProcessingCard
          assessmentReference="SYNTHETIC-PRESENTATION"
          confirmed
        />
      ) : (
        <AdaptiveAssessmentExperience
          assessmentReference="SYNTHETIC-PRESENTATION"
          token="synthetic-only"
          initialState={state}
          visualReview
        />
      )}
    </main>
  );
}
