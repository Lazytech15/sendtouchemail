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
          source?: string;
        };

        if (!body.name || !body.email || !body.message) {
          return corsResponse(
            Response.json({ error: "Name, email, and message are required." }, { status: 400 })
          );
        }

        const instance = await env.EMAIL_WORKFLOW.create({
          params: {
            name: body.name.trim(),
            email: body.email.trim(),
            message: body.message.trim(),
            timestamp: new Date().toISOString(),
            source: body.source?.trim(),
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

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/booking/guest-confirm
    // Called after the booking workflow starts to send the guest a confirmation
    // email from your verified eablao.dev domain.
    // ─────────────────────────────────────────────────────────────────────────
    if (url.pathname === "/api/booking/guest-confirm" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          guestName?: string;
          guestEmail?: string;
          roomType?: string;
          checkIn?: string;
          checkOut?: string;
          guests?: string | number;
          bookingRef?: string;
        };

        if (!body.guestName || !body.guestEmail) {
          return corsResponse(
            Response.json({ error: "guestName and guestEmail are required." }, { status: 400 })
          );
        }

        const formatDate = (iso: string) => {
          if (!iso) return "—";
          const d = new Date(iso);
          return d.toLocaleDateString("en-PH", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "Asia/Manila",
          });
        };

        const checkInFmt  = formatDate(body.checkIn  ?? "");
        const checkOutFmt = formatDate(body.checkOut ?? "");

        const nights = (() => {
          if (!body.checkIn || !body.checkOut) return null;
          const diff = new Date(body.checkOut).getTime() - new Date(body.checkIn).getTime();
          const n = Math.round(diff / (1000 * 60 * 60 * 24));
          return n > 0 ? n : null;
        })();

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // ✅ Using your verified eablao.dev domain
            from: "Vue sur la Montagne Hotel <reservations@eablao.dev>",
            to: [body.guestEmail],
            // Also notify yourself (same as contact form)
            bcc: [env.TO_EMAIL],

            subject: `Booking Request Received — Vue sur la Montagne Hotel`,

            text: `
Dear ${body.guestName},

Thank you for choosing Vue sur la Montagne Hotel. We have received your reservation request and our team will confirm your booking within 24 hours.

BOOKING DETAILS
───────────────
Room Type : ${body.roomType ?? "—"}
Check-in  : ${checkInFmt}
Check-out : ${checkOutFmt}
${nights ? `Nights    : ${nights}\n` : ""}Guests    : ${body.guests ?? "—"}
${body.bookingRef ? `Reference : ${body.bookingRef}\n` : ""}
If you have any questions, please contact us:
  reservations@vuesurmontagne.ph
  +63 2 8123 4567

We look forward to welcoming you!

Warm regards,
Reservations Team
Vue sur la Montagne Hotel
Km. 28 Tanay–Sampaloc Road, Tanay, Rizal 1980, Philippines
            `.trim(),

            html: buildGuestEmailHtml({
              guestName:    body.guestName,
              roomType:     body.roomType  ?? "—",
              checkInFmt,
              checkOutFmt,
              nights,
              guests:       String(body.guests ?? "—"),
              bookingRef:   body.bookingRef,
            }),
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          console.error("Resend guest-confirm error:", err);
          return corsResponse(
            Response.json({ error: "Failed to send confirmation email." }, { status: 500 })
          );
        }

        const data = (await response.json()) as { id: string };
        console.log(`[Booking] Guest confirmation sent → ${body.guestEmail}  Resend ID: ${data.id}`);

        return corsResponse(Response.json({ success: true, emailId: data.id }));
      } catch (err) {
        console.error("booking/guest-confirm error:", err);
        return corsResponse(
          Response.json({ error: "Something went wrong." }, { status: 500 })
        );
      }
    }

    return corsResponse(Response.json({ error: "Not Found" }, { status: 404 }));
  },
} satisfies ExportedHandler<Env>;

// ─── Attach CORS headers ──────────────────────────────────────────────────────
function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers });
}

