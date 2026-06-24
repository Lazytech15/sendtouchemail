// worker/index.ts
export { EmailWorkflow } from "./workflow";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }));
    }

    // ─── POST /api/contact — Contact form (unchanged) ───────────────────────
    if (url.pathname === "/api/contact" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          name?: string; email?: string; message?: string; source?: string;
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
          Response.json({ success: true, instanceId: instance.id, message: "Message received!" })
        );
      } catch (err) {
        console.error("Contact endpoint error:", err);
        return corsResponse(Response.json({ error: "Something went wrong." }, { status: 500 }));
      }
    }

    // ─── POST /api/booking/guest-confirm — Hotel booking emails ─────────────
    if (url.pathname === "/api/booking/guest-confirm" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          guestName?: string; guestEmail?: string; roomType?: string;
          checkIn?: string; checkOut?: string; guests?: string | number;
          bookingRef?: string;
        };

        if (!body.guestName || !body.guestEmail) {
          return corsResponse(
            Response.json({ error: "guestName and guestEmail are required." }, { status: 400 })
          );
        }

        const formatDate = (iso: string) => {
          if (!iso) return "—";
          return new Date(iso).toLocaleDateString("en-PH", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
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

        // Generate a short booking reference
        const bookingRef = body.bookingRef ?? `VLM-${Date.now().toString(36).toUpperCase()}`;

        // ── Email 1: Guest confirmation ──────────────────────────────────────
        const guestRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Vue sur la Montagne Hotel <reservations@eablao.dev>",
            to:   [body.guestEmail],
            subject: "Booking Request Received — Vue sur la Montagne Hotel",
            html: buildGuestHtml({ guestName: body.guestName, roomType: body.roomType ?? "—", checkInFmt, checkOutFmt, nights, guests: String(body.guests ?? "—"), bookingRef }),
            text: buildGuestText({ guestName: body.guestName, roomType: body.roomType ?? "—", checkInFmt, checkOutFmt, nights, guests: String(body.guests ?? "—"), bookingRef }),
          }),
        });

        if (!guestRes.ok) {
          const err = await guestRes.text();
          console.error("Resend guest email error:", err);
          return corsResponse(Response.json({ error: "Failed to send guest confirmation." }, { status: 500 }));
        }

        // ── Email 2: Admin notification (to your own TO_EMAIL) ───────────────
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Vue sur la Montagne Hotel <reservations@eablao.dev>",
            to:   [env.TO_EMAIL],
            subject: `New Booking Request from ${body.guestName} — ${bookingRef}`,
            html: buildAdminHtml({ guestName: body.guestName, guestEmail: body.guestEmail, roomType: body.roomType ?? "—", checkInFmt, checkOutFmt, nights, guests: String(body.guests ?? "—"), bookingRef }),
          }),
        }).catch((e) => console.error("Admin notification failed (non-critical):", e));

        const guestData = (await guestRes.json()) as { id: string };
        console.log(`[Booking] ${bookingRef} — ${body.guestName} <${body.guestEmail}> Resend ID: ${guestData.id}`);

        return corsResponse(Response.json({ success: true, bookingRef, emailId: guestData.id }));
      } catch (err) {
        console.error("booking/guest-confirm error:", err);
        return corsResponse(Response.json({ error: "Something went wrong." }, { status: 500 }));
      }
    }

    return corsResponse(Response.json({ error: "Not Found" }, { status: 404 }));
  },
} satisfies ExportedHandler<Env>;

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers });
}

