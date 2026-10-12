# OutputTracer

Browser IDE for **running C++** and **tracing what it prints** — aimed at students who have to predict program output.

Live: [outputtracer.com](https://outputtracer.com)

## What you can do

- Write multi-file C++ (`main.cpp`, headers) in a Visual Studio–style editor
- **Run** in an interactive terminal (stdin over WebSocket)
- **Predict + Trace** to compile, capture stdout, and step through execution with GDB
- Practice 200+ output-tracing questions under `/practice`

## Run locally

You need Node 20+, `g++`, and (optional) `gdb`, `prlimit`, and `bubblewrap`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
npm run build
```

## How execution is isolated

User source is written to a temp directory and compiled with `g++` via `execFile` (no shell). The binary is then run with, in order of preference:

1. **bubblewrap** — no network, private PID/UTS, only `/usr`, `/dev`, `/proc`, and the submission dir
2. **unshare --net** plus `prlimit` (CPU, address space, process count)
3. **prlimit** alone

The process still shares the host kernel. For a public internet deployment, put each run in its own container or microVM as well. Set `TRUST_PROXY=1` behind a reverse proxy so rate limits use `X-Forwarded-For`.

| Env var | Default | Meaning |
| --- | --- | --- |
| `CXX_COMPILER` | `g++` | Compiler binary |
| `MAX_CONCURRENT_RUNS` | `4` | In-flight compile/run sessions |
| `RATE_LIMIT_PREDICT_MAX` | `20` | `/api/predict` hits per IP per window |
| `ENABLE_TRACE` | on | Set `0` to skip GDB tracing |

## Docker

```bash
docker build -t outputtracer .
docker run --rm -p 3000:3000 --security-opt seccomp=unconfined outputtracer
```

`seccomp=unconfined` is only needed if you want bubblewrap user namespaces inside the container. Without it the app still runs with `prlimit` / `unshare` when the kernel allows them.

Health check: `GET /api`.
