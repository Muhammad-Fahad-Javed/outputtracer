#!/usr/bin/env bash
# Adversarial checks against the REAL sandbox container.
# Run ONLY on a disposable machine/VM, never on a host holding secrets.
# Requires: docker daemon, and the image built from Dockerfile.sandbox.
#
#   docker build -f Dockerfile.sandbox -t outputtracer-python-sandbox:latest .
#   IMAGE=outputtracer-python-sandbox:latest ./tests/security/run_security_checks.sh
#
# STATUS IN THIS DELIVERY: NOT RUN (no Docker daemon was available when this
# package was produced). Passing these checks is evidence, not proof, of
# isolation; see docs/SECURITY.md for the residual risks.
set -u
IMAGE="${IMAGE:-outputtracer-python-sandbox:latest}"
pass=0; fail=0

# Same flags as dockerExec.mjs buildDockerArgs(); keep in sync.
run_py() {
  local code="$1" timeout_s="${2:-8}" name="otpy-sec-$RANDOM" rc
  printf '%s' "$(python3 -c 'import json,sys; print(json.dumps({"code": sys.argv[1], "stdin": ""}))' "$code")" | \
  timeout -k 2 "$timeout_s" docker run --rm -i --name "$name" \
    --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
    --cap-drop ALL --security-opt no-new-privileges --user 10001:10001 \
    --memory 128m --memory-swap 128m --cpus 0.5 --pids-limit 64 \
    --ulimit nofile=64:64 --ulimit nproc=64:64 --ulimit fsize=8388608:8388608 \
    --ipc none --log-driver none \
    -e PYTHONHASHSEED=0 -e PYTHONDONTWRITEBYTECODE=1 \
    "$IMAGE" python3 -I /opt/worker/run_worker.py 2>&1
  rc=${PIPESTATUS[1]}
  # Killing the Docker CLI does not reliably stop its container. Always remove
  # the exact disposable container created by this invocation.
  docker rm -f "$name" >/dev/null 2>&1 || true
  return "$rc"
}

check() { # name, expected-grep, code [timeout]
  local name="$1" expect="$2" code="$3" t="${4:-8}"
  local out; out="$(run_py "$code" "$t")"; local rc=$?
  if echo "$out" | grep -qE "$expect" || { [ "$expect" = "__TIMEOUT_OR_KILLED__" ] && [ $rc -ne 0 ]; }; then
    echo "PASS  $name"; pass=$((pass+1))
  else
    echo "FAIL  $name"; echo "      output: $(echo "$out" | head -c 300)"; fail=$((fail+1))
  fi
}

check "no network (DNS/connect fails)" "BLOCKED" \
  $'import socket\ntry:\n    socket.create_connection(("1.1.1.1",53),timeout=2)\n    print("REACHED")\nexcept Exception:\n    print("BLOCKED")'
check "cannot write to root filesystem" "BLOCKED" \
  $'try:\n    open("/etc/pwn","w").write("x"); print("WROTE")\nexcept Exception:\n    print("BLOCKED")'
check "cannot exec from noexec tmpfs" "BLOCKED" \
  $'import os,stat\ntry:\n    p="/tmp/x.sh"; open(p,"w").write("#!/bin/sh\\necho hi"); os.chmod(p,0o755)\n    os.execv(p,[p]); print("EXEC")\nexcept Exception:\n    print("BLOCKED")'
check "no host docker socket" "BLOCKED" \
  $'import os\nprint("EXISTS" if os.path.exists("/var/run/docker.sock") else "BLOCKED")'
check "not root" "uid=10001|^10001" \
  $'import os\nprint(os.getuid())'
check "no application secrets in environment" "CLEAN" \
  $'import os\n# GPG_KEY is the public CPython image signing fingerprint, not a credential.\nbad=[k for k,v in os.environ.items() if v and k != "GPG_KEY" and any(s in k.upper() for s in ("SECRET","TOKEN","KEY","PASSWORD","SUPABASE"))]\nprint("LEAK:"+",".join(bad) if bad else "CLEAN")'
check "fork bomb is contained by pids-limit" "CONTAINED|BlockingIOError|Resource temporarily|OSError" \
  $'import os\nn=0\ntry:\n    while n<1000:\n        if os.fork()==0:\n            import time; time.sleep(30); os._exit(0)\n        n+=1\n    print("UNCONTAINED")\nexcept OSError:\n    print("CONTAINED")' 15
check "memory hog is killed (limit enforced outside program)" "__TIMEOUT_OR_KILLED__" \
  $'x=[]\nwhile True:\n    x.append(bytearray(10_000_000))' 20
check "infinite loop is killed by deadline" "__TIMEOUT_OR_KILLED__" \
  $'while True:\n    pass' 6
check "huge output does not hang the harness" "x" \
  $'import sys\nfor _ in range(100000):\n    sys.stdout.write("x"*1000)' 10
check "cannot read other users' output (fresh container has empty /tmp)" "EMPTY" \
  $'import os\nprint("EMPTY" if os.listdir("/tmp")==[] else "LEFTOVER")'

echo; echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
