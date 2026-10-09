// Custom Next.js server with WebSocket support for interactive terminal.
//
// This wraps the standard Next.js request handler and adds a WebSocket
// server on the `/ws/terminal` path. All other traffic is handled by
// Next.js as usual.

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import {
  handleTerminalSession,
  TerminalInitPayload,
} from "./src/lib/wsTerminal.js";
import { execConfig } from "./src/lib/execConfig.js";
import { clientIpFromForwarded, globalRateLimiter } from "./src/lib/rateLimit.js";
import { getHub } from "./src/lib/cloud/collabHub.js";
import { accessFromToken } from "./src/lib/cloud/accessToken.js";
import { canEdit } from "./src/lib/cloud/roles.js";

async function resolveTerminalPayload(
  payload: TerminalInitPayload & { projectId?: string; accessToken?: string }
): Promise<{ ok: true; payload: TerminalInitPayload } | { ok: false; message: string }> {
  if (payload.projectId) {
    const access = await accessFromToken(payload.accessToken || "", payload.projectId);
    if (!access) {
      return { ok: false, message: "You do not have access to run this project." };
    }
    if (payload.standard && canEdit(access.role)) {
      await getHub().setStandard(payload.projectId, payload.standard);
    }
    const shared = await getHub().readFiles(payload.projectId);
    return {
      ok: true,
      payload: {
        files: shared.files,
        standard: shared.standard,
        ownerKey: access.userId,
      },
    };
  }

  if (!payload.files || typeof payload.files !== "object") {
    return { ok: false, message: "Invalid init payload: missing files." };
  }
  return { ok: true, payload: { files: payload.files, standard: payload.standard } };
}

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server — only handles upgrades on /ws/terminal
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url!, true);

    if (pathname === "/ws/collab") {
      const ip = clientIpFromForwarded(
        req.headers["x-forwarded-for"],
        req.socket.remoteAddress,
        process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true"
      );
      const limited = globalRateLimiter.check(
        `collab:${ip}`,
        execConfig.rateLimitWsMax,
        execConfig.rateLimitWsWindowMs
      );
      if (!limited.ok) {
        socket.write(
          "HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nRetry-After: " +
            limited.retryAfterSec +
            "\r\n\r\n"
        );
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        getHub().attach(ws);
      });
      return;
    }

    if (pathname === "/ws/terminal") {
      const ip = clientIpFromForwarded(
        req.headers["x-forwarded-for"],
        req.socket.remoteAddress,
        process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true"
      );
      const limited = globalRateLimiter.check(
        `ws:${ip}`,
        execConfig.rateLimitWsMax,
        execConfig.rateLimitWsWindowMs
      );
      if (!limited.ok) {
        socket.write(
          "HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nRetry-After: " +
            limited.retryAfterSec +
            "\r\n\r\n"
        );
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return;
    }

    // Leave HMR and other Next.js upgrades alone in development.
  });

  wss.on("connection", (ws: WebSocket) => {
    // Wait for the first message which should be the init payload
    let initialized = false;

    const initTimeout = setTimeout(() => {
      if (!initialized) {
        ws.send(
          JSON.stringify({
            type: "error",
            data: "No init message received within 10s.",
          })
        );
        ws.close();
      }
    }, 10_000);

    ws.on("message", (data) => {
      if (initialized) return; // After init, messages are handled by the session

      initialized = true;
      clearTimeout(initTimeout);

      try {
        const payload = JSON.parse(data.toString()) as TerminalInitPayload & {
          projectId?: string;
          accessToken?: string;
        };

        void resolveTerminalPayload(payload)
          .then((resolved) => {
            if (!resolved.ok) {
              ws.send(JSON.stringify({ type: "error", data: resolved.message }));
              ws.close();
              return;
            }
            handleTerminalSession(ws, resolved.payload);
          })
          .catch(() => {
            ws.send(
              JSON.stringify({
                type: "error",
                data: "Could not start the program.",
              })
            );
            ws.close();
          });
      } catch {
        ws.send(
          JSON.stringify({
            type: "error",
            data: "Invalid init payload: malformed JSON.",
          })
        );
        ws.close();
      }
    });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(
      `> Ready on http://0.0.0.0:${port} (${dev ? "development" : "production"})`
    );
    console.log(`> WebSocket terminal available at ws://localhost:${port}/ws/terminal`);
    console.log(`> WebSocket collab available at ws://localhost:${port}/ws/collab`);
  });
});
