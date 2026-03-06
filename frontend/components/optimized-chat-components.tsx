/**
 * ✅ Optimized Chat Components with Memoization
 * 
 * Memoized components to prevent unnecessary re-renders
 * These are extracted from the main chat component for better performance
 */

import React, { useState, useEffect, memo, useMemo } from "react";
import { ShieldCheck, Circle, Square, Triangle } from "lucide-react";

/**
 * ✅ Memoized Progress Bar Component
 * Prevents re-render when parent updates but percentage/label stay same
 */
export const AnimatedProgress = memo(function AnimatedProgress({
  label,
  percentage,
  delay = 0,
}: {
  label: string;
  percentage: number;
  delay?: number;
}) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setWidth(percentage), delay);
    return () => clearTimeout(timer);
  }, [percentage, delay]);

  return (
    <div className="mb-3 w-full max-w-sm">
      <div className="flex justify-between text-[13px] mb-1">
        <span className="font-semibold text-slate-800">
          {label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
        <span className="text-slate-500 font-medium">{percentage.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full bg-[#e5e5e5] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#0f0f0f] rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
});

/**
 * ✅ Memoized Diagnosis Summary Component
 * Only re-renders when diagnosis data actually changes
 */
export const DiagnosisSummary = memo(function DiagnosisSummary({
  diagnosis,
  confidence,
  labelize,
}: {
  diagnosis: string;
  confidence: number;
  labelize: (text: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
      <div className="flex items-center gap-2 text-slate-700 text-[11px] uppercase tracking-wider font-semibold">
        <Circle className="w-3.5 h-3.5" /> Likely Condition
      </div>
      <div className="text-[17px] font-semibold text-slate-900 mt-2">
        {labelize(diagnosis)}
      </div>
      <div className="text-[13px] text-slate-600 mt-1">
        Confidence: {confidence.toFixed(1)}%
      </div>
    </div>
  );
});

/**
 * ✅ Memoized Prediction List Component
 * Only re-renders when predictions array changes
 */
export const PredictionsList = memo(function PredictionsList({
  predictions,
  labelize,
}: {
  predictions: Array<{ disease: string; probability: number }>;
  labelize: (text: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 med-lift med-fade-up">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-3">
        Top Predictions
      </div>
      <div className="space-y-2.5">
        {predictions.slice(0, 5).map((pred) => (
          <div key={pred.disease}>
            <div className="flex items-center justify-between text-[12px] mb-1">
              <span className="font-medium text-slate-700">{labelize(pred.disease)}</span>
              <span className="text-slate-500">{pred.probability.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-slate-700 to-slate-500"
                style={{ width: `${pred.probability}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * ✅ Memoized Health Tips Component
 * Only re-renders when items change
 */
export const HealthTips = memo(function HealthTips({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 med-lift med-fade-up">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-800 mb-2">
        {title}
      </div>
      <ul className="space-y-2 text-[13px] text-slate-700">
        {items.map((item, idx) => (
          <li key={`${item}-${idx}`} className="leading-relaxed flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

/**
 * ✅ Memoized Image Model Signals Component
 * Complex component with heavy computation - caches output
 */
export const ImageModelSignals = memo(function ImageModelSignals({
  imageSignals,
  labelize,
}: {
  imageSignals: Array<{
    dataset: string;
    top_label_name: string;
    top_confidence: number;
    scores?: Array<{ label_name: string; confidence: number }>;
  }>;
  labelize: (text: string) => string;
}) {

  const processedSignals = useMemo(() => imageSignals.slice(0, 5), [imageSignals]);

  if (processedSignals.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
        <div className="flex items-center gap-2 text-slate-700 text-[11px] uppercase tracking-wider font-semibold">
          <Triangle className="w-3.5 h-3.5" /> Image Model Signals
        </div>
        <div className="text-[13px] text-slate-600 mt-2">
          No image model signals used for this prediction.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
      <div className="flex items-center gap-2 text-slate-700 text-[11px] uppercase tracking-wider font-semibold">
        <Triangle className="w-3.5 h-3.5" /> Image Model Signals
      </div>

      <div className="mt-3 space-y-3">

        {processedSignals.map((ds, idx) => (
          <div key={`${ds.dataset}-${idx}`} className="border-b pb-2 last:border-b-0">

            {/* ✅ DATASET + TOP LABEL */}
            <div className="flex justify-between text-[13px] font-semibold text-slate-800">
              <span>
                {labelize(ds.dataset)} → {labelize(ds.top_label_name)}
              </span>
              <span className="text-slate-600">
                {Number(ds.top_confidence).toFixed(1)}%
              </span>
            </div>

            {/* ✅ PROGRESS BAR */}
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-slate-700 to-slate-500 transition-all duration-700"
                style={{ width: `${Number(ds.top_confidence)}%` }}
              />
            </div>

            {/* ✅ SCORES LIST */}
            {Array.isArray(ds.scores) && ds.scores.length > 0 && (
              <div className="mt-2 space-y-1 text-[12px] text-slate-600">

                {ds.scores.slice(0, 3).map((score, sIdx) => (
                  <div
                    key={`${ds.dataset}-${sIdx}`}
                    className="flex justify-between"
                  >
                    {/* FIXED: label_name instead of label_index */}
                    <span>{labelize(score.label_name)}</span>
                    <span>{Number(score.confidence).toFixed(1)}%</span>
                  </div>
                ))}

              </div>
            )}

          </div>
        ))}

      </div>
    </div>
  );
});

/**
 * ✅ Memoized Self-Care Steps Component
 */
export const SelfCareSteps = memo(function SelfCareSteps({
  precautions,
}: {
  precautions: string[];
}) {
  if (precautions.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
      <div className="flex items-center gap-2 text-slate-700 text-[11px] uppercase tracking-wider font-semibold">
        <ShieldCheck className="w-3.5 h-3.5" /> Self-Care Steps
      </div>
      <ul className="mt-2 space-y-1.5 text-[13px] text-slate-700">
        {precautions.slice(0, 6).map((item, idx) => (
          <li key={`${item}-${idx}`} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

/**
 * ✅ Memoized Symptoms and Context Component
 */
export const SymptomsContext = memo(function SymptomsContext({
  symptoms,
  gender,
  ageGroup,
  labelize,
}: {
  symptoms: string[];
  gender: string;
  ageGroup: string;
  labelize: (text: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
      <div className="flex items-center gap-2 text-slate-700 text-[11px] uppercase tracking-wider font-semibold">
        <Square className="w-3.5 h-3.5" /> Symptoms And Context
      </div>
      <div className="text-[13px] text-slate-700 mt-2">
        <div>
          <span className="font-semibold">Symptoms:</span>{" "}
          {symptoms.length > 0 ? symptoms.map(labelize).join(", ") : "No clear symptoms captured yet."}
        </div>
        <div className="mt-1">
          <span className="font-semibold">Profile:</span> {labelize(String(gender))},{" "}
          {labelize(String(ageGroup))}
        </div>
      </div>
    </div>
  );
});
