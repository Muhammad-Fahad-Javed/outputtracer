"""Tests for run_worker.py and trace_worker.py.

These execute the real workers as subprocesses. They run on a developer machine
and prove tracer/runner LOGIC. They do NOT prove sandbox isolation: that is
provided by Docker flags and must be verified separately (see tests/security/).
"""
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.join(HERE, "..", "py")
RUN = os.path.join(PY, "run_worker.py")
TRACE = os.path.join(PY, "trace_worker.py")
ENV = {**os.environ, "PYTHONHASHSEED": "0"}


def run(code, stdin="", timeout=20):
    p = subprocess.run(
        [sys.executable, "-I", RUN],
        input=json.dumps({"code": code, "stdin": stdin}).encode(),
        capture_output=True, timeout=timeout, env=ENV,
    )
    return p.returncode, p.stdout.decode("utf-8"), p.stderr.decode("utf-8")


def trace(code, stdin="", limits=None, timeout=60):
    env = {"code": code, "stdin": stdin}
    if limits:
        env["limits"] = limits
    p = subprocess.run(
        [sys.executable, "-I", TRACE],
        input=json.dumps(env).encode(), capture_output=True, timeout=timeout, env=ENV,
    )
    lines = [l for l in p.stdout.decode("utf-8").splitlines() if l.strip()]
    return p.returncode, json.loads(lines[-1])


class RunWorkerTests(unittest.TestCase):
    def test_prints_output(self):
        rc, out, _ = run("print('hello')")
        self.assertEqual((rc, out), (0, "hello\n"))

    def test_reads_stdin(self):
        rc, out, _ = run("a=int(input());b=int(input());print(a+b)", "2\n3\n")
        self.assertEqual((rc, out), (0, "5\n"))

    def test_unicode(self):
        rc, out, _ = run("print(input()[::-1])", "héllo→\n")
        self.assertEqual((rc, out), (0, "→olléh\n"))

    def test_empty_program_and_empty_input(self):
        self.assertEqual(run("")[0], 0)
        rc, _, err = run("input()", "")
        self.assertEqual(rc, 1)
        self.assertIn("EOFError", err)

    def test_syntax_error_exit_3_and_no_host_path(self):
        rc, _, err = run("def (:\n")
        self.assertEqual(rc, 3)
        self.assertIn("SyntaxError", err)
        self.assertNotIn(PY, err)

    def test_runtime_error_exit_1_user_frames_only(self):
        rc, _, err = run("x = 1\nprint(1/0)\n")
        self.assertEqual(rc, 1)
        self.assertIn('File "main.py", line 2', err)
        self.assertIn("ZeroDivisionError", err)
        self.assertNotIn("run_worker", err)

    def test_sys_exit_code_preserved(self):
        self.assertEqual(run("import sys; sys.exit(7)")[0], 7)
        self.assertEqual(run("import sys; sys.exit(0)")[0], 0)

    def test_bad_envelope(self):
        p = subprocess.run([sys.executable, "-I", RUN], input=b"not json", capture_output=True)
        self.assertEqual(p.returncode, 70)

    def test_main_guard(self):
        rc, out, _ = run("print(__name__)")
        self.assertEqual(out, "__main__\n")


