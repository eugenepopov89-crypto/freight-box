#!/usr/bin/env node
/*
  Локальный доступ к ставкам с телефона / другого ПК в одной Wi‑Fi сети.

  Запуск из папки Documents (где лежат rates.html, rates.js, styles.css):
    node serve-rates-local.mjs

  Откройте в браузере адрес из вывода, например:
    http://192.168.x.x:8787/rates.html

  Важно: таблицы хранятся в localStorage браузера. На другом устройстве реестр
  будет свой (пустой), пока вы не экспортируете/перенесёте данные отдельно.
  Ссылка «КП» с полным текстом ставок — по-прежнему в самой скопированной ссылке.

  В интернет через домашнюю сеть без настройки роутера: например
    npx localtunnel --port 8787
  (временная публичная ссылка; осторожно с конфиденциальностью)
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json",
  ".pdf": "application/pdf",
};

function safeResolvedPath(relPath) {
  const trimmed = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, "");
  const resolved = path.resolve(ROOT, trimmed);
  if (!resolved.startsWith(ROOT)) {
    return null;
  }
  return resolved;
}

function listLanIps() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const entry of ifaces[name] || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        ips.push(entry.address);
      }
    }
  }
  return [...new Set(ips)];
}

const server = http.createServer((req, res) => {
  const urlRaw = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
  const rel =
    urlRaw === "/" ? "rates.html" : urlRaw.replace(/^\/+/u, "");

  /* не открываем выход из папки */
  const filepath = safeResolvedPath(rel);
  if (!filepath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filepath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filepath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const lan = listLanIps();
  console.log("");
  console.log("Ставки доступны по ссылке (выберите с вашего ПК или телефона в одной Wi‑Fi):");
  console.log("");
  console.log("  На этом компьютере:");
  console.log("    http://127.0.0.1:" + PORT + "/rates.html");
  console.log("    Альтернативный файл: http://127.0.0.1:" + PORT + "/проект%20контроля%20ставок%20и%20подготовки%20кп.html");
  console.log("");
  if (lan.length) {
    console.log("  С телефона / другого ноутбука (та же локальная сеть):");
    for (const ip of lan) {
      console.log("    http://" + ip + ":" + PORT + "/rates.html");
    }
  } else {
    console.log("  LAN IP не нашёлся — включите Wi‑Fi и проверьте интерфейс.");
  }
  console.log("");
  console.log("Ctrl+C — остановить сервер.");
  console.log("");
});
