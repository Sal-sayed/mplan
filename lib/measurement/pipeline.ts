// pipeline.ts — orchestrates the 'new' (pre-launch) path:
//   intake -> classify (deterministic) -> measurement plan (Gemini)
//
// runNewSitePipeline is the non-streaming entry point (used by tests and any
// non-HTTP caller). The streaming route reuses the same stages directly:
// resolveClassification for the gate, then buildPlanPrompt/finalizePlan from
// generate-plan.ts as stream post-processing.

import { classifySite, LOW_CONFIDENCE } from './classify.ts';
import { getTemplate } from './templates.ts';
import { generateMeasurementPlan } from './generate-plan.ts';
import type {
  BusinessModel,
  Classification,
  PipelineResult,
  SiteContext,
} from './types.ts';

// Thrown when the deterministic classifier isn't confident enough and the
// caller asked to gate on it. Carries the Classification so a UI can show the
// guess and ask the user to confirm/override the business model.
export class LowConfidenceError extends Error {
  readonly classification: Classification;
  constructor(classification: Classification) {
    super(
      `Low-confidence classification: ${classification.businessModel} ` +
        `at ${classification.confidence.toFixed(2)} (< ${LOW_CONFIDENCE}).`
    );
    this.name = 'LowConfidenceError';
    this.classification = classification;
  }
}

export interface PipelineOptions {
  // Throw LowConfidenceError when the guessed confidence < LOW_CONFIDENCE and no
  // override is supplied. Lets the UI confirm before spending an LLM call.
  requireConfidentClassification?: boolean;
  // A UI-provided business model (or full Classification) that bypasses the
  // deterministic guess entirely — never triggers the low-confidence gate.
  overrideClassification?: BusinessModel | Classification;
}

// Build a full Classification from a user-supplied business model.
function classificationFromModel(model: BusinessModel): Classification {
  const template = getTemplate(model);
  return {
    businessModel: model,
    vertical: template.vertical,
    primaryKpis: template.coreKpis,
    confidence: 1,
    rationale: 'Business model supplied by the user (override).',
    signals: [],
  };
}

// Resolve the classification to use, applying any override and the confidence
// gate. Shared by runNewSitePipeline and the HTTP route so the gate lives in
// exactly one place.
export function resolveClassification(
  ctx: SiteContext,
  opts: PipelineOptions = {}
): Classification {
  if (opts.overrideClassification) {
    return typeof opts.overrideClassification === 'string'
      ? classificationFromModel(opts.overrideClassification)
      : opts.overrideClassification;
  }

  const classification = classifySite(ctx);
  if (opts.requireConfidentClassification && classification.confidence < LOW_CONFIDENCE) {
    throw new LowConfidenceError(classification);
  }
  return classification;
}

export async function runNewSitePipeline(
  ctx: SiteContext,
  opts: PipelineOptions = {}
): Promise<PipelineResult> {
  const classification = resolveClassification(ctx, opts);
  const plan = await generateMeasurementPlan(ctx, classification);
  return { classification, plan };
}