// ─── Guest confirmation HTML ─────────────────────────────────────────────────
function buildGuestHtml(p: { guestName: string; roomType: string; checkInFmt: string; checkOutFmt: string; nights: number | null; guests: string; bookingRef: string }): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:Georgia,serif;margin:0;padding:0;background:#f0ebe0;}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border:1px solid #dccbb5;}
  .hdr{background:#1B365D;padding:32px;text-align:center;}
  .hdr-eye{font-family:Arial,sans-serif;font-size:10px;letter-spacing:.35em;text-transform:uppercase;color:#DCCBB5;opacity:.75;}
  .hdr-title{font-size:26px;font-style:italic;font-weight:400;color:#DCCBB5;margin:8px 0 0;}
  .check{width:48px;height:48px;border-radius:50%;border:1px solid rgba(220,203,181,.4);display:inline-block;line-height:48px;font-size:22px;color:#DCCBB5;margin-bottom:12px;}
  .body{padding:32px;}
  .greeting{font-size:15px;color:#1B365D;margin-bottom:16px;}
  .intro{font-size:13px;color:rgba(51,51,51,.65);line-height:1.7;margin-bottom:28px;font-family:Arial,sans-serif;}
  .sec-label{font-family:Arial,sans-serif;font-size:9px;letter-spacing:.35em;text-transform:uppercase;color:rgba(27,54,93,.5);margin-bottom:12px;}
  table{width:100%;border-collapse:collapse;margin-bottom:28px;}
  td{padding:10px 0;border-bottom:1px solid rgba(27,54,93,.08);font-family:Arial,sans-serif;font-size:13px;}
  td:first-child{color:rgba(51,51,51,.45);font-size:10px;letter-spacing:.15em;text-transform:uppercase;width:38%;}
  td:last-child{color:#1B365D;font-weight:500;}
  .ref{background:rgba(27,54,93,.04);border:1px solid rgba(27,54,93,.12);padding:10px 16px;margin-bottom:28px;font-family:monospace;font-size:11px;color:rgba(27,54,93,.5);}
  .note{font-family:Arial,sans-serif;font-size:12px;color:rgba(51,51,51,.55);line-height:1.7;margin-bottom:24px;}
  hr{border:none;border-top:1px solid rgba(27,54,93,.1);margin:24px 0;}
  .ftr{background:#F5F0E8;padding:20px 32px;text-align:center;border-top:1px solid rgba(27,54,93,.1);}
  .ftr p{font-family:Arial,sans-serif;font-size:11px;color:rgba(51,51,51,.45);margin:4px 0;}
  .disclaimer{background:#fff3cd;padding:16px 32px;text-align:center;border-top:1px solid #ffeeba;}
  .disclaimer p{font-family:Arial,sans-serif;font-size:11px;color:#856404;margin:4px 0;line-height:1.6;}
  .disclaimer a{color:#856404;font-weight:bold;text-decoration:underline;}
</style></head><body>
<div class="wrap">
  <div class="hdr">
    <div class="check">✓</div>
    <div class="hdr-eye">Reservation Request</div>
    <div class="hdr-title">Request Received</div>
  </div>
  <div class="body">
    <div class="greeting">Dear ${p.guestName},</div>
    <div class="intro">Thank you for choosing <strong>Vue sur la Montagne Hotel</strong>. We have received your reservation request and our team will review and confirm your booking within 24 hours.</div>
    <div class="sec-label">Your Booking Details</div>
    <table>
      <tr><td>Room Type</td><td>${p.roomType}</td></tr>
      <tr><td>Check-in</td><td>${p.checkInFmt}</td></tr>
      <tr><td>Check-out</td><td>${p.checkOutFmt}</td></tr>
      ${p.nights ? `<tr><td>Duration</td><td>${p.nights} Night${p.nights > 1 ? "s" : ""}</td></tr>` : ""}
      <tr><td>Guests</td><td>${p.guests}</td></tr>
    </table>
    <div class="ref">Booking Reference: ${p.bookingRef}</div>
    <div class="note">Our reservations team will send you a final confirmation once your booking is approved. If you have any questions, please reach out to us.</div>
    <hr/>
    <div class="note">📞 &nbsp;+63 2 8123 4567 &nbsp;·&nbsp; +63 917 555 8900<br/>✉️ &nbsp;reservations@vuesurmontagne.ph</div>
  </div>
  <div class="ftr">
    <p><strong>Vue sur la Montagne Hotel</strong></p>
    <p>Km. 28 Tanay–Sampaloc Road, Tanay, Rizal 1980, Philippines</p>
  </div>
  <div class="disclaimer">
    <p><strong>Disclaimer:</strong> This email contains mock data and is entirely fictitious. It is generated solely for a reservation system portfolio demonstration.</p>
    <p>View my portfolio at: <a href="https://eablao.dev" target="_blank">https://eablao.dev</a></p>
  </div>
</div>
</body></html>`;
}

function buildGuestText(p: { guestName: string; roomType: string; checkInFmt: string; checkOutFmt: string; nights: number | null; guests: string; bookingRef: string }): string {
  return `Dear ${p.guestName},

Thank you for choosing Vue sur la Montagne Hotel. We have received your reservation request and our team will confirm your booking within 24 hours.

BOOKING DETAILS
───────────────
Reference : ${p.bookingRef}
Room Type : ${p.roomType}
Check-in  : ${p.checkInFmt}
Check-out : ${p.checkOutFmt}
${p.nights ? `Duration  : ${p.nights} Night${p.nights > 1 ? "s" : ""}\n` : ""}Guests    : ${p.guests}

Questions? Contact us:
  reservations@vuesurmontagne.ph
  +63 2 8123 4567

Warm regards,
Reservations Team — Vue sur la Montagne Hotel`.trim();
}

// ─── Admin notification HTML ─────────────────────────────────────────────────
function buildAdminHtml(p: { guestName: string; guestEmail: string; roomType: string; checkInFmt: string; checkOutFmt: string; nights: number | null; guests: string; bookingRef: string }): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f7f7f7;}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border:1px solid #e4e4e4;border-radius:6px;overflow:hidden;}
  .hdr{padding:24px 32px;border-bottom:3px solid #1B365D;background:#f7f7f7;}
  .hdr-label{font-size:10px;letter-spacing:.25em;color:#1B365D;text-transform:uppercase;opacity:.7;}
  .hdr-title{font-size:22px;font-weight:700;color:#1B365D;margin:6px 0 0;}
  .badge{display:inline-block;margin-top:10px;padding:3px 10px;border-radius:4px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;background:#eef2ff;color:#1B365D;border:1px solid #c7d2fe;}
  .body{padding:28px 32px;}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;}
  td{padding:10px 0;border-bottom:1px solid #ebebeb;font-size:13px;}
  td:first-child{color:#888;font-size:10px;letter-spacing:.2em;text-transform:uppercase;width:38%;}
  td:last-child{color:#1B365D;font-weight:500;}
  .ftr{padding:16px 32px;border-top:1px solid #ebebeb;background:#f7f7f7;}
  .ftr p{font-size:11px;color:#aaa;margin:0;}
</style></head><body>
<div class="wrap">
  <div class="hdr">
    <div class="hdr-label">↳ New Booking Request</div>
    <div class="hdr-title">Reservation Pending</div>
    <div class="badge">${p.bookingRef}</div>
  </div>
  <div class="body">
    <table>
      <tr><td>Guest</td><td>${p.guestName}</td></tr>
      <tr><td>Email</td><td><a href="mailto:${p.guestEmail}" style="color:#1B365D;">${p.guestEmail}</a></td></tr>
      <tr><td>Room Type</td><td>${p.roomType}</td></tr>
      <tr><td>Check-in</td><td>${p.checkInFmt}</td></tr>
      <tr><td>Check-out</td><td>${p.checkOutFmt}</td></tr>
      ${p.nights ? `<tr><td>Duration</td><td>${p.nights} Night${p.nights > 1 ? "s" : ""}</td></tr>` : ""}
      <tr><td>Guests</td><td>${p.guests}</td></tr>
    </table>
    <p style="font-size:12px;color:#666;">Reply directly to this email or contact the guest at <a href="mailto:${p.guestEmail}" style="color:#1B365D;">${p.guestEmail}</a> to confirm or modify the reservation.</p>
  </div>
  <div class="ftr"><p>Vue sur la Montagne Hotel · Reservations System</p></div>
</div>
</body></html>`;
}