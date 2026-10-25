# Browser DOSBox release — 26 October 2026

Production release: `browser-dosbox-20261026-v3`; application commit `0e150a1`.

NASM project execution uses the self-hosted js-dos emulators 8.5.2 DOSBox worker
and official NASM 2.16.03 DOS assembler. Students do not install desktop DOSBox.
The browser downloads the pinned runtime and toolchain when starting a run.
Third-party licenses, corresponding sources and asset hashes are in
`public/dosbox/`.

## Using projects

- Edit `main.asm` and optional `.asm`/`.inc` sources in the editor.
- Upload test data in **Files → Input**. A program reads `INPUT\NAME.EXT`.
- Write downloadable results to `OUTPUT\NAME.EXT`.
- **Run** copies the current source and input revision into a fresh private
  virtual drive. Each group member has separate execution, keyboard input and
  output files. Editing and source attribution remain shared.
- Click the DOS screen for individual keys, or send a line from the input field.
- Download private output, or explicitly save it as a shared input file.
- **Download project** exports source and input files together. Standalone
  projects also autosave in that browser; classroom work remains server-persisted.

File names follow DOS 8.3 conventions. Input data permits 16 files, 256 KiB per
file and 1 MiB total. Runtime projects are bounded to 64 files and 2 MiB total;
existing classroom source limits also apply. Runs stop after five minutes or
when stopped explicitly. Sources and input copies receive DOS read-only
attributes, but client execution is not a security or authorship attestation.

## Submissions and review

Immutable submission hashes include the source and input asset manifest.
Source diffs, contribution reports and similarity tokenization exclude that
reserved manifest. Runtime output is never silently promoted to the shared
document or trusted as a grade.

Teachers open **Review submitted work** from teacher watch, inspect/download
the exact saved source and input files, run that snapshot locally, and assign
a manual grade. A stale review cannot grade a newer resubmission. Students see
marks for the current immutable snapshot rather than an older hand-in.

NASM automatic server execution/grading returns an explicit browser/manual-review
response instead of passing projects through the limited teaching emulator.
C++ and Python execution are unchanged. The standalone **Learning debugger ·
limited 8086** remains a separate, explicitly selected teaching mode for CPU
inspection and instruction tracing.

## Validation

- 520 unit/integration tests passed; 2 existing tests skipped. TypeScript and
  changed-file ESLint passed. The production build and all 15 public route
  deployment health checks passed.
- `node --import tsx scripts/test-browser-dosbox.mjs` checks real NASM/DOSBox
  arithmetic (`SHL`, `MUL`, `DIV`), exact binary input/output, character/non-echo/
  buffered input with spaces, and actual invalid-instruction diagnostics.
- `scripts/test-classroom-dosbox.mjs` passed 22 checks in the private preview
  and production using disposable QA coursework. Checks cover two-member teams,
  shared and durable binary assets, forged updates, canonical immutable captures,
  teacher/student access, manual grading, current-grade visibility, resubmission
  hashes and stale-review rejection. Credentials are never printed.
- Visible browser checks verified public and classroom worker runs, Restart,
  interactive input, binary upload/download (`00 FF 80 2A` preserved), NASM
  diagnostics, stopping an infinite loop, teacher snapshot review and saving a
  disposable manual grade. Browser checks caught and fixed transferred-buffer
  reuse, false error-exit labels and compressed console rendering.

## Practical limits

The configured build target is a DOS `.COM` program assembled from `main.asm`
with NASM `-f bin`; normal DOS memory, file-name and program-size limits apply.
This does not provide Linux system calls, real networking, host disks or physical
hardware. Larger projects requiring object linking or a different operating
system need another configured toolchain.

Browser restrictions and source metrics cannot prove independent authorship.
Input data is reviewable alongside source; teachers should check it when code
includes or generates material from data files. Browser execution is intentionally
untrusted, and does not certify submissions automatically.

Compilation work moves off EC2, but collaboration, persistence and notifications
still use the server/database. This release is not a certification of 100 or
300 concurrent users; that requires a separate representative load test,
including the existing per-IP WebSocket limits for campus networks.
