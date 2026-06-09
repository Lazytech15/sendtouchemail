// worker/workflow.ts
import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";

interface ContactParams {
  name: string;
  email: string;
  message: string;
  timestamp: string;
  source?: string; // e.g. "Portfolio — eablao.dev" or "Vue sur la Montagne Hotel"
}

/** Format ISO timestamp → "11:13:45 AM PHT || 06/09/2026" (Philippines Time, UTC+8) */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  // Shift to PHT (UTC+8)
  const phtOffset = 8 * 60 * 60 * 1000;
  const pht = new Date(d.getTime() + phtOffset);
  const hh = pht.getUTCHours();
  const mm = pht.getUTCMinutes().toString().padStart(2, "0");
  const ss = pht.getUTCSeconds().toString().padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = (hh % 12 || 12).toString().padStart(2, "0");
  const month = (pht.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = pht.getUTCDate().toString().padStart(2, "0");
  const year = pht.getUTCFullYear();
  return `${hour12}:${mm}:${ss} ${ampm} PH Time || ${month}/${day}/${year}`;
}

/** Pass through the source label sent by the frontend, with a fallback */
function resolveSource(source?: string): string {
  return source?.trim() || "Unknown";
}

export class EmailWorkflow extends WorkflowEntrypoint<Env, ContactParams> {
  async run(event: WorkflowEvent<ContactParams>, step: WorkflowStep) {
    const { name, email, message, timestamp, source } = event.payload;
    const readableDate = formatTimestamp(timestamp);
    const sourceLabel = resolveSource(source);

    // Step 1: Send email via Resend
    await step.do("send email via resend", async () => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Portfolio Contact <onboarding@resend.dev>",
          to: [this.env.TO_EMAIL],

          subject: `New message from ${name} — ${sourceLabel}`,

          text: `
You have a new contact form submission.

From:           ${name}
Contact Email:  ${email}
Received From:  ${this.env.TO_EMAIL}
Source:         ${sourceLabel}
Sent:           ${readableDate}

Message:
${message}

---
To reply, email the sender at: ${email}
          `.trim(),

          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: 'DM Sans', Arial, sans-serif;
      margin: 0; padding: 0;
      background: transparent;
      color: #111111;
    }
    .wrapper {
      max-width: 560px;
      margin: 32px auto;
      border-radius: 6px;
      overflow: hidden;
      background: #ffffff;
      border: 1px solid #e4e4e4;
    }
    .header {
      padding: 24px 32px;
      border-bottom: 3px solid #c8ff00;
      background: #f7f7f7;
    }
    .header-label {
      font-family: monospace;
      font-size: 10px;
      letter-spacing: 0.25em;
      color: #5a7a00;
      text-transform: uppercase;
    }
    .header-title {
      font-size: 24px;
      font-weight: 700;
      color: #111111;
      margin: 6px 0 0;
    }
    .source-badge {
      display: inline-block;
      margin-top: 10px;
      padding: 3px 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      background: #edffc0;
      color: #3d5c00;
      border: 1px solid #c8ff00;
    }
    .body { padding: 28px 32px; }
    .field {
      margin-bottom: 18px;
      padding-bottom: 18px;
      border-bottom: 1px solid #ebebeb;
    }
    .field:last-child { border-bottom: none; margin-bottom: 0; }
    .field-label {
      font-family: monospace;
      font-size: 10px;
      letter-spacing: 0.22em;
      color: #5a7a00;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .field-value {
      font-size: 14px;
      color: #333333;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .field-value a { color: #5a7a00; text-decoration: none; }
    .footer {
      padding: 16px 32px;
      border-top: 1px solid #ebebeb;
      background: #f7f7f7;
    }
    .footer p {
      font-family: monospace;
      font-size: 11px;
      color: #aaaaaa;
      margin: 0;
      letter-spacing: 0.06em;
    }

    @media (prefers-color-scheme: dark) {
      .wrapper { background: #1a1a1a !important; border-color: rgba(255,255,255,0.10) !important; }
      .header { background: #111111 !important; }
      .header-label { color: #c8ff00 !important; }
      .header-title { color: #f2f0eb !important; }
      .source-badge { background: rgba(200,255,0,0.12) !important; color: #c8ff00 !important; border-color: rgba(200,255,0,0.3) !important; }
      .body { background: #1a1a1a !important; }
      .field { border-bottom-color: rgba(255,255,255,0.07) !important; }
      .field-label { color: #c8ff00 !important; }
      .field-value { color: rgba(242,240,235,0.80) !important; }
      .field-value a { color: #c8ff00 !important; }
      .footer { background: #111111 !important; border-top-color: rgba(255,255,255,0.07) !important; }
      .footer p { color: rgba(242,240,235,0.28) !important; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-label">↳ Contact Form</div>
      <div class="header-title">New Message</div>
      <div class="source-badge">${sourceLabel}</div>
    </div>
    <div class="body">
      <div class="field">
        <div class="field-label">From</div>
        <div class="field-value">${name}</div>
      </div>
      <div class="field">
        <div class="field-label">Contact Email</div>
        <div class="field-value"><a href="mailto:${email}">${email}</a></div>
      </div>
      <div class="field">
        <div class="field-label">Received From</div>
        <div class="field-value"><a href="mailto:${this.env.TO_EMAIL}">${this.env.TO_EMAIL}</a></div>
      </div>
      <div class="field">
        <div class="field-label">Sent</div>
        <div class="field-value">${readableDate}</div>
      </div>
      <div class="field">
        <div class="field-label">Message</div>
        <div class="field-value">${message.replace(/\n/g, "<br/>")}</div>
      </div>
    </div>
    <div class="footer">
      <p>EABLAO.DEV · All systems operational</p>
    </div>
  </div>
</body>
</html>
          `.trim(),

          reply_to: email,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Resend API error ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as { id: string };
      console.log(`Email sent successfully. Resend ID: ${data.id}`);
      return { emailId: data.id };
    });

    // Step 2: log the submission
    await step.do("log submission", async () => {
      console.log(`[Contact] ${readableDate} — ${name} <${email}> via ${sourceLabel}`);
    });
  }
}