class TraceWorkerTests(unittest.TestCase):
    def test_basic_trace_is_real(self):
        rc, r = trace("x = 1\ny = x + 1\nprint(y)\n")
        self.assertEqual(rc, 0)
        self.assertEqual(r["status"], "ok")
        self.assertEqual([s["line"] for s in r["steps"] if s["event"] == "line"], [1, 2, 3])
        last_line_step = [s for s in r["steps"] if s["event"] == "line"][-1]
        self.assertEqual(last_line_step["locals"]["y"], {"t": "int", "v": 2})

    def test_lines_are_one_based_and_indices_sequential(self):
        _, r = trace("a = 1\nb = 2\n")
        self.assertTrue(all(s["line"] >= 1 for s in r["steps"]))
        self.assertEqual([s["index"] for s in r["steps"]], list(range(len(r["steps"]))))

    def test_loop_values_change(self):
        _, r = trace("t = 0\nfor i in range(3):\n    t += i\n")
        seen = [s["locals"]["i"]["v"] for s in r["steps"] if s["event"] == "line" and "i" in s["locals"]]
        self.assertEqual(seen[:1], [0])
        self.assertIn(2, seen)

    def test_function_call_and_return(self):
        _, r = trace("def f(n):\n    return n * 2\nz = f(4)\n")
        events = [(s["event"], s["function"]) for s in r["steps"]]
        self.assertIn(("call", "f"), events)
        self.assertIn(("return", "f"), events)
        ret = [s for s in r["steps"] if s["event"] == "return" and s["function"] == "f"][0]
        self.assertEqual(ret["returnValue"], {"t": "int", "v": 8})
        call = [s for s in r["steps"] if s["event"] == "call" and s["function"] == "f"][0]
        self.assertEqual(call["locals"]["n"], {"t": "int", "v": 4})
        self.assertEqual([f["function"] for f in call["stack"]], ["<module>", "f"])
        self.assertEqual(events.index(("call", "f")) < events.index(("return", "f")), True)

    def test_exception_captured(self):
        _, r = trace("x = 1\ny = x / 0\n")
        self.assertEqual(r["status"], "exception")
        self.assertEqual(r["error"]["type"], "ZeroDivisionError")
        self.assertEqual(r["error"]["line"], 2)
        exc = [s for s in r["steps"] if s["event"] == "exception"]
        self.assertTrue(exc)
        self.assertEqual(exc[0]["exception"]["type"], "ZeroDivisionError")

    def test_incremental_stdout_not_cumulative(self):
        _, r = trace("print('a')\nprint('b')\nprint('c')\n")
        combined = "".join(s["stdout"] for s in r["steps"]) + r["trailingStdout"]
        self.assertEqual(combined, "a\nb\nc\n")
        self.assertTrue(all(s["stdout"] in ("", "a\n", "b\n", "c\n") for s in r["steps"]))

    def test_stdin_supported(self):
        _, r = trace("n = int(input())\nprint(n + 1)\n", stdin="41\n")
        combined = "".join(s["stdout"] for s in r["steps"]) + r["trailingStdout"]
        self.assertEqual(combined, "42\n")

    def test_nested_containers(self):
        _, r = trace("d = {'a': [1, 2, (3, 4)], 'b': {5, 6}}\nx = 0\n")
        step = [s for s in r["steps"] if s["event"] == "line" and "d" in s["locals"]][0]
        d = step["locals"]["d"]
        self.assertEqual(d["t"], "dict")
        self.assertEqual(d["v"][0][0], {"t": "str", "v": "a"})
        self.assertEqual(d["v"][0][1]["t"], "list")
        self.assertEqual(d["v"][1][1]["t"], "set")

    def test_circular_reference(self):
        _, r = trace("a = []\na.append(a)\nz = 1\n")
        step = [s for s in r["steps"] if s["event"] == "line" and s["line"] == 3][0]
        inner = step["locals"]["a"]["v"][0]
        self.assertEqual(inner["t"], "ref")

    def test_deep_nesting_bounded(self):
        _, r = trace("x = []\nfor _ in range(500):\n    x = [x]\nz = 1\n", limits={"maxSteps": 5000})
        step = [s for s in r["steps"] if s["event"] == "line" and s["line"] == 4][0]
        v, depth = step["locals"]["x"], 0
        while v.get("t") == "list" and v["v"]:
            v, depth = v["v"][0], depth + 1
        self.assertLessEqual(depth, 6)
        self.assertEqual(v["t"], "deep")

    def test_large_collections_and_strings_truncated(self):
        _, r = trace("big = list(range(100000))\ns = 'x' * 100000\nz = 1\n")
        step = [s for s in r["steps"] if s["event"] == "line" and s["line"] == 3][0]
        self.assertTrue(step["locals"]["big"]["trunc"])
        self.assertEqual(step["locals"]["big"]["len"], 100000)
        self.assertLessEqual(len(step["locals"]["big"]["v"]), 30)
        self.assertTrue(step["locals"]["s"]["trunc"])
        self.assertLessEqual(len(step["locals"]["s"]["v"]), 200)

    def test_nonfinite_and_bigint(self):
        _, r = trace("a = float('nan')\nb = float('inf')\nc = 10**5000\nz = 1\n")
        step = [s for s in r["steps"] if s["event"] == "line" and s["line"] == 4][0]
        self.assertEqual(step["locals"]["a"], {"t": "float", "v": "nan"})
        self.assertEqual(step["locals"]["b"], {"t": "float", "v": "inf"})
        self.assertEqual(step["locals"]["c"]["t"], "bigint")
        json.dumps(r)  # whole result must be valid JSON

    def test_user_objects_never_have_hooks_called(self):
        code = (
            "class Evil:\n"
            "    def __repr__(self):\n"
            "        print('REPR CALLED')\n"
            "        return 'x'\n"
            "    def __str__(self):\n"
            "        print('STR CALLED')\n"
            "        return 'x'\n"
            "    @property\n"
            "    def boom(self):\n"
            "        print('PROP CALLED')\n"
            "e = Evil()\n"
            "d = {'k': e}\n"
            "l = [e]\n"
            "z = 1\n"
        )
        _, r = trace(code)
        combined = "".join(s["stdout"] for s in r["steps"]) + r["trailingStdout"]
        self.assertEqual(combined, "")
        step = [s for s in r["steps"] if s["event"] == "line" and s["line"] == 14][0]
        self.assertEqual(step["locals"]["e"], {"t": "object", "kind": "Evil"})

    def test_subclass_of_list_is_placeholder(self):
        code = "class L(list):\n    def __iter__(self):\n        print('ITER')\n        return iter([])\nx = L([1])\nz = 1\n"
        _, r = trace(code)
        combined = "".join(s["stdout"] for s in r["steps"]) + r["trailingStdout"]
        self.assertNotIn("ITER", combined)

    def test_metaclass_name_override_ignored(self):
        code = "class M(type):\n    __name__ = property(lambda s: 1/0)\nclass C(metaclass=M):\n    pass\nc = C()\nz = 1\n"
        rc, r = trace(code)
        self.assertEqual(rc, 0)
        self.assertIn(r["status"], ("ok", "exception"))

    def test_custom_exception_message_not_executed(self):
        code = "class E(Exception):\n    def __str__(self):\n        print('STR')\n        return 'm'\nraise E(object())\n"
        _, r = trace(code)
        combined = "".join(s["stdout"] for s in r["steps"]) + r["trailingStdout"]
        self.assertNotIn("STR", combined)
        self.assertEqual(r["status"], "exception")

    def test_step_limit_truncates_and_exits_cleanly(self):
        rc, r = trace("while True:\n    pass\n", limits={"maxSteps": 50})
        self.assertEqual(rc, 0)
        self.assertEqual(r["status"], "truncated")
        self.assertTrue(r["truncated"])
        self.assertEqual(r["truncationReason"], "max_steps")
        self.assertEqual(len(r["steps"]), 50)

    def test_step_limit_cannot_be_swallowed_by_user_code(self):
        code = "while True:\n    try:\n        while True:\n            pass\n    except:\n        pass\n"
        rc, r = trace(code, limits={"maxSteps": 30})
        self.assertEqual(rc, 0)
        self.assertTrue(r["truncated"])

    def test_response_size_limit(self):
        code = "big = list(range(100))\nfor i in range(2000):\n    pass\n"
        _, r = trace(code, limits={"maxSteps": 5000, "maxResponseBytes": 20000})
        self.assertTrue(r["truncated"])
        self.assertEqual(r["truncationReason"], "max_response_bytes")
        self.assertLess(len(json.dumps(r["steps"])), 30000)

    def test_stdout_cap(self):
        _, r = trace("for i in range(2000):\n    print('x' * 100)\n", limits={"maxSteps": 5000, "maxStdoutBytes": 1000})
        self.assertTrue(r["stdoutTruncated"])
        total = sum(len(s["stdout"]) for s in r["steps"]) + len(r["trailingStdout"])
        self.assertLessEqual(total, 1000)

    def test_syntax_error(self):
        rc, r = trace("def (:\n")
        self.assertEqual(r["status"], "syntax_error")
        self.assertEqual(r["steps"], [])
        self.assertEqual(r["error"]["type"], "SyntaxError")

    def test_deterministic_for_deterministic_programs(self):
        code = "s = {'b', 'a', 'c'}\nd = {1: 'x', 2: 'y'}\nfor k in sorted(s):\n    print(k)\n"
        _, r1 = trace(code)
        _, r2 = trace(code)
        self.assertEqual(r1["steps"], r2["steps"])
        self.assertEqual(r1["trailingStdout"], r2["trailingStdout"])

    def test_no_host_paths_or_tracer_frames_leak(self):
        _, r = trace("raise ValueError('x')\n")
        blob = json.dumps(r)
        self.assertNotIn("trace_worker", blob)
        self.assertNotIn(PY, blob)
        self.assertTrue(all(f["function"] != "run_trace" for s in r["steps"] for f in s["stack"]))

    def test_recorded_trace_supports_backward_navigation_without_rerun(self):
        # Navigation is index arithmetic over the recorded list: verify the data
        # needed for any step is self-contained and stable.
        _, r = trace("a = 1\nb = a + 1\nc = b + 1\n")
        lines = [s for s in r["steps"] if s["event"] == "line"]
        self.assertEqual(lines[2]["locals"]["b"], {"t": "int", "v": 2})
        self.assertNotIn("c", lines[2]["locals"])
        self.assertEqual(lines[1]["locals"]["a"], {"t": "int", "v": 1})

    def test_system_exit_code(self):
        _, r = trace("import sys\nsys.exit(4)\n")
        self.assertEqual(r["exitCode"], 4)

    def test_bad_envelope(self):
        p = subprocess.run([sys.executable, "-I", TRACE], input=b"nope", capture_output=True)
        self.assertEqual(p.returncode, 70)