// ─── Guest confirmation HTML email ───────────────────────────────────────────
function buildGuestEmailHtml(p: {
  guestName:  string;
  roomType:   string;
  checkInFmt: string;
  checkOutFmt: string;
  nights:     number | null;
  guests:     string;
  bookingRef?: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light dark" />
  <style>
    body { font-family: Georgia, serif; margin: 0; padding: 0; background: #f0ebe0; }
    .wrapper {
      max-width: 560px; margin: 32px auto;
      background: #ffffff;
      border: 1px solid #dccbb5;
    }
    .header {
      background: #1B365D;
      padding: 32px;
      text-align: center;
    }
    .header-eyebrow {
      font-family: Arial, sans-serif;
      font-size: 10px; letter-spacing: 0.35em;
      text-transform: uppercase;
      color: #DCCBB5; opacity: 0.75;
    }
    .header-title {
      font-size: 26px; font-style: italic; font-weight: 400;
      color: #DCCBB5; margin: 8px 0 0;
    }
    .check-icon {
      width: 48px; height: 48px;
      border-radius: 50%;
      border: 1px solid rgba(220,203,181,0.4);
      display: inline-flex; align-items: center; justify-content: center;
      margin-bottom: 12px;
      font-size: 22px; color: #DCCBB5;
      line-height: 48px;
    }
    .body { padding: 32px; }
    .greeting { font-size: 15px; color: #1B365D; margin-bottom: 16px; }
    .intro { font-size: 13px; color: rgba(51,51,51,0.65); line-height: 1.7; margin-bottom: 28px; font-family: Arial, sans-serif; }
    .details-heading {
      font-family: Arial, sans-serif;
      font-size: 9px; letter-spacing: 0.35em;
      text-transform: uppercase;
      color: rgba(27,54,93,0.5);
      margin-bottom: 12px;
    }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    .details-table td {
      padding: 10px 0;
      border-bottom: 1px solid rgba(27,54,93,0.08);
      font-family: Arial, sans-serif;
      font-size: 13px;
    }
    .details-table td:first-child {
      color: rgba(51,51,51,0.45);
      font-size: 10px; letter-spacing: 0.15em;
      text-transform: uppercase; width: 38%;
    }
    .details-table td:last-child { color: #1B365D; font-weight: 500; }
    .ref-box {
      background: rgba(27,54,93,0.04);
      border: 1px solid rgba(27,54,93,0.12);
      padding: 10px 16px; margin-bottom: 28px;
      font-family: monospace; font-size: 11px;
      color: rgba(27,54,93,0.5);
    }
    .note { font-family: Arial, sans-serif; font-size: 12px; color: rgba(51,51,51,0.55); line-height: 1.7; margin-bottom: 24px; }
    .divider { border: none; border-top: 1px solid rgba(27,54,93,0.1); margin: 24px 0; }
    .footer {
      background: #F5F0E8;
      padding: 20px 32px;
      text-align: center;
      border-top: 1px solid rgba(27,54,93,0.1);
    }
    .footer p { font-family: Arial, sans-serif; font-size: 11px; color: rgba(51,51,51,0.45); margin: 4px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="check-icon">✓</div>
      <div class="header-eyebrow">Reservation Request</div>
      <div class="header-title">Request Received</div>
    </div>
    <div class="body">
      <div class="greeting">Dear ${p.guestName},</div>
      <div class="intro">
        Thank you for choosing <strong>Vue sur la Montagne Hotel</strong>. We have received your reservation
        request and our team will review and confirm your booking within 24 hours.
      </div>

      <div class="details-heading">Your Booking Details</div>
      <table class="details-table">
        <tr><td>Room Type</td><td>${p.roomType}</td></tr>
        <tr><td>Check-in</td><td>${p.checkInFmt}</td></tr>
        <tr><td>Check-out</td><td>${p.checkOutFmt}</td></tr>
        ${p.nights ? `<tr><td>Duration</td><td>${p.nights} Night${p.nights > 1 ? "s" : ""}</td></tr>` : ""}
        <tr><td>Guests</td><td>${p.guests}</td></tr>
      </table>

      ${p.bookingRef ? `<div class="ref-box">Booking Reference: ${p.bookingRef}</div>` : ""}

      <div class="note">
        Our reservations team will send you a final confirmation email once your booking
        is approved. If you have any questions in the meantime, please don't hesitate
        to reach out to us.
      </div>
      <hr class="divider" />
      <div class="note">
        📞 &nbsp;+63 2 8123 4567 &nbsp;·&nbsp; +63 917 555 8900<br/>
        ✉️ &nbsp;reservations@vuesurmontagne.ph
      </div>
    </div>
    <div class="footer">
      <p><strong>Vue sur la Montagne Hotel</strong></p>
      <p>Km. 28 Tanay–Sampaloc Road, Tanay, Rizal 1980, Philippines</p>
      <p style="margin-top:8px; opacity:0.6;">© 2026 Vue sur la Montagne Hotel. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}