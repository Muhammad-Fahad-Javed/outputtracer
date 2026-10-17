"""Deterministic step tracer. Runs INSIDE the sandbox container only.

Protocol
--------
stdin  : one JSON envelope {"code": str, "stdin": str, "limits": {...}}
stdout : the LAST line is the JSON result (see build_result). Any earlier
         output on the real stdout is ignored; program output is captured
         in-process and returned inside the result.

Event-ordering contract (documented for the API and UI)
-------------------------------------------------------
* "call"      emitted when a user function (or the module) is entered.
              Snapshot = arguments, before the first line runs.
* "line"      emitted BEFORE a line executes. Snapshot = state before it runs.
* "return"    emitted when a user frame is about to return. Carries
              `returnValue`. Snapshot = state at return.
* "exception" emitted when an exception is raised in (or propagates through)
              a user frame. Carries `exception: {type, message}`.
Steps are numbered from 0 in emission order.

stdout contract: each step's `stdout` holds ONLY the output produced since
the previous step (incremental, never cumulative). Concatenating all step
`stdout` fields plus `trailingStdout` reproduces the full output.

Serialization safety: only exact builtin types (type(x) is list, etc.) are
walked. Subclasses and user-defined objects become bounded placeholders; no
repr()/str()/property access is ever invoked on them.

Determinism: sets/dicts are emitted in a canonical order (sets sorted by
their serialized form). PYTHONHASHSEED=0 should be set by the launcher.
Programs using time/random/threads are not deterministic by nature.
"""
import io
import json
import math
import os
import sys

USER_FILENAME = "main.py"
MAX_ENVELOPE_BYTES = 256 * 1024

DEFAULT_LIMITS = {
    "maxSteps": 2000,
    "maxDepth": 4,
    "maxItems": 30,
    "maxString": 200,
    "maxVarsPerFrame": 40,
    "maxStackDepth": 30,
    "maxStdoutBytes": 64 * 1024,
    "maxResponseBytes": 2 * 1024 * 1024,
}

_PRIMITIVE_TYPES = (type(None), bool, int, float, str)
_TYPE_NAME_GETTER = type.__dict__["__name__"].__get__


def type_name(obj):
    """Real class name, immune to metaclass/property overrides."""
    try:
        return _TYPE_NAME_GETTER(type(obj))
    except Exception:  # noqa: BLE001
        return "object"


class Serializer:
    def __init__(self, limits):
        self.max_depth = limits["maxDepth"]
        self.max_items = limits["maxItems"]
        self.max_string = limits["maxString"]

    def ser(self, obj, depth=0, seen=None):
        if seen is None:
            seen = set()
        t = type(obj)
        if obj is None:
            return {"t": "none"}
        if t is bool:
            return {"t": "bool", "v": obj}
        if t is int:
            if obj.bit_length() > 3000:
                return {"t": "bigint", "bits": obj.bit_length()}
            return {"t": "int", "v": obj if abs(obj) < 2**53 else str(obj)}
        if t is float:
            if math.isnan(obj):
                return {"t": "float", "v": "nan"}
            if math.isinf(obj):
                return {"t": "float", "v": "inf" if obj > 0 else "-inf"}
            return {"t": "float", "v": obj}
        if t is str:
            if len(obj) > self.max_string:
                return {"t": "str", "v": obj[: self.max_string], "len": len(obj), "trunc": True}
            return {"t": "str", "v": obj}
        if t in (list, tuple, dict, set, frozenset):
            oid = id(obj)
            if oid in seen:
                return {"t": "ref", "kind": type_name(obj)}
            if depth >= self.max_depth:
                return {"t": "deep", "kind": type_name(obj), "len": len(obj)}
            seen = seen | {oid}
            n = len(obj)
            if t is dict:
                pairs = []
                for i, (k, v) in enumerate(obj.items()):
                    if i >= self.max_items:
                        break
                    pairs.append([self.ser(k, depth + 1, seen), self.ser(v, depth + 1, seen)])
                return {"t": "dict", "v": pairs, "len": n, "trunc": n > self.max_items}
            if t in (set, frozenset):
                items = []
                for i, v in enumerate(obj):
                    if i >= self.max_items * 4:
                        break
                    items.append(self.ser(v, depth + 1, seen))
                items.sort(key=lambda x: json.dumps(x, sort_keys=True))
                return {
                    "t": "set" if t is set else "frozenset",
                    "v": items[: self.max_items],
                    "len": n,
                    "trunc": n > self.max_items,
                }
            items = []
            for i, v in enumerate(obj):
                if i >= self.max_items:
                    break
                items.append(self.ser(v, depth + 1, seen))
            return {"t": "list" if t is list else "tuple", "v": items, "len": n, "trunc": n > self.max_items}
        return {"t": "object", "kind": type_name(obj)}


