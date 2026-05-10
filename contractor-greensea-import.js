/**
 * Импорт КП Green Sea / ВСК:
 * — раздел 1: море (порты без Busan, 20′DC / 40′HC);
 * — раздел 2: для Москвы первые три суммы ₽ в блоке «Стоимость транспортировки»
 *   (20′ &lt;24 т, 20′ &gt;24 т, 40′) → столбцы ЖД реестра.
 *
 * Требует: rates.js загрузился и выставил window.__ratesImportApi.
 */
(function () {
  "use strict";

  var SHIPPING_LINE = "Green sea";

  /** Профиль «Москва» по текущему ТЗ пользователя; позже можно добавить другие регионы. */
  var GREENSEA_PROFILE_MOSCOW = {
    id: "moscow",
    destination: "MOSCOW",
    railTerminal: "ВСК",
    destinationStations: ["Электроугли", "Селятино", "Белый Раст"],
    /** Одна строка для колонки «Станция назначения» в реестре */
    destinationStationsDisplay: "Электроугли, Селятино, Белый Раст",
    warehouseAddresses: ["Москва, МО"],
    customsClearance: "destinationPort",
    sailingPlaceholder: "Уточнять дополнительно",
    dvTerminal: "ВСК",
  };

  var PDFJS_BASE =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/";
  var PDFJS_MAIN = PDFJS_BASE + "pdf.mjs";
  var PDFJS_WORKER = PDFJS_BASE + "pdf.worker.mjs";

  function normalizePdfText(txt) {
    return String(txt || "")
      .replace(/\r/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b\uFEFF]/g, "")
      .replace(/\s+\n/g, "\n");
  }

  function parseMoneyUsd(raw) {
    var s = String(raw || "").replace(/[^\d]/g, "");
    if (!s) {
      return Number.NaN;
    }
    return Number(s);
  }

  function parseMoneyRub(raw) {
    return parseMoneyUsd(raw);
  }

  /**
   * Первая строка «МОСКВА» в разделе 2: первые три суммы в ₽ подряд —
   * базовый блок «Стоимость транспортировки» (без охраны): &lt;24т, &gt;24т, 40′.
   */
  function parseGreenseaMoscowRailTriple(sec2, warnings) {
    if (!sec2 || String(sec2).trim().length < 30) {
      if (warnings) {
        warnings.push(
          "Раздел 2 (наземная часть) не найден или слишком короткий — ЖД Москвы не заполнены."
        );
      }
      return null;
    }

    var lines = String(sec2).split(/\n/);
    var targetLine = "";
    var i;
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i].trim().replace(/\s+/g, " ");
      if (/^МОСКВА/i.test(ln) || /^\*?МОСКВА/i.test(ln)) {
        targetLine = ln;
        break;
      }
    }

    if (!targetLine) {
      var flat = String(sec2).replace(/\s+/g, " ");
      var block = flat.match(/МОСКВА\*?[\s\S]{0,900}?(?=\n\s*[А-ЯЁ]{4,}|$)/i);
      if (block) {
        targetLine = block[0].replace(/\s+/g, " ").trim();
      }
    }

    if (!targetLine) {
      var mm = String(sec2).match(/МОСКВА[^\n]{10,1200}/i);
      if (mm) {
        targetLine = mm[0].replace(/\s+/g, " ").trim();
      }
    }

    if (!targetLine) {
      if (warnings) {
        warnings.push(
          'Строка направления «МОСКВА» в разделе 2 не найдена — столбцы ЖД не заполнены.'
        );
      }
      return null;
    }

    var rubs = [];
    var reRub = /([\d][\d\s]*)\s*₽/g;
    var m;
    while ((m = reRub.exec(targetLine)) !== null && rubs.length < 12) {
      var n = parseMoneyRub(m[1]);
      if (Number.isFinite(n)) {
        rubs.push(Math.round(n));
      }
    }

    if (rubs.length < 3) {
      if (warnings) {
        warnings.push(
          "Для Москвы в разделе 2 найдено меньше трёх сумм в ₽ — проверьте текст PDF или вставьте раздел вручную."
        );
      }
      return null;
    }

    return {
      lt24: rubs[0],
      gt24: rubs[1],
      hq40: rubs[2],
    };
  }

  function sliceBetween(text, startRe, endRes) {
    var s = text.search(startRe);
    if (s < 0) {
      return "";
    }
    var from = text.slice(s);
    for (var k = 0; k < endRes.length; k++) {
      var e = endRes[k];
      var hit = typeof e === "number" ? e : from.search(e);
      if (hit >= 0) {
        return from.slice(0, hit);
      }
    }
    return from.slice(0, Math.min(from.length, 12000));
  }

  function shouldSkipPort(portUpper) {
    var p = String(portUpper || "").trim().toUpperCase();
    return /^BUSAN\b/i.test(p);
  }

  function normalizePortToken(raw) {
    return String(raw || "")
      .replace(/\*+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  /**
   * Две суммы USD подряд после названия порта (20'DC и 40'HC).
   * Устойчиво к переносам из PDF: сначала построчно, затем по всему фрагменту.
   */
  function parseGreenseaSeaRows(sec1) {
    var rows = [];
    var warnings = [];
    var seen = {};

    function pushRow(portRaw, u20, u40) {
      var port = normalizePortToken(portRaw);
      if (!port || shouldSkipPort(port)) {
        return;
      }
      if (/^ПОРТ/i.test(port) || /^СТОИМОСТЬ/i.test(port)) {
        return;
      }
      if (!Number.isFinite(u20) || !Number.isFinite(u40)) {
        return;
      }
      if (seen[port]) {
        return;
      }
      seen[port] = true;
      rows.push({ port: port, usd20: u20, usd40: u40 });
    }

    /** Звёздочки после порта (**, *) перед суммами — убираем из имени в normalizePortToken */
    var lineRe =
      /^([^$\n\r]+?)\s*\**\s*\$\s*([\d\s,\u00a0]+)\s+\$\s*([\d\s,\u00a0]+)/;

    var lines = String(sec1 || "").split(/\n/);
    var i;
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i].trim().replace(/\s+/g, " ");
      var mm = ln.match(lineRe);
      if (!mm) {
        continue;
      }
      pushRow(mm[1], parseMoneyUsd(mm[2]), parseMoneyUsd(mm[3]));
    }

    if (!rows.length) {
      var flat = String(sec1 || "").replace(/\s+/g, " ");
      var g =
        /([^$\n\r]{4,90}?)\s*\**\s*\$\s*([\d\s,\u00a0]+)\s+\$\s*([\d\s,\u00a0]+)/g;
      var m;
      while ((m = g.exec(flat)) !== null) {
        pushRow(m[1], parseMoneyUsd(m[2]), parseMoneyUsd(m[3]));
      }
    }

    if (!rows.length) {
      warnings.push(
        "Не удалось распознать строки таблицы моря (раздел 1). Вставьте в поле ниже текст страницы PDF или проверьте, что в файле есть блок «Морская составляющая» с колонками 20'DC и 40'HC."
      );
    }

    return { rows: rows, warnings: warnings };
  }

  function parseValidityRange(fullText) {
    var isoFrom = "";
    var re =
      /вступают в силу с\s+(\d{1,2})\s+([а-яёА-ЯЁ]+)\s+(\d{4})/i;
    var m = fullText.match(re);
    if (m) {
      var mo = russianMonthIndex(m[2]);
      if (mo >= 0) {
        var dd = Number(m[1]);
        var yyyy = Number(m[3]);
        if (Number.isFinite(dd) && Number.isFinite(yyyy)) {
          isoFrom = toIsoDate(new Date(yyyy, mo, dd));
        }
      }
    }
    if (!isoFrom) {
      var m2 = fullText.match(
        /(\d{1,2})[\./](\d{1,2})[\./](\d{2,4})/
      );
      if (m2) {
        var d0 = Number(m2[1]);
        var m0 = Number(m2[2]) - 1;
        var y0 = Number(m2[3]);
        if (y0 < 100) {
          y0 += 2000;
        }
        if (Number.isFinite(d0) && m0 >= 0 && m0 <= 11) {
          isoFrom = toIsoDate(new Date(y0, m0, d0));
        }
      }
    }
    if (!isoFrom) {
      isoFrom = toIsoDate(new Date());
    }
    var fromD = parseIsoLocal(isoFrom);
    var toD = fromD
      ? new Date(fromD.getTime() + 365 * 86400000)
      : new Date();
    return { fromIso: isoFrom, toIso: toIsoDate(toD) };
  }

  function toIsoDate(d) {
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, "0");
    var da = String(d.getDate()).padStart(2, "0");
    return y + "-" + mo + "-" + da;
  }

  function parseIsoLocal(iso) {
    var p = String(iso || "").trim().split("-");
    if (p.length !== 3) {
      return null;
    }
    var y = Number(p[0]);
    var m = Number(p[1]) - 1;
    var d = Number(p[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return null;
    }
    return new Date(y, m, d);
  }

  function russianMonthIndex(word) {
    var w = String(word || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\.+/g, "")
      .trim();
    var prefixes = [
      ["январ", 0],
      ["феврал", 1],
      ["март", 2],
      ["апрел", 3],
      ["мая", 4],
      ["май", 4],
      ["июн", 5],
      ["июл", 6],
      ["август", 7],
      ["сентябр", 8],
      ["октябр", 9],
      ["ноябр", 10],
      ["декабр", 11],
    ];
    for (var i = 0; i < prefixes.length; i++) {
      var p = prefixes[i][0];
      if (w.indexOf(p) === 0 || w === p) {
        return prefixes[i][1];
      }
    }
    return -1;
  }

  /**
   * Разделы 1–2 + даты действия.
   */
  function parseGreenseaVskText(fullText) {
    var t = normalizePdfText(fullText);
    var warnings = [];

    var sec1 = sliceBetween(t, /1\.\s*Морская составляющая/i, [
      /\n\s*2\.\s*Наземная составляющая/i,
      /\n\s*2\.\s*Наземная/i,
    ]);

    var sec2 = sliceBetween(t, /\n\s*2\.\s*Наземная составляющая/i, [
      /\n\s*В случае изменения по инициативе Клиента/i,
      /\n\s*3\.\s*Условия использования предложения/i,
      /\n\s*3\.\s*Условия/i,
    ]);
    if (!sec2) {
      sec2 = sliceBetween(t, /2\.\s*Наземная составляющая/i, [
        /\n\s*В случае изменения по инициативе Клиента/i,
        /\n\s*3\.\s*Условия использования предложения/i,
      ]);
    }

    var seaOut = parseGreenseaSeaRows(sec1);
    warnings.push.apply(warnings, seaOut.warnings);

    var railMoscow = parseGreenseaMoscowRailTriple(sec2, warnings);

    var validity = parseValidityRange(t);

    return {
      sea: seaOut.rows,
      railMoscow: railMoscow,
      validity: validity,
      warnings: warnings,
    };
  }

  function sortStationsRu(arr) {
    return arr.slice().sort(function (a, b) {
      return a.localeCompare(b, "ru", { sensitivity: "base" });
    });
  }

  function buildSeaRouteRow(profile, port, slot, seaUsd, railLt, railGt, railHq) {
    return {
      origin: port,
      shippingLine: SHIPPING_LINE,
      seaUsd: seaUsd,
      sailingDate: profile.sailingPlaceholder,
      dvTerminal: profile.dvTerminal,
      destinationStation: profile.destinationStationsDisplay,
      unloadAddress: profile.warehouseAddresses[0] || "",
      containerSlot: slot,
      railRub20Lt24: slot === "20LT24" ? railLt : null,
      railRub20Gt24: slot === "20GT24" ? railGt : null,
      railRub40Hq: slot === "40HQ" ? railHq : null,
      autoRub: 0,
    };
  }

  /**
   * Одна публикация на комбинацию порт × тип слота (20LT24 / 20GT24 / 40HQ).
   */
  function buildGreenseaMoscowRate(opts) {
    var stableRateKeyFromRecord = opts.stableRateKeyFromRecord;
    var profile = opts.profile;
    var port = opts.port;
    var slot = opts.slot;
    var seaUsd = opts.seaUsd;
    var validity = opts.validity;
    var railLt = opts.railLt;
    var railGt = opts.railGt;
    var railHq = opts.railHq;

    var stationsSorted = sortStationsRu(profile.destinationStations);

    var seaRouteRows = [
      buildSeaRouteRow(
        profile,
        port,
        slot,
        seaUsd,
        railLt,
        railGt,
        railHq
      ),
    ];
    var seaUsds = [seaUsd];
    var autoRubs = [0];

    var containerTypes =
      slot === "40HQ" ? ["40HQ"] : ["20FT"];
    var containerType = slot === "40HQ" ? "40HQ" : "20FT";

    var railRub20Lt24 = null;
    var railRub20Gt24 = null;
    var railRub = null;

    if (slot === "40HQ") {
      railRub =
        Number.isFinite(railHq) && railHq >= 0 ? railHq : null;
    } else if (slot === "20GT24") {
      railRub20Gt24 =
        Number.isFinite(railGt) && railGt >= 0 ? railGt : null;
      railRub = railRub20Gt24;
    } else {
      railRub20Lt24 =
        Number.isFinite(railLt) && railLt >= 0 ? railLt : null;
      railRub = railRub20Lt24;
    }

    var rate = {
      id: "",
      origin: port,
      originPorts: [port],
      destination: profile.destination,
      railTerminal: profile.railTerminal,
      cargoDepartureTerminal: "",
      cargoDestinationStation: "",
      destinationStation: stationsSorted[0] || "",
      destinationStations: stationsSorted,
      containerTypes: containerTypes,
      containerType: containerType,
      cargoSecurity: "no",
      tnvedCode: "",
      cargoWeightKg: null,
      shippingLine: SHIPPING_LINE,
      shippingLines: [SHIPPING_LINE],
      bookingAgent: "НЕТ",
      bookingAgentShippingLine: "",
      customsClearance: profile.customsClearance,
      tariffValidFrom: validity.fromIso,
      tariffValidTo: validity.toIso,
      tariffLineWindows: [
        {
          shippingLine: SHIPPING_LINE,
          tariffValidFrom: validity.fromIso,
          tariffValidTo: validity.toIso,
        },
      ],
      deliveryTerms: "FOB",
      deliveryExwFcaUsd: null,
      seaUsd: seaUsds[0],
      seaUsds: seaUsds,
      seaRouteRows: seaRouteRows,
      railRub: railRub,
      railRub20Lt24: railRub20Lt24,
      railRub20Gt24: railRub20Gt24,
      autoRub: 0,
      autoRubs: autoRubs,
      securityCostRub: null,
      warehouseAddress: profile.warehouseAddresses[0] || "",
      warehouseAddresses: profile.warehouseAddresses.slice(),
      transitDays: 45,
      nextSailingDates: [profile.sailingPlaceholder],
      manager:
        "Импорт Green Sea — море + ЖД Москва (разд. 1–2), авто при необходимости вручную",
      updatedAt: new Date().toISOString(),
    };

    rate.id = stableRateKeyFromRecord(rate);
    return rate;
  }

  function buildAllRatesGreenseaMoscow(parsed, stableRateKeyFromRecord) {
    var rates = [];
    var profile = GREENSEA_PROFILE_MOSCOW;
    var sea = parsed.sea || [];
    var rm = parsed.railMoscow;
    var railLt = rm && Number.isFinite(rm.lt24) ? rm.lt24 : null;
    var railGt = rm && Number.isFinite(rm.gt24) ? rm.gt24 : null;
    var railHq = rm && Number.isFinite(rm.hq40) ? rm.hq40 : null;

    var sl = ["20LT24", "20GT24", "40HQ"];
    var si;
    for (si = 0; si < sea.length; si++) {
      var row = sea[si];
      var sj;
      for (sj = 0; sj < sl.length; sj++) {
        var slot = sl[sj];
        var seaUsd =
          slot === "40HQ" ? row.usd40 : row.usd20;
        rates.push(
          buildGreenseaMoscowRate({
            stableRateKeyFromRecord: stableRateKeyFromRecord,
            profile: profile,
            port: row.port,
            slot: slot,
            seaUsd: seaUsd,
            validity: parsed.validity,
            railLt: railLt,
            railGt: railGt,
            railHq: railHq,
          })
        );
      }
    }
    return rates;
  }

  async function pdfFileToBytes(file) {
    return new Uint8Array(await file.arrayBuffer());
  }

  async function pdfBytesToText(data) {
    var pdfjs = await import(PDFJS_MAIN);
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }
    var doc = await pdfjs.getDocument({ data: data }).promise;
    var full = "";
    var p;
    for (p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var tc = await page.getTextContent();
      full +=
        tc.items
          .map(function (item) {
            return "str" in item ? item.str : "";
          })
          .join(" ") + "\n";
    }
    return full;
  }

  async function uiParse(showPreviewEl) {
    var api = window.__ratesImportApi;
    var fileEl = document.getElementById("contractor-greensea-file");
    var fbEl = document.getElementById("contractor-greensea-text-fallback");

    var text = "";

    try {
      if (fileEl && fileEl.files && fileEl.files[0]) {
        var bytes = await pdfFileToBytes(fileEl.files[0]);
        text = await pdfBytesToText(bytes);
      } else if (fbEl && String(fbEl.value || "").trim()) {
        text = fbEl.value;
      }

      text = normalizePdfText(text);
      if (text.trim().length < 80) {
        if (api && api.setStatus) {
          api.setStatus(
            "Укажите PDF или вставьте текст страницы с таблицей моря в поле ниже.",
            "error"
          );
        }
        return;
      }

      var parsed = parseGreenseaVskText(text);

      window.__greenseaLastParsed = parsed;

      var lines = [];
      lines.push(
        "Маппинг: раздел 1 → порты (кроме BUSAN), море по 20'DC / 40'HC; раздел 2 → ЖД Москва (первые три ₽ в строке МОСКВА)."
      );
      lines.push(
        "Москва: станции «" +
          GREENSEA_PROFILE_MOSCOW.destinationStationsDisplay +
          "», склад «Москва, МО», терминал ЖД «ВСК», линия «" +
          SHIPPING_LINE +
          "», таможня «в порту назначения»."
      );
      lines.push("");
      lines.push("Порты (" + parsed.sea.length + "):");
      var pi;
      for (pi = 0; pi < parsed.sea.length; pi++) {
        var s = parsed.sea[pi];
      lines.push(
        "  " +
            s.port +
            " → 20'DC " +
            s.usd20 +
            " USD, 40'HC " +
            s.usd40 +
            " USD"
        );
      }
      lines.push("");
      lines.push(
        "ЖД Москва (раздел 2, блок «Стоимость транспортировки» — первые три суммы ₽ в строке МОСКВА):"
      );
      if (parsed.railMoscow) {
        lines.push(
          "  20′ <24 т → " + parsed.railMoscow.lt24 + " ₽"
        );
        lines.push(
          "  20′ >24 т → " + parsed.railMoscow.gt24 + " ₽"
        );
        lines.push("  40′ → " + parsed.railMoscow.hq40 + " ₽");
      } else {
        lines.push(
          "  не распознано — проверьте раздел 2 в PDF или вставьте фрагмент текста с строкой МОСКВА."
        );
      }
      lines.push(
        "Срок тарифа (из текста КП): " +
          parsed.validity.fromIso +
          " … " +
          parsed.validity.toIso
      );
      lines.push(
        "Ставок к сохранению: " + parsed.sea.length * 3 + " (3 типа контейнера × порты)."
      );

      if (parsed.warnings.length) {
        lines.push("");
        lines.push("Предупреждения:");
        for (var wi = 0; wi < parsed.warnings.length; wi++) {
          lines.push("  — " + parsed.warnings[wi]);
        }
      }

      var built = [];
      if (api && parsed.sea.length) {
        built = buildAllRatesGreenseaMoscow(parsed, api.stableRateKeyFromRecord);
      }

      window.__greenseaLastBuiltRates = built;

      if (showPreviewEl instanceof HTMLElement) {
        showPreviewEl.textContent = lines.join("\n");
      }
      if (api && api.setStatus) {
        api.setStatus(
          "Разбор выполнен: " +
            parsed.sea.length +
            " портов → " +
            built.length +
            " ставок.",
          "success"
        );
      }
    } catch (err) {
      window.__greenseaLastParsed = null;
      window.__greenseaLastBuiltRates = null;
      if (api && api.setStatus) {
        api.setStatus(
          "Ошибка разбора PDF: " + (err && err.message ? err.message : err),
          "error"
        );
      }
    }
  }

  async function uiCommit() {
    var api = window.__ratesImportApi;
    if (!api) {
      return;
    }
    if (
      typeof api.persistenceAvailableForRatesImport === "function" &&
      !api.persistenceAvailableForRatesImport()
    ) {
      api.setStatus(
        "Браузер не даёт сохранить данные (localStorage недоступен). Разрешите хранение для сайта или откройте страницу не в приватном режиме.",
        "error"
      );
      return;
    }
    var built = window.__greenseaLastBuiltRates;
    if (!Array.isArray(built) || !built.length) {
      api.setStatus(
        "Сначала нажмите «Разобрать PDF / текст».",
        "error"
      );
      return;
    }
    var rates = await api.loadRates();
    var added = 0;
    var updated = 0;
    var i;
    for (i = 0; i < built.length; i++) {
      var nr = built[i];
      var key = api.stableRateKeyFromRecord(nr);
      var idx = rates.findIndex(function (r) {
        return api.stableRateKeyFromRecord(r) === key;
      });
      if (idx >= 0) {
        var prev = rates[idx];
        if (prev && prev._pbId) {
          nr._pbId = prev._pbId;
        }
        rates[idx] = nr;
        updated++;
      } else {
        rates.push(nr);
        added++;
      }
    }
    await api.saveRates(rates);
    await api.fullPublicationRefresh(rates);
    api.setStatus(
      "Green Sea (море, Москва): добавлено " +
        added +
        ", обновлено " +
        updated +
        ".",
      "success"
    );
  }

  function wire() {
    var parseBtn = document.getElementById("contractor-greensea-parse-btn");
    var commitBtn = document.getElementById("contractor-greensea-commit-btn");
    var prev = document.getElementById("contractor-greensea-preview");
    parseBtn &&
      parseBtn.addEventListener("click", function () {
        uiParse(prev);
      });
    commitBtn &&
      commitBtn.addEventListener("click", function () {
        uiCommit();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  window.parseGreenseaVskTextExport = parseGreenseaVskText;
})();
