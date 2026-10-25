# Unified Assembly Lab — 25 October 2026

The `/assembly` route now loads the same `UnifiedShell` as the main editor, initially in 8086 Assembly mode with its CPU inspector open. The route, canonical metadata, learning links and pending lesson-code handoff remain in place. The separate 863-line `AssemblyLab` component was removed.

The shared editor preserves assembly examples and NASM syntax highlighting, Step/F10, Back/Shift+F10, Reset, a live register/flag inspector and execution history. Continue resumes an existing CPU state; the console's Run again starts fresh. The interactive DOS console handles line, character and non-echo input. Input resumes return the full actual timeline. Memory and Stack now show real execution bytes instead of hardcoded placeholders, through a bounded read-only action on the existing token-authorized endpoint. Classroom sessions remain excluded from this public endpoint.

Stop, language/sample changes and unmount invalidate pending assembly requests; a late-created session is disposed of rather than adopted. Execution line styling uses plain Monaco decoration classes with an explicit translucent blue background. The navigation wraps on narrow screens, toolbars/tabs scroll, and Registers provides the CPU controls when the desktop inspector is hidden.

## Verification

- 454 application tests passed, with 2 existing skips, across 61 files. This includes 16 assembly route regressions for real memory/stack values, non-mutating inspection, address bounds and wrapping, token/scope protection, and timeline continuity after interactive input.
- TypeScript and scoped ESLint passed. Both candidate production builds completed successfully.
- All 10 NASM compiler checks passed against the candidate and final production runtime: four valid programs and one invalid program in both buffered and interactive modes. Inputs cover preserved spaces, echoed characters and non-echo characters.
- Browser checks at 1280×800 and 390×844 verified Step/Back register restoration, Continue, real memory bytes, DOS line input and the narrow-screen Registers view. A stack program produced SS:SP `1000:FFFC`, word `1234`, bytes `34 12` in the actual browser panel.
- The final candidate's Run-followed-immediately-by-Stop remained stopped. The execution line's computed background was `rgba(38, 79, 120, 0.35)` with a blue border, preserving syntax contrast.
- The existing two assembly lesson routes still loaded. Their current production content has no starter-code action; pending-code transfer was checked in the implementation rather than claimed as a completed browser interaction.

## Release

Production source: `7de3835722395e55deda3a115ac8f0e1b3563b67`. Deployment: `assembly-20261025-v2`. Main and the implementation branch were pushed to GitHub. Atomic promotion verified all 15 public routes returned 200. The previous console release is retained for rollback.

Artifact SHA-256: `47bc030e4af621aa760882b9294c6ec690c011234159936f1ccd7f19641cef4f`.

EC2 reports: `/tmp/outputtracer-assembly-candidate-examples.json`, `/tmp/outputtracer-assembly-production-examples.json`, and `/tmp/outputtracer-assembly-deploy-v2.log`. The disposable browser teacher was signed out. No database migrations or coursework changes were needed.
