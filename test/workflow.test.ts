import { describe, it, expect } from "vitest";
import worker from "../worker/index";

// Minimal mock env — secrets aren't needed for request-routing tests
const mockEnv = {
	EMAIL_WORKFLOW: {
		create: async () => ({ id: "test-instance-id" }),
	},
	RESEND_API_KEY: "re_test_key",
	TO_EMAIL: "test@example.com",
} as unknown as Env;

function makeRequest(method: string, path: string, body?: object): Request {
	return new Request(`https://worker.example.com${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	});
}

describe("Contact worker", () => {
	it("POST /api/contact returns 200 with valid payload", async () => {
		const req = makeRequest("POST", "/api/contact", {
			name: "Jose Ramirez",
			email: "jose@example.com",
			message: "Hello, I want to work with you!",
		});

		const res = await worker.fetch(req, mockEnv);
		expect(res.status).toBe(200);

		const body = await res.json() as { success: boolean; instanceId: string };
		expect(body.success).toBe(true);
		expect(body.instanceId).toBe("test-instance-id");
	});

	it("POST /api/contact returns 400 when fields are missing", async () => {
		const req = makeRequest("POST", "/api/contact", {
			name: "Jose Ramirez",
			// missing email and message
		});

		const res = await worker.fetch(req, mockEnv);
		expect(res.status).toBe(400);

		const body = await res.json() as { error: string };
		expect(body.error).toContain("required");
	});

	it("OPTIONS /api/contact returns 204 for CORS preflight", async () => {
		const req = makeRequest("OPTIONS", "/api/contact");
		const res = await worker.fetch(req, mockEnv);
		expect(res.status).toBe(204);
	});

	it("GET unknown route returns 404", async () => {
		const req = makeRequest("GET", "/not-a-real-route");
		const res = await worker.fetch(req, mockEnv);
		expect(res.status).toBe(404);
	});
});