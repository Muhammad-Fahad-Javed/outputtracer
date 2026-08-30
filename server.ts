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

    if (pathname === "/ws/terminal") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
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
        const payload = JSON.parse(data.toString()) as TerminalInitPayload;

        if (!payload.files || typeof payload.files !== "object") {
          ws.send(
            JSON.stringify({
              type: "error",
              data: "Invalid init payload: missing files.",
            })
          );
          ws.close();
          return;
        }

        handleTerminalSession(ws, payload);
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
  });
});
