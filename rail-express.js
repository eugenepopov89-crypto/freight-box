document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "freightbox-rail-express-v1";
  const SHARE_KEY = "express_kp";
  const months = [
    "Январь","Февраль","Март","Апрель","Май","Июнь",
    "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
  ];

  const form = document.getElementById("express-form");
  const statusEl = document.getElementById("express-status");
  const tbody = document.getElementById("express-tbody");
  const kpTbody = document.getElementById("express-kp-tbody");
  const monthSelect = document.getElementById("validMonth");
  const yearInput = document.getElementById("validYear");
  const departurePicks = document.getElementById("departure-station-picks");
  const borderPicks = document.getElementById("border-crossing-picks");
  const arrivalPicks = document.getElementById("arrival-station-picks");
  const departureInput = document.getElementById("departureStationInput");
  const borderInput = document.getElementById("borderCrossingInput");
  const arrivalInput = document.getElementById("arrivalStationInput");
  const warehouseWrap = document.getElementById("warehouse-addresses-wrap");
  const autoRubWrap = document.getElementById("auto-rub-wrap");
  const addWarehouseBtn = document.getElementById("add-warehouse-address-btn");
  const datesWrap = document.getElementById("departure-dates-wrap");
  const addDateBtn = document.getElementById("add-departure-date-btn");
  const tnvedWrap = document.getElementById("tnved-wrap");
  const addTnvedBtn = document.getElementById("add-tnved-btn");
  const hasHeavyPlaces = document.getElementById("hasHeavyPlaces");
  const heavyPlacesWrap = document.getElementById("heavy-places-wrap");
  const addHeavyPlaceBtn = document.getElementById("add-heavy-place-btn");
  const printBtn = document.getElementById("express-print-btn");
  const shareBtn = document.getElementById("express-share-btn");

  if (!form || !statusEl || !tbody || !kpTbody) return;

  const defaultDeparture = [
    "NANSHA/GUANGZHOU/SHENZHEN/DONGGUAN",
    "CHAOZHOU/SHANTOU",
    "XIAMEN",
    "ZHENGZHOU",
    "ZENGCHENG",
    "CHENGDU",
  ];
  const defaultArrival = ["ВОРСИНО", "СЕЛЯТИНО", "ХОВРИНО", "ШУШАРЫ"];
  defaultDeparture.forEach((v) => addQuickPick(departurePicks, "departureQuick", v));
  defaultArrival.forEach((v) => addQuickPick(arrivalPicks, "arrivalQuick", v));

  months.forEach((m, i) => {
    const o = document.createElement("option");
    o.value = String(i + 1);
    o.textContent = m;
    monthSelect.appendChild(o);
  });
  const now = new Date();
  monthSelect.value = String(now.getMonth() + 1);
  yearInput.value = String(now.getFullYear());

  bindQuickToInput(departurePicks, "departureQuick", departureInput, true);
  bindQuickToInput(borderPicks, "borderCrossingQuick", borderInput, false);
  bindQuickToInput(arrivalPicks, "arrivalQuick", arrivalInput, false);

  addWarehouseBtn?.addEventListener("click", () => {
    appendWarehouseRow("");
    refreshWarehouseAndAutoRows();
  });

  warehouseWrap?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLButtonElement)) return;
    if (t.dataset.action !== "remove-warehouse") return;
    if (warehouseWrap.querySelectorAll(".warehouse-address-row").length <= 1) {
      const i = warehouseWrap.querySelector('input[name="warehouseAddress"]');
      if (i instanceof HTMLInputElement) i.value = "";
      return;
    }
    t.closest(".warehouse-address-row")?.remove();
    refreshWarehouseAndAutoRows();
  });

  addDateBtn?.addEventListener("click", () => appendDateRow(""));
  datesWrap?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLButtonElement) || t.dataset.action !== "remove-date") return;
    t.closest(".sailing-date-row")?.remove();
  });

  addTnvedBtn?.addEventListener("click", () => appendTnvedRow(""));
  tnvedWrap?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLButtonElement) || t.dataset.action !== "remove-tnved") return;
    t.closest(".destination-station-row")?.remove();
  });

  hasHeavyPlaces?.addEventListener("change", () => {
    if (!(heavyPlacesWrap instanceof HTMLElement)) return;
    heavyPlacesWrap.hidden = !(hasHeavyPlaces instanceof HTMLInputElement && hasHeavyPlaces.checked);
  });
  addHeavyPlaceBtn?.addEventListener("click", () => appendHeavyPlaceRow(""));
  heavyPlacesWrap?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLButtonElement) || t.dataset.action !== "remove-heavy-place") return;
    t.closest(".destination-station-row")?.remove();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    refreshWarehouseAndAutoRows();
    const data = readFormData();
    if (!data.ok) {
      setStatus(data.message, "error");
      return;
    }
    const rates = loadRates();
    rates.push(data.rate);
    saveRates(rates);
    render(rates);
    form.reset();
    yearInput.value = String(now.getFullYear());
    monthSelect.value = String(now.getMonth() + 1);
    resetComplexRows();
    setStatus("Ставка сохранена.", "success");
  });

  printBtn?.addEventListener("click", () => window.print());
  shareBtn?.addEventListener("click", async () => {
    const payload = { rates: loadRates() };
    const encoded = encodePayload(payload);
    if (!encoded) return setStatus("Не удалось создать ссылку.", "error");
    const url = new URL(window.location.href);
    url.searchParams.set(SHARE_KEY, encoded);
    try {
      await navigator.clipboard.writeText(url.toString());
      setStatus("Ссылка КП скопирована.", "success");
    } catch {
      setStatus("Ссылка: " + url.toString(), "error");
    }
  });

  hydrateSharedData();
  resetComplexRows();
  render(loadRates());

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "status";
    if (type) statusEl.classList.add(type);
  }

  function addQuickPick(container, name, value) {
    if (!(container instanceof HTMLElement)) return;
    const label = document.createElement("label");
    label.textContent = value + " ";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = value;
    label.appendChild(input);
    container.appendChild(label);
  }

  function bindQuickToInput(container, name, input, toUpper) {
    if (!(container instanceof HTMLElement) || !(input instanceof HTMLInputElement)) return;
    container.addEventListener("change", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.name !== name) return;
      const values = [...container.querySelectorAll('input[name="' + name + '"]:checked')]
        .map((n) => (n instanceof HTMLInputElement ? n.value : ""))
        .filter(Boolean);
      input.value = values.join(", ");
    });
    input.addEventListener("input", () => {
      const selected = new Set(
        input.value.split(",").map((s) => (toUpper ? s.trim().toUpperCase() : s.trim())).filter(Boolean)
      );
      [...container.querySelectorAll('input[name="' + name + '"]')].forEach((n) => {
        if (!(n instanceof HTMLInputElement)) return;
        const key = toUpper ? n.value.toUpperCase() : n.value;
        n.checked = selected.has(key);
      });
    });
  }

  function appendWarehouseRow(value) {
    if (!(warehouseWrap instanceof HTMLElement)) return;
    const row = document.createElement("div");
    row.className = "warehouse-address-row";
    const label = document.createElement("label");
    label.textContent = "Адрес склада выгрузки *";
    const controls = document.createElement("div");
    controls.className = "warehouse-address-controls";
    const input = document.createElement("input");
    input.name = "warehouseAddress";
    input.required = true;
    input.value = value;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-remove-date";
    remove.dataset.action = "remove-warehouse";
    remove.textContent = "−";
    controls.appendChild(input);
    controls.appendChild(remove);
    row.appendChild(label);
    row.appendChild(controls);
    warehouseWrap.appendChild(row);
  }

  function appendDateRow(value) {
    if (!(datesWrap instanceof HTMLElement)) return;
    const row = document.createElement("div");
    row.className = "sailing-date-row";
    const input = document.createElement("input");
    input.name = "departureDates";
    input.type = "date";
    input.required = true;
    input.value = value;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-remove-date";
    remove.dataset.action = "remove-date";
    remove.textContent = "−";
    row.appendChild(input);
    row.appendChild(remove);
    datesWrap.appendChild(row);
  }

  function appendTnvedRow(value) {
    if (!(tnvedWrap instanceof HTMLElement)) return;
    const row = document.createElement("div");
    row.className = "destination-station-row";
    const input = document.createElement("input");
    input.name = "tnvedCode";
    input.value = value;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-remove-date";
    remove.dataset.action = "remove-tnved";
    remove.textContent = "−";
    row.appendChild(input);
    row.appendChild(remove);
    tnvedWrap.appendChild(row);
  }

  function appendHeavyPlaceRow(value) {
    if (!(heavyPlacesWrap instanceof HTMLElement)) return;
    const row = document.createElement("div");
    row.className = "destination-station-row";
    const input = document.createElement("input");
    input.name = "heavyPlaceWeight";
    input.type = "number";
    input.min = "1500";
    input.step = "1";
    input.value = value;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-remove-date";
    remove.dataset.action = "remove-heavy-place";
    remove.textContent = "−";
    row.appendChild(input);
    row.appendChild(remove);
    heavyPlacesWrap.appendChild(row);
  }

  function refreshWarehouseAndAutoRows() {
    const rows = [...warehouseWrap.querySelectorAll(".warehouse-address-row")];
    rows.forEach((row, i) => {
      const idx = i + 1;
      const label = row.querySelector("label");
      const input = row.querySelector('input[name="warehouseAddress"]');
      if (label instanceof HTMLLabelElement && input instanceof HTMLInputElement) {
        const id = "warehouseAddress-" + String(idx);
        label.textContent = "Адрес склада выгрузки " + String(idx) + " *";
        label.htmlFor = id;
        input.id = id;
      }
    });
    const old = [...autoRubWrap.querySelectorAll('input[name="autoRub"]')].map((n) =>
      n instanceof HTMLInputElement ? n.value : ""
    );
    autoRubWrap.innerHTML = "";
    const count = Math.max(1, rows.length);
    for (let i = 0; i < count; i++) {
      const idx = i + 1;
      const row = document.createElement("div");
      row.className = "auto-rub-row";
      const label = document.createElement("label");
      label.htmlFor = "autoRub-" + String(idx);
      label.textContent = "До склада выгрузки " + String(idx) + ", RUB *";
      const input = document.createElement("input");
      input.id = "autoRub-" + String(idx);
      input.name = "autoRub";
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.required = true;
      input.value = old[i] || "";
      row.appendChild(label);
      row.appendChild(input);
      autoRubWrap.appendChild(row);
    }
  }

  function readFormData() {
    const fd = new FormData(form);
    const departure = String(fd.get("departureStationInput") || "").trim();
    const border = String(fd.get("borderCrossingInput") || "").trim();
    const arrival = String(fd.get("arrivalStationInput") || "").trim();
    if (!departure || !border || !arrival) {
      return { ok: false, message: "Заполните станции и погран переход." };
    }
    const warehouses = [...warehouseWrap.querySelectorAll('input[name="warehouseAddress"]')]
      .map((n) => (n instanceof HTMLInputElement ? n.value.trim() : ""))
      .filter(Boolean);
    if (!warehouses.length) return { ok: false, message: "Добавьте адреса выгрузки." };
    const autoRubs = [...autoRubWrap.querySelectorAll('input[name="autoRub"]')].map((n) =>
      n instanceof HTMLInputElement ? Number(n.value) : Number.NaN
    );
    if (autoRubs.some((n) => !Number.isFinite(n) || n < 0) || autoRubs.length < warehouses.length) {
      return { ok: false, message: "Заполните стоимости довоза по всем складам." };
    }
    const dates = [...datesWrap.querySelectorAll('input[name="departureDates"]')]
      .map((n) => (n instanceof HTMLInputElement ? n.value : ""))
      .filter(Boolean);
    if (!dates.length) return { ok: false, message: "Добавьте даты выхода." };

    const tnvedCodes = [...tnvedWrap.querySelectorAll('input[name="tnvedCode"]')]
      .map((n) => (n instanceof HTMLInputElement ? n.value.trim() : ""))
      .filter(Boolean);
    const heavyWeights = [...heavyPlacesWrap.querySelectorAll('input[name="heavyPlaceWeight"]')]
      .map((n) => (n instanceof HTMLInputElement ? Number(n.value) : Number.NaN))
      .filter((n) => Number.isFinite(n) && n >= 1500);

    const railUsd = Number(fd.get("railUsd"));
    const transitDays = Number(fd.get("transitDays"));
    if (!Number.isFinite(railUsd) || !Number.isFinite(transitDays)) {
      return { ok: false, message: "Проверьте числовые поля ставки." };
    }
    const profitRailUsd = Number(fd.get("profitRailUsd") || 0);
    const profitAutoRub = Number(fd.get("profitAutoRub") || 0);

    return {
      ok: true,
      rate: {
        id: String(Date.now()) + "-" + Math.random().toString(16).slice(2),
        departureStation: departure,
        borderCrossing: border,
        arrivalStation: arrival,
        warehouseAddresses: warehouses,
        departureDates: dates,
        validYear: Number(fd.get("validYear")),
        validMonth: Number(fd.get("validMonth")),
        validitySlot: String(fd.get("validitySlot") || "H1"),
        containerType: "40HQ",
        tnvedCodes,
        cargoWeightKg: String(fd.get("cargoWeightKg") || "").trim(),
        hasHeavyPlaces: hasHeavyPlaces instanceof HTMLInputElement && hasHeavyPlaces.checked,
        heavyPlaceWeights: heavyWeights,
        transitDays,
        railUsd,
        autoRubs: autoRubs.slice(0, warehouses.length),
        profitRailUsd: Number.isFinite(profitRailUsd) ? profitRailUsd : 0,
        profitAutoRub: Number.isFinite(profitAutoRub) ? profitAutoRub : 0,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  function render(rates) {
    if (!Array.isArray(rates) || !rates.length) {
      tbody.innerHTML = '<tr><td colspan="7">Ставок пока нет.</td></tr>';
      kpTbody.innerHTML = '<tr><td colspan="4">Ставок пока нет.</td></tr>';
      return;
    }
    const rows = [];
    const kpRows = [];
    rates.forEach((rate) => {
      const warehouses = Array.isArray(rate.warehouseAddresses) ? rate.warehouseAddresses : [];
      const autos = Array.isArray(rate.autoRubs) ? rate.autoRubs : [];
      const railWithProfit = Number(rate.railUsd || 0) + Number(rate.profitRailUsd || 0);
      warehouses.forEach((w, i) => {
        const auto = Number(autos[i] ?? autos[0] ?? 0);
        const autoWithProfit = auto + Number(rate.profitAutoRub || 0);
        rows.push(
          "<tr>" +
            "<td>" + esc(rate.departureStation) + "</td>" +
            "<td>" + esc(rate.borderCrossing) + "</td>" +
            "<td>" + esc(rate.arrivalStation) + "</td>" +
            "<td>" + esc(w) + "</td>" +
            "<td>" + esc(num(railWithProfit, 2)) + "</td>" +
            "<td>" + esc(num(autoWithProfit, 0)) + "</td>" +
            "<td>" + esc("ЖД " + num(railWithProfit, 2) + " USD / Авто " + num(autoWithProfit, 0) + " RUB") + "</td>" +
          "</tr>"
        );
        kpRows.push(
          "<tr>" +
            "<td>" + esc(rate.departureStation + " → " + rate.arrivalStation + " (" + rate.borderCrossing + ")") + "</td>" +
            "<td>" + esc(w) + "</td>" +
            "<td>" + esc(num(railWithProfit, 2)) + "</td>" +
            "<td>" + esc(num(autoWithProfit, 0)) + "</td>" +
          "</tr>"
        );
      });
    });
    tbody.innerHTML = rows.join("");
    kpTbody.innerHTML = kpRows.join("");
  }

  function encodePayload(payload) {
    try {
      return btoa(encodeURIComponent(JSON.stringify(payload)).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(Number.parseInt(p1, 16))
      ));
    } catch {
      return "";
    }
  }

  function decodePayload(raw) {
    try {
      const json = decodeURIComponent(
        Array.prototype.map.call(atob(String(raw || "")), (ch) => "%" + ("00" + ch.charCodeAt(0).toString(16)).slice(-2)).join("")
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function hydrateSharedData() {
    const raw = new URLSearchParams(window.location.search).get(SHARE_KEY);
    if (!raw) return;
    const payload = decodePayload(raw);
    if (!payload || !Array.isArray(payload.rates)) return;
    saveRates(payload.rates);
  }

  function resetComplexRows() {
    if (tnvedWrap instanceof HTMLElement) {
      tnvedWrap.innerHTML =
        '<div class="destination-station-row"><input name="tnvedCode" placeholder="Например, 8471300000" /><button type="button" id="add-tnved-btn" class="btn-add-date">+</button></div>';
      const b = document.getElementById("add-tnved-btn");
      b?.addEventListener("click", () => appendTnvedRow(""));
    }
    if (heavyPlacesWrap instanceof HTMLElement) {
      heavyPlacesWrap.hidden = true;
      heavyPlacesWrap.innerHTML =
        '<div class="destination-station-row"><input name="heavyPlaceWeight" type="number" min="1500" step="1" placeholder="Вес места, кг" /><button type="button" id="add-heavy-place-btn" class="btn-add-date">+</button></div>';
      const b = document.getElementById("add-heavy-place-btn");
      b?.addEventListener("click", () => appendHeavyPlaceRow(""));
    }
    if (datesWrap instanceof HTMLElement) {
      datesWrap.innerHTML =
        '<div class="sailing-date-row"><input name="departureDates" type="date" required /><button type="button" id="add-departure-date-btn" class="btn-add-date">+</button></div>';
      const b = document.getElementById("add-departure-date-btn");
      b?.addEventListener("click", () => appendDateRow(""));
    }
    if (warehouseWrap instanceof HTMLElement) {
      warehouseWrap.innerHTML =
        '<div class="warehouse-address-row"><label for="warehouseAddress-1">Адрес склада выгрузки 1 *</label><div class="warehouse-address-controls"><input id="warehouseAddress-1" name="warehouseAddress" required /><button type="button" id="add-warehouse-address-btn" class="btn-add-date">+</button></div></div>';
      const b = document.getElementById("add-warehouse-address-btn");
      b?.addEventListener("click", () => {
        appendWarehouseRow("");
        refreshWarehouseAndAutoRows();
      });
    }
    refreshWarehouseAndAutoRows();
  }

  function loadRates() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveRates(rates) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  }

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function num(v, d) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
});
