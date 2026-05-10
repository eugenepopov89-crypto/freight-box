/**
 * Отдельное окно: FOB-ставки, срок действия которых включает сегодняшнюю дату.
 * Данные — PocketBase (тот же токен, что у rates.html).
 */
(function registryLiveFobIife() {
  "use strict";

  const API_BASE = "https://pocketbase-production-3100.up.railway.app";

  const COLUMN_DEFS = [
    { key: "terms", label: "Условия<br />поставки", filter: true, sort: true },
    { key: "departure", label: "Отправление", filter: true, sort: true },
    { key: "railTerminal", label: "ЖД<br />терминал", filter: true, sort: true },
    { key: "destinationStation", label: "Станция<br />назначения", filter: true, sort: true },
    { key: "customs", label: "Таможня", filter: true, sort: true },
    { key: "sailings", label: "Ближайшие<br />выходы", filter: true, sort: true },
    { key: "line", label: "Морская<br />линия", filter: true, sort: true },
    { key: "container", label: "Контейнер", filter: true, sort: true },
    { key: "railLt", label: "ЖД 20′<br />&lt;24т", filter: true, sort: true },
    { key: "railGt", label: "ЖД 20′<br />&gt;24т", filter: true, sort: true },
    { key: "rail40", label: "ЖД 40′<br />HQ", filter: true, sort: true },
  ];

  function pocketBaseAuthHeaders() {
    const token = localStorage.getItem("pb_token");
    if (!token || !String(token).trim()) {
      return {};
    }
    const raw = String(token).trim();
    const value = raw.toLowerCase().startsWith("bearer ")
      ? raw
      : "Bearer " + raw;
    return { Authorization: value };
  }

  function normalizePocketBaseRateRecord(record) {
    if (!record || typeof record !== "object") {
      return {};
    }
    let d = record.data;
    if (typeof d === "string") {
      try {
        d = JSON.parse(d);
      } catch {
        d = {};
      }
    }
    if (!d || typeof d !== "object" || Array.isArray(d)) {
      d = {};
    }
    return { ...d, _pbId: record.id };
  }

  async function loadRatesPb() {
    const auth = pocketBaseAuthHeaders();
    if (!auth.Authorization) {
      return [];
    }
    try {
      const res = await fetch(
        API_BASE + "/api/collections/rates/records?perPage=500&sort=-created",
        { headers: { ...auth } }
      );
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return (data.items || []).map((item) =>
        normalizePocketBaseRateRecord(item)
      );
    } catch {
      return [];
    }
  }

  function parseTariffIsoDateLocal(iso) {
    const s = String(iso || "").trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) {
      return null;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) {
      return null;
    }
    const dt = new Date(y, mo - 1, d);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== mo - 1 ||
      dt.getDate() !== d
    ) {
      return null;
    }
    return dt;
  }

  function legacyTariffValidityRange(rate) {
    const vy = Number(rate.validYear);
    const vm = Number(rate.validMonth);
    if (!Number.isFinite(vy) || !Number.isFinite(vm) || vm < 1 || vm > 12) {
      return null;
    }
    const slot = String(rate.validitySlot || "").trim().toUpperCase();
    const isH1 = slot === "H1" || slot === "";
    if (isH1) {
      return {
        from: new Date(vy, vm - 1, 1),
        to: new Date(vy, vm - 1, 15),
      };
    }
    return {
      from: new Date(vy, vm - 1, 16),
      to: new Date(vy, vm, 0),
    };
  }

  function tariffValidityBounds(rate) {
    const fIso = String(rate.tariffValidFrom || "").trim();
    const tIso = String(rate.tariffValidTo || "").trim();
    if (fIso && tIso) {
      const from = parseTariffIsoDateLocal(fIso);
      const to = parseTariffIsoDateLocal(tIso);
      if (from && to) {
        return { from, to };
      }
    }
    return legacyTariffValidityRange(rate);
  }

  function rateIncludesToday(rate) {
    const b = tariffValidityBounds(rate);
    if (!b) {
      return false;
    }
    const t = new Date();
    const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return b.from <= today && b.to >= today;
  }

  function normalizeDeliveryTerms(raw) {
    const s = String(raw ?? "").trim().toUpperCase();
    return s === "EXW" || s === "FCA" || s === "FOB" ? s : "FOB";
  }

  function rateNumericOrNaN(raw) {
    if (raw == null || raw === "") {
      return Number.NaN;
    }
    if (typeof raw === "number") {
      return Number.isFinite(raw) ? raw : Number.NaN;
    }
    if (typeof raw === "string") {
      let t = raw.trim().replace(/[\s\u00a0\u202f]/g, "");
      if (t === "" || t === "-" || t === "—") {
        return Number.NaN;
      }
      if (t.includes(",") && !t.includes(".")) {
        t = t.replace(",", ".");
      }
      const n = Number(t);
      return Number.isFinite(n) ? n : Number.NaN;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : Number.NaN;
  }

  function formatNumber(value) {
    const n = rateNumericOrNaN(value);
    if (!Number.isFinite(n)) {
      return "—";
    }
    return new Intl.NumberFormat("ru-RU").format(n);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeOriginPortLabel(port) {
    return String(port || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }

  function getRateOriginPortsUpper(rate) {
    const raw = rate.originPorts;
    let list = [];
    if (Array.isArray(raw) && raw.length) {
      list = raw;
    } else if (raw != null && String(raw).trim() !== "") {
      list = String(raw)
        .split(/[,;]/)
        .map((chunk) => normalizeOriginPortLabel(chunk))
        .filter(Boolean);
    }
    if (!list.length) {
      const o = normalizeOriginPortLabel(rate.origin);
      if (o) {
        list = [o];
      }
    }
    const seen = new Set();
    const out = [];
    list.forEach((p) => {
      const up = normalizeOriginPortLabel(p);
      if (up && !seen.has(up)) {
        seen.add(up);
        out.push(up);
      }
    });
    return out;
  }

  function getRateShippingLines(rate) {
    if (Array.isArray(rate.shippingLines) && rate.shippingLines.length) {
      return rate.shippingLines
        .map((line) => String(line || "").trim().replace(/\s+/g, " "))
        .filter(Boolean);
    }
    return String(rate.shippingLine || "")
      .split(",")
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter(Boolean);
  }

  function normalizeOriginPortToken(value) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  function normalizeShippingLineToken(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("ru-RU");
  }

  function buildOriginLineCombinations(origins, lines) {
    const combos = [];
    const safeOrigins = origins.length ? origins : [""];
    const safeLines = lines.length ? lines : [""];
    safeOrigins.forEach((origin) => {
      safeLines.forEach((line) => {
        combos.push({
          origin: String(origin || "").trim().toUpperCase(),
          shippingLine: String(line || "").trim(),
        });
      });
    });
    return combos;
  }

  function getWarehouseAddressesForRate(rate) {
    const rawList = Array.isArray(rate.warehouseAddresses)
      ? rate.warehouseAddresses
      : [rate.warehouseAddress];
    const seen = new Set();
    const unique = [];
    rawList.forEach((item) => {
      const display = String(item || "").trim().replace(/\s+/g, " ");
      if (!display) {
        return;
      }
      const key = display.toLocaleLowerCase("ru-RU");
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(display);
    });
    return unique;
  }

  function getRateContainerTypes(rate) {
    const rows = Array.isArray(rate.seaRouteRows) ? rate.seaRouteRows : [];
    const slots = rows
      .map((r) => String(r.containerSlot || "").trim())
      .filter((s) => s === "20LT24" || s === "20GT24" || s === "40HQ");
    if (slots.length) {
      const has20 = slots.some((s) => s === "20LT24" || s === "20GT24");
      const has40 = slots.includes("40HQ");
      const out = [];
      if (has20) {
        out.push("20FT");
      }
      if (has40) {
        out.push("40HQ");
      }
      return out.length ? out : ["40HQ"];
    }
    const raw = rate.containerTypes;
    if (Array.isArray(raw) && raw.length) {
      return raw.map((x) => String(x || "").trim()).filter(Boolean);
    }
    const one = String(rate.containerType || "").trim();
    return one ? [one] : [];
  }

  function formatContainerTypesDisplay(rate) {
    const rows = Array.isArray(rate.seaRouteRows) ? rate.seaRouteRows : [];
    const slots = rows
      .map((r) => String(r.containerSlot || "").trim())
      .filter((s) => s === "20LT24" || s === "20GT24" || s === "40HQ");
    if (slots.length) {
      const seen = new Set();
      const parts = [];
      slots.forEach((s) => {
        const label =
          s === "20LT24"
            ? "20′ <24т"
            : s === "20GT24"
              ? "20′ >24т"
              : "40′ HQ";
        if (!seen.has(label)) {
          seen.add(label);
          parts.push(label);
        }
      });
      return parts.join(", ");
    }
    const xs = getRateContainerTypes(rate);
    return xs.length ? [...new Set(xs)].join(", ") : "—";
  }

  function formatOriginPorts(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(", ");
    }
    return String(value || "—");
  }

  function formatDestinationStations(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(", ");
    }
    return String(value || "—");
  }

  function formatCustomsClearance(value) {
    if (value === "destinationPort") {
      return "В порту назначения";
    }
    if (value === "destinationStation") {
      return "На станции назначения";
    }
    return "—";
  }

  function formatSailingDate(value) {
    if (!value) {
      return "";
    }
    const asDate = new Date(value);
    if (Number.isNaN(asDate.getTime())) {
      return String(value);
    }
    return asDate.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function formatSailingDates(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => formatSailingDate(item))
        .filter(Boolean)
        .join(", ");
    }
    return formatSailingDate(value) || "—";
  }

  function formatShippingLineDisplay(rate) {
    const single = String(rate.shippingLine || "").trim();
    if (single) {
      return single;
    }
    if (Array.isArray(rate.shippingLines)) {
      const lines = rate.shippingLines
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      if (lines.length) {
        return lines.join(", ");
      }
    }
    return "—";
  }

  function formatRegistryRailTriple(rate) {
    const dash = "—";
    const fmt = (n) => (Number.isFinite(n) ? formatNumber(n) : dash);
    const ct = String(rate.containerType || "").trim().toUpperCase();
    const is20 =
      ct === "20FT" || (ct.includes("20") && !ct.includes("40"));
    const is40 = ct.includes("40");
    const w = rateNumericOrNaN(rate.cargoWeightKg);
    const rail = rateNumericOrNaN(rate.railRub);
    const ltField = rateNumericOrNaN(rate.railRub20Lt24);
    const gtField = rateNumericOrNaN(rate.railRub20Gt24);
    let cell20Lt = dash;
    let cell20Gt = dash;
    let cell40 = dash;

    if (is20) {
      if (Number.isFinite(ltField)) {
        cell20Lt = fmt(ltField);
      }
      if (Number.isFinite(gtField)) {
        cell20Gt = fmt(gtField);
      }
      const legacyRail =
        Number.isFinite(rail) &&
        (!Number.isFinite(ltField) || !Number.isFinite(gtField));
      if (legacyRail) {
        if (!Number.isFinite(w)) {
          if (!Number.isFinite(ltField)) {
            cell20Lt = fmt(rail);
          }
          if (!Number.isFinite(gtField)) {
            cell20Gt = fmt(rail);
          }
        } else if (w <= 24000) {
          if (!Number.isFinite(ltField)) {
            cell20Lt = fmt(rail);
          }
        } else if (!Number.isFinite(gtField)) {
          cell20Gt = fmt(rail);
        }
      }
    } else if (is40) {
      cell40 = fmt(rail);
    } else if (Number.isFinite(rail)) {
      cell40 = fmt(rail);
    }

    return { cell20Lt, cell20Gt, cell40 };
  }

  function expandRatesByRouteDimensions(rates) {
    const expanded = [];
    rates.forEach((rate) => {
      const origins = getRateOriginPortsUpper(rate).map((p) =>
        String(p || "").trim().toUpperCase()
      );
      const shippingLines = getRateShippingLines(rate);
      let addresses = getWarehouseAddressesForRate(rate);
      if (!addresses.length) {
        addresses = [""];
      }
      const seaRouteRowsRaw = Array.isArray(rate.seaRouteRows)
        ? rate.seaRouteRows
        : [];
      const seaUsds = Array.isArray(rate.seaUsds)
        ? rate.seaUsds
        : [rate.seaUsd];
      const autoRubs = Array.isArray(rate.autoRubs)
        ? rate.autoRubs
        : [rate.autoRub];
      if (!origins.length) {
        expanded.push(rate);
        return;
      }
      if (!shippingLines.length) {
        origins.forEach((origin) => {
          expanded.push({
            ...rate,
            origin: String(origin || "").trim().toUpperCase(),
            originPorts: [String(origin || "").trim().toUpperCase()],
          });
        });
        return;
      }
      const routeCombos = buildOriginLineCombinations(origins, shippingLines);
      const seaRouteRowsNormalized = seaRouteRowsRaw.map((row, index) => ({
        ...row,
        origin: normalizeOriginPortToken(
          row.origin || routeCombos[index]?.origin || ""
        ),
        shippingLine: String(
          row.shippingLine || routeCombos[index]?.shippingLine || ""
        )
          .trim()
          .replace(/\s+/g, " "),
      }));
      origins.forEach((origin, originIndex) => {
        shippingLines.forEach((line, lineIndex) => {
          const routeRow =
            seaRouteRowsNormalized.find(
              (row) =>
                normalizeOriginPortToken(row.origin) ===
                  normalizeOriginPortToken(origin) &&
                normalizeShippingLineToken(row.shippingLine) ===
                  normalizeShippingLineToken(line)
            ) || null;
          const seaUsdFallback = Number(
            seaUsds[originIndex * shippingLines.length + lineIndex]
          );
          const seaUsdValue = routeRow
            ? Number(routeRow.seaUsd)
            : seaUsdFallback;
          const sailingDate = routeRow
            ? String(routeRow.sailingDate || "")
            : "";
          addresses.forEach((address, addressIndex) => {
            const autoRubValue = Number(autoRubs[addressIndex]);
            expanded.push({
              ...rate,
              origin: String(origin || "").trim().toUpperCase(),
              originPorts: [String(origin || "").trim().toUpperCase()],
              shippingLine: String(routeRow?.shippingLine || line || "")
                .trim()
                .replace(/\s+/g, " "),
              shippingLines: [
                String(routeRow?.shippingLine || line || "")
                  .trim()
                  .replace(/\s+/g, " "),
              ],
              seaUsd: Number.isFinite(seaUsdValue)
                ? seaUsdValue
                : Number(rate.seaUsd),
              seaUsds: [
                Number.isFinite(seaUsdValue)
                  ? seaUsdValue
                  : Number(rate.seaUsd),
              ],
              nextSailingDates: sailingDate
                ? [sailingDate]
                : Array.isArray(rate.nextSailingDates)
                  ? rate.nextSailingDates
                  : [],
              warehouseAddress: address,
              warehouseAddresses: [address],
              autoRub: Number.isFinite(autoRubValue)
                ? autoRubValue
                : Number(rate.autoRub),
              autoRubs: [
                Number.isFinite(autoRubValue)
                  ? autoRubValue
                  : Number(rate.autoRub),
              ],
            });
          });
        });
      });
    });
    return expanded;
  }

  function buildRow(rate) {
    const rail = formatRegistryRailTriple(rate);
    return {
      terms: normalizeDeliveryTerms(rate.deliveryTerms),
      departure:
        formatOriginPorts(rate.originPorts || [rate.origin]) +
        " → VLADIVOSTOK",
      railTerminal: String(rate.railTerminal || "").trim() || "—",
      destinationStation: formatDestinationStations(
        rate.destinationStations || [rate.destinationStation]
      ),
      customs: formatCustomsClearance(rate.customsClearance),
      sailings: formatSailingDates(rate.nextSailingDates || rate.nextSailing),
      line: formatShippingLineDisplay(rate),
      container: formatContainerTypesDisplay(rate),
      railLt: rail.cell20Lt,
      railGt: rail.cell20Gt,
      rail40: rail.cell40,
    };
  }

  function parseSortKey(str) {
    const cleaned = String(str || "")
      .replace(/—/g, "")
      .replace(/\s/g, "")
      .replace(/\u00a0/g, "");
    if (cleaned === "" || cleaned === "-") {
      return null;
    }
    let t = cleaned.replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function compareByColumn(a, b, key, dir) {
    const va = String(a[key] ?? "");
    const vb = String(b[key] ?? "");
    const na = parseSortKey(va);
    const nb = parseSortKey(vb);
    let cmp = 0;
    if (na !== null && nb !== null) {
      cmp = na === nb ? 0 : na < nb ? -1 : 1;
    } else if (na !== null) {
      cmp = -1;
    } else if (nb !== null) {
      cmp = 1;
    } else {
      cmp = va.localeCompare(vb, "ru", {
        sensitivity: "base",
        numeric: true,
      });
    }
    return cmp * dir;
  }

  function rowMatchesFilters(row, filters) {
    return COLUMN_DEFS.every((col) => {
      const needle = String(filters[col.key] || "")
        .trim()
        .toLowerCase();
      if (!needle) {
        return true;
      }
      const hay = String(row[col.key] || "").toLowerCase();
      return hay.includes(needle);
    });
  }

  function syncSortIndicatorClasses(theadEl, sortState) {
    theadEl.querySelectorAll(".registry-th-sortable").forEach((th) => {
      const key = th.getAttribute("data-sort-key");
      th.classList.remove("is-sorted-asc", "is-sorted-desc");
      if (key && sortState.column === key) {
        th.classList.add(
          sortState.dir > 0 ? "is-sorted-asc" : "is-sorted-desc"
        );
      }
    });
  }

  function bindTheadOnce(theadEl, filters, sortState, ctx) {
    if (theadEl.dataset.registryBound === "1") {
      return;
    }
    theadEl.dataset.registryBound = "1";

    const headLabels = COLUMN_DEFS.map(
      (c) =>
        '<th scope="col" class="registry-th-sortable" data-sort-key="' +
        escapeHtml(c.key) +
        '">' +
        c.label +
        "</th>"
    ).join("");

    const headFilters = COLUMN_DEFS.map(
      (c) =>
        '<th scope="col"><label class="visually-hidden">Фильтр: ' +
        escapeHtml(c.key) +
        "</label>" +
        '<input type="search" class="registry-filter-input" data-filter-key="' +
        escapeHtml(c.key) +
        '" autocomplete="off" placeholder="Фильтр…" value="" /></th>'
    ).join("");

    theadEl.innerHTML =
      "<tr>" + headLabels + "</tr><tr class='registry-filter-row'>" + headFilters + "</tr>";

    theadEl.querySelectorAll(".registry-th-sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.getAttribute("data-sort-key");
        if (!k) {
          return;
        }
        if (sortState.column === k) {
          sortState.dir = -sortState.dir;
        } else {
          sortState.column = k;
          sortState.dir = 1;
        }
        ctx.redrawBody();
      });
    });

    theadEl.querySelectorAll(".registry-filter-input").forEach((inp) => {
      const k = inp.getAttribute("data-filter-key");
      if (k) {
        inp.value = filters[k] || "";
      }
      inp.addEventListener("input", () => {
        const key = inp.getAttribute("data-filter-key");
        if (key) {
          filters[key] = inp.value;
        }
        ctx.redrawBody();
      });
    });

    syncSortIndicatorClasses(theadEl, sortState);
  }

  function syncFilterInputsFromState(theadEl, filters) {
    theadEl.querySelectorAll(".registry-filter-input").forEach((inp) => {
      const k = inp.getAttribute("data-filter-key");
      if (!k || document.activeElement === inp) {
        return;
      }
      inp.value = filters[k] || "";
    });
  }

  function renderRows(tbodyEl, rows) {
    if (!rows.length) {
      tbodyEl.innerHTML =
        '<tr><td colspan="' +
        COLUMN_DEFS.length +
        '">Нет строк по условию (FOB, срок на сегодня) или по фильтрам.</td></tr>';
      return;
    }
    tbodyEl.innerHTML = rows
      .map(
        (r) =>
          "<tr>" +
          COLUMN_DEFS.map(
            (c) =>
              "<td>" + escapeHtml(String(r[c.key] != null ? r[c.key] : "")) + "</td>"
          ).join("") +
          "</tr>"
      )
      .join("");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!localStorage.getItem("pb_token")) {
      window.location.href = "login.html";
      return;
    }

    const statusEl = document.getElementById("registry-status");
    const theadEl = document.getElementById("registry-thead");
    const tbodyEl = document.getElementById("registry-tbody");
    const reloadBtn = document.getElementById("registry-reload");
    const todayLabelEl = document.getElementById("registry-today-label");

    if (!theadEl || !tbodyEl) {
      return;
    }

    let sourceRows = [];
    const filters = {};
    COLUMN_DEFS.forEach((c) => {
      filters[c.key] = "";
    });
    const sortState = { column: "departure", dir: 1 };

    function todayRu() {
      const t = new Date();
      return t.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }

    function filteredRows() {
      return sourceRows.filter((r) => rowMatchesFilters(r, filters));
    }

    const ctx = {
      redrawBody: function redrawBody() {
        let list = filteredRows().slice();
        list.sort((a, b) => {
          const c = compareByColumn(a, b, sortState.column, sortState.dir);
          if (c !== 0) {
            return c;
          }
          return compareByColumn(a, b, "line", 1);
        });
        syncSortIndicatorClasses(theadEl, sortState);
        renderRows(tbodyEl, list);
      },
    };

    function sortAndRedraw() {
      bindTheadOnce(theadEl, filters, sortState, ctx);
      syncFilterInputsFromState(theadEl, filters);
      ctx.redrawBody();
    }

    async function reload() {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = "Загрузка ставок…";
      }
      tbodyEl.innerHTML = "";
      const raw = await loadRatesPb();
      const fobToday = raw.filter(
        (r) =>
          normalizeDeliveryTerms(r.deliveryTerms) === "FOB" &&
          rateIncludesToday(r)
      );
      const expanded = expandRatesByRouteDimensions(fobToday);
      sourceRows = expanded.map((rate) => buildRow(rate));

      if (todayLabelEl) {
        todayLabelEl.textContent = todayRu();
      }
      if (statusEl) {
        statusEl.textContent =
          "Загружено строк после разворота маршрутов: " +
          sourceRows.length +
          " (ставок-записей FOB на сегодня: " +
          fobToday.length +
          ").";
        statusEl.hidden = sourceRows.length > 0;
      }
      sortAndRedraw();
    }

    reloadBtn?.addEventListener("click", () => {
      theadEl.dataset.registryBound = "";
      theadEl.innerHTML = "";
      reload();
    });

    await reload();
  });
})();
