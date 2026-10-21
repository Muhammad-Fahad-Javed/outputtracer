export interface DryRunStep {
  step: number;
  statement: string;
  variables: string;
  output: string;
}

export type PredictionStatus = "idle" | "loading" | "success" | "error";

// Fine-grained reason the backend gives for an "error" status. Optional so
// older/other clients that only look at `status` keep working.
export type PredictionErrorKind =
  | "invalid_request"
  | "compile_error"
  | "compile_timeout"
  | "runtime_error"
  | "timeout"
  | "output_limit"
  | "server_error"
  | "rate_limited"
  | "busy";

export interface ExecutionMeta {
  exitCode?: number | null;
  signal?: string | null;
  compileTimeMs?: number;
  runTimeMs?: number;
  truncated?: boolean;
}

export interface PredictionResult {
  status: PredictionStatus;
  output?: string;
  stderr?: string;
  dryRun?: DryRunStep[];
  traceTruncated?: boolean;
  // Present when the traced re-run may differ from the shown output
  // (clock/rand/pointers). See lib/traceDeterminism.ts.
  traceNote?: string;
  meta?: ExecutionMeta;
  error?: {
    kind?: PredictionErrorKind;
    title: string;
    message: string;
  };
}

export interface ExampleProgram {
  id: string;
  title: string;
  category: string;
  code: string;
  expectedOutput: string;
  dryRun: DryRunStep[];
}
