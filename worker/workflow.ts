// worker/workflow.ts
import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";

interface ContactParams {
  name: string;
  email: string;
  message: string;
  timestamp: string;
}

export class EmailWorkflow extends WorkflowEntrypoint<Env, ContactParams> {
  async run(event: WorkflowEvent<ContactParams>, step: WorkflowStep) {
    const { name, email, message, timestamp } = event.payload;

    // Step 1: Send email via Resend
    await step.do("send email via resend", async () => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // No custom domain yet → use Resend's free sender
          from: "Portfolio Contact <onboarding@resend.dev>",

          // Your verified Resend account email — set via secret
          to: [this.env.TO_EMAIL],

          subject: `New message from ${name} — eablao.dev`,

          // Plain text fallback
          text: `
You have a new contact form submission.

Name:    ${name}
Email:   ${email}
Sent:    ${timestamp}

Message:
${message}

---
Reply directly to this email to respond.
          `.trim(),

          // HTML version
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: 'DM Sans', Arial, sans-serif; background: #0a0a0a; color: #f2f0eb; margin: 0; padding: 0; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #111; border: 1px solid rgba(242,240,235,0.10); }
    .header { background: #0d0d0d; padding: 28px 32px; border-bottom: 3px solid #c8ff00; }
    .header-label { font-family: monospace; font-size: 10px; letter-spacing: 0.25em; color: #c8ff00; text-transform: uppercase; }
    .header-title { font-size: 26px; font-weight: 700; color: #f2f0eb; margin: 8px 0 0; }
    .body { padding: 32px; }
    .field { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid rgba(242,240,235,0.08); }
    .field:last-child { border-bottom: none; margin-bottom: 0; }
    .field-label { font-family: monospace; font-size: 10px; letter-spacing: 0.22em; color: #c8ff00; text-transform: uppercase; margin-bottom: 6px; }
    .field-value { font-size: 14px; color: rgba(242,240,235,0.80); line-height: 1.6; white-space: pre-wrap; }
    .field-value a { color: #c8ff00; text-decoration: none; }
    .footer { padding: 20px 32px; border-top: 1px solid rgba(242,240,235,0.08); }
    .footer p { font-family: monospace; font-size: 11px; color: rgba(242,240,235,0.28); margin: 0; letter-spacing: 0.06em; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-label">↳ Portfolio · Contact Form</div>
      <div class="header-title">New Message</div>
    </div>
    <div class="body">
      <div class="field">
        <div class="field-label">From</div>
        <div class="field-value">${name}</div>
      </div>
      <div class="field">
        <div class="field-label">Reply-to</div>
        <div class="field-value"><a href="mailto:${email}">${email}</a></div>
      </div>
      <div class="field">
        <div class="field-label">Sent</div>
        <div class="field-value">${timestamp}</div>
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

          // So you can hit Reply and it goes to the visitor
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

    // Step 2: (optional) log the submission for your own records
    await step.do("log submission", async () => {
      console.log(`[Contact] ${timestamp} — ${name} <${email}>`);
    });
  }
}