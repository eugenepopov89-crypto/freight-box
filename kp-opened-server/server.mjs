/**
 * Мини-сервер для писем «КП открыто по ссылке».
 * Запуск: npm install && cp env.example .env && заполните .env затем npm start
 *
 * Принимает POST /kp-opened с JSON телом как из rates.js (reportSharedKpOpen).
 * POST /parse-kp — разбор PDF КП через Anthropic Claude (тело JSON: { pdf: base64 }).
 */
import "dotenv/config";
import http from "node:http";
import nodemailer from "nodemailer";

const PORT = Number(process.env.PORT || 3847);
const TRACKING_SECRET = process.env.TRACKING_SECRET || "";
const SMTP_URL = process.env.SMTP_URL || "";
const SMTP_FROM = process.env.SMTP_FROM || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM =
  process.env.RESEND_FROM || "KP notifier <onboarding@resend.dev>";

let mailer = null;
if (SMTP_URL) {
  mailer = nodemailer.createTransport(SMTP_URL);
}

async function sendViaResend(to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      html,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error("Resend HTTP " + res.status + ": " + text);
  }
}

function buildMailHtml(payload) {
  const lines = [
    "<p>Открыто коммерческое предложение по ссылке.</p>",
    "<ul>",
    "<li><strong>Время (UTC ISO):</strong> " +
      escapeHtml(String(payload.openedAt || "")) +
      "</li>",
    "<li><strong>Ссылка страницы:</strong> " +
      escapeHtml(String(payload.openingPageUrl || "—")) +
      "</li>",
    "<li><strong>Номер КП:</strong> " +
      escapeHtml(String(payload.docNumber || "—")) +
      "</li>",
    "<li><strong>Клиент:</strong> " +
      escapeHtml(String(payload.clientCompany || "—")) +
      "</li>",
    "<li><strong>Кому:</strong> " +
      escapeHtml(String(payload.recipientFio || "—")) +
      "</li>",
    "<li><strong>Направление (из ссылки):</strong> " +
      escapeHtml(String(payload.destination || "—")) +
      "</li>",
    "<li><strong>Период (год/месяц):</strong> " +
      escapeHtml(
        String(payload.filterYear ?? "") +
          " / " +
          String(payload.filterMonth ?? "")
      ) +
      "</li>",
    "</ul>",
  ];
  return lines.join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function handleKpOpened(req, bodyText) {
  let data = {};
  try {
    data = JSON.parse(bodyText || "{}");
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON" };
  }

  if (data.event !== "kp_link_opened") {
    return { ok: false, status: 400, message: "Unknown event" };
  }

  const to = String(data.managerEmail || "").trim();
  if (!to.includes("@")) {
    return { ok: false, status: 400, message: "managerEmail missing" };
  }

  const subject =
    "[КП] Переход по ссылке" +
    (data.clientCompany ? " — " + String(data.clientCompany).slice(0, 120) : "");
  const html = buildMailHtml(data);

  if (SMTP_URL && mailer) {
    if (!SMTP_FROM || !SMTP_FROM.includes("@")) {
      return {
        ok: false,
        status: 500,
        message: "SMTP_FROM invalid or missing",
      };
    }
    await mailer.sendMail({
      from: SMTP_FROM,
      to,
      ...(process.env.TRACKING_REPLY_TO
        ? { replyTo: process.env.TRACKING_REPLY_TO.trim() }
        : {}),
      subject,
      html,
      text:
        html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim() || subject,
    });
    return { ok: true, status: 200, via: "smtp" };
  }

  if (RESEND_API_KEY) {
    await sendViaResend(to, subject, html);
    return { ok: true, status: 200, via: "resend" };
  }

  console.log("[kp-opened DEV, no SMTP/Resend]", JSON.stringify(data, null, 2));
  return { ok: true, status: 200, dev: true };
}

/** Парсинг КП подрядчика через Claude AI (PDF в base64 в поле body.pdf). */
async function handleParseKp(req) {
  const chunks = [];
  for await (const ch of req) {
    chunks.push(ch);
  }
  const raw = Buffer.concat(chunks).toString("utf8").slice(0, 10_000_000);

  let body = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 400, data: { ok: false, error: "Invalid JSON" } };
  }

  const pdfBase64 = body.pdf;
  if (!pdfBase64) {
    return { status: 400, data: { ok: false, error: "No PDF data" } };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    return {
      status: 500,
      data: { ok: false, error: "No API key configured" },
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: `Извлеки из КП данные и верни ТОЛЬКО JSON без markdown:
{"contractor":"название","validFrom":"дата","sea_freight":[{"port":"SHANGHAI","usd_20":1234,"usd_40":2345}],"rail_rub":{"destination":"MOSCOW","rub_20_lt24":190000,"rub_20_gt24":212000,"rub_40":315000},"auto_rub":{"rub_20":41000,"rub_40":43000}}
Для rail_rub и auto_rub бери данные для МОСКВЫ. Если данных нет — ставь null.`,
            },
          ],
        },
      ],
    }),
  });

  const aiData = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      aiData.error?.message ||
      aiData.message ||
      "Anthropic API error " + response.status;
    return {
      status: response.status >= 400 && response.status < 600 ? response.status : 502,
      data: { ok: false, error: msg, details: aiData },
    };
  }

  const text = (aiData.content || [])
    .map((i) => i.text || "")
    .join("");
  const clean = text.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    return {
      status: 502,
      data: {
        ok: false,
        error: "Could not parse model output as JSON",
        raw: clean.slice(0, 4000),
      },
    };
  }

  return { status: 200, data: { ok: true, result: parsed } };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-KP-Secret"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/kp-opened") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "kp-opened-server",
        hasSmtp: Boolean(SMTP_URL),
        hasResend: Boolean(RESEND_API_KEY),
        hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      })
    );
    return;
  }

  if (req.method === "POST" && req.url === "/parse-kp") {
    try {
      const out = await handleParseKp(req);
      res.writeHead(out.status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(out.data));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        })
      );
    }
    return;
  }

  if (req.method !== "POST" || req.url !== "/kp-opened") {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false }));
    return;
  }

  if (TRACKING_SECRET) {
    const sent = req.headers["x-kp-secret"];
    if (sent !== TRACKING_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }
  }

  const chunks = [];
  for await (const ch of req) {
    chunks.push(ch);
  }
  const raw = Buffer.concat(chunks).toString("utf8").slice(0, 65536);

  try {
    const out = await handleKpOpened(req, raw);
    res.writeHead(out.status || 500, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify({ ok: out.ok, ...(out.via ? { via: out.via } : {}), ...(out.dev ? { dev: true } : {}) }));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "send_failed",
      })
    );
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    "kp-opened-server listening http://127.0.0.1:" +
      PORT +
      " — POST /kp-opened, POST /parse-kp, GET /kp-opened"
  );
  if (!SMTP_URL && !RESEND_API_KEY) {
    console.log("Предупреждение: нет SMTP_URL и RESEND_API_KEY — только лог в консоль.");
  }
});
