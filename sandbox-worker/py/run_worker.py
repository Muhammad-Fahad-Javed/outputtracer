"""Execution worker. Runs INSIDE the sandbox container only.

Protocol: reads one JSON envelope from stdin: {"code": str, "stdin": str}.
Then executes `code` with sys.stdin replaced by the supplied stdin text.

Exit codes (consumed by the sandbox worker service):
  0   program finished normally
  1   uncaught runtime exception (traceback on stderr, user frames only)
  3   syntax error (message on stderr)
  N   program called sys.exit(N)
  70  worker protocol failure (bad envelope)
"""
import io
import json
import sys
import traceback

MAX_ENVELOPE_BYTES = 256 * 1024
USER_FILENAME = "main.py"


def _read_envelope():
    raw = sys.stdin.buffer.read(MAX_ENVELOPE_BYTES + 1)
    if len(raw) > MAX_ENVELOPE_BYTES:
        raise ValueError("envelope too large")
    data = json.loads(raw.decode("utf-8"))
    code = data.get("code")
    stdin_text = data.get("stdin", "")
    if not isinstance(code, str) or not isinstance(stdin_text, str):
        raise ValueError("code and stdin must be strings")
    return code, stdin_text


def _print_user_traceback(exc):
    tb = exc.__traceback__
    frames = [f for f in traceback.extract_tb(tb) if f.filename == USER_FILENAME]
    out = []
    if frames:
        out.append("Traceback (most recent call last):\n")
        for f in frames:
            out.append('  File "%s", line %d, in %s\n' % (f.filename, f.lineno, f.name))
            if f.line:
                out.append("    %s\n" % f.line.strip())
    # Format only the exception type + message the safe way (no user __str__ on
    # arbitrary subclasses is possible to fully avoid here, but this process is
    # already the sandboxed one, so worst case is the user's own output).
    out.extend(traceback.format_exception_only(type(exc), exc))
    sys.stderr.write("".join(out))
    sys.stderr.flush()


def main():
    try:
        code, stdin_text = _read_envelope()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("worker protocol error: %s\n" % type(exc).__name__)
        return 70

    try:
        compiled = compile(code, USER_FILENAME, "exec")
    except SyntaxError as exc:
        line = exc.lineno or 0
        sys.stderr.write(
            'SyntaxError: %s (%s, line %d)\n' % (exc.msg, USER_FILENAME, line)
        )
        return 3

    sys.stdin = io.TextIOWrapper(io.BytesIO(stdin_text.encode("utf-8")), encoding="utf-8")
    glb = {"__name__": "__main__", "__file__": USER_FILENAME, "__builtins__": __builtins__}
    try:
        exec(compiled, glb)  # noqa: S102 - this IS the sandboxed executor
    except SystemExit as exc:
        sys.stdout.flush()
        code_val = exc.code
        if code_val is None:
            return 0
        if isinstance(code_val, int):
            return code_val & 0xFF
        sys.stderr.write(str(code_val)[:1000] + "\n")
        return 1
    except BaseException as exc:  # noqa: BLE001
        sys.stdout.flush()
        _print_user_traceback(exc)
        return 1
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    rc = main()
    sys.stdout.flush()
    sys.stderr.flush()
    sys.exit(rc)