def safe_exception_message(exc, serializer, limit):
    """Message without invoking user-defined __str__/__repr__."""
    try:
        args = exc.args
    except Exception:  # noqa: BLE001
        return ""
    if type(args) is not tuple:
        return ""
    if len(args) == 0:
        return ""
    if len(args) == 1 and type(args[0]) is str:
        return args[0][:limit]
    parts = []
    for a in args[:5]:
        s = serializer.ser(a, depth=self_depth_one(serializer))
        parts.append(_brief(s))
    return ", ".join(parts)[:limit]


def self_depth_one(serializer):
    return max(serializer.max_depth - 1, 0)


def _brief(s):
    t = s.get("t")
    if t in ("none",):
        return "None"
    if t in ("bool", "int", "float"):
        return str(s["v"])
    if t == "str":
        return repr(s["v"])
    if t == "object":
        return "<%s object>" % s["kind"]
    return "<%s>" % t


class Capture(io.TextIOBase):
    """In-process stdout/stderr capture with a hard byte cap."""

    def __init__(self, cap):
        self.parts = []
        self.size = 0
        self.cap = cap
        self.truncated = False
        self.cursor = 0  # index into parts consumed by drain()

    def writable(self):
        return True

    def write(self, s):
        if type(s) is not str:
            s = str(s)
        n = len(s.encode("utf-8", "replace"))
        if self.size + n > self.cap:
            self.truncated = True
            remaining = max(self.cap - self.size, 0)
            if remaining:
                s = s.encode("utf-8", "replace")[:remaining].decode("utf-8", "ignore")
                self.parts.append(s)
                self.size += remaining
            return len(s)
        self.parts.append(s)
        self.size += n
        return len(s)

    def flush(self):
        pass

    def drain(self):
        new = "".join(self.parts[self.cursor:])
        self.cursor = len(self.parts)
        return new


class Tracer:
    def __init__(self, limits, out, err):
        self.limits = limits
        self.ser = Serializer(limits)
        self.out = out
        self.err = err
        self.steps = []
        self.truncated = False
        self.truncation_reason = None
        self.approx_bytes = 0
        self.finalize = None  # callback set by main()

    # -- snapshot helpers -------------------------------------------------
    def _vars(self, mapping, skip_modules_and_callables):
        out = {}
        count = 0
        try:
            items = list(mapping.items())
        except Exception:  # noqa: BLE001
            return out
        for name, value in items:
            if type(name) is not str:
                continue
            if name.startswith("__"):
                continue
            if skip_modules_and_callables:
                tn = type_name(value)
                if tn in ("function", "builtin_function_or_method", "module", "type"):
                    continue
            if count >= self.limits["maxVarsPerFrame"]:
                out["…"] = {"t": "object", "kind": "more variables omitted"}
                break
            out[name] = self.ser.ser(value)
            count += 1
        return out

    def _stack(self, frame):
        stack = []
        f = frame
        while f is not None and len(stack) < self.limits["maxStackDepth"]:
            if f.f_code.co_filename == USER_FILENAME:
                name = f.f_code.co_name
                stack.append({"function": name, "line": f.f_lineno})
            f = f.f_back
        stack.reverse()
        return stack

    def record(self, frame, event, arg):
        if len(self.steps) >= self.limits["maxSteps"]:
            self.truncated = True
            self.truncation_reason = "max_steps"
            if self.finalize:
                self.finalize()
            return
        is_module = frame.f_code.co_name == "<module>"
        step = {
            "index": len(self.steps),
            "line": frame.f_lineno,
            "event": event,
            "function": "<module>" if is_module else frame.f_code.co_name,
            "locals": self._vars(frame.f_locals, skip_modules_and_callables=is_module),
            "stack": self._stack(frame),
            "stdout": self.out.drain(),
        }
        if not is_module:
            step["globals"] = self._vars(frame.f_globals, skip_modules_and_callables=True)
        if event == "return":
            step["returnValue"] = self.ser.ser(arg)
        elif event == "exception":
            exc_type, exc_val, _tb = arg
            step["exception"] = {
                "type": type_name(exc_val),
                "message": safe_exception_message(exc_val, self.ser, 300),
            }
        encoded = len(json.dumps(step))
        self.approx_bytes += encoded
        if self.approx_bytes > self.limits["maxResponseBytes"]:
            self.truncated = True
            self.truncation_reason = "max_response_bytes"
            if self.finalize:
                self.finalize()
            return
        self.steps.append(step)

    def trace(self, frame, event, arg):
        if frame.f_code.co_filename != USER_FILENAME:
            return None
        try:
            # The module-level "call" has no meaningful source line (0); skip it.
            if event == "call" and frame.f_code.co_name == "<module>":
                pass
            elif event in ("call", "line", "return", "exception"):
                self.record(frame, event, arg)
        except Exception:  # noqa: BLE001
            # Never let tracer bugs change program behavior.
            pass
        return self.trace


