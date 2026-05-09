import nodemailer from "nodemailer";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMailHtml(payload) {
  return [
    "<p>Открыто коммерческое предложение по ссылке.</p>",
    "<ul>",
    "<li><strong>Время (UTC ISO):</strong> " + escapeHtml(String(payload.openedAt || "")) + "</li>",
    "<li><strong>Ссылка страницы:</strong> " + escapeHtml(String(payload.openingPageUrl || "—")) + "</li>",
    "<li><strong>Номер КП:</strong> " + escapeHtml(String(payload.docNumber || "—")) + "</li>",
    "<li><strong>Клиент:</strong> " + escapeHtml(String(payload.clientCompany || "—")) + "</li>",
    "<li><strong>Кому:</strong> " + escapeHtml(String(payload.recipientFio || "—")) + "</li>",
    "<li><strong>Направление (из ссылки):</strong> " + escapeHtml(String(payload.destination || "—")) + "</li>",
    "<li><strong>Период (год/месяц):</strong> " + escapeHtml(String(payload.filterYear ?? "") + " / " + String(payload.filterMonth ?? "")) + "</li>",
    "</ul>",
  ].join("");
}

async function sendViaResend(to, subject, html, apiKey, from) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error("Resend HTTP " + res.status + ": " + text);
  }
}

export default async (req) => {
  const TRACKING_SECRET = Netlify.env.get("TRACKING_SECRET") || "";
  const SMTP_URL = Netlify.env.get("SMTP_URL") || "";
  const SMTP_FROM = Netlify.env.get("SMTP_FROM") || "";
  const TRACKING_REPLY_TO = Netlify.env.get("TRACKING_REPLY_TO") || "";
  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY") || "";
  const RESEND_FROM = Netlify.env.get("RESEND_FROM") || "KP notifier <onboarding@resend.dev>";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method === "GET") {
    return Response.json({
      ok: true,
      service: "kp-opened",
      hasSmtp: Boolean(SMTP_URL),
      hasResend: Boolean(RESEND_API_KEY),
    });
  }

  if (req.method !== "POST") {
    return Response.json({ ok: false }, { status: 404 });
  }

  if (TRACKING_SECRET) {
    const sent = req.headers.get("x-kp-secret");
    if (sent !== TRACKING_SECRET) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  let data;
  try {
    data = await req.json();
  } catch {
    return Response.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  if (data.event !== "kp_link_opened") {
    return Response.json({ ok: false, message: "Unknown event" }, { status: 400 });
  }

  const to = String(data.managerEmail || "").trim();
  if (!to.includes("@")) {
    return Response.json({ ok: false, message: "managerEmail missing" }, { status: 400 });
  }

  const subject =
    "[КП] Переход по ссылке" +
    (data.clientCompany ? " — " + String(data.clientCompany).slice(0, 120) : "");
  const html = buildMailHtml(data);

  try {
    if (SMTP_URL) {
      if (!SMTP_FROM || !SMTP_FROM.includes("@")) {
        return Response.json({ ok: false, message: "SMTP_FROM invalid or missing" }, { status: 500 });
      }
      const mailer = nodemailer.createTransport(SMTP_URL);
      await mailer.sendMail({
        from: SMTP_FROM,
        to,
        ...(TRACKING_REPLY_TO ? { replyTo: TRACKING_REPLY_TO } : {}),
        subject,
        html,
        text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || subject,
      });
      return Response.json({ ok: true, via: "smtp" });
    }

    if (RESEND_API_KEY) {
      await sendViaResend(to, subject, html, RESEND_API_KEY, RESEND_FROM);
      return Response.json({ ok: true, via: "resend" });
    }

    console.log("[kp-opened DEV, no SMTP/Resend]", JSON.stringify(data, null, 2));
    return Response.json({ ok: true, dev: true });
  } catch (e) {
    console.error(e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "send_failed" },
      { status: 500 }
    );
  }
};

export const config = {
  path: "/kp-opened",
};
