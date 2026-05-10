/**
 * Импорт КП формата Green Sea Transport / терминал ВСК (PDF).
 * Требует: rates.js уже загрузился и выставил window.__ratesImportApi.
 */
(function () {
  "use strict";

  var SHIPPING_LINE = "Green Sea Transport (тариф подрядчика ВСК)";
  var PDFJS_BASE =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/";
  var PDFJS_MAIN = PDFJS_BASE + "pdf.mjs";
  var PDFJS_WORKER = PDFJS_BASE + "pdf.worker.mjs";

  var RAIL_ROWS = [
    { match: /^МОСКВА/i, cityKey: "МОСКВА", dest: "MOSCOW", station: "Электроугли", addr: "По оферте ВСК (адрес склада)" },
    { match: /^САНКТ-ПЕТЕРБУРГ/i, cityKey: "САНКТ-ПЕТЕРБУРГ", dest: "ST. PETERSBURG", station: "Шушары", addr: "По оферте ВСК (в пределах КАД)" },
    { match: /^НОВОСИБИРСК/i, cityKey: "НОВОСИБИРСК", dest: "RU_REGIONS", station: "Иня-Восточная", addr: "По оферте ВСК" },
    { match: /^ЕКАТЕРИНБУРГ/i, cityKey: "ЕКАТЕРИНБУРГ", dest: "RU_REGIONS", station: "Екатеринбург-Сортировочный", addr: "По оферте ВСК" },
    { match: /^РОСТОВ/i, cityKey: "РОСТОВ-НА-ДОНУ", dest: "RU_REGIONS", station: "Ростов-Тов.", addr: "По оферте ВСК" },
    { match: /^КРАСНОЯРСК/i, cityKey: "КРАСНОЯРСК", dest: "RU_REGIONS", station: "Красноярск-Северные ворота", addr: "По оферте ВСК" },
    { match: /^ТОЛЬЯТТИ/i, cityKey: "ТОЛЬЯТТИ", dest: "RU_REGIONS", station: "Тольятти вет.", addr: "По оферте ВСК" },
  ];

  function normalizePdfText(txt) {
    return String(txt || "")
      .replace(/\r/g, "\n")
      .replace(/\u00a0/g, " ")
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

  /**
   * @returns {{fromIso:string,toIso:string}}
   */
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
          var d = new Date(yyyy, mo, dd);
          isoFrom = toIsoDate(d);
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
      var t = new Date();
      isoFrom = toIsoDate(t);
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

  function parseSeaRows(sec) {
    var rows = [];
    var lines = sec.split(/\n/);
    var re =
      /^([A-Z][A-Za-z ()0-9,-]+)\s*(\*{0,2})\s*\$\s*([\d\s,]+)\s+\$\s*([\d\s,]+)/;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      var mm = ln.match(re);
      if (!mm) {
        continue;
      }
      var portRaw = mm[1]
        .replace(/\*{1,2}\s*$/, "")
        .trim()
        .toUpperCase();
      if (/^Порт/i.test(portRaw) || /^Стоимость/i.test(portRaw)) {
        continue;
      }
      var u20 = parseMoneyUsd(mm[3]);
      var u40 = parseMoneyUsd(mm[4]);
      if (!Number.isFinite(u20) || !Number.isFinite(u40)) {
        continue;
      }
      rows.push({ port: portRaw, usd20: u20, usd40: u40 });
    }
    return rows;
  }

  function parseRailTripleLine(line, rowDef) {
    void rowDef;
    var chunks = [];
    var reRu = /([\d][\d\s]*)\s*₽/g;
    var m;
    while ((m = reRu.exec(line)) !== null && chunks.length < 3) {
      chunks.push(parseMoneyRub(m[1]));
    }
    if (chunks.length < 3) {
      return null;
    }
    return {
      lt24: chunks[0],
      gt24: chunks[1],
      rub40: chunks[2],
    };
  }

  function parseRailTable(sec) {
    var lines = sec.split(/\n/).map(function (x) {
      return String(x || "").trim();
    });
    var out = {};
    var warnings = [];

    RAIL_ROWS.forEach(function (def) {
      if (out[def.cityKey]) {
        return;
      }
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (!ln || ln.length < 10 || !def.match.test(ln)) {
          continue;
        }
        var triple = parseRailTripleLine(ln, def);
        if (!triple) {
          warnings.push(
            "ЖД «" + def.cityKey + "»: не удалось прочитать три суммы"
          );
          return;
        }
        if (
          Number.isFinite(triple.lt24) &&
          Number.isFinite(triple.gt24) &&
          Number.isFinite(triple.rub40)
        ) {
          out[def.cityKey] = triple;
        }
        return;
      }
    });

    return { byCity: out, warnings: warnings };
  }

  function parseAutoTable(sec6) {
    var byCity = {};
    var lines = sec6.split(/\n/);
    var re =
      /^([А-ЯЁA-Z][А-ЯЁA-Z\-\s]+?)(\*)*\s+([\d\s]{2,})\s*₽\s+([\d\s]{2,})\s*₽/;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      var mm = ln.match(re);
      if (!mm) {
        continue;
      }
      var name = mm[1].replace(/\*{1,2}$/, "").trim().toUpperCase();
      var a20 = parseMoneyRub(mm[3]);
      var a40 = parseMoneyRub(mm[4]);
      if (Number.isFinite(a20) && Number.isFinite(a40)) {
        byCity[name] = { auto20: a20, auto40: a40 };
      }
    }
    return byCity;
  }

  function matchAutoForCity(cityKey, autoByName) {
    var up = cityKey.toUpperCase();
    if (autoByName[up]) {
      return autoByName[up];
    }
    for (var k in autoByName) {
      if (!Object.prototype.hasOwnProperty.call(autoByName, k)) {
        continue;
      }
      if (up.indexOf(k) === 0 || k.indexOf(up) === 0) {
        return autoByName[k];
      }
    }
    return null;
  }

  /**
   * @returns {{ sea:Array, rail:Object, auto:Object, validity:{fromIso:string,toIso:string}, warnings:string[] }}
   */
  function parseGreenseaVskText(fullText) {
    var t = normalizePdfText(fullText);
    var warnings = [];

    var sec1 = sliceBetween(t, /1\.\s*Морская составляющая/i, [
      /\n\s*2\.\s*Наземная составляющая/i,
    ]);
    var sec2 = sliceBetween(t, /\n\s*2\.\s*Наземная составляющая/i, [
      /\n\s*В случае изменения по инициативе Клиента/i,
      /\n\s*3\.\s*Условия использования предложения/i,
    ]);

    var sea = parseSeaRows(sec1);
    if (!sea.length) {
      warnings.push(
        "Морские ставки из раздела 1 не найдены — проверьте файл или вставьте текст вручную."
      );
    }

    var rt = parseRailTable(sec2);
    warnings.push.apply(warnings, rt.warnings);

    var autoMap = {};
    var s6 = sliceBetween(t, /6\.\s*Организация доставки/i, [
      /\n\s*7\.\s*Превышение/i,
    ]);
    if (s6 && s6.length > 120) {
      autoMap = parseAutoTable(s6);
    }

    var validity = parseValidityRange(t);

    var railCount = Object.keys(rt.byCity).length;
    if (!railCount) {
      warnings.push(
        "Таблица ЖД (раздел 2): не удалось распознать строки направлений."
      );
    }

    return {
      sea: sea,
      rail: rt.byCity,
      auto: autoMap,
      validity: validity,
      warnings: warnings,
    };
  }

  function buildSeaRouteRows(cfg) {
    var origins = cfg.origins;
    var line = cfg.line;
    var seaByPort = cfg.seaByPort;
    var slot = cfg.slot;
    var seaUsdFn = cfg.seaUsdFn;
    var railLt = cfg.railLt;
    var railGt = cfg.railGt;
    var railHq = cfg.railHq;
    var autoRub = cfg.autoRub;
    var sailingDate = cfg.sailingDate;
    var station = cfg.station;
    var addr = cfg.addr;
    var rows = [];
    for (var i = 0; i < origins.length; i++) {
      var pol = origins[i];
      var su = seaUsdFn(pol);
      if (!Number.isFinite(su)) {
        continue;
      }
      var row = {
        origin: pol,
        shippingLine: line,
        seaUsd: su,
        sailingDate: sailingDate,
        dvTerminal: "ВСК(Врангель)",
        destinationStation: station,
        unloadAddress: addr,
        containerSlot: slot,
        railRub20Lt24:
          slot === "20LT24" || (railLt != null && railGt != null)
            ? railLt
            : null,
        railRub20Gt24:
          slot === "20GT24" || (railLt != null && railGt != null)
            ? railGt
            : null,
        railRub40Hq: slot === "40HQ" ? railHq : null,
        autoRub: autoRub,
      };
      rows.push(row);
    }
    return rows;
  }

  /** Пара 20′: в строках указан общий тип 20LT24, суммы Lt/Gt задаём явно как в ставке через форму. */
  function buildPair20SeaRows(cfg) {
    var origins = cfg.origins;
    var line = cfg.line;
    var seaByFn = cfg.seaUsdFn;
    var sailingDate = cfg.sailingDate;
    var station = cfg.station;
    var addr = cfg.addr;
    var autoRub = cfg.autoRub;
    var railLt = cfg.railLt;
    var railGt = cfg.railGt;

    var rows = [];
    for (var i = 0; i < origins.length; i++) {
      var pol = origins[i];
      var su = seaByFn(pol);
      rows.push({
        origin: pol,
        shippingLine: line,
        seaUsd: su,
        sailingDate: sailingDate,
        dvTerminal: "ВСК(Врангель)",
        destinationStation: station,
        unloadAddress: addr,
        containerSlot: "20LT24",
        railRub20Lt24: railLt,
        railRub20Gt24: railGt,
        railRub40Hq: null,
        autoRub: autoRub,
      });
    }
    return rows;
  }

  function buildRateRecord(opts) {
    var api = opts.api;
    var stableRateKeyFromRecord = api.stableRateKeyFromRecord;
    var origins = opts.origins.slice().sort(function (a, b) {
      return a.localeCompare(b, "en");
    });
    var shippingLines = [SHIPPING_LINE];
    var dest = opts.dest;
    var destStation = opts.destStation;
    var slotMode = opts.slotMode;
    var seaByPort = opts.seaByPort;
    var railLt = opts.railLt;
    var railGt = opts.railGt;
    var railHq = opts.railHq;
    var autoRub = opts.autoRub;
    var validity = opts.validity;

    var seaUsdFor20 = function (pol) {
      var r = seaByPort[pol];
      return r ? r.usd20 : Number.NaN;
    };
    var seaUsdFor40 = function (pol) {
      var r = seaByPort[pol];
      return r ? r.usd40 : Number.NaN;
    };

    var sailingDate = validity.fromIso;
    var seaRouteRows;
    var containerType;
    var containerTypes;
    var railRub;
    var railRub20Lt24 = null;
    var railRub20Gt24 = null;

    if (slotMode === "40") {
      seaRouteRows = buildSeaRouteRows({
        origins: origins,
        line: SHIPPING_LINE,
        seaByPort: seaByPort,
        slot: "40HQ",
        seaUsdFn: seaUsdFor40,
        railLt: null,
        railGt: null,
        railHq: railHq,
        autoRub: autoRub,
        sailingDate: sailingDate,
        station: destStation,
        addr: opts.unloadAddress,
      });
      containerType = "40HQ";
      containerTypes = ["40HQ"];
      railRub = railHq;
    } else {
      seaRouteRows = buildPair20SeaRows({
        origins: origins,
        line: SHIPPING_LINE,
        seaUsdFn: seaUsdFor20,
        sailingDate: sailingDate,
        station: destStation,
        addr: opts.unloadAddress,
        autoRub: autoRub,
        railLt: railLt,
        railGt: railGt,
      });
      containerType = "20FT";
      containerTypes = ["20FT"];
      railRub20Lt24 = railLt;
      railRub20Gt24 = railGt;
      railRub =
        railLt != null &&
        railGt != null &&
        Number.isFinite(railLt) &&
        Number.isFinite(railGt)
          ? railLt
          : Number.NaN;
    }

    var seaUsds = seaRouteRows.map(function (r) {
      return r.seaUsd;
    });
    var autoRubs = seaRouteRows.map(function () {
      return autoRub;
    });

    var rate = {
      id: "",
      origin: origins[0] || "",
      originPorts: origins,
      destination: dest,
      railTerminal: "ВСК(Врангель)",
      cargoDepartureTerminal: "",
      cargoDestinationStation: "",
      destinationStation: destStation,
      destinationStations: [destStation],
      containerTypes: containerTypes,
      containerType: containerType,
      cargoSecurity: "no",
      tnvedCode: "",
      cargoWeightKg: null,
      shippingLine: SHIPPING_LINE,
      shippingLines: shippingLines,
      bookingAgent: "ВСК (КП перевозчика)",
      bookingAgentShippingLine: SHIPPING_LINE,
      customsClearance: "destinationPort",
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
      autoRub: autoRub,
      autoRubs: autoRubs,
      securityCostRub: null,
      warehouseAddress: opts.unloadAddress,
      warehouseAddresses: [opts.unloadAddress],
      transitDays: 45,
      nextSailingDates: [validity.fromIso],
      manager: "Импорт PDF (Green Sea / ВСК)",
      updatedAt: new Date().toISOString(),
    };

    rate.id = stableRateKeyFromRecord(rate);
    return rate;
  }

  function buildAllRates(parsed, stableRateKeyFromRecord) {
    var extraWarn = [];

    var seaByName = {};
    for (var s = 0; s < parsed.sea.length; s++) {
      seaByName[parsed.sea[s].port] = parsed.sea[s];
    }
    var origins = Object.keys(seaByName).sort();
    if (!origins.length) {
      return [];
    }

    var out = [];

    for (var i = 0; i < RAIL_ROWS.length; i++) {
      var rr = RAIL_ROWS[i];
      var tr = parsed.rail[rr.cityKey];
      if (!tr) {
        continue;
      }
      var au = matchAutoForCity(rr.cityKey, parsed.auto);
      if (!au) {
        extraWarn.push(
          "Авто раздела 6 для «" +
            rr.cityKey +
            "» не найдено — в ставке авто указано как 0; при необходимости поправьте вручную."
        );
      }

      function autoRubFor(mode) {
        if (!au) {
          return 0;
        }
        return mode === "40" ? au.auto40 : au.auto20;
      }

      out.push(
        buildRateRecord({
          api: { stableRateKeyFromRecord: stableRateKeyFromRecord },
          origins: origins,
          dest: rr.dest,
          destStation: rr.station,
          unloadAddress: rr.addr,
          seaByPort: seaByName,
          railLt: tr.lt24,
          railGt: tr.gt24,
          railHq: tr.rub40,
          autoRub: autoRubFor("40"),
          validity: parsed.validity,
          slotMode: "40",
        })
      );

      out.push(
        buildRateRecord({
          api: { stableRateKeyFromRecord: stableRateKeyFromRecord },
          origins: origins,
          dest: rr.dest,
          destStation: rr.station,
          unloadAddress: rr.addr,
          seaByPort: seaByName,
          railLt: tr.lt24,
          railGt: tr.gt24,
          railHq: tr.rub40,
          autoRub: autoRubFor("20"),
          validity: parsed.validity,
          slotMode: "20",
        })
      );
    }

    return { rates: out, extraWarnings: extraWarn };
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
    for (var p = 1; p <= doc.numPages; p++) {
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
            "Укажите PDF или вставьте текст страницы в поле ниже.",
            "error"
          );
        }
        return;
      }

      var parsed = parseGreenseaVskText(text);

      window.__greenseaLastParsed = parsed;

      var lines = [];

      lines.push("Порты моря (" + parsed.sea.length + "):");
      for (var si = 0; si < parsed.sea.length; si++) {
        var s = parsed.sea[si];

        lines.push(
          "  " + s.port + " 20' " + s.usd20 + " USD 40' " + s.usd40 + " USD"
        );
      }
      lines.push("ЖД направления: " + Object.keys(parsed.rail).join(", "));
      lines.push(
        "Срок: " +
          parsed.validity.fromIso +
          " … " +
          parsed.validity.toIso
      );

      lines.push("");
      lines.push(
        "Ставок к сохранению: " +
          (parsed.sea.length
            ? Object.keys(parsed.rail).length * 2
            : 0)
      );

      if (parsed.warnings.length) {

        lines.push("");
        lines.push("Предупреждения:");
        for (var wi = 0; wi < parsed.warnings.length; wi++) {
          lines.push("  — " + parsed.warnings[wi]);
        }
      }

      var built = { rates: [], extraWarnings: [] };

      if (api && parsed.sea.length) {
        built = buildAllRates(parsed, api.stableRateKeyFromRecord);
      }

      window.__greenseaLastBuiltRates = built.rates;

      if (built.extraWarnings.length) {
        lines.push("");
        lines.push("Замечания:");
        for (var ei = 0; ei < built.extraWarnings.length; ei++) {
          lines.push("  — " + built.extraWarnings[ei]);
        }
      }

      if (showPreviewEl instanceof HTMLElement) {
        showPreviewEl.textContent = lines.join("\n");
      }
      if (api && api.setStatus) {
        api.setStatus(
          "Разбор выполнен (" +
            built.rates.length +
            " ставок по направлениям).",
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
    for (var i = 0; i < built.length; i++) {
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
      "Импорт Green Sea: добавлено " +
        added +
        ", обновлено " +
        updated +
        " (по совпадению ключа ставки).",
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
