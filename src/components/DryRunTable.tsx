import { DryRunStep } from "@/types/predictor";

interface DryRunTableProps {
  steps: DryRunStep[];
}

export default function DryRunTable({ steps }: DryRunTableProps) {
  if (steps.length === 0) {
    return (
      <p className="font-mono text-sm text-[#999999]">
        Run the predictor to generate a step-by-step trace.
      </p>
    );
  }

  return (
    <div>
      {/* Desktop / tablet table */}
      <div className="mono-scroll hidden overflow-x-auto rounded-md border border-[#E5E5E5] sm:block">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[#F7F7F7]">
            <tr>
              <th className="w-16 border-b border-[#E5E5E5] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#666666]">
                Step
              </th>
              <th className="border-b border-[#E5E5E5] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#666666]">
                Statement
              </th>
              <th className="border-b border-[#E5E5E5] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#666666]">
                Variables
              </th>
              <th className="border-b border-[#E5E5E5] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#666666]">
                Output
              </th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.step} className="border-b border-[#F0F0F0] last:border-b-0">
                <td className="px-4 py-3 align-top font-mono text-[#666666]">{s.step}</td>
                <td className="px-4 py-3 align-top font-mono text-[13px] text-black">
                  {s.statement}
                </td>
                <td className="px-4 py-3 align-top font-mono text-[13px] text-[#333333]">
                  {s.variables}
                </td>
                <td className="px-4 py-3 align-top font-mono text-[13px] text-black">
                  {s.output}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {steps.map((s) => (
          <div key={s.step} className="rounded-md border border-[#E5E5E5] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
                Step {s.step}
              </span>
              <span className="font-mono text-xs text-black">{s.output}</span>
            </div>
            <p className="font-mono text-[13px] text-black">{s.statement}</p>
            <p className="mt-1.5 font-mono text-[12px] text-[#666666]">{s.variables}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