class CurriculumDataTests(unittest.TestCase):
    """Reference solutions must satisfy every public example and hidden test."""

    SOLUTIONS = {
        "py-q-001": "print('Hello, world!')",
        "py-q-002": "a=int(input());b=int(input());print(a+b)",
        "py-q-003": "print(f'Hello, {input()}!')",
        "py-q-004": "n=int(input());print('even' if n%2==0 else 'odd')",
        "py-q-005": "n=int(input())\nfor i in range(1,n+1): print(i)",
        "py-q-006": "n=int(input());t=0\nwhile n>0:\n    t+=n%10;n//=10\nprint(t)",
        "py-q-007": "def factorial(n):\n    return 1 if n<=1 else n*factorial(n-1)\nprint(factorial(int(input())))",
        "py-q-008": "nums=list(map(int,input().split()));m=nums[0]\nfor x in nums:\n    if x>m: m=x\nprint(m)",
        "py-q-009": "c={}\nfor w in input().split(): c[w]=c.get(w,0)+1\nfor w,n in c.items(): print(w,n)",
        "py-q-010": "print(len(set(input().split())))",
        "py-q-011": "print(input()[::-1])",
        "py-q-012": "s=''.join(input().lower().split());print('yes' if s==s[::-1] else 'no')",
        "py-q-013": "s=input()\ntry:\n    print(int(s)*2)\nexcept ValueError:\n    print('invalid')",
        "py-q-014": "a=int(input());b=int(input())\ntry:\n    print(f'{a/b:.2f}')\nexcept ZeroDivisionError:\n    print('cannot divide by zero')",
        "py-q-015": "n=int(input())\nt=0\nfor i in range(1,n+1):\n    t+=i\nprint(t)",
    }

    def test_reference_solutions_pass_all_tests(self):
        path = os.path.join(HERE, "..", "..", "curriculum", "python-curriculum.json")
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        ids = [q["id"] for q in data["questions"]]
        self.assertEqual(len(ids), len(set(ids)), "question ids must be unique")
        topic_ids = {t["id"] for t in data["topics"]}
        self.assertEqual(len(topic_ids), len(data["topics"]))
        for q in data["questions"]:
            self.assertIn(q["topic"], topic_ids)
            self.assertIn(q["id"], self.SOLUTIONS, "missing reference solution for " + q["id"])
            for case in q["examples"] + q["hiddenTests"]:
                rc, out, err = run(self.SOLUTIONS[q["id"]], case["stdin"])
                self.assertEqual((rc, out), (0, case["stdout"]), f"{q['id']} failed on {case!r}: {err}")


if __name__ == "__main__":
    unittest.main()
