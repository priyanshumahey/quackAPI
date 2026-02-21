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
---------------------------------------------------------
`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

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
});
