const PORT = 3005;

console.log(`🦆 QuackAPI Test Server running at http://localhost:${PORT}`);
console.log(`
Available endpoints to test in QuackAPI:
---------------------------------------------------------
1. Echo Request (Test methods, headers, query, body)
   URL: http://localhost:3005/echo
   Try: GET, POST, PUT, DELETE with different payloads

2. Status Codes (Test error highlighting)
   URL: http://localhost:3005/status/401
   URL: http://localhost:3005/status/404
   URL: http://localhost:3005/status/500

3. Delays (Test loading spinner and timeouts)
   URL: http://localhost:3005/delay/3   (Delays for 3 seconds)

4. Content Types (Test response formatting)
   URL: http://localhost:3005/html      (Returns raw HTML)
   URL: http://localhost:3005/json      (Returns JSON)

5. Binary Data (Test image/binary response handling)
   URL: http://localhost:3005/image     (Returns a 1x1 PNG)

6. Streaming (Test chunked responses and progress)
   URL: http://localhost:3005/stream    (Streams 5 chunks over 5 seconds)

7. Cookies (Test cookie jar persistence)
   URL: http://localhost:3005/cookie/set (Sets a test cookie)
   URL: http://localhost:3005/cookie/get (Reads the test cookie)

8. WebSocket Endpoints
   ws://localhost:3005/ws/echo          (Echoes messages back)
   ws://localhost:3005/ws/chat          (Chat room — broadcasts to all)
   ws://localhost:3005/ws/ticker        (Sends a tick every 2s)
   ws://localhost:3005/ws/json          (Echoes parsed JSON with metadata)
---------------------------------------------------------
`);

// ── WebSocket state ──────────────────────────────────────────────────────────

const chatClients = new Set<any>();
const tickerClients = new Set<any>();
let tickerInterval: ReturnType<typeof setInterval> | null = null;

function startTicker() {
  if (tickerInterval) return;
  let count = 0;
  tickerInterval = setInterval(() => {
    count++;
    const msg = JSON.stringify({ tick: count, time: new Date().toISOString() });
    for (const ws of tickerClients) {
      ws.send(msg);
    }
    if (tickerClients.size === 0) {
      clearInterval(tickerInterval!);
      tickerInterval = null;
    }
  }, 2000);
}

Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    const method = req.method;

    // ── WebSocket upgrade ────────────────────────────────
    if (url.pathname.startsWith("/ws/")) {
      const channel = url.pathname.split("/")[2] || "echo";
      const upgraded = server.upgrade(req, { data: { channel } as any });
      if (upgraded) return undefined as any;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // CORS headers just in case
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Status endpoint
    if (url.pathname.startsWith("/status/")) {
      const code = parseInt(url.pathname.split("/")[2]) || 200;
      return new Response(
        JSON.stringify({
          error: code >= 400,
          message: `Returned status ${code}`,
          code,
        }),
        {
          status: code,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Delay endpoint
    if (url.pathname.startsWith("/delay/")) {
      const seconds = parseInt(url.pathname.split("/")[2]) || 1;
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return new Response(
        JSON.stringify({ message: `Delayed for ${seconds} seconds` }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. HTML endpoint
    if (url.pathname === "/html") {
      return new Response(
        "<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body>\n  <h1>Hello World</h1>\n  <p>This is an HTML response.</p>\n</body>\n</html>",
        {
          headers: { ...corsHeaders, "Content-Type": "text/html" },
        }
      );
    }

    // 4. JSON endpoint
    if (url.pathname === "/json") {
      return new Response(
        JSON.stringify({
          status: "success",
          data: {
            id: 123,
            name: "Test Item",
            tags: ["test", "mock", "api"],
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Image/Binary endpoint
    if (url.pathname === "/image") {
      // A tiny 1x1 transparent PNG
      const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64"
      );
      return new Response(pngBuffer, {
        headers: { ...corsHeaders, "Content-Type": "image/png" },
      });
    }

    // 6. Streaming endpoint
    if (url.pathname === "/stream") {
      const stream = new ReadableStream({
        async start(controller) {
          for (let i = 1; i <= 5; i++) {
            controller.enqueue(new TextEncoder().encode(`Chunk ${i} of 5\n`));
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    // 7. Cookie endpoints
    if (url.pathname === "/cookie/set") {
      return new Response(JSON.stringify({ message: "Cookie set!" }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Set-Cookie": "quack_test_cookie=delicious; Path=/; HttpOnly",
        },
      });
    }

    if (url.pathname === "/cookie/get") {
      const cookieHeader = req.headers.get("cookie") || "No cookies found";
      return new Response(
        JSON.stringify({ message: "Cookies received", cookies: cookieHeader }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Default: Echo endpoint
    const headers = Object.fromEntries(req.headers.entries());
    const query = Object.fromEntries(url.searchParams.entries());
    let body = "";
    try {
      body = await req.text();
    } catch (e) {}

    let parsedBody: any = body;
    if (body && headers["content-type"]?.includes("application/json")) {
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {}
    }

    const responsePayload = {
      _notice: "This is an echo response. It returns exactly what you sent.",
      method,
      url: req.url,
      path: url.pathname,
      query,
      headers,
      body: parsedBody || null,
    };

    return new Response(JSON.stringify(responsePayload, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },

  websocket: {
    open(ws: any) {
      const channel: string = ws.data?.channel || "echo";
      console.log(`  ↔ WS [${channel}] client connected`);

      if (channel === "chat") {
        chatClients.add(ws);
        ws.send(JSON.stringify({ type: "system", message: `Welcome! ${chatClients.size} user(s) online.` }));
        for (const client of chatClients) {
          if (client !== ws) {
            client.send(JSON.stringify({ type: "system", message: "A new user joined." }));
          }
        }
      } else if (channel === "ticker") {
        tickerClients.add(ws);
        ws.send(JSON.stringify({ type: "system", message: "Subscribed to ticker. You will receive a tick every 2 seconds." }));
        startTicker();
      } else if (channel === "json") {
        ws.send(JSON.stringify({ type: "system", message: "Send any JSON and I will echo it back with metadata." }));
      } else {
        // echo
        ws.send("Connected to echo WebSocket. Send any message and it will be echoed back.");
      }
    },

    message(ws: any, message: string | Buffer) {
      const channel: string = ws.data?.channel || "echo";
      const text = typeof message === "string" ? message : message.toString();
      console.log(`  ↔ WS [${channel}] received: ${text.substring(0, 80)}`);

      if (channel === "echo") {
        ws.send(`echo: ${text}`);
      } else if (channel === "chat") {
        const payload = JSON.stringify({ type: "message", from: "user", data: text, timestamp: new Date().toISOString() });
        for (const client of chatClients) {
          client.send(payload);
        }
      } else if (channel === "ticker") {
        ws.send(JSON.stringify({ type: "info", message: "This is a read-only ticker stream. Your message was ignored." }));
      } else if (channel === "json") {
        try {
          const parsed = JSON.parse(text);
          ws.send(JSON.stringify({
            type: "echo",
            receivedAt: new Date().toISOString(),
            byteSize: text.length,
            data: parsed,
          }, null, 2));
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Invalid JSON", raw: text }));
        }
      }
    },

    close(ws: any) {
      const channel: string = ws.data?.channel || "echo";
      console.log(`  ↔ WS [${channel}] client disconnected`);

      if (channel === "chat") {
        chatClients.delete(ws);
        for (const client of chatClients) {
          client.send(JSON.stringify({ type: "system", message: "A user left." }));
        }
      } else if (channel === "ticker") {
        tickerClients.delete(ws);
      }
    },
  },
});
