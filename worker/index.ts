// worker/index.ts
export { EmailWorkflow } from "./workflow";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }));
    }

    // POST /api/contact  — called by your React Contact form
    if (url.pathname === "/api/contact" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          name?: string;
          email?: string;
          message?: string;
        };

        // Basic validation
        if (!body.name || !body.email || !body.message) {
          return corsResponse(
            Response.json({ error: "Name, email, and message are required." }, { status: 400 })
          );
        }

        // Start the email workflow
        const instance = await env.EMAIL_WORKFLOW.create({
          params: {
            name: body.name.trim(),
            email: body.email.trim(),
            message: body.message.trim(),
            timestamp: new Date().toISOString(),
          },
        });

        return corsResponse(
          Response.json({
            success: true,
            instanceId: instance.id,
            message: "Message received! I'll get back to you soon.",
          })
        );
      } catch (err) {
        console.error("Contact endpoint error:", err);
        return corsResponse(
          Response.json({ error: "Something went wrong. Please try again." }, { status: 500 })
        );
      }
    }

    return corsResponse(Response.json({ error: "Not Found" }, { status: 404 }));
  },
} satisfies ExportedHandler<Env>;

// Attach CORS headers to any Response
function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*"); // tighten to your domain later
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}