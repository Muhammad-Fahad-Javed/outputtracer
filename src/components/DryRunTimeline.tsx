import { AlertTriangle } from "lucide-react";
import { DryRunStep } from "@/types/predictor";

interface DryRunTimelineProps {
  steps: DryRunStep[];
  truncated?: boolean;
}

export default function DryRunTimeline({ steps, truncated }: DryRunTimelineProps) {
  if (steps.length === 0) {
    return (
      <p className="font-mono text-sm text-[#999999]">
        Run the predictor to generate a step-by-step trace.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div
          key={step.step}
          className="rounded-[4px] border border-[#E5E5E5] bg-white p-3"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-xs text-[#999999]">
              Step {step.step}
            </span>
          </div>

          <div className="font-mono text-[13px] text-black">
            {step.statement}
          </div>

          {step.variables && step.variables !== "\u2014" && (
            <div className="mt-2 font-mono text-xs text-[#666666]">
              Variables: {step.variables}
            </div>
          )}

          {step.output && step.output !== "\u2014" && (
            <div className="mt-2 font-mono text-xs">
              <span className="text-[#666666]">Output:</span>{" "}
              <span className="font-semibold text-black">
                {step.output}
              </span>
            </div>
          )}
        </div>
      ))}

      {truncated && (
        <div className="flex items-center gap-2 rounded-[4px] border border-dashed border-[#DCDCDC] bg-[#FAFAFA] px-4 py-3">
          <AlertTriangle size={14} className="shrink-0 text-[#999999]" />
          <p className="font-mono text-xs text-[#666666]">
            Trace truncated at {steps.length} steps. The program has more
            execution steps than the maximum trace limit.
          </p>
        </div>
      )}
    </div>
  );
}