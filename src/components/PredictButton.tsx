import { Loader2 } from "lucide-react";

interface PredictButtonProps {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}

export default function PredictButton({ onClick, loading, disabled }: PredictButtonProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[4px] bg-black px-7 py-3.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#1a1a1a] active:scale-[0.98] active:bg-[#000000] disabled:cursor-not-allowed disabled:bg-[#666666] disabled:active:scale-100 sm:w-auto"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Predicting…
          </>
        ) : (
          "Predict Output"
        )}
      </button>
      <span className="hidden items-center gap-1 text-xs text-[#666666] sm:inline-flex">
        <kbd className="rounded-[3px] border border-[#DCDCDC] bg-[#F2F2F2] px-1.5 py-0.5 font-mono text-[11px]">
          Ctrl
        </kbd>
        +
        <kbd className="rounded-[3px] border border-[#DCDCDC] bg-[#F2F2F2] px-1.5 py-0.5 font-mono text-[11px]">
          Enter
        </kbd>
      </span>
    </div>
  );
}