def build_result(tracer, status, error, exit_code, trailing_stdout):
    return {
        "status": status,  # "ok" | "exception" | "syntax_error" | "truncated"
        "exitCode": exit_code,
        "steps": tracer.steps,
        "truncated": tracer.truncated,
        "truncationReason": tracer.truncation_reason,
        "stdoutTruncated": tracer.out.truncated,
        "trailingStdout": trailing_stdout,
        "stderr": "".join(tracer.err.parts),
        "error": error,
    }


def merge_limits(user_limits):
    limits = dict(DEFAULT_LIMITS)
    if isinstance(user_limits, dict):
        for k, default in DEFAULT_LIMITS.items():
            v = user_limits.get(k)
            if type(v) is int and 0 < v <= default * 4:
                limits[k] = v
        # Hard ceilings regardless of request
        limits["maxSteps"] = min(limits["maxSteps"], 10000)
        limits["maxResponseBytes"] = min(limits["maxResponseBytes"], 8 * 1024 * 1024)
    return limits


def run_trace(code, stdin_text, user_limits, emit):
    """Core entry; `emit(result_dict)` is called exactly once, then returns.

    When the step cap is hit, the tracer calls tracer.finalize which emits and
    hard-exits the process (cannot be caught by user code).
    """
    limits = merge_limits(user_limits)
    out = Capture(limits["maxStdoutBytes"])
    err = Capture(limits["maxStdoutBytes"])
    tracer = Tracer(limits, out, err)

    try:
        compiled = compile(code, USER_FILENAME, "exec")
    except SyntaxError as exc:
        err.write("SyntaxError: %s (line %d)\n" % (exc.msg, exc.lineno or 0))
        emit(
            build_result(
                tracer,
                "syntax_error",
                {"type": "SyntaxError", "message": exc.msg, "line": exc.lineno or 0},
                3,
                "",
            )
        )
        return

    emitted = {"done": False}

    def finish(status, error, exit_code):
        if emitted["done"]:
            return
        emitted["done"] = True
        sys.settrace(None)
        trailing = out.drain()
        result = build_result(tracer, status, error, exit_code, trailing)
        emit(result)

    def hard_finalize():
        finish("truncated", None, 0)
        sys.stdout = sys.__stdout__
        sys.stdout.flush()
        os._exit(0)

    tracer.finalize = hard_finalize

    real_stdout, real_stderr, real_stdin = sys.stdout, sys.stderr, sys.stdin
    sys.stdout, sys.stderr = out, err
    sys.stdin = io.TextIOWrapper(io.BytesIO(stdin_text.encode("utf-8")), encoding="utf-8")
    glb = {"__name__": "__main__", "__file__": USER_FILENAME, "__builtins__": __builtins__}
    status, error, exit_code = "ok", None, 0
    try:
        sys.settrace(tracer.trace)
        try:
            exec(compiled, glb)  # noqa: S102 - sandboxed executor
        finally:
            sys.settrace(None)
    except SystemExit as exc:
        c = exc.code
        exit_code = 0 if c is None else (c & 0xFF if isinstance(c, int) else 1)
    except BaseException as exc:  # noqa: BLE001
        status = "exception"
        exit_code = 1
        tb = exc.__traceback__
        line = 0
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == USER_FILENAME:
                line = tb.tb_lineno
            tb = tb.tb_next
        error = {
            "type": type_name(exc),
            "message": safe_exception_message(exc, tracer.ser, 300),
            "line": line,
        }
        err.write("%s: %s\n" % (error["type"], error["message"]))
    finally:
        sys.stdout, sys.stderr, sys.stdin = real_stdout, real_stderr, real_stdin
    finish(status, error, exit_code)


def main():
    raw = sys.stdin.buffer.read(MAX_ENVELOPE_BYTES + 1)
    if len(raw) > MAX_ENVELOPE_BYTES:
        sys.stdout.write(json.dumps({"status": "protocol_error"}) + "\n")
        return 70
    try:
        data = json.loads(raw.decode("utf-8"))
        code, stdin_text = data["code"], data.get("stdin", "")
        if type(code) is not str or type(stdin_text) is not str:
            raise ValueError("bad types")
    except Exception:  # noqa: BLE001
        sys.stdout.write(json.dumps({"status": "protocol_error"}) + "\n")
        return 70

    def emit(result):
        sys.__stdout__.write("\n" + json.dumps(result, separators=(",", ":")) + "\n")
        sys.__stdout__.flush()

    run_trace(code, stdin_text, data.get("limits"), emit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
