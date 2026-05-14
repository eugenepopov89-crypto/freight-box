document.addEventListener("DOMContentLoaded", async () => {
  const STORAGE_KEY = "factoriall-rates-v1";
  const SALES_PROFIT_UNDO_STACK_KEY = "factoriall-rates-sales-profit-undo-v1";
  /** Имя коллекции в PocketBase: одна запись на агента, текстовое поле `name`. */
  const BOOKING_AGENTS_COLLECTION = "booking_agents";
  const API_BASE = "https://pocketbase-production-3100.up.railway.app";
  let bookingAgentsPbCache = [];

  /** Пользовательские подсказки в datalist (localStorage). */
  const AGENTS_KEY = "freightbox-booking-agents";
  const LINES_KEY = "freightbox-shipping-lines";
  /** Линии для поля «Для какой морской линии используется агент» (дополняют маршрут). */
  const ROUTE_LINES_KEY = "freightbox-booking-route-lines";
  /** Подсказки «агента нет» — всегда в списке (WebKit/Safari и форма без входа в PB). */
  const DEFAULT_BOOKING_AGENT_SUGGESTIONS = ["НЕТ", "нет"];
  /** Чекбоксы быстрого выбора агента: не раздувать дом сотнями имён из реестра. */
  const MAX_BOOKING_AGENT_QUICK_PICKS = 72;

  function readSavedList(storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(saved)) {
        return [];
      }
      return saved
        .map((item) => String(item || "").trim().replace(/\s+/g, " "))
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function writeSavedList(storageKey, values) {
    try {
      const normalized = (values || [])
        .map((v) => String(v || "").trim().replace(/\s+/g, " "))
        .filter(Boolean);
      const sorted = [...new Set(normalized)].sort((a, b) =>
        a.localeCompare(b, "ru")
      );
      localStorage.setItem(storageKey, JSON.stringify(sorted));
    } catch (err) {
      console.warn("[rates] localStorage save failed:", storageKey, err);
    }
  }

  /** Однократный перенос со старых ключей (`bookingAgentOptions` и т.д.). */
  function migrateLegacyOptionKeys() {
    const pairs = [
      ["bookingAgentOptions", AGENTS_KEY],
      ["shippingLineOptions", LINES_KEY],
      ["bookingAgentRouteLineOptions", ROUTE_LINES_KEY],
    ];
    pairs.forEach(([oldKey, newKey]) => {
      const raw = localStorage.getItem(oldKey);
      if (!raw) {
        return;
      }
      try {
        const oldArr = JSON.parse(raw);
        if (!Array.isArray(oldArr)) {
          return;
        }
        const merged = [...new Set(readSavedList(newKey).concat(
          oldArr.map((item) => String(item || "").trim()).filter(Boolean)
        ))].sort((a, b) => a.localeCompare(b, "ru"));
        writeSavedList(newKey, merged);
        localStorage.removeItem(oldKey);
      } catch {
        /* ignore */
      }
    });
  }

  /**
   * Загрузка сохранённых строк из localStorage и добавление option в datalist
   * (без CSS-селектора по значению — безопасно для кавычек и спецсимволов).
   */
  function loadSavedOptions(storageKey, datalistId) {
    const saved = readSavedList(storageKey);
    const datalist = document.getElementById(datalistId);
    if (!datalist) {
      return saved;
    }
    saved.forEach((val) => {
      const exists = [...datalist.querySelectorAll("option")].some(
        (opt) => opt.value === val
      );
      if (!exists) {
        const opt = document.createElement("option");
        opt.value = val;
        datalist.appendChild(opt);
      }
    });
    sortDatalistOptions(datalist);
    return saved;
  }

  /**
   * Сохранить новую опцию в localStorage и сразу добавить в datalist.
   * `gridId` зарезервирован; можно передать null.
   */
  function saveNewOption(storageKey, datalistId, gridId, value) {
    void gridId;
    if (value == null || value === "") {
      return;
    }
    value = String(value).trim();
    if (!value) {
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(saved)) {
        return;
      }
      if (!saved.includes(value)) {
        saved.push(value);
        localStorage.setItem(storageKey, JSON.stringify(saved));
      }
    } catch (e) {
      console.warn("localStorage недоступен:", e);
    }
    const datalist = document.getElementById(datalistId);
    if (!datalist) {
      return;
    }
    let exists = false;
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      exists = !!datalist.querySelector(
        `option[value="${CSS.escape(value)}"]`
      );
    } else {
      exists = [...datalist.querySelectorAll("option")].some(
        (opt) => opt.value === value
      );
    }
    if (!exists) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      datalist.appendChild(opt);
    }
  }

  migrateLegacyOptionKeys();

  const DESTINATIONS = ["MOSCOW", "ST. PETERSBURG", "MINSK"];

  function getStationQuickPicksRootEl() {
    return document.getElementById("station-quick-picks");
  }

  function resolveDestinationCityForStationName(stationRaw) {
    const root = getStationQuickPicksRootEl();
    if (!(root instanceof HTMLElement)) {
      return "";
    }
    const want = String(stationRaw || "").trim();
    if (!want) {
      return "";
    }
    const inputs = [
      ...root.querySelectorAll('input[name="destinationQuickStations"]'),
    ];
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      if (!(inp instanceof HTMLInputElement)) {
        continue;
      }
      if (
        String(inp.value || "")
          .trim()
          .localeCompare(want, "ru", { sensitivity: "accent" }) === 0
      ) {
        const d = String(inp.dataset.destination || "").trim();
        return DESTINATIONS.includes(d) ? d : "";
      }
    }
    return "";
  }

  function inferDestinationFromFormStations() {
    const tokens = [];
    const pushSplit = (txt) => {
      String(txt || "")
        .split(/[,/]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((t) => tokens.push(t));
    };
    const seaRoot = document.getElementById("sea-usd-wrap");
    if (seaRoot instanceof HTMLElement) {
      seaRoot.querySelectorAll(".sea-route-station").forEach((el) => {
        if (el instanceof HTMLInputElement) {
          pushSplit(el.value);
        }
      });
    }
    const hid = document.getElementById("destination-stations-primary");
    if (hid instanceof HTMLInputElement) {
      pushSplit(hid.value);
    }
    const cities = new Set();
    tokens.forEach((tok) => {
      const c = resolveDestinationCityForStationName(tok);
      if (c) {
        cities.add(c);
      }
    });
    if (!tokens.length) {
      return { ok: false, code: "unknown" };
    }
    if (!cities.size) {
      return { ok: false, code: "unknown" };
    }
    if (cities.size > 1) {
      return { ok: false, code: "conflict" };
    }
    return { ok: true, value: [...cities][0] };
  }

  function applyHiddenDestinationFromStationsForSubmit() {
    const field = document.getElementById("destination");
    if (!(field instanceof HTMLInputElement)) {
      return { ok: false, message: "Внутренняя ошибка формы направления." };
    }
    const inf = inferDestinationFromFormStations();
    if (inf.ok && inf.value) {
      field.value = inf.value;
      return { ok: true };
    }
    const tabDest =
      typeof activeDestination === "string" &&
      DESTINATIONS.includes(activeDestination)
        ? activeDestination
        : "MOSCOW";
    field.value = tabDest;
    return { ok: true };
  }

  const months = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];

  function toIsoDateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
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

  function normalizeShippingLineToken(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("ru-RU");
  }

  function legacyTariffValidityRange(rate) {
    const vy = Number(rate?.validYear);
    const vm = Number(rate?.validMonth);
    if (!Number.isFinite(vy) || !Number.isFinite(vm) || vm < 1 || vm > 12) {
      return null;
    }
    const slot = String(rate?.validitySlot || "").trim().toUpperCase();
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

  const form = document.getElementById("rates-form");
  const destinationField = document.getElementById("destination");
  const statusEl = document.getElementById("rates-status");
  const tbody = document.getElementById("rates-tbody");
  const tabsWrap = document.getElementById("rates-tabs");
  const printBtn = document.getElementById("print-tab-btn");
  const shareActiveFilterBtn = document.getElementById("share-active-filter-btn");
  const printRouteTop = document.getElementById("print-route-top");
  const printRouteBottom = document.getElementById("print-route-bottom");
  const terminalSuggestions = document.getElementById("terminal-suggestions");
  const shippingLineSuggestions = document.getElementById(
    "shipping-line-suggestions"
  );
  const bookingAgentSuggestions = document.getElementById(
    "booking-agent-suggestions"
  );
  const stationSuggestions = document.getElementById("station-suggestions");
  const originPortsWrap = document.getElementById("origin-ports-wrap");
  const addOriginPortBtn = document.getElementById("add-origin-port-btn");
  const destinationStationsWrap = document.getElementById("destination-stations-wrap");
  const warehouseAddressesWrap = document.getElementById("warehouse-addresses-wrap");
  const autoDeliveryRowsWrap = document.getElementById("auto-delivery-rows-wrap");
  const originQuickPicks = document.getElementById("origin-quick-picks");
  const stationQuickPicks = document.getElementById("station-quick-picks");
  const portsSelectAllBtn = document.getElementById("ports-select-all");
  const portsClearAllBtn = document.getElementById("ports-clear-all");
  const stationsSelectAllBtn = document.getElementById("stations-select-all");
  const stationsClearAllBtn = document.getElementById("stations-clear-all");
  const addPortOptionBtn = document.getElementById("add-port-option");
  const addStationOptionBtn = document.getElementById("add-station-option");
  const shippingLineInput = document.getElementById("shippingLine");
  /** То же поле, что «Название линии» в быстром добавлении (один input для ввода и списка). */
  const newShippingLineOptionInput = shippingLineInput;
  const shippingLineQuickPicks = document.getElementById("shipping-line-quick-picks");
  const tariffValidityRowsRoot = document.getElementById("tariff-validity-rows-root");
  const tariffValidityEmptyHint = document.getElementById("tariff-validity-empty-hint");
  const bookingAgentInput = document.getElementById("bookingAgent");
  const bookingAgentLineWrap = document.getElementById("booking-agent-line-wrap");
  const bookingAgentShippingLineInput = document.getElementById(
    "bookingAgentShippingLine"
  );
  const bookingAgentRouteLineSuggestions = document.getElementById(
    "booking-agent-route-line-suggestions"
  );
  const linesSelectAllBtn = document.getElementById("lines-select-all");
  const linesClearAllBtn = document.getElementById("lines-clear-all");
  const addShippingLineOptionBtn = document.getElementById("add-shipping-line-option");
  const addBookingAgentOptionBtn = document.getElementById("add-booking-agent-option");
  const bookingAgentQuickPicks = document.getElementById(
    "booking-agent-quick-picks"
  );
  const bookingAgentSlotsWrap = document.getElementById("booking-agent-value-rows");
  const bookingAgentSubmitInput = document.getElementById(
    "booking-agent-submit-value"
  );
  const addBookingAgentSlotBtn = document.getElementById(
    "add-booking-agent-slot-btn"
  );
  const agentsSelectAllBtn = document.getElementById("agents-select-all");
  const agentsClearAllBtn = document.getElementById("agents-clear-all");
  const railTerminalInput = document.getElementById("railTerminal");
  const railTerminalQuickPicks = document.getElementById("rail-terminal-quick-picks");
  const terminalsSelectAllBtn = document.getElementById("terminals-select-all");
  const terminalsClearAllBtn = document.getElementById("terminals-clear-all");
  const newPortOptionInput = document.getElementById("new-port-option");
  const newStationOptionInput = document.getElementById("new-station-option");
  const chinaPortSuggestions = document.getElementById("china-port-suggestions");
  const sailingDatesWrap = document.getElementById("sailing-dates-wrap");
  const addSailingDateBtn = document.getElementById("add-sailing-date-btn");
  const extraSailingToggle = document.getElementById("extra-sailing-toggle");
  const extraSailingPanel = document.getElementById("extra-sailing-panel");
  const periodEl = document.getElementById("current-period");
  const yearTabsWrap = document.getElementById("rates-year-tabs");
  const monthTabsWrap = document.getElementById("rates-month-tabs");
  const publicationTabs = document.getElementById("rates-publication-tabs");
  const originPortFiltersWrap = document.getElementById(
    "rates-origin-port-filters"
  );
  const containerTypeFiltersWrap = document.getElementById(
    "rates-container-type-filters"
  );
  const lineFiltersWrap = document.getElementById("rates-line-filters");
  const agentFiltersWrap = document.getElementById("rates-agent-filters");
  const originPortsFilterAllBtn = document.getElementById(
    "origin-ports-filter-all"
  );
  const originPortsFilterClearBtn = document.getElementById(
    "origin-ports-filter-clear"
  );
  const containerTypeFilterAllBtn = document.getElementById(
    "container-type-filter-all"
  );
  const containerTypeFilterClearBtn = document.getElementById(
    "container-type-filter-clear"
  );
  const linesFilterAllBtn = document.getElementById("lines-filter-all");
  const linesFilterClearBtn = document.getElementById("lines-filter-clear");
  const agentsFilterAllBtn = document.getElementById("agents-filter-all");
  const agentsFilterClearBtn = document.getElementById("agents-filter-clear");
  let activeDestination = "MOSCOW";
  const FIXED_YEAR = 2026;
  let activeYear = FIXED_YEAR;
  let activeMonth = new Date().getMonth() + 1;
  const CBR_JSON_URL = "https://www.cbr-xml-daily.ru/daily_json.js";
  const DEFAULT_RAIL_TERMINALS = [
    "ВМТП",
    "ВМКТ",
    "СОЛЛЕРС",
    "ВМПП",
    "ВСК(Врангель)",
    "Находка",
  ];
  const DEFAULT_SHIPPING_LINES = [
    "ТК",
    "FESCO",
    "ТРАНЗИТ",
    "SINOKOR",
    "TORGMOLL",
    "SCO",
    "NNS",
    "XHL",
    "NECO",
    "XUAXIN",
    "DONGYOUNG",
    "PANDA",
    "FAST SHIPPING",
    "STF",
    "ТЛК-ВОСТОК",
    "РТГ",
    "MHL",
    "XLY",
    "APF",
    "SAFETRANS",
    "CK-LINE",
    "SDS-SHIPPING",
  ];
  let publicationSortMode = "default";
  let cbrRubPerUsd = null;
  let cbrRateLabel = "";
  let cbSortExcludeLastMile = false;
  let salesWorksetIds = [];

  const cbrSortBtn = document.getElementById("rates-cbr-sort-btn");
  const cbrExcludeLastMileBtn = document.getElementById(
    "rates-cbr-exclude-lastmile-btn"
  );
  const cbrSortBanner = document.getElementById("rates-cbr-sort-banner");
  const salesProfitSeaPctInput = document.getElementById("sales-profit-sea-pct");
  const salesProfitRailPctInput = document.getElementById("sales-profit-rail-pct");
  const salesProfitSeaFixedInput = document.getElementById("sales-profit-sea-fixed");
  const salesProfitRailFixedInput = document.getElementById("sales-profit-rail-fixed");
  const salesProfitApplyBtn = document.getElementById("sales-profit-apply-btn");
  const salesProfitApplyBtnFixed = document.getElementById("sales-profit-apply-btn-fixed");
  const salesProfitRevertBtn = document.getElementById("sales-profit-revert-btn");
  const salesProfitRevertBtnFixed = document.getElementById("sales-profit-revert-btn-fixed");
  const salesProfitPercentWrap = document.getElementById("sales-profit-percent-wrap");
  const salesProfitFixedWrap = document.getElementById("sales-profit-fixed-wrap");
  const salesWorksetBuildBtn = document.getElementById("sales-workset-build-btn");
  const salesWorksetClearBtn = document.getElementById("sales-workset-clear-btn");
  const salesWorksetTbody = document.getElementById("sales-workset-tbody");
  const salesPrintBtn = document.getElementById("sales-print-btn");
  const salesPrintMeta = document.getElementById("sales-print-meta");
  const salesKpClientCompanyInput = document.getElementById("sales-kp-client-company");
  const salesKpRecipientFioInput = document.getElementById("sales-kp-recipient-fio");
  const salesKpManagerSelect = document.getElementById("sales-kp-manager-select");
  const salesKpCurrencyTermsInput = document.getElementById("sales-kp-currency-terms");
  const salesKpPaymentTermsInput = document.getElementById("sales-kp-payment-terms");
  const salesKpInsuranceTermsInput = document.getElementById("sales-kp-insurance-terms");
  const salesKpDocNum = document.getElementById("sales-kp-doc-num");
  const salesKpDocDate = document.getElementById("sales-kp-doc-date");
  const salesKpRouteSubtitle = document.getElementById("sales-kp-route-subtitle");
  const salesKpFromManager = document.getElementById("sales-kp-from-manager");
  const salesKpClientName = document.getElementById("sales-kp-client-name");
  const salesKpToRecipient = document.getElementById("sales-kp-to-recipient");
  const salesKpTable = document.getElementById("sales-kp-table");
  const salesKpTbody = document.getElementById("sales-kp-tbody");
  const salesKpCurrency = document.getElementById("sales-kp-currency");
  const salesKpPayment = document.getElementById("sales-kp-payment");
  const salesKpInsurance = document.getElementById("sales-kp-insurance");
  const salesKpManagerCardName = document.getElementById("sales-kp-manager-card-name");
  const salesKpManagerCardDetail = document.getElementById("sales-kp-manager-card-detail");
  const salesKpDestinationNode = document.getElementById("sales-kp-destination-node");
  const salesShareLinkBtn = document.getElementById("sales-share-link-btn");
  const salesManagerEmailInput = document.getElementById("sales-kp-manager-email");
  const salesShareStatus = document.getElementById("sales-share-status");
  const SHARE_PARAM_KEY = "kp_share";
  const FILTER_SHARE_PARAM_KEY = "rates_view";
  window.__applyProfitPercent = () => {
    void applySalesProfitToVisibleRates("percent");
  };
  window.__applyProfitFixed = () => {
    void applySalesProfitToVisibleRates("fixed");
  };
  /**
   * URL приёма уведомления об открытии КП (POST JSON).
   * В репозитории есть готовый сервер: папка kp-opened-server → npm install && npm start
   * По умолчанию на localhost включается автоматически; на другом хосте замените URL.
   */
  const TRACKING_ENDPOINT = (() => {
    if (typeof window === "undefined") {
      return "";
    }
    const h = String(window.location.hostname || "");
    const proto = String(window.location.protocol || "");
    if (h === "localhost" || h === "127.0.0.1") {
      return "http://127.0.0.1:3847/kp-opened";
    }
    /* file:// без hostname — считаем локальную связку со слушателем на 127.0.0.1 */
    if ((!h || h === "") && proto === "file:") {
      return "http://127.0.0.1:3847/kp-opened";
    }
    return "";
  })();
  /** Тот же секрет, что TRACKING_SECRET у сервера (опционально). */
  const TRACKING_WEBHOOK_SECRET = "";
  const seaUsdWrap = document.getElementById("sea-usd-wrap");
  /** Ключи «порт\u0000линия» для связок, которые пользователь убрал кнопкой удаления блока. */
  const seaRouteBlockExclusions = new Set();
  /** Дополнительные блоки-копии: id, anchorComboKey — ключ базовой строки маршрута, после которой показываем копию. */
  const seaRouteExtraCopies = [];
  /** Первое заполнение новой копии до появления в DOM: id → снимок полей. */
  const pendingSeaRouteCopyState = new Map();
  const railRubRowsWrap = document.getElementById("rail-rub-rows-wrap");
  const cargoDepartureTerminalSelect = document.getElementById("cargoDepartureTerminal");
  const cargoDestinationStationSelect = document.getElementById("cargoDestinationStation");
  const addRailRubRowBtn = document.getElementById("add-rail-rub-row-btn");
  const addWarehouseAddressBtn = document.getElementById("add-warehouse-address-btn");
  const salesManagerCards = {
    vlad: {
      fullName: "Влад Давидович",
      detailHtml:
        "Ведущий проект менеджер<br>" +
        "ООО «ФАКТОРИАЛЛ РУСЬ»<br>" +
        "Тел: +7 (499) 348-96-58 доб.128<br>" +
        "Моб: +375 44 722 29 26<br>" +
        "e-mail: dv@f-logist.org",
    },
  };
  let salesKpLastDocNumber = "";
  let salesKpLastDocDate = "";

  /** Единый формат ключа ставки для Set/Undo (после JSON парсятся только строковые ключи). */
  function normalizeRateId(rateId) {
    if (rateId == null) {
      return "";
    }
    return String(rateId).trim();
  }

  function dedupePreserveOrder(rateIdsRaw) {
    const seen = new Set();
    const list = [];
    for (let i = 0; i < rateIdsRaw.length; i++) {
      const id = normalizeRateId(rateIdsRaw[i]);
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      list.push(id);
    }
    return list;
  }

  function normalizeDeliveryTerms(raw) {
    const s = String(raw ?? "").trim().toUpperCase();
    return s === "EXW" || s === "FCA" || s === "FOB" ? s : "FOB";
  }

  function syncDeliveryTermsPickupRow() {
    const sel = document.getElementById("deliveryTerms");
    const row = document.getElementById("delivery-exw-fca-row");
    const inp = document.getElementById("deliveryExwFcaUsd");
    const lab = document.getElementById("delivery-exw-fca-label");
    if (
      !(sel instanceof HTMLSelectElement) ||
      !(row instanceof HTMLElement) ||
      !(inp instanceof HTMLInputElement) ||
      !(lab instanceof HTMLElement)
    ) {
      return;
    }
    const v = normalizeDeliveryTerms(sel.value);
    if (v === "FOB") {
      row.hidden = true;
      inp.required = false;
      inp.disabled = true;
      inp.removeAttribute("aria-required");
      inp.value = "";
      return;
    }
    row.hidden = false;
    inp.disabled = false;
    inp.required = true;
    inp.setAttribute("aria-required", "true");
    lab.textContent =
      v === "EXW" ? "Стоимость EXW, USD *" : "Стоимость FCA, USD *";
    inp.placeholder =
      v === "EXW" ? "Например, 850 (EXW)" : "Например, 650 (FCA)";
  }

  if (
    !form ||
    !(destinationField instanceof HTMLInputElement) ||
    !statusEl ||
    !tbody ||
    !tabsWrap ||
    !yearTabsWrap ||
    !monthTabsWrap ||
    !printBtn ||
    !terminalSuggestions ||
    !shippingLineSuggestions ||
    !bookingAgentSuggestions ||
    !stationSuggestions ||
    !originPortsWrap ||
    !destinationStationsWrap ||
    !warehouseAddressesWrap ||
    !autoDeliveryRowsWrap ||
    !seaUsdWrap ||
    !originQuickPicks ||
    !stationQuickPicks ||
    !portsSelectAllBtn ||
    !portsClearAllBtn ||
    !stationsSelectAllBtn ||
    !stationsClearAllBtn ||
    !addPortOptionBtn ||
    !shippingLineInput ||
    !shippingLineQuickPicks ||
    !bookingAgentInput ||
    !bookingAgentLineWrap ||
    !bookingAgentShippingLineInput ||
    !bookingAgentSlotsWrap ||
    !bookingAgentSubmitInput ||
    !addBookingAgentSlotBtn ||
    !linesSelectAllBtn ||
    !linesClearAllBtn ||
    !addShippingLineOptionBtn ||
    !addBookingAgentOptionBtn ||
    !bookingAgentQuickPicks ||
    !agentsSelectAllBtn ||
    !agentsClearAllBtn ||
    !railTerminalInput ||
    !railTerminalQuickPicks ||
    !terminalsSelectAllBtn ||
    !terminalsClearAllBtn ||
    !newPortOptionInput ||
    !chinaPortSuggestions ||
    !sailingDatesWrap ||
    !addSailingDateBtn ||
    !periodEl ||
    !railRubRowsWrap
  ) {
    return;
  }

  function updateRailRubRemoveButtons() {
    const rows = railRubRowsWrap.querySelectorAll("[data-rail-rub-row]");
    rows.forEach((row) => {
      const btn = row.querySelector('[data-action="remove-rail-rub-row"]');
      if (btn instanceof HTMLButtonElement) {
        btn.hidden = rows.length <= 1;
      }
    });
  }

  function appendRailRubRow(tierPref, amountStr) {
    const row = document.createElement("div");
    row.className = "rail-rub-tier-row";
    row.setAttribute("data-rail-rub-row", "");
    const grid = document.createElement("div");
    grid.className = "rail-rub-tier-row-grid";
    const label = document.createElement("label");
    label.className = "rail-rub-tier-field";
    const select = document.createElement("select");
    select.className = "rail-rub-tier-select";
    select.name = "railRubTier";
    select.setAttribute(
      "aria-label",
      "Стоимость ЖД в RUB за выбранный тип контейнера / вес"
    );
    const tierOptions = [
      ["20LT24", "20′ft < 24 t"],
      ["20GT24", "20′ft > 24 t"],
      ["40HQ", "40′ HQ"],
    ];
    tierOptions.forEach(([val, text]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = text;
      select.appendChild(opt);
    });
    const pref = String(tierPref || "40HQ");
    if (tierOptions.some(([v]) => v === pref)) {
      select.value = pref;
    }
    label.appendChild(select);
    const input = document.createElement("input");
    input.type = "number";
    input.name = "railRubAmount";
    input.min = "0";
    input.step = "1";
    input.className = "rail-rub-amount-input";
    input.placeholder = "Сумма, RUB";
    input.setAttribute("aria-label", "Сумма ЖД, RUB");
    if (amountStr != null && String(amountStr).trim() !== "") {
      input.value = String(amountStr).trim();
    }
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn-remove-date";
    rm.dataset.action = "remove-rail-rub-row";
    rm.setAttribute("aria-label", "Удалить строку");
    rm.textContent = "−";
    grid.appendChild(label);
    grid.appendChild(input);
    grid.appendChild(rm);
    row.appendChild(grid);
    railRubRowsWrap.appendChild(row);
    updateRailRubRemoveButtons();
  }

  function resetRailRubRows() {
    railRubRowsWrap.innerHTML = "";
    appendRailRubRow("40HQ", "");
  }

  function readSeaRailNum(inputEl) {
    if (!(inputEl instanceof HTMLInputElement)) {
      return null;
    }
    const raw = String(inputEl.value || "").trim();
    if (raw === "") {
      return null;
    }
    const n = rateNumericOrNaN(raw);
    if (!Number.isFinite(n) || n < 0) {
      return null;
    }
    return n;
  }

  function normalizeContainerSlotValue(raw) {
    const s = String(raw || "").trim();
    if (s === "20LT24" || s === "20GT24" || s === "40HQ") {
      return s;
    }
    return "40HQ";
  }

  function getPrimarySeaContainerSlot(seaBlk) {
    if (!(seaBlk instanceof HTMLElement)) {
      return "40HQ";
    }
    const primarySeg = seaBlk.querySelector(
      '.sea-route-maritime-segment[data-maritime-primary="true"]'
    );
    const root = primarySeg instanceof HTMLElement ? primarySeg : seaBlk;
    const slotSel = root.querySelector(".sea-route-container-slot");
    return normalizeContainerSlotValue(
      slotSel instanceof HTMLSelectElement ? slotSel.value : ""
    );
  }

  function aggregateRailRubTiersFromDom() {
    const bundles = [
      ...railRubRowsWrap.querySelectorAll("[data-sea-rail-route]"),
    ];
    /** @type {number|null} */
    let lt24 = null;
    /** @type {number|null} */
    let gt24 = null;
    /** @type {number|null} */
    let hq = null;
    /** @type {{slot:string,railRub40Hq: number|null,railRub20Lt24: number|null,railRub20Gt24: number|null}[]} */
    const perRoute = [];
    bundles.forEach((blk, bundleIndex) => {
      if (!(blk instanceof HTMLElement)) {
        return;
      }
      const slot = normalizeContainerSlotValue(
        blk.dataset.containerSlot || ""
      );
      if (slot === "40HQ") {
        const hqVal = readSeaRailNum(blk.querySelector('input[data-rail-slot="hq"]'));
        perRoute.push({
          slot,
          railRub40Hq: hqVal,
          railRub20Lt24: null,
          railRub20Gt24: null,
        });
        if (bundleIndex === 0) {
          hq = hqVal;
        }
      } else if (slot === "20LT24") {
        const lt = readSeaRailNum(blk.querySelector('input[data-rail-slot="lt"]'));
        perRoute.push({
          slot,
          railRub40Hq: null,
          railRub20Lt24: lt,
          railRub20Gt24: null,
        });
        if (bundleIndex === 0) {
          lt24 = lt;
        }
      } else {
        const gt = readSeaRailNum(blk.querySelector('input[data-rail-slot="gt"]'));
        perRoute.push({
          slot,
          railRub40Hq: null,
          railRub20Lt24: null,
          railRub20Gt24: gt,
        });
        if (bundleIndex === 0) {
          gt24 = gt;
        }
      }
    });
    return { lt24, gt24, hq, perRoute };
  }

  loadSavedOptions(AGENTS_KEY, "booking-agent-suggestions");
  loadSavedOptions(LINES_KEY, "shipping-line-suggestions");

  document.getElementById("year-rates").textContent = String(
    new Date().getFullYear()
  );

  wireTariffValidityInputs();

  const now = new Date();
  periodEl.textContent = buildTariffAddedHintText(now);
  syncPrintRoute();
  sortDatalistOptions(chinaPortSuggestions);
  sortDatalistOptions(stationSuggestions);
  sortCheckboxOptions(originQuickPicks, "originQuickPorts");
  sortCheckboxOptions(stationQuickPicks, "destinationQuickStations");
  sortCheckboxOptions(shippingLineQuickPicks, "shippingLineQuickOptions");
  filterStationQuickPicksByDestination("");
    refreshWarehouseAddressRowLabels();
    syncAutoRubRowsToWarehouseAddresses();
    syncSeaUsdRowsToRouteCombinations();
  const deliveryTermsSelect = document.getElementById("deliveryTerms");
  if (deliveryTermsSelect instanceof HTMLSelectElement) {
    deliveryTermsSelect.addEventListener("change", syncDeliveryTermsPickupRow);
  }
  syncDeliveryTermsPickupRow();
  syncOriginQuickPicksToInput();
  syncShippingLineInputToQuickPicks();
  initTariffValidityDefaults();
  syncRailTerminalInputToQuickPicks();
  syncBookingAgentInputToQuickPicks();
  mergeBookingAgentSlotsToHiddenField();
  syncBookingAgentLineVisibility();
  enableDatalistOpenOnFocus(shippingLineInput);
  enableDatalistOpenOnFocus(railTerminalInput);
  getBookingAgentSlotInputs().forEach((inp) => {
    enableDatalistOpenOnFocus(inp);
  });
  syncBookingAgentShippingLineDatalist();
  enableDatalistOpenOnFocus(bookingAgentShippingLineInput);

  const initialRates = await loadRates();
  await fetchBookingAgentsPb();
  refreshAutocompleteLists(initialRates);
  buildMonthFilterTabs();
  refreshYearTabs(initialRates);
  syncFilterTabsActiveStates();
  fullPublicationRefresh(initialRates);
  syncCbrExcludeLastMileButton();
  syncCbrSortBanner();
  syncSalesRevertButton();
  refreshSalesWorksetTable(initialRates);
  try {
    await hydrateSalesKpFromSharedLink();
  } catch (error) {
    // Никогда не блокируем основной функционал формы/фильтров из-за шеринга.
    console.error("hydrateSalesKpFromSharedLink failed:", error);
  }
  try {
    await hydratePublicationFiltersFromSharedLink();
  } catch (error) {
    console.error("hydratePublicationFiltersFromSharedLink failed:", error);
  }

  const ratesRegistryLiveOpen = document.getElementById(
    "rates-registry-live-open"
  );
  function openRegistryLiveFobWindow() {
    const url = new URL("registry-live-fob.html", window.location.href).href;
    window.open(url, "_blank", "noopener,noreferrer");
  }
  ratesRegistryLiveOpen?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openRegistryLiveFobWindow();
  });
  ratesRegistryLiveOpen?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openRegistryLiveFobWindow();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    syncQuickPickSelectionsToInputRows();
    syncShippingLineQuickPicksToInput();
    applyBookingAgentQuickPicksBeforeSubmit();
    mergeBookingAgentSlotsToHiddenField();
    syncRailTerminalQuickPicksToInput();

    const originPorts = getOriginPorts();
    if (!originPorts.length) {
      setStatus(
        "Добавьте хотя бы один порт отправления (вручную или через чекбоксы).",
        "error"
      );
      return;
    }

    const shippingLinesPreflight = getShippingLinesFromInput();
    if (!shippingLinesPreflight.length) {
      setStatus("Добавьте хотя бы одну морскую линию.", "error");
      return;
    }

    syncSeaUsdRowsToRouteCombinations();
    mirrorLegacyHiddenFromSeaRows();

    const destApplied = applyHiddenDestinationFromStationsForSubmit();
    if (!destApplied.ok) {
      setStatus(destApplied.message || "Проверьте станции назначения.", "error");
      return;
    }

    const formData = new FormData(form);
    const destinationStations = getDestinationStations();
    const warehouseAddresses = getWarehouseAddresses();

    // Если пользователь выбрал порты/станции через чекбоксы, считаем это заполнением
    // и фиксируем в formData для единообразной дальнейшей обработки.
    if (originPorts.length) {
      formData.set("originPorts", originPorts.join(", "));
    }
    if (destinationStations.length) {
      formData.set("destinationStations", destinationStations.join(", "));
    }

    const requiredMissingMessages = [
      ["railTerminal", "Заполните терминал прибытия на Дальнем Востоке."],
      ["shippingLine", "Заполните морскую линию."],
      ["bookingAgent", "Заполните букирующего агента (или НЕТ)."],
      ["customsClearance", "Выберите таможенную очистку."],
      ["transitDays", "Заполните транзитный срок (дней)."],
    ];
    for (let i = 0; i < requiredMissingMessages.length; i++) {
      const field = requiredMissingMessages[i][0];
      const message = requiredMissingMessages[i][1];
      if (!String(formData.get(field) || "").trim()) {
        setStatus(message, "error");
        return;
      }
    }

    const customsClearanceRaw = String(
      formData.get("customsClearance") || ""
    ).trim();
    if (
      customsClearanceRaw !== "destinationPort" &&
      customsClearanceRaw !== "destinationStation"
    ) {
      setStatus(
        "Выберите таможенную очистку: в порту назначения или на станции назначения.",
        "error"
      );
      return;
    }

    const shippingLines = getShippingLinesFromInput();
    if (!shippingLines.length) {
      setStatus("Добавьте хотя бы одну морскую линию.", "error");
      return;
    }

    const railTiersForSave = aggregateRailRubTiersFromDom();
    for (let ri = 0; ri < railTiersForSave.perRoute.length; ri++) {
      const pr = railTiersForSave.perRoute[ri];
      const rs = pr.slot || "40HQ";
      if (rs === "40HQ" && pr.railRub40Hq == null) {
        setStatus(
          "В строке ЖД №" + String(ri + 1) + " укажите сумму для выбранного типа 40′ HQ.",
          "error"
        );
        return;
      }
      if (rs === "20LT24" && pr.railRub20Lt24 == null) {
        setStatus(
          "В строке ЖД №" + String(ri + 1) + " укажите сумму для 20′ ft < 24 t.",
          "error"
        );
        return;
      }
      if (rs === "20GT24" && pr.railRub20Gt24 == null) {
        setStatus(
          "В строке ЖД №" + String(ri + 1) + " укажите сумму для 20′ ft > 24 t.",
          "error"
        );
        return;
      }
    }

    const seaRouteRows = getSeaRouteRows();
    const routeCombos = buildOriginLineCombinations(originPorts, shippingLines);
    const autoRubs = getAutoRubValues();
    if (!seaRouteRows.length) {
      setStatus("Заполните фрахт и дату выхода для морских строк.", "error");
      return;
    }
    if (railTiersForSave.perRoute.length !== seaRouteRows.length) {
      setStatus(
        "Число блоков ЖД (" +
          String(railTiersForSave.perRoute.length) +
          ") не совпадает с числом строк моря (" +
          String(seaRouteRows.length) +
          "). Обновите маршрут и заполните ЖД по каждой строке (в т.ч. по каждому типу контейнера).",
        "error"
      );
      return;
    }
    if (autoRubs.length !== seaRouteRows.length) {
      setStatus(
        "Укажите стоимость авто для каждой строки моря (в т.ч. под каждый тип контейнера в одной связке порта × линия).",
        "error"
      );
      return;
    }
    const seaRouteRowsWithKeys = seaRouteRows.map((row, rowIdx) => {
      const railPart = railTiersForSave.perRoute[rowIdx] || {
        slot: "40HQ",
        railRub40Hq: null,
        railRub20Lt24: null,
        railRub20Gt24: null,
      };
      return {
        origin: row.origin,
        shippingLine: row.shippingLine,
        seaUsd: row.seaUsd,
        sailingDate: row.sailingDate,
        dvTerminal: row.dvTerminal,
        destinationStation: row.destinationStation,
        unloadAddress: row.unloadAddress,
        containerSlot: row.containerSlot,
        seaBundleBlockIndex: row.seaBundleBlockIndex,
        seaSegmentIndex: row.seaSegmentIndex,
        railRub20Lt24: railPart.railRub20Lt24,
        railRub20Gt24: railPart.railRub20Gt24,
        railRub40Hq: railPart.railRub40Hq,
        autoRub: autoRubs[rowIdx],
      };
    });
    const seaUsds = seaRouteRowsWithKeys.map((row) => row.seaUsd);
    for (let i = 0; i < seaRouteRowsWithKeys.length; i++) {
      const row = seaRouteRowsWithKeys[i];
      if (!Number.isFinite(row.seaUsd) || row.seaUsd < 0) {
        setStatus(
          "Проверьте фрахт для строки " + String(i + 1) + ".",
          "error"
        );
        return;
      }
      if (!row.sailingDate) {
        setStatus(
          "Заполните дату выхода для строки " + String(i + 1) + ".",
          "error"
        );
        return;
      }
      if (!String(row.dvTerminal || "").trim()) {
        setStatus(
          "Укажите терминал прибытия на ДВ для строки моря " + String(i + 1) + ".",
          "error"
        );
        return;
      }
      if (!String(row.destinationStation || "").trim()) {
        setStatus(
          "Укажите станцию назначения для строки моря " + String(i + 1) + ".",
          "error"
        );
        return;
      }
      if (!String(row.unloadAddress || "").trim()) {
        setStatus(
          "Укажите адрес выгрузки (склад) для строки моря " + String(i + 1) + ".",
          "error"
        );
        return;
      }
      const ar = autoRubs[i];
      if (!Number.isFinite(ar) || ar < 0) {
        setStatus(
          "Проверьте стоимость авто для строки моря №" + String(i + 1) + ".",
          "error"
        );
        return;
      }
    }
    if (!destinationStations.length) {
      setStatus(
        "Добавьте хотя бы одну станцию назначения в строках моря (или через быстрый выбор).",
        "error"
      );
      return;
    }
    if (!warehouseAddresses.length) {
      setStatus(
        "Добавьте хотя бы один адрес выгрузки в строках моря выше.",
        "error"
      );
      return;
    }

    const cargoSecurityRaw = String(
      formData.get("cargoSecurity") || ""
    ).trim();

    const tnvedTrim = String(formData.get("tnvedCode") || "").trim();
    if (cargoSecurityRaw === "yes" && !tnvedTrim) {
      setStatus(
        "При выборе «Наличие охраны — Да» нужно указать код ТН ВЭД.",
        "error"
      );
      return;
    }

    let securityCostRub = null;
    if (cargoSecurityRaw === "yes") {
      const scRaw = String(formData.get("securityCostRub") || "").trim();
      if (scRaw !== "") {
        const sn = Number(scRaw);
        if (Number.isNaN(sn) || sn < 0) {
          setStatus(
            "Проверьте стоимость охраны: укажите неотрицательное число в RUB или оставьте поле пустым.",
            "error"
          );
          return;
        }
        securityCostRub = sn;
      }
    }

    const cargoWeightRaw = String(formData.get("cargoWeightKg") || "").trim();
    const cargoWeightKgValue =
      cargoWeightRaw === "" ? null : Number(cargoWeightRaw);
    if (cargoWeightRaw !== "" && Number.isNaN(cargoWeightKgValue)) {
      setStatus("Проверьте поле «Вес груза, кг».", "error");
      return;
    }
    let aggLtSave = null;
    let aggGtSave = null;
    railTiersForSave.perRoute.forEach((p) => {
      if (p.railRub20Lt24 != null) {
        aggLtSave = p.railRub20Lt24;
      }
      if (p.railRub20Gt24 != null) {
        aggGtSave = p.railRub20Gt24;
      }
    });
    const railRub20Lt24 = aggLtSave;
    const railRub20Gt24 = aggGtSave;
    const pr0 = railTiersForSave.perRoute[0];
    let finalRailRub = Number.NaN;
    if (pr0) {
      if (pr0.slot === "40HQ") {
        finalRailRub =
          pr0.railRub40Hq == null ? Number.NaN : pr0.railRub40Hq;
      } else if (
        aggLtSave != null &&
        aggGtSave != null &&
        Number.isFinite(aggLtSave) &&
        Number.isFinite(aggGtSave)
      ) {
        finalRailRub =
          cargoWeightKgValue != null && cargoWeightKgValue > 24000
            ? aggGtSave
            : aggLtSave;
      } else if (pr0.slot === "20LT24") {
        finalRailRub =
          pr0.railRub20Lt24 == null ? Number.NaN : pr0.railRub20Lt24;
      } else if (pr0.slot === "20GT24") {
        finalRailRub =
          pr0.railRub20Gt24 == null ? Number.NaN : pr0.railRub20Gt24;
      }
    }
    const slotSet = new Set(
      seaRouteRowsWithKeys.map((r) => String(r.containerSlot || "").trim())
    );
    const has20 = [...slotSet].some(
      (s) => s === "20LT24" || s === "20GT24"
    );
    const has40 = slotSet.has("40HQ");
    const containerType =
      has40 && !has20 ? "40HQ" : has20 ? "20FT" : "40HQ";
    const containerTypesDer = [];
    if (has20) {
      containerTypesDer.push("20FT");
    }
    if (has40) {
      containerTypesDer.push("40HQ");
    }
    if (!containerTypesDer.length) {
      containerTypesDer.push("40HQ");
    }

    const bookingAgentRaw = String(formData.get("bookingAgent") || "").trim();
    const bookingAgentLineRaw = String(
      formData.get("bookingAgentShippingLine") || ""
    ).trim();
    const bookingNeedsAgentLine =
      bookingAgentMergedRequiresShippingLine(bookingAgentRaw);
    if (bookingNeedsAgentLine && !bookingAgentLineRaw) {
      setStatus("Укажите, для какой морской линии используется букирующий агент.", "error");
      return;
    }

    const deliveryTermsSubmit = normalizeDeliveryTerms(
      String(formData.get("deliveryTerms") || "FOB")
    );
    let deliveryExwFcaUsdSubmit = null;
    if (deliveryTermsSubmit === "EXW" || deliveryTermsSubmit === "FCA") {
      const rawPickupUsd = rateNumericOrNaN(formData.get("deliveryExwFcaUsd"));
      if (!Number.isFinite(rawPickupUsd) || rawPickupUsd < 0) {
        setStatus(
          deliveryTermsSubmit === "EXW"
            ? "Укажите стоимость EXW в USD."
            : "Укажите стоимость FCA в USD.",
          "error"
        );
        return;
      }
      deliveryExwFcaUsdSubmit = rawPickupUsd;
    }

    const tariffLineWindows = collectTariffLineWindowsFromDom();
    if (!tariffLineWindows.length && shippingLines.length) {
      setStatus(
        "Не удалось сопоставить срок действия тарифа с выбранными морскими линиями — обновите выбор линий.",
        "error"
      );
      return;
    }
    if (tariffLineWindows.length !== shippingLines.length) {
      setStatus(
        "Число строк срока тарифа не совпадает с числом морских линий. Измените набор линий или обновите страницу.",
        "error"
      );
      return;
    }
    const lineTokenSeen = new Set(
      shippingLines.map((ln) => normalizeShippingLineToken(ln))
    );
    let minTariffFrom = null;
    let maxTariffTo = null;
    let tariffFromRaw = "";
    let tariffToRaw = "";
    for (let ti = 0; ti < tariffLineWindows.length; ti++) {
      const w = tariffLineWindows[ti];
      const lineLabel = w.shippingLine || "линия";
      const tok = normalizeShippingLineToken(lineLabel);
      if (!lineTokenSeen.has(tok)) {
        setStatus(
          "Срок тарифа: строка «" + lineLabel + "» не совпадает с выбранными морскими линиями.",
          "error"
        );
        return;
      }
      if (!w.tariffValidFrom || !w.tariffValidTo) {
        setStatus(
          "Укажите даты «с» и «по» для морской линии «" + lineLabel + "».",
          "error"
        );
        return;
      }
      const tariffFromDate = parseTariffIsoDateLocal(w.tariffValidFrom);
      const tariffToDate = parseTariffIsoDateLocal(w.tariffValidTo);
      if (!tariffFromDate || !tariffToDate) {
        setStatus(
          "Проверьте формат дат срока тарифа для линии «" + lineLabel + "».",
          "error"
        );
        return;
      }
      if (tariffFromDate.getTime() > tariffToDate.getTime()) {
        setStatus(
          "Для линии «" +
            lineLabel +
            "» дата «с» не может быть позже даты «по».",
          "error"
        );
        return;
      }
      if (!minTariffFrom || tariffFromDate < minTariffFrom) {
        minTariffFrom = tariffFromDate;
      }
      if (!maxTariffTo || tariffToDate > maxTariffTo) {
        maxTariffTo = tariffToDate;
      }
    }
    if (minTariffFrom && maxTariffTo) {
      tariffFromRaw = toIsoDateLocal(minTariffFrom);
      tariffToRaw = toIsoDateLocal(maxTariffTo);
    }

    const rate = {
      id: buildRateId(formData),
      origin: originPorts[0] || "",
      originPorts,
      destination: String(formData.get("destination")),
      railTerminal: String(formData.get("railTerminal") || "").trim(),
      cargoDepartureTerminal: String(
        formData.get("cargoDepartureTerminal") || ""
      ).trim(),
      cargoDestinationStation: String(
        formData.get("cargoDestinationStation") || ""
      ).trim(),
      destinationStation: destinationStations[0] || "",
      destinationStations,
      containerTypes: containerTypesDer,
      containerType,
      cargoSecurity: cargoSecurityRaw,
      tnvedCode: tnvedTrim,
      cargoWeightKg: cargoWeightKgValue,
      shippingLine: String(formData.get("shippingLine") || "").trim(),
      shippingLines,
      bookingAgent: bookingAgentRaw,
      bookingAgentShippingLine: bookingNeedsAgentLine ? bookingAgentLineRaw : "",
      customsClearance: customsClearanceRaw,
      tariffValidFrom: tariffFromRaw,
      tariffValidTo: tariffToRaw,
      tariffLineWindows,
      deliveryTerms: deliveryTermsSubmit,
      deliveryExwFcaUsd: deliveryExwFcaUsdSubmit,
      seaUsd: seaUsds[0],
      seaUsds,
      seaRouteRows: seaRouteRowsWithKeys,
      railRub: finalRailRub,
      railRub20Lt24,
      railRub20Gt24,
      autoRub: autoRubs[0],
      autoRubs,
      securityCostRub,
      warehouseAddress: warehouseAddresses[0] || "",
      warehouseAddresses,
      transitDays: Number(formData.get("transitDays")),
      nextSailingDates: [
        ...new Set(
          [
            ...seaRouteRowsWithKeys.map((row) => row.sailingDate),
            ...getSailingDates(),
          ]
            .map((item) =>
              typeof item === "string" ? item.trim() : String(item || "").trim()
            )
            .filter(Boolean)
        ),
      ],
      manager: String(formData.get("manager") || "").trim(),
      updatedAt: new Date().toISOString(),
    };

    if (Number.isNaN(rate.railRub) || Number.isNaN(rate.transitDays)) {
      setStatus("Проверьте числовые поля ставки.", "error");
      return;
    }
    if (Number.isNaN(rate.seaUsd)) {
      setStatus("Проверьте морской фрахт для порта отправления 1.", "error");
      return;
    }
    if (Number.isNaN(rate.autoRub)) {
      setStatus("Проверьте стоимость авто до склада выгрузки 1.", "error");
      return;
    }

    const rates = await loadRates();
    const stableKey = rate.id;
    let existingIndex = rates.findIndex((item) => item.id === stableKey);
    if (existingIndex < 0) {
      existingIndex = rates.findIndex(
        (item) => stableRateKeyFromRecord(item) === stableKey
      );
    }

    if (existingIndex >= 0) {
      const prevId = normalizeRateId(rates[existingIndex].id);
      rates[existingIndex] = rate;
      if (prevId && prevId !== stableKey) {
        salesWorksetIds = salesWorksetIds.map((id) =>
          normalizeRateId(id) === prevId ? stableKey : id
        );
      }
      setStatus("Ставка обновлена.", "success");
    } else {
      rates.push(rate);
      setStatus("Ставка опубликована.", "success");
    }

    await saveRates(rates);
    if (bookingAgentMergedRequiresShippingLine(bookingAgentRaw)) {
      await persistBookingAgentsFromMergedField(bookingAgentRaw);
    }
    refreshAutocompleteLists(rates);
    refreshYearTabs(rates);
    syncFilterTabsActiveStates();
    fullPublicationRefresh(rates);
    form.reset();
    resetOriginPortRows();
    resetDestinationStationRows();
    resetWarehouseAddressRows();
    resetSailingDateRows();
    refreshWarehouseAddressRowLabels();
    syncAutoRubRowsToWarehouseAddresses();
    syncSeaUsdRowsToRouteCombinations();
    syncDeliveryTermsPickupRow();
    syncSecurityCostVisibility();
    syncShippingLineQuickPicksToInput();
    initTariffValidityDefaults();
    syncRailTerminalQuickPicksToInput();
    resetBookingAgentSlotsToSingleEmpty();
    syncBookingAgentInputToQuickPicks();
    syncBookingAgentLineVisibility();
  });

  addOriginPortBtn?.addEventListener("click", () => {
    appendOriginPortRow("");
  });

  portsSelectAllBtn.addEventListener("click", () => {
    [
      ...originQuickPicks.querySelectorAll('input[name="originQuickPorts"]'),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = true;
      }
    });
    syncOriginQuickPicksToInput();
    syncSeaUsdRowsToRouteCombinations();
  });

  portsClearAllBtn.addEventListener("click", () => {
    [
      ...originQuickPicks.querySelectorAll('input[name="originQuickPorts"]'),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    syncOriginQuickPicksToInput();
    syncSeaUsdRowsToRouteCombinations();
  });

  stationsSelectAllBtn.addEventListener("click", () => {
    [
      ...stationQuickPicks.querySelectorAll(
        'input[name="destinationQuickStations"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        const label = input.closest("label");
        const isVisible = label ? label.style.display !== "none" : true;
        input.checked = isVisible;
      }
    });
    syncStationQuickPicksToInput();
  });

  stationsClearAllBtn.addEventListener("click", () => {
    [
      ...stationQuickPicks.querySelectorAll(
        'input[name="destinationQuickStations"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    syncStationQuickPicksToInput();
  });

  addPortOptionBtn.addEventListener("click", () => {
    const value = String(newPortOptionInput.value || "").trim().toUpperCase();
    if (!value) {
      return;
    }
    addOptionToDatalist(chinaPortSuggestions, value);
    addCheckboxOption(originQuickPicks, "originQuickPorts", value);
    newPortOptionInput.value = "";
    syncOriginQuickPicksToInput();
    syncSeaUsdRowsToRouteCombinations();
  });

  addStationOptionBtn?.addEventListener("click", () => {
    if (!(newStationOptionInput instanceof HTMLInputElement)) {
      return;
    }
    const value = String(newStationOptionInput.value || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!value) {
      return;
    }
    addOptionToDatalist(stationSuggestions, value);
    addCheckboxOption(stationQuickPicks, "destinationQuickStations", value, "");
    filterStationQuickPicksByDestination("");
    newStationOptionInput.value = "";
    syncStationQuickPicksToInput();
  });

  addShippingLineOptionBtn.addEventListener("click", () => {
    const newValue = String(newShippingLineOptionInput.value || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!newValue) {
      return;
    }
    addCheckboxOption(shippingLineQuickPicks, "shippingLineQuickOptions", newValue);
    shippingLineInput.value = newValue;
    syncShippingLineInputToQuickPicks();
    syncBookingAgentShippingLineDatalist();
    saveNewOption(LINES_KEY, "shipping-line-suggestions", null, newValue);
    saveNewOption(
      ROUTE_LINES_KEY,
      "booking-agent-route-line-suggestions",
      null,
      newValue
    );
    newShippingLineOptionInput.value = "";
  });

  addBookingAgentOptionBtn.addEventListener("click", async () => {
    let newValue = "";
    const slots = getBookingAgentSlotInputs();
    for (let si = 0; si < slots.length; si++) {
      const v = String(slots[si].value || "").trim().replace(/\s+/g, " ");
      if (v) {
        newValue = v;
        break;
      }
    }
    if (!newValue) {
      setStatus(
        "Введите название букирующего агента в поле выше, затем добавьте его в список подсказок.",
        "error"
      );
      return;
    }

    saveNewOption(AGENTS_KEY, "booking-agent-suggestions", null, newValue);

    const ok = await createBookingAgentPbRecord(newValue);
    try {
      const latest = await loadRates();
      refreshAutocompleteLists(latest);
    } catch (_) {
      refreshAutocompleteLists([]);
    }
    distributeAgentNamesAcrossSlots([newValue]);
    syncBookingAgentLineVisibility();
    syncBookingAgentInputToQuickPicks();
    const hasPb = Boolean(pocketBaseAuthHeaders().Authorization);
    const isNyetHint =
      normalizeBookingAgentDedupeKey(newValue) === "нет";

    if (ok && !isNyetHint) {
      setStatus(
        "Агент «" + newValue + "» сохранён в общий список подсказок (PocketBase).",
        "success"
      );
    } else if (isNyetHint) {
      setStatus(
        "Подсказка «НЕТ» / «нет» уже есть в списке; выберите значение из подсказок или введите в поле сверху.",
        "success"
      );
    } else if (!hasPb) {
      setStatus(
        "Агент добавлен в подсказки в этом браузере. Общие подсказки из PocketBase (как другие сохранённые агенты) появятся после входа в том же браузере — откройте страницу логина и авторизуйтесь.",
        "success"
      );
    } else {
      setStatus(
        "Подсказка «" +
          newValue +
          "» сохранена локально. Сервер вернул ошибку при записи справочника — проверьте права коллекции booking_agents или консоль.",
        "error"
      );
    }
  });

  linesSelectAllBtn.addEventListener("click", () => {
    [
      ...shippingLineQuickPicks.querySelectorAll(
        'input[name="shippingLineQuickOptions"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = true;
      }
    });
    syncShippingLineQuickPicksToInput();
  });

  linesClearAllBtn.addEventListener("click", () => {
    [
      ...shippingLineQuickPicks.querySelectorAll(
        'input[name="shippingLineQuickOptions"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    syncShippingLineQuickPicksToInput();
  });

  shippingLineInput.addEventListener("input", () => {
    syncShippingLineInputToQuickPicks();
  });
  bookingAgentSlotsWrap.addEventListener("input", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLInputElement)) {
      return;
    }
    if (!t.classList.contains("booking-agent-slot-input")) {
      return;
    }
    mergeBookingAgentSlotsToHiddenField();
    syncBookingAgentLineVisibility();
    syncBookingAgentInputToQuickPicks();
  });

  addBookingAgentSlotBtn.addEventListener("click", () => {
    appendBookingAgentSlotRow("");
    mergeBookingAgentSlotsToHiddenField();
    nudgeBookingAgentDatalistBindings();
  });

  stationQuickPicks.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name !== "destinationQuickStations") {
      return;
    }
    syncStationQuickPicksToInput();
  });

  /** Чекбоксы быстрого выбора: надёжно обновляем строки «Название порта» и «Название линии». */
  form.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name === "originQuickPorts") {
      syncOriginQuickPicksToInput();
      syncSeaUsdRowsToRouteCombinations();
      return;
    }
    if (target.name === "shippingLineQuickOptions") {
      syncShippingLineQuickPicksToInput();
    }
  });

  /**
   * У части браузеров чекбокс внутри <details> даёт input, а change на form ведёт себя нестабильно.
   * Дублируем синхронизацию по input (как у полей терминалов/станций в строках моря).
   */
  form.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.type !== "checkbox") {
      return;
    }
    if (target.name === "originQuickPorts") {
      syncOriginQuickPicksToInput();
      syncSeaUsdRowsToRouteCombinations();
      return;
    }
    if (target.name === "shippingLineQuickOptions") {
      syncShippingLineQuickPicksToInput();
    }
  });

  originQuickPicks.addEventListener("change", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLInputElement) || t.name !== "originQuickPorts") {
      return;
    }
    syncOriginQuickPicksToInput();
    syncSeaUsdRowsToRouteCombinations();
  });

  shippingLineQuickPicks.addEventListener("change", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLInputElement) || t.name !== "shippingLineQuickOptions") {
      return;
    }
    syncShippingLineQuickPicksToInput();
  });

  newPortOptionInput.addEventListener("input", () => {
    const v = newPortOptionInput instanceof HTMLInputElement ? newPortOptionInput.value : "";
    originPortsWrap.querySelectorAll('input[name="originPorts"]').forEach((node) => {
      if (node instanceof HTMLInputElement) {
        node.value = v;
      }
    });
    syncSeaUsdRowsToRouteCombinations();
  });

  newStationOptionInput?.addEventListener("input", () => {
    if (!(newStationOptionInput instanceof HTMLInputElement)) {
      return;
    }
    const primary = destinationStationsWrap.querySelector(
      'input[name="destinationStations"]'
    );
    if (primary instanceof HTMLInputElement) {
      primary.value = newStationOptionInput.value;
    }
    refreshCargoRouteSelectOptions();
  });

  terminalsSelectAllBtn.addEventListener("click", () => {
    [
      ...railTerminalQuickPicks.querySelectorAll(
        'input[name="railTerminalQuickOptions"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = true;
      }
    });
    syncRailTerminalQuickPicksToInput();
  });

  terminalsClearAllBtn.addEventListener("click", () => {
    [
      ...railTerminalQuickPicks.querySelectorAll(
        'input[name="railTerminalQuickOptions"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    syncRailTerminalQuickPicksToInput();
  });

  railTerminalQuickPicks.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name !== "railTerminalQuickOptions") {
      return;
    }
    syncRailTerminalQuickPicksToInput();
  });

  railTerminalInput.addEventListener("input", () => {
    syncRailTerminalInputToQuickPicks();
  });

  agentsSelectAllBtn.addEventListener("click", () => {
    [
      ...bookingAgentQuickPicks.querySelectorAll(
        'input[name="bookingAgentQuickOptions"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = true;
      }
    });
    syncBookingAgentQuickPicksToInput();
  });

  agentsClearAllBtn.addEventListener("click", () => {
    [
      ...bookingAgentQuickPicks.querySelectorAll(
        'input[name="bookingAgentQuickOptions"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    syncBookingAgentQuickPicksToInput();
  });

  bookingAgentQuickPicks.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name !== "bookingAgentQuickOptions") {
      return;
    }
    syncBookingAgentQuickPicksToInput();
  });

  seaUsdWrap.addEventListener("change", onSeaUsdWrapDelegatedChange);
  seaUsdWrap.addEventListener("click", handleSeaUsdMaritimeStackClick);
  seaUsdWrap.addEventListener("input", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLInputElement)) {
      return;
    }
    if (t.name === "seaSailingDate") {
      const bundle = t.closest(".sea-route-block");
      const seg = t.closest(".sea-route-maritime-segment");
      if (
        bundle instanceof HTMLElement &&
        bundle.dataset.seaRouteCopy !== "1" &&
        seg instanceof HTMLElement &&
        seg.getAttribute("data-maritime-primary") === "true"
      ) {
        syncSeaSecondarySailingDatesFromPrimary(bundle);
      }
    }
    if (
      t.classList.contains("sea-route-port-input") ||
      t.classList.contains("sea-route-line-input")
    ) {
      const bundle = t.closest(".sea-route-block");
      if (bundle instanceof HTMLElement) {
        syncSeaRouteBundleRouteFromInputs(bundle);
      }
      mirrorLegacyHiddenFromSeaRows();
      syncRailAutoSectionsFromSea();
    }
    if (
      t.classList.contains("sea-route-dv-terminal") ||
      t.classList.contains("sea-route-station") ||
      t.classList.contains("sea-route-unload")
    ) {
      mirrorLegacyHiddenFromSeaRows();
      syncRailAutoSectionsFromSea();
    }
  });
  const securityCostWrap = document.getElementById("security-cost-wrap");
  const securityCostRubInput = document.getElementById("securityCostRub");

  function syncSecurityCostVisibility() {
    if (!securityCostWrap || !securityCostRubInput) {
      return;
    }
    const sel = form.querySelector('input[name="cargoSecurity"]:checked');
    const isYes =
      sel instanceof HTMLInputElement && sel.value === "yes";
    securityCostWrap.hidden = !isYes;
    if (!isYes) {
      securityCostRubInput.value = "";
    }
  }

  form.querySelectorAll('input[name="cargoSecurity"]').forEach((el) => {
    el.addEventListener("change", syncSecurityCostVisibility);
  });
  syncSecurityCostVisibility();

  addRailRubRowBtn?.addEventListener("click", () => {
    appendRailRubRow("40HQ", "");
  });

  railRubRowsWrap.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.dataset.action !== "remove-rail-rub-row") {
      return;
    }
    if (railRubRowsWrap.querySelectorAll("[data-rail-rub-row]").length <= 1) {
      return;
    }
    target.closest("[data-rail-rub-row]")?.remove();
    updateRailRubRemoveButtons();
  });

  addWarehouseAddressBtn?.addEventListener("click", () => {
    appendWarehouseAddressRow("");
    refreshWarehouseAddressRowLabels();
    syncAutoRubRowsToWarehouseAddresses();
  });

  warehouseAddressesWrap.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.dataset.action !== "remove-warehouse-address") {
      return;
    }
    if (warehouseAddressesWrap.querySelectorAll(".warehouse-address-row").length <= 1) {
      const onlyInput = warehouseAddressesWrap.querySelector(
        'input[name="warehouseAddress"]'
      );
      if (onlyInput instanceof HTMLInputElement) {
        onlyInput.value = "";
      }
      return;
    }
    target.closest(".warehouse-address-row")?.remove();
    refreshWarehouseAddressRowLabels();
    syncAutoRubRowsToWarehouseAddresses();
  });

  addSailingDateBtn?.addEventListener("click", () => {
    appendSailingDateRow("", null);
  });

  extraSailingToggle?.addEventListener("click", () => {
    if (!(extraSailingPanel instanceof HTMLElement)) {
      return;
    }
    const show = extraSailingPanel.hidden;
    extraSailingPanel.hidden = !show;
    mergeExtraSailingRowsFromSeaBlocks();
    if (extraSailingToggle instanceof HTMLButtonElement) {
      extraSailingToggle.textContent = show ? "Скрыть" : "Показать";
      extraSailingToggle.setAttribute(
        "aria-expanded",
        show ? "true" : "false"
      );
    }
  });

  sailingDatesWrap.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.dataset.action === "copy-extra-sailing-row") {
      const row = target.closest(".sailing-date-row");
      const sel =
        row instanceof HTMLElement
          ? row.querySelector('select[name="nextSailingDateOrigin"]')
          : null;
      const li =
        row instanceof HTMLElement
          ? row.querySelector('input[name="nextSailingDateLine"]')
          : null;
      const origin =
        sel instanceof HTMLSelectElement
          ? String(sel.value || "").trim().toUpperCase()
          : "";
      const line =
        li instanceof HTMLInputElement
          ? String(li.value || "").trim().replace(/\s+/g, " ")
          : "";
      appendSailingDateRow("", { origin, line });
      return;
    }
    if (target.dataset.action !== "remove-date") {
      return;
    }
    if (sailingDatesWrap.querySelectorAll(".sailing-date-row").length <= 1) {
      const onlyInput = sailingDatesWrap.querySelector('input[name="nextSailingDates"]');
      if (onlyInput instanceof HTMLInputElement) {
        onlyInput.value = "";
      }
      return;
    }
    target.closest(".sailing-date-row")?.remove();
  });

  tbody.addEventListener("click", async (event) => {
    const el = event.target;
    const btn =
      el instanceof Element
        ? el.closest("button[data-action][data-id]")
        : null;
    if (!(btn instanceof HTMLButtonElement)) {
      return;
    }

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action || !String(id || "").trim()) {
      return;
    }

    if (action === "delete") {
      const idNorm = normalizeRateId(id);
      const allRates = await loadRates();
      const victim = allRates.find(
        (rate) => normalizeRateId(rate.id) === idNorm
      );
      if (!victim) {
        setStatus(
          "Ставка не найдена в списке — обновите страницу и попробуйте снова.",
          "error"
        );
        fullPublicationRefresh(await loadRates());
        return;
      }
      const auth = pocketBaseAuthHeaders();
      const pbId = victim._pbId;
      let usedSoftArchive = false;

      if (!auth.Authorization) {
        const next = allRates.filter(
          (rate) => normalizeRateId(rate.id) !== idNorm
        );
        await saveRates(next);
        refreshAutocompleteLists(next);
        refreshYearTabs(next);
        syncFilterTabsActiveStates();
        fullPublicationRefresh(next);
        setStatus("Ставка удалена из реестра (локальное хранение браузера).", "success");
        return;
      }

      if (pbId && auth.Authorization) {
        const delUrl = `${API_BASE}/api/collections/rates/records/${encodeURIComponent(
          String(pbId).trim()
        )}`;
        const delRes = await fetch(delUrl, {
          method: "DELETE",
          headers: { ...auth },
        });
        if (!delRes.ok) {
          if (delRes.status === 403) {
            const archRes = await pocketBaseSoftArchiveRate(pbId, victim);
            if (!archRes.ok) {
              const errSnippet =
                archRes.status === 403
                  ? " недостаточно прав ни на удаление, ни на обновление записи."
                  : " не удалось пометить ставку как архивную на сервере.";
              setStatus(
                "Операция отклонена PocketBase (" +
                  String(archRes.status || delRes.status) +
                  "):" +
                  errSnippet +
                  " Пусть администратор разрешит в коллекции rates правила для Delete или Update при авторизации.",
                "error"
              );
              return;
            }
            usedSoftArchive = true;
          } else {
            const errText = await delRes.text().catch(() => "");
            setStatus(
              "Не удалось удалить ставку на сервере (код " +
                String(delRes.status) +
                (errText ? "): " + errText.slice(0, 220) : ")."),
              "error"
            );
            return;
          }
        }
      } else if (auth.Authorization && !pbId) {
        const next = allRates.filter(
          (rate) => normalizeRateId(rate.id) !== idNorm
        );
        await saveRates(next);
      }

      const refreshed = await loadRates();
      refreshAutocompleteLists(refreshed);
      refreshYearTabs(refreshed);
      syncFilterTabsActiveStates();
      fullPublicationRefresh(refreshed);
      setStatus(
        usedSoftArchive
          ? "Ставка снята с публикации (полное удаление записи в базе может быть доступно только суперпользователю PocketBase)."
          : "Ставка удалена.",
        "success"
      );
    }
  });

  tabsWrap.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const destination = target.dataset.destination;
    if (!destination || !DESTINATIONS.includes(destination)) {
      return;
    }
    activeDestination = destination;
    syncFilterTabsActiveStates();
    syncPrintRoute();
    fullPublicationRefresh(await loadRates());
  });

  yearTabsWrap.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const yearValue = Number(target.dataset.year);
    if (Number.isNaN(yearValue)) {
      return;
    }
    activeYear = yearValue;
    syncFilterTabsActiveStates();
    syncSalesPrintMeta();
    fullPublicationRefresh(await loadRates());
  });

  monthTabsWrap.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const monthValue = Number(target.dataset.month);
    if (Number.isNaN(monthValue) || monthValue < 1 || monthValue > 12) {
      return;
    }
    activeMonth = monthValue;
    syncFilterTabsActiveStates();
    syncSalesPrintMeta();
    fullPublicationRefresh(await loadRates());
  });

  if (publicationTabs) {
    publicationTabs.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (
        target.name === "filterOriginPort" ||
        target.name === "filterContainerType" ||
        target.name === "filterShippingLine" ||
        target.name === "filterBookingAgent"
      ) {
        renderPublicationBody(await loadRates());
      }
    });
  }

  originPortsFilterAllBtn?.addEventListener("click", async () => {
    if (!originPortFiltersWrap) {
      return;
    }
    [
      ...originPortFiltersWrap.querySelectorAll(
        'input[name="filterOriginPort"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = true;
      }
    });
    renderPublicationBody(await loadRates());
  });

  originPortsFilterClearBtn?.addEventListener("click", async () => {
    if (!originPortFiltersWrap) {
      return;
    }
    [
      ...originPortFiltersWrap.querySelectorAll(
        'input[name="filterOriginPort"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    renderPublicationBody(await loadRates());
  });

  containerTypeFilterAllBtn?.addEventListener("click", async () => {
    if (!containerTypeFiltersWrap) {
      return;
    }
    [
      ...containerTypeFiltersWrap.querySelectorAll(
        'input[name="filterContainerType"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = true;
      }
    });
    renderPublicationBody(await loadRates());
  });

  containerTypeFilterClearBtn?.addEventListener("click", async () => {
    if (!containerTypeFiltersWrap) {
      return;
    }
    [
      ...containerTypeFiltersWrap.querySelectorAll(
        'input[name="filterContainerType"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    renderPublicationBody(await loadRates());
  });

  linesFilterAllBtn?.addEventListener("click", async () => {
    if (!lineFiltersWrap) {
      return;
    }
    [
      ...lineFiltersWrap.querySelectorAll('input[name="filterShippingLine"]'),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = true;
      }
    });
    renderPublicationBody(await loadRates());
  });

  linesFilterClearBtn?.addEventListener("click", async () => {
    if (!lineFiltersWrap) {
      return;
    }
    [
      ...lineFiltersWrap.querySelectorAll('input[name="filterShippingLine"]'),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    renderPublicationBody(await loadRates());
  });

  agentsFilterAllBtn?.addEventListener("click", async () => {
    if (!agentFiltersWrap) {
      return;
    }
    [
      ...agentFiltersWrap.querySelectorAll('input[name="filterBookingAgent"]'),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = true;
      }
    });
    renderPublicationBody(await loadRates());
  });

  agentsFilterClearBtn?.addEventListener("click", async () => {
    if (!agentFiltersWrap) {
      return;
    }
    [
      ...agentFiltersWrap.querySelectorAll('input[name="filterBookingAgent"]'),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    renderPublicationBody(await loadRates());
  });

  cbrExcludeLastMileBtn?.addEventListener("click", async () => {
    cbSortExcludeLastMile = !cbSortExcludeLastMile;
    syncCbrExcludeLastMileButton();
    syncCbrSortBanner();
    if (publicationSortMode === "cbr_total_asc") {
      renderPublicationBody(await loadRates());
    }
  });

  cbrSortBtn?.addEventListener("click", async () => {
    if (publicationSortMode === "cbr_total_asc") {
      publicationSortMode = "default";
      renderPublicationBody(await loadRates());
      syncCbrSortBanner();
      return;
    }

    try {
      cbrSortBtn.disabled = true;
      const needFetch = !(typeof cbrRubPerUsd === "number" && cbrRubPerUsd > 0);
      if (needFetch) {
        cbrSortBtn.textContent = "Загрузка курса…";
        const r = await fetchCbrUsdRubRateFromCbrDaily();
        cbrRubPerUsd = r.rubPerUsd;
        cbrRateLabel = formatCbrBannerDate(r.isoDate);
      }
      publicationSortMode = "cbr_total_asc";
      renderPublicationBody(await loadRates());
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "неизвестная ошибка";
      setStatus("Не удалось получить курс ЦБ для пересчёта: " + msg + ".", "error");
    } finally {
      if (cbrSortBtn instanceof HTMLButtonElement) {
        cbrSortBtn.disabled = false;
      }
      syncCbrExcludeLastMileButton();
      syncCbrSortBanner();
    }
  });

  printBtn.addEventListener("click", () => {
    window.print();
  });

  shareActiveFilterBtn?.addEventListener("click", async () => {
    const payload = getPublicationFilterSharePayload();
    const encoded = encodeSharePayload(payload);
    if (!encoded) {
      setStatus("Не удалось сформировать ссылку активного фильтра.", "error");
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set(FILTER_SHARE_PARAM_KEY, encoded);
    const shareUrl = url.toString();
    const copied = await copyTextToClipboardBestEffort(shareUrl);
    if (copied) {
      setStatus("Ссылка на активный фильтр скопирована в буфер обмена.", "success");
    } else {
      setStatus(
        "Фильтр в ссылке сформирован. Автокопирование недоступно — сейчас откроется окно со ссылкой.",
        "error"
      );
      try {
        window.prompt("Ссылка с фильтром — скопируйте:", shareUrl);
      } catch (_) {
        /* ignore */
      }
    }
  });

  salesProfitApplyBtn?.addEventListener("click", () => {
    void applySalesProfitToVisibleRates("percent");
  });
  salesProfitApplyBtnFixed?.addEventListener("click", () => {
    void applySalesProfitToVisibleRates("fixed");
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const percentBtn = target.closest("#sales-profit-apply-btn");
    if (percentBtn instanceof HTMLButtonElement) {
      percentBtn.disabled = false;
      percentBtn.removeAttribute("disabled");
      void applySalesProfitToVisibleRates("percent");
      return;
    }
    const fixedBtn = target.closest("#sales-profit-apply-btn-fixed");
    if (fixedBtn instanceof HTMLButtonElement) {
      fixedBtn.disabled = false;
      fixedBtn.removeAttribute("disabled");
      void applySalesProfitToVisibleRates("fixed");
    }
  });

  salesProfitRevertBtn?.addEventListener("click", () => {
    revertLastSalesProfitApply();
  });
  salesProfitRevertBtnFixed?.addEventListener("click", () => {
    revertLastSalesProfitApply();
  });

  document.querySelectorAll('input[name="salesProfitMethod"]').forEach((node) => {
    node.addEventListener("change", syncSalesProfitMethodUi);
  });
  syncSalesProfitMethodUi();
  if (salesProfitApplyBtn instanceof HTMLButtonElement) {
    salesProfitApplyBtn.disabled = false;
    salesProfitApplyBtn.removeAttribute("disabled");
    salesProfitApplyBtn.setAttribute("aria-disabled", "false");
  }
  if (salesProfitApplyBtnFixed instanceof HTMLButtonElement) {
    salesProfitApplyBtnFixed.disabled = false;
    salesProfitApplyBtnFixed.removeAttribute("disabled");
    salesProfitApplyBtnFixed.setAttribute("aria-disabled", "false");
  }

  salesWorksetBuildBtn?.addEventListener("click", async () => {
    const visible = getPublicationVisibleRatesSorted(
      await loadRates(),
      activeDestination,
      activeYear,
      activeMonth
    );
    if (!visible.length) {
      setStatus(
        "В реестре нет строк по вашим фильтрам — измените вкладку, месяц, фильтры портов, контейнеров, линий или агентов.",
        "error"
      );
      return;
    }
    const nextIds = dedupePreserveOrder(visible.map((r) => r.id));
    if (!nextIds.length) {
      setStatus("Не удалось сопоставить id ставок для таблицы продаж.", "error");
      return;
    }
    salesWorksetIds = nextIds;
    refreshSalesWorksetTable(await loadRates());
    setStatus(
      "Таблица для продаж: " +
        salesWorksetIds.length +
        " ставок. Профит и откат касаются только этих id.",
      "success"
    );
  });

  salesWorksetClearBtn?.addEventListener("click", async () => {
    if (!salesWorksetIds.length) {
      return;
    }
    salesWorksetIds = [];
    refreshSalesWorksetTable(await loadRates());
    setStatus("Таблица для продаж очищена.", "success");
  });

  salesPrintBtn?.addEventListener("click", () => {
    triggerSalesWorksetPrint();
  });

  salesKpClientCompanyInput?.addEventListener("input", async () => {
    buildSalesKpDocument(await loadRates(), false);
  });
  salesKpRecipientFioInput?.addEventListener("input", async () => {
    buildSalesKpDocument(await loadRates(), false);
  });
  salesKpManagerSelect?.addEventListener("change", async () => {
    buildSalesKpDocument(await loadRates(), false);
  });
  salesKpCurrencyTermsInput?.addEventListener("input", async () => {
    buildSalesKpDocument(await loadRates(), false);
  });
  salesKpPaymentTermsInput?.addEventListener("input", async () => {
    buildSalesKpDocument(await loadRates(), false);
  });
  salesKpInsuranceTermsInput?.addEventListener("input", async () => {
    buildSalesKpDocument(await loadRates(), false);
  });
  salesShareLinkBtn?.addEventListener("click", async () => {
    await copySalesKpShareLink();
  });

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "status";
    if (type) {
      statusEl.classList.add(type);
    }
  }

  function getRegisteredUserEmail() {
    try {
      const raw = localStorage.getItem("pb_user");
      if (!raw) {
        return "";
      }
      const rec = JSON.parse(raw);
      return String(rec.email || rec.username || "").trim();
    } catch {
      return "";
    }
  }

  function formatDateDdMmYy(date) {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = String(date.getFullYear()).slice(-2);
    return d + "." + m + "." + y;
  }

  /** Строка под заголовком формы: email из записи PocketBase при входе + сегодняшняя дата. */
  function buildTariffAddedHintText(date) {
    const email = getRegisteredUserEmail();
    const when = formatDateDdMmYy(date);
    if (email) {
      return "Тариф добавлен: " + email + ", " + when;
    }
    return "Тариф добавлен: " + when;
  }

  function normalizedContainerTypesKey(values) {
    const list = Array.isArray(values)
      ? values.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    return [...new Set(list)].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" })
    ).join(";");
  }

  function normalizedSeaSlotKeyFromRate(rate) {
    const rows = Array.isArray(rate?.seaRouteRows) ? rate.seaRouteRows : [];
    const slots = rows
      .map((r) => String(r.containerSlot || "").trim())
      .filter((s) => s === "20LT24" || s === "20GT24" || s === "40HQ");
    if (slots.length) {
      return normalizedContainerTypesKey(slots);
    }
    const raw = rate?.containerTypes;
    if (Array.isArray(raw) && raw.length) {
      return normalizedContainerTypesKey(raw);
    }
    const one = String(rate?.containerType || "").trim();
    return one ? normalizedContainerTypesKey([one]) : "";
  }

  function getRateContainerTypes(rate) {
    if (!rate || typeof rate !== "object") {
      return [];
    }
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
    const rows = Array.isArray(rate?.seaRouteRows) ? rate.seaRouteRows : [];
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

  function buildRateId(formData) {
    const normalizedPorts = getOriginPorts()
      .map((port) => port.toUpperCase())
      .sort()
      .join(";");
    const normalizedStations = [...getDestinationStations()]
      .sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }))
      .join(";");
    const cargoSecurityForId = String(formData.get("cargoSecurity") || "").trim();
    const slotVals = [
      ...seaUsdWrap.querySelectorAll(".sea-route-container-slot"),
    ]
      .filter((s) => s instanceof HTMLSelectElement)
      .map((s) => String(s.value || "").trim())
      .filter((v) => v === "20LT24" || v === "20GT24" || v === "40HQ");
    const ctCombined = normalizedContainerTypesKey(slotVals);
    return [
      normalizedPorts,
      normalizedStations,
      String(formData.get("destination")),
      ctCombined,
      cargoSecurityForId,
      String(formData.get("customsClearance") || ""),
      String(formData.get("bookingAgent") || "").trim(),
      tariffKeySegmentFromFormData(formData),
      normalizeDeliveryTerms(formData.get("deliveryTerms")),
    ].join("|");
  }

  /**
   * Тот же идентификатор ставки по сохранённой записи, что и у buildRateId(formData).
   * В ключ не входят суммы (море, ЖД, авто и т.д.), вес груза, ТН ВЭД и сумма охраны —
   * иначе при правке фрахта или этих полей появлялась вторая строка со старыми цифрами.
   */
  function stableRateKeyFromRecord(rate) {
    const normalizedPorts = [...(rate.originPorts || [rate.origin])]
      .map((port) => String(port || "").trim().toUpperCase())
      .filter(Boolean)
      .sort()
      .join(";");

    const normalizedStations = [
      ...(rate.destinationStations || [rate.destinationStation]),
    ]
      .map((s) => String(s || "").trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }))
      .join(";");

    const cargoSecurityForId = String(rate.cargoSecurity || "").trim();
    const ctCombined = normalizedSeaSlotKeyFromRate(rate);

    return [
      normalizedPorts,
      normalizedStations,
      String(rate.destination || ""),
      ctCombined,
      cargoSecurityForId,
      String(rate.customsClearance || ""),
      String(rate.bookingAgent || "").trim(),
      tariffKeySegmentFromRecord(rate),
      normalizeDeliveryTerms(rate.deliveryTerms),
    ].join("|");
  }

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

  function stripPbMetaForSave(rate) {
    if (!rate || typeof rate !== "object") {
      return {};
    }
    const copy = { ...rate };
    delete copy._pbId;
    delete copy.ratesArchivedAt;
    return copy;
  }

  function sanitizeRateForLocalPersist(rate) {
    const base = stripPbMetaForSave(rate);
    return { ...base };
  }

  /** Без авторизации PocketBase реестр хранится в localStorage этого браузера (как при открытии проекта по ссылке без входа). */
  function loadRatesFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((rate) => rate && typeof rate === "object")
        .map((rate) => sanitizeRateForLocalPersist(rate))
        .filter((rate) => !isRatesRecordArchived(rate));
    } catch {
      return [];
    }
  }

  function saveRatesToLocalStorage(rates) {
    const arr = Array.isArray(rates)
      ? rates.map((rate) =>
          rate && typeof rate === "object" ? sanitizeRateForLocalPersist(rate) : null
        )
      : [];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(arr.filter(Boolean))
    );
  }

  /** Скрывает ставку в интерфейсе, когда DELETE в PocketBase запрещён (403). PATCH чаще разрешён для авторизованных. */
  function isRatesRecordArchived(rate) {
    const t =
      rate && rate.ratesArchivedAt != null
        ? String(rate.ratesArchivedAt).trim()
        : "";
    return Boolean(t);
  }

  async function pocketBaseSoftArchiveRate(pbId, rateSnapshot) {
    const auth = pocketBaseAuthHeaders();
    if (!auth.Authorization || !pbId) {
      return { ok: false, status: 0 };
    }
    const data = stripPbMetaForSave(rateSnapshot);
    data.ratesArchivedAt = new Date().toISOString();
    try {
      const res = await fetch(
        `${API_BASE}/api/collections/rates/records/${encodeURIComponent(
          String(pbId).trim()
        )}`,
        {
          method: "PATCH",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        }
      );
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  async function loadRates() {
    const auth = pocketBaseAuthHeaders();
    if (!auth.Authorization) {
      return loadRatesFromLocalStorage();
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/collections/rates/records?perPage=500&sort=-created`,
        {
          headers: { ...auth },
        }
      );
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return (data.items || [])
        .map((record) => normalizePocketBaseRateRecord(record))
        .filter((rate) => !isRatesRecordArchived(rate));
    } catch (e) {
      return [];
    }
  }

  async function saveRates(rates) {
    const auth = pocketBaseAuthHeaders();
    if (!auth.Authorization) {
      saveRatesToLocalStorage(rates);
      return;
    }
    const headers = { ...auth, "Content-Type": "application/json" };
    for (const rate of rates) {
      const pbId = rate._pbId;
      const payload = { data: stripPbMetaForSave(rate) };
      if (pbId) {
        await fetch(`${API_BASE}/api/collections/rates/records/${pbId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${API_BASE}/api/collections/rates/records`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      }
    }
  }

  function normalizeBookingAgentDisplayName(raw) {
    return String(raw || "").trim().replace(/\s+/g, " ");
  }

  /**
   * Имя букирующего агента в записи PB: поддерживаются распространённые имена полей и data.* (как у ставок).
   */
  function extractBookingAgentNameFromPbRecord(record) {
    if (!record || typeof record !== "object") {
      return "";
    }
    const scalarKeys = [
      "name",
      "title",
      "label",
      "agent",
      "company",
      "full_name",
    ];
    for (let i = 0; i < scalarKeys.length; i++) {
      const k = scalarKeys[i];
      if (record[k] != null && String(record[k]).trim()) {
        return normalizeBookingAgentDisplayName(record[k]);
      }
    }
    let d = record.data;
    if (typeof d === "string") {
      try {
        d = JSON.parse(d);
      } catch {
        d = null;
      }
    }
    if (d && typeof d === "object" && !Array.isArray(d)) {
      for (let i = 0; i < scalarKeys.length; i++) {
        const k = scalarKeys[i];
        if (d[k] != null && String(d[k]).trim()) {
          return normalizeBookingAgentDisplayName(d[k]);
        }
      }
    }
    return "";
  }

  function bookingAgentPbSortDedupe(names) {
    const clean = (names || [])
      .map((s) => normalizeBookingAgentDisplayName(s))
      .filter(Boolean);
    return [...new Set(clean)].sort((a, b) => a.localeCompare(b, "ru"));
  }

  function normalizeBookingAgentDedupeKey(raw) {
    return String(raw || "").trim().toLocaleLowerCase("ru-RU");
  }

  function bookingAgentNameExists(names, candidate) {
    const key = normalizeBookingAgentDedupeKey(candidate);
    if (!key) {
      return true;
    }
    return names.some(
      (n) => normalizeBookingAgentDedupeKey(n) === key
    );
  }

  function mergeNameIntoBookingAgentsCache(displayName) {
    const t = normalizeBookingAgentDisplayName(displayName);
    if (!t || normalizeBookingAgentDedupeKey(t) === "нет") {
      return;
    }
    if (bookingAgentNameExists(bookingAgentsPbCache, t)) {
      return;
    }
    bookingAgentsPbCache = bookingAgentPbSortDedupe(
      bookingAgentsPbCache.concat([t])
    );
  }

  function formatPbBookingAgentError(status, bodyText) {
    const code = "HTTP " + status;
    const raw = String(bodyText || "").trim();
    if (!raw) {
      return code;
    }
    try {
      const j = JSON.parse(raw);
      if (j.message) {
        return code + ": " + j.message;
      }
    } catch (_) {
      /* ignore */
    }
    if (raw.length <= 240) {
      return code + ": " + raw;
    }
    return code + ": " + raw.slice(0, 240) + "…";
  }

  async function fetchBookingAgentsPb() {
    const auth = pocketBaseAuthHeaders();
    if (!auth.Authorization) {
      bookingAgentsPbCache = [];
      return;
    }
    const urlBase =
      `${API_BASE}/api/collections/${BOOKING_AGENTS_COLLECTION}/records?perPage=500`;
    try {
      let res = await fetch(urlBase + "&sort=name", {
        headers: { ...auth },
      });
      if (!res.ok) {
        res = await fetch(urlBase + "&sort=-created", {
          headers: { ...auth },
        });
      }
      if (!res.ok) {
        res = await fetch(urlBase, { headers: { ...auth } });
      }
      if (!res.ok) {
        if (res.status === 404) {
          console.warn(
            "[rates] PocketBase: коллекция \"" +
              BOOKING_AGENTS_COLLECTION +
              "\" не найдена — создайте её в админке (поле name или JSON data.name)."
          );
        } else if (res.status === 403) {
          console.warn(
            "[rates] booking_agents: нет прав на просмотр списка (List rule). " +
              "Запись может создаваться, но список из API недоступен — проверьте правила коллекции."
          );
        }
        return;
      }
      const data = await res.json();
      const rawItems = Array.isArray(data.items) ? data.items : [];
      const fromServer = rawItems
        .map((it) => extractBookingAgentNameFromPbRecord(it))
        .filter(Boolean);
      /*
       * Нельзя просто брать только fromServer: при «чужом» имени поля в PB там [] —
       * и мы затёрли бы кэш сразу после успешного POST (merge был бы потерян).
       */
      if (fromServer.length === 0 && rawItems.length > 0) {
        console.warn(
          "[rates] booking_agents: пришли записи из API, но имя поля не совпало с известными (name, title, data.name…)."
        );
      }
      bookingAgentsPbCache = bookingAgentPbSortDedupe(
        (bookingAgentsPbCache || []).concat(fromServer)
      );
    } catch (err) {
      console.warn("[rates] booking_agents fetch failed:", err);
    }
  }

  async function createBookingAgentPbRecord(displayName) {
    const trimmed = String(displayName || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!trimmed) {
      return false;
    }
    if (normalizeBookingAgentDedupeKey(trimmed) === "нет") {
      await fetchBookingAgentsPb();
      return true;
    }
    const auth = pocketBaseAuthHeaders();
    if (!auth.Authorization) {
      return false;
    }
    await fetchBookingAgentsPb();
    if (bookingAgentNameExists(bookingAgentsPbCache, trimmed)) {
      return true;
    }

    const postUrl = `${API_BASE}/api/collections/${BOOKING_AGENTS_COLLECTION}/records`;
    const postHeaders = { ...auth, "Content-Type": "application/json" };

    async function postPayload(bodyObj) {
      return fetch(postUrl, {
        method: "POST",
        headers: postHeaders,
        body: JSON.stringify(bodyObj),
      });
    }

    const postBodies = [
      { name: trimmed },
      { data: { name: trimmed } },
      { title: trimmed },
      { agent: trimmed },
    ];

    try {
      let lastStatus = 0;
      let lastBody = "";
      let res = null;
      let recJson = "";

      for (let i = 0; i < postBodies.length; i++) {
        res = await postPayload(postBodies[i]);
        lastStatus = res.status;
        lastBody = await res.text();
        if (res.ok) {
          recJson = lastBody;
          break;
        }
        if (
          lastStatus !== 400 &&
          lastStatus !== 405
        ) {
          break;
        }
      }

      if (!res || !res.ok) {
        console.warn("[rates] booking_agents POST", lastStatus, lastBody);
        if (typeof setStatus === "function") {
          let hint = "";
          if (lastStatus === 404) {
            hint =
              " Коллекции «booking_agents» нет или неверное имя (Admin → Collections). Добавьте коллекцию с текстовым полем name.";
          } else if (lastStatus === 403 || lastStatus === 401) {
            hint =
              " Проверьте правила PocketBase для booking_agents: Create и View/List для авторизованных (@request.auth.id != \"\" ).";
          }
          setStatus(
            "Не удалось добавить агента в справочник. " +
              formatPbBookingAgentError(lastStatus, lastBody) +
              hint,
            "error"
          );
        }
        return false;
      }

      let rec = null;
      try {
        rec = JSON.parse(recJson);
      } catch (_) {
        rec = null;
      }
      mergeNameIntoBookingAgentsCache(
        extractBookingAgentNameFromPbRecord(rec || {}) || trimmed
      );
      await fetchBookingAgentsPb();
      return true;
    } catch (err) {
      console.warn("[rates] booking_agents POST failed:", err);
      if (typeof setStatus === "function") {
        setStatus("Ошибка сети при сохранении агента в справочник.", "error");
      }
      return false;
    }
  }

  async function persistBookingAgentsFromMergedField(mergedRaw) {
    const merged = String(mergedRaw || "").trim();
    if (!bookingAgentMergedRequiresShippingLine(merged)) {
      return;
    }
    const parts = merged
      .split(/\s*;\s*/)
      .map((p) => p.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const seenKeys = new Set();
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!isBookingAgentProvided(p)) {
        continue;
      }
      const k = normalizeBookingAgentDedupeKey(p);
      if (seenKeys.has(k)) {
        continue;
      }
      seenKeys.add(k);
      await createBookingAgentPbRecord(p);
    }
  }

  function getBookingAgentSlotInputs() {
    if (!(bookingAgentSlotsWrap instanceof HTMLElement)) {
      return bookingAgentInput instanceof HTMLInputElement
        ? [bookingAgentInput]
        : [];
    }
    return [
      ...bookingAgentSlotsWrap.querySelectorAll(".booking-agent-slot-input"),
    ].filter((el) => el instanceof HTMLInputElement);
  }

  function mergeBookingAgentSlotsToHiddenField() {
    if (!(bookingAgentSubmitInput instanceof HTMLInputElement)) {
      return;
    }
    const vals = getBookingAgentSlotInputs()
      .map((inp) =>
        String(inp.value || "").trim().replace(/\s+/g, " ")
      )
      .filter(Boolean);
    bookingAgentSubmitInput.value = vals.join("; ");
  }

  function distributeAgentNamesAcrossSlots(namesClean) {
    if (!(bookingAgentSlotsWrap instanceof HTMLElement)) {
      mergeBookingAgentSlotsToHiddenField();
      return;
    }
    [
      ...bookingAgentSlotsWrap.querySelectorAll("[data-booking-agent-row]"),
    ]
      .slice(1)
      .forEach((row) => row.remove());
    const clean = namesClean
      .map((n) => String(n || "").trim().replace(/\s+/g, " "))
      .filter(Boolean);
    if (!(bookingAgentInput instanceof HTMLInputElement)) {
      mergeBookingAgentSlotsToHiddenField();
      return;
    }
    if (!clean.length) {
      bookingAgentInput.value = "";
      mergeBookingAgentSlotsToHiddenField();
      return;
    }
    bookingAgentInput.value = clean[0] || "";
    for (let i = 1; i < clean.length; i++) {
      appendBookingAgentSlotRow(clean[i]);
    }
    mergeBookingAgentSlotsToHiddenField();
  }

  function appendBookingAgentSlotRow(initialValue) {
    if (!(bookingAgentSlotsWrap instanceof HTMLElement)) {
      return;
    }
    const listId =
      bookingAgentSuggestions instanceof HTMLElement && bookingAgentSuggestions.id
        ? bookingAgentSuggestions.id
        : "booking-agent-suggestions";
    const row = document.createElement("div");
    row.className = "booking-agent-slot-row quick-add-row";
    row.setAttribute("data-booking-agent-row", "");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "booking-agent-slot-input";
    input.setAttribute("list", listId);
    input.setAttribute("autocomplete", "organization");
    input.setAttribute("placeholder", "Название агента");
    input.setAttribute(
      "aria-label",
      "Название букирующего агента (дополнительная строка)"
    );
    input.value = String(initialValue || "")
      .trim()
      .replace(/\s+/g, " ");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-mini-control booking-agent-slot-remove-btn";
    btn.textContent = "−";
    btn.setAttribute("aria-label", "Удалить этого агента из списка");
    row.appendChild(input);
    row.appendChild(btn);
    bookingAgentSlotsWrap.appendChild(row);
    btn.addEventListener("click", () => {
      row.remove();
      mergeBookingAgentSlotsToHiddenField();
      syncBookingAgentLineVisibility();
      syncBookingAgentInputToQuickPicks();
      nudgeBookingAgentDatalistBindings();
    });
    enableDatalistOpenOnFocus(input);
    input.addEventListener("input", () => {
      mergeBookingAgentSlotsToHiddenField();
      syncBookingAgentLineVisibility();
      syncBookingAgentInputToQuickPicks();
    });
  }

  function resetBookingAgentSlotsToSingleEmpty() {
    if (!(bookingAgentSlotsWrap instanceof HTMLElement)) {
      if (bookingAgentSubmitInput instanceof HTMLInputElement) {
        bookingAgentSubmitInput.value = "";
      }
      if (bookingAgentInput instanceof HTMLInputElement) {
        bookingAgentInput.value = "";
      }
      return;
    }
    [
      ...bookingAgentSlotsWrap.querySelectorAll("[data-booking-agent-row]"),
    ]
      .slice(1)
      .forEach((row) => row.remove());
    if (bookingAgentInput instanceof HTMLInputElement) {
      bookingAgentInput.value = "";
    }
    mergeBookingAgentSlotsToHiddenField();
  }

  function loadSalesProfitUndoStack() {
    try {
      const raw = localStorage.getItem(SALES_PROFIT_UNDO_STACK_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const normalizedLevels = parsed
        .map((lvl) => coerceUndoPatchRecord(lvl))
        .filter((lvl) => Object.keys(lvl).length > 0);
      return normalizedLevels;
    } catch {
      return [];
    }
  }

  function saveSalesProfitUndoStack(stack) {
    try {
      if (!stack.length) {
        localStorage.removeItem(SALES_PROFIT_UNDO_STACK_KEY);
        return;
      }
      localStorage.setItem(SALES_PROFIT_UNDO_STACK_KEY, JSON.stringify(stack));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "не удалось сохранить";
      if (typeof setStatus === "function") {
        setStatus(
          "Ошибка localStorage для отката профита — проверьте квоту или режим браузера: " +
            msg +
            ".",
          "error"
        );
      }
    }
  }

  function coerceUndoPatchRecord(patch) {
    const out = {};
    if (!patch || typeof patch !== "object") {
      return out;
    }
    for (const k of Object.keys(patch)) {
      const id = normalizeRateId(k);
      const snap = patch[k];
      if (!id || !snap || typeof snap !== "object") {
        continue;
      }
      const entry = {
        seaUsd: snap.seaUsd,
        railRub: snap.railRub,
        updatedAt: snap.updatedAt,
      };
      if (Object.prototype.hasOwnProperty.call(snap, "seaUsds")) {
        entry.seaUsds = Array.isArray(snap.seaUsds) ? snap.seaUsds : [];
      }
      if (Object.prototype.hasOwnProperty.call(snap, "seaRouteRows")) {
        entry.seaRouteRows = Array.isArray(snap.seaRouteRows)
          ? snap.seaRouteRows
          : [];
      }
      if (Object.prototype.hasOwnProperty.call(snap, "railRub20Lt24")) {
        entry.railRub20Lt24 = snap.railRub20Lt24;
      }
      if (Object.prototype.hasOwnProperty.call(snap, "railRub20Gt24")) {
        entry.railRub20Gt24 = snap.railRub20Gt24;
      }
      out[id] = entry;
    }
    return out;
  }

  function syncSalesRevertButton() {
    const empty = loadSalesProfitUndoStack().length === 0;
    if (salesProfitRevertBtn instanceof HTMLButtonElement) {
      salesProfitRevertBtn.disabled = empty;
      salesProfitRevertBtn.setAttribute("aria-disabled", empty ? "true" : "false");
    }
    if (salesProfitRevertBtnFixed instanceof HTMLButtonElement) {
      salesProfitRevertBtnFixed.disabled = empty;
      salesProfitRevertBtnFixed.setAttribute("aria-disabled", empty ? "true" : "false");
    }
  }

  function syncSalesProfitMethodUi() {
    const checked = document.querySelector(
      'input[name="salesProfitMethod"]:checked'
    );
    const method =
      checked instanceof HTMLInputElement ? checked.value : "percent";
    if (salesProfitPercentWrap instanceof HTMLElement) {
      salesProfitPercentWrap.hidden = method !== "percent";
    }
    if (salesProfitFixedWrap instanceof HTMLElement) {
      salesProfitFixedWrap.hidden = method !== "fixed";
    }
    syncSalesApplyButtonsEnabled();
  }

  function syncSalesApplyButtonsEnabled() {
    if (salesProfitApplyBtn instanceof HTMLButtonElement) {
      salesProfitApplyBtn.disabled = false;
      salesProfitApplyBtn.removeAttribute("disabled");
      salesProfitApplyBtn.setAttribute("aria-disabled", "false");
    }
    if (salesProfitApplyBtnFixed instanceof HTMLButtonElement) {
      salesProfitApplyBtnFixed.disabled = false;
      salesProfitApplyBtnFixed.removeAttribute("disabled");
      salesProfitApplyBtnFixed.setAttribute("aria-disabled", "false");
    }
  }

  function pushSalesProfitUndoPatch(undoPatchRaw) {
    const normalized = coerceUndoPatchRecord(undoPatchRaw);
    if (!Object.keys(normalized).length) {
      return;
    }
    const stack = loadSalesProfitUndoStack();
    stack.push(normalized);
    saveSalesProfitUndoStack(stack);
    syncSalesRevertButton();
  }

  function getCurrentProfitTargetIds(allRates) {
    const idsFromSalesTable = [
      ...(salesWorksetTbody instanceof HTMLElement
        ? salesWorksetTbody.querySelectorAll("tr[data-rate-id]")
        : []),
    ]
      .map((row) =>
        row instanceof HTMLElement ? normalizeRateId(row.dataset.rateId) : ""
      )
      .filter(Boolean);
    if (idsFromSalesTable.length) {
      return dedupePreserveOrder(idsFromSalesTable);
    }
    if (Array.isArray(salesWorksetIds) && salesWorksetIds.length) {
      return dedupePreserveOrder(salesWorksetIds);
    }
    return dedupePreserveOrder(
      getPublicationVisibleRatesSorted(allRates, activeDestination, activeYear, activeMonth).map(
        (rate) => rate.id
      )
    );
  }

  async function revertLastSalesProfitApply() {
    const stack = loadSalesProfitUndoStack();
    if (!stack.length) {
      setStatus("Нечего откатывать: профит ещё не применяли или уже всё вернули.", "error");
      syncSalesRevertButton();
      return;
    }

    if (
      !(salesProfitRevertBtn instanceof HTMLButtonElement) ||
      !(salesProfitRevertBtnFixed instanceof HTMLButtonElement)
    ) {
      return;
    }
    salesProfitRevertBtn.disabled = true;
    salesProfitRevertBtnFixed.disabled = true;

    try {
      const rawPatch = stack.pop();
      saveSalesProfitUndoStack(stack);
      const patch = coerceUndoPatchRecord(rawPatch);

      const allRates = await loadRates();
      const ids = Object.keys(patch);
      if (!ids.length) {
        setStatus(
          "Снимок отката пустой (данные удалены?). Остальной стек сохранён.",
          "error"
        );
        return;
      }

      const updated = allRates.map((rate) => {
        const rid = normalizeRateId(rate.id);
        const snapshot = rid ? patch[rid] : undefined;
        if (!snapshot || typeof snapshot !== "object") {
          return rate;
        }
        const restored = {
          ...rate,
          seaUsd: snapshot.seaUsd,
          railRub: snapshot.railRub,
          updatedAt: snapshot.updatedAt,
        };
        if (Object.prototype.hasOwnProperty.call(snapshot, "seaUsds")) {
          restored.seaUsds = Array.isArray(snapshot.seaUsds) ? snapshot.seaUsds : [];
        }
        if (Object.prototype.hasOwnProperty.call(snapshot, "seaRouteRows")) {
          restored.seaRouteRows = Array.isArray(snapshot.seaRouteRows)
            ? snapshot.seaRouteRows
            : [];
        }
        if (Object.prototype.hasOwnProperty.call(snapshot, "railRub20Lt24")) {
          restored.railRub20Lt24 = snapshot.railRub20Lt24;
        }
        if (Object.prototype.hasOwnProperty.call(snapshot, "railRub20Gt24")) {
          restored.railRub20Gt24 = snapshot.railRub20Gt24;
        }
        return restored;
      });

      await saveRates(updated);
      fullPublicationRefresh(updated);
      syncCbrSortBanner();

      const n = ids.length;
      setStatus(
        "У " +
          n +
          " ставок восстановлены морской фрахт (USD) и ЖД (₽) в том виде, в каком они были до последнего пересчёта профита.",
        "success"
      );
    } finally {
      syncSalesRevertButton();
    }
  }

  function filterRatesByPublicationTabs(
    allRates,
    destination,
    filterYear,
    filterMonth
  ) {
    return [...allRates].filter(
      (item) =>
        item.destination === destination &&
        rateOverlapsPublicationMonth(item, filterYear, filterMonth)
    );
  }

  function buildFilterChipLabel(inputNameAttr, rawValue) {
    const trimmed = String(rawValue || "").trim();
    const labelText = trimmed === "" ? "—" : trimmed;
    const valueEncoded = trimmed === "" ? "—" : trimmed;
    return (
      '<label class="rates-filter-chip">' +
      '<input type="checkbox" name="' +
      inputNameAttr +
      '" value="' +
      escapeHtml(valueEncoded) +
      '" />' +
      "<span>" +
      escapeHtml(labelText) +
      "</span></label>"
    );
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

  function repopulatePublicationFilters(allRates) {
    const base = filterRatesByPublicationTabs(
      allRates,
      activeDestination,
      activeYear,
      activeMonth
    );

    if (originPortFiltersWrap) {
      const portSet = new Set();
      base.forEach((r) => {
        getRateOriginPortsUpper(r).forEach((up) => portSet.add(up));
      });
      const ports = [...portSet].sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" })
      );
      originPortFiltersWrap.innerHTML = ports
        .map((p) => buildFilterChipLabel("filterOriginPort", p))
        .join("");
    }

    if (containerTypeFiltersWrap) {
      const ctAccum = new Set();
      base.forEach((r) => {
        getRateContainerTypes(r).forEach((ct) => ctAccum.add(ct));
      });
      const ctSet = [...ctAccum].sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" })
      );
      containerTypeFiltersWrap.innerHTML = ctSet
        .map((t) => buildFilterChipLabel("filterContainerType", t))
        .join("");
    }

    if (!lineFiltersWrap || !agentFiltersWrap) {
      return;
    }

    const lineSet = new Set();
    base.forEach((r) => {
      getRateShippingLines(r).forEach((line) => lineSet.add(line));
    });
    const lines = [...lineSet].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" })
    );
    const agents = [
      ...new Set(
        base.map((r) => String(r.bookingAgent || "").trim()).filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));
    lineFiltersWrap.innerHTML = lines
      .map((line) => buildFilterChipLabel("filterShippingLine", line))
      .join("");
    agentFiltersWrap.innerHTML = agents
      .map((agent) => buildFilterChipLabel("filterBookingAgent", agent))
      .join("");
  }

  function applyPublicationTableFilters(rows) {
    if (!rows.length) {
      return rows;
    }
    let out = rows;

    if (originPortFiltersWrap) {
      const portBoxes = [
        ...originPortFiltersWrap.querySelectorAll(
          'input[name="filterOriginPort"]'
        ),
      ];
      const selPorts = portBoxes
        .filter((i) => i instanceof HTMLInputElement && i.checked)
        .map((i) => normalizeOriginPortLabel(i.value || ""));
      const portFilterOn =
        portBoxes.length > 0 &&
        selPorts.length > 0 &&
        selPorts.length < portBoxes.length;
      if (portFilterOn) {
        const wanted = new Set(selPorts);
        out = out.filter((r) =>
          getRateOriginPortsUpper(r).some((p) => wanted.has(p))
        );
      }
    }

    if (containerTypeFiltersWrap) {
      const ctBoxes = [
        ...containerTypeFiltersWrap.querySelectorAll(
          'input[name="filterContainerType"]'
        ),
      ];
      const selCt = ctBoxes
        .filter((i) => i instanceof HTMLInputElement && i.checked)
        .map((i) => String(i.value || "").trim());
      const ctFilterOn =
        ctBoxes.length > 0 &&
        selCt.length > 0 &&
        selCt.length < ctBoxes.length;
      if (ctFilterOn) {
        const wantedCt = new Set(selCt);
        out = out.filter((r) =>
          getRateContainerTypes(r).some((ct) => wantedCt.has(ct))
        );
      }
    }

    if (!(lineFiltersWrap && agentFiltersWrap)) {
      return out;
    }
    const lineBoxes = [
      ...lineFiltersWrap.querySelectorAll('input[name="filterShippingLine"]'),
    ];
    const agentBoxes = [
      ...agentFiltersWrap.querySelectorAll('input[name="filterBookingAgent"]'),
    ];
    const selLines = lineBoxes
      .filter((i) => i instanceof HTMLInputElement && i.checked)
      .map((i) => String(i.value || "").trim());
    const selAgents = agentBoxes
      .filter((i) => i instanceof HTMLInputElement && i.checked)
      .map((i) => String(i.value || "").trim());

    const lineFilterOn =
      lineBoxes.length > 0 &&
      selLines.length > 0 &&
      selLines.length < lineBoxes.length;
    if (lineFilterOn) {
      const lineSet = new Set(selLines);
      out = out.filter((r) =>
        getRateShippingLines(r).some((line) => lineSet.has(line))
      );
    }

    const agentFilterOn =
      agentBoxes.length > 0 &&
      selAgents.length > 0 &&
      selAgents.length < agentBoxes.length;
    if (agentFilterOn) {
      const agentSet = new Set(selAgents);
      out = out.filter((r) =>
        agentSet.has(String(r.bookingAgent || "").trim())
      );
    }
    return out;
  }

  function getPublicationVisibleRatesSorted(
    allRates,
    destination,
    filterYear,
    filterMonth
  ) {
    const sorted = [...allRates].sort(compareRatesForPublication);
    const filteredBase = sorted.filter(
      (item) =>
        item.destination === destination &&
        rateOverlapsPublicationMonth(item, filterYear, filterMonth)
    );
    const expandedBase = expandRatesByRouteDimensions(filteredBase);
    return applyPublicationTableFilters(expandedBase);
  }

  function profitIsContainer20Ft(rate) {
    const ct = String(rate.containerType || "").trim().toUpperCase();
    return ct === "20FT" || (ct.includes("20") && !ct.includes("40"));
  }

  /** 20′ с парой тарифов ЖД: процентная надбавка — к каждому; фиксированная — один раз к активному тарифу по весу. */
  function profitHas20RailPair(rate) {
    if (!profitIsContainer20Ft(rate)) {
      return false;
    }
    const lt = rateNumericOrNaN(rate.railRub20Lt24);
    const gt = rateNumericOrNaN(rate.railRub20Gt24);
    return Number.isFinite(lt) && Number.isFinite(gt) && lt >= 0 && gt >= 0;
  }

  function profitEffective20RailRub(ltRounded, gtRounded, cargoKg) {
    const w = rateNumericOrNaN(cargoKg);
    if (Number.isFinite(w) && w > 24000) {
      return gtRounded;
    }
    return ltRounded;
  }

  async function applySalesProfitToVisibleRates(forceMethod) {
    setStatus("Применение профита запущено…", "success");
    if (
      !(salesProfitApplyBtn instanceof HTMLButtonElement) ||
      !(salesProfitApplyBtnFixed instanceof HTMLButtonElement)
    ) {
      return;
    }
    salesProfitApplyBtn.disabled = true;
    salesProfitApplyBtnFixed.disabled = true;

    try {
      let method =
        forceMethod === "fixed" || forceMethod === "percent"
          ? forceMethod
          : null;
      if (method) {
        const pick = document.querySelector(
          'input[name="salesProfitMethod"][value="' + method + '"]'
        );
        if (pick instanceof HTMLInputElement) {
          pick.checked = true;
        }
        syncSalesProfitMethodUi();
      } else {
        const checked = document.querySelector(
          'input[name="salesProfitMethod"]:checked'
        );
        method =
          checked instanceof HTMLInputElement ? checked.value : "percent";
      }

      let seaDeltaMode = "fixed";
      let railDeltaMode = "fixed";
      let seaValue = 0;
      let railValue = 0;

      if (method === "percent") {
        const seaPctRaw = String(salesProfitSeaPctInput?.value || "")
          .trim()
          .replace(",", ".");
        const railPctRaw = String(salesProfitRailPctInput?.value || "")
          .trim()
          .replace(",", ".");
        const seaPct = seaPctRaw === "" ? Number.NaN : Number(seaPctRaw);
        const railPct = railPctRaw === "" ? Number.NaN : Number(railPctRaw);
        if (!Number.isFinite(seaPct) || seaPct < 0) {
          setStatus("Укажите корректный % от фрахта.", "error");
          return;
        }
        if (!Number.isFinite(railPct) || railPct < 0) {
          setStatus("Укажите корректный % от ЖД части.", "error");
          return;
        }
        seaDeltaMode = "percent";
        railDeltaMode = "percent";
        seaValue = seaPct;
        railValue = railPct;
      } else {
        const seaFixedRaw = String(salesProfitSeaFixedInput?.value || "")
          .trim()
          .replace(",", ".");
        const railFixedRaw = String(salesProfitRailFixedInput?.value || "")
          .trim()
          .replace(",", ".");
        const seaFixed = seaFixedRaw === "" ? Number.NaN : Number(seaFixedRaw);
        const railFixed = railFixedRaw === "" ? Number.NaN : Number(railFixedRaw);
        if (!Number.isFinite(seaFixed) || seaFixed < 0) {
          setStatus("Укажите корректную сумму добавления к фрахту, USD.", "error");
          return;
        }
        if (!Number.isFinite(railFixed) || railFixed < 0) {
          setStatus("Укажите корректную сумму добавления к ЖД, RUB.", "error");
          return;
        }
        seaValue = seaFixed;
        railValue = railFixed;
      }

      const allRates = await loadRates();
      const targetIds = getCurrentProfitTargetIds(allRates);
      const idSet = new Set(
        targetIds
          .map((rawId) => normalizeRateId(rawId))
          .filter(Boolean)
      );
      if (!idSet.size) {
        setStatus("Нет строк для применения профита в текущем отборе.", "error");
        return;
      }
      let applied = 0;
      let skipped = 0;
      const undoPatch = {};

      const updated = allRates.map((rate) => {
        const rid = normalizeRateId(rate.id);
        if (!rid || !idSet.has(rid)) {
          return rate;
        }
        const seaUsd = Number(rate.seaUsd);
        const railRub = Number(rate.railRub);
        const ltRail0 = rateNumericOrNaN(rate.railRub20Lt24);
        const gtRail0 = rateNumericOrNaN(rate.railRub20Gt24);
        const pair20 = profitHas20RailPair(rate);
        const single20Lt =
          profitIsContainer20Ft(rate) &&
          Number.isFinite(ltRail0) &&
          ltRail0 >= 0 &&
          !Number.isFinite(gtRail0);
        const single20Gt =
          profitIsContainer20Ft(rate) &&
          Number.isFinite(gtRail0) &&
          gtRail0 >= 0 &&
          !Number.isFinite(ltRail0);

        if (!Number.isFinite(seaUsd) || seaUsd < 0) {
          skipped++;
          return rate;
        }

        if (
          !pair20 &&
          !single20Lt &&
          !single20Gt &&
          (!Number.isFinite(railRub) || railRub < 0)
        ) {
          skipped++;
          return rate;
        }

        const addSea =
          seaDeltaMode === "percent" ? seaUsd * (seaValue / 100) : seaValue;
        let nextSeaUsd = Math.round((seaUsd + addSea) * 100) / 100;

        const snap = {
          seaUsd: rate.seaUsd,
          seaUsds: Array.isArray(rate.seaUsds) ? [...rate.seaUsds] : [],
          seaRouteRows: Array.isArray(rate.seaRouteRows)
            ? rate.seaRouteRows.map((row) => ({ ...row }))
            : [],
          railRub: rate.railRub,
          railRub20Lt24: rate.railRub20Lt24,
          railRub20Gt24: rate.railRub20Gt24,
          updatedAt: rate.updatedAt,
        };

        let nextRailRub;
        let nextLt24 = rate.railRub20Lt24;
        let nextGt24 = rate.railRub20Gt24;
        let nextSeaUsds = Array.isArray(rate.seaUsds) ? [...rate.seaUsds] : [];
        let nextSeaRouteRows = Array.isArray(rate.seaRouteRows)
          ? rate.seaRouteRows.map((row) => ({ ...row }))
          : [];

        if (nextSeaUsds.length) {
          nextSeaUsds = nextSeaUsds.map((raw) => {
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 0) {
              return raw;
            }
            const delta =
              seaDeltaMode === "percent" ? n * (seaValue / 100) : seaValue;
            return Math.round((n + delta) * 100) / 100;
          });
          if (Number.isFinite(Number(nextSeaUsds[0]))) {
            nextSeaUsd = Number(nextSeaUsds[0]);
          }
        }
        if (nextSeaRouteRows.length) {
          if (nextSeaUsds.length === nextSeaRouteRows.length) {
            nextSeaRouteRows = nextSeaRouteRows.map((row, i) => {
              const u = Number(nextSeaUsds[i]);
              return Number.isFinite(u)
                ? { ...row, seaUsd: Math.round(u * 100) / 100 }
                : row;
            });
          } else {
            nextSeaRouteRows = nextSeaRouteRows.map((row) => {
              const current = Number(row.seaUsd);
              if (!Number.isFinite(current) || current < 0) {
                return row;
              }
              const delta =
                seaDeltaMode === "percent" ? current * (seaValue / 100) : seaValue;
              return {
                ...row,
                seaUsd: Math.round((current + delta) * 100) / 100,
              };
            });
          }
        }

        if (pair20) {
          const lt = rateNumericOrNaN(rate.railRub20Lt24);
          const gt = rateNumericOrNaN(rate.railRub20Gt24);
          let nLt;
          let nGt;
          if (railDeltaMode === "percent") {
            nLt = Math.round(lt + lt * (railValue / 100));
            nGt = Math.round(gt + gt * (railValue / 100));
          } else {
            const w = rateNumericOrNaN(rate.cargoWeightKg);
            const heavy = Number.isFinite(w) && w > 24000;
            if (heavy) {
              nLt = Math.round(lt);
              nGt = Math.round(gt + railValue);
            } else {
              nLt = Math.round(lt + railValue);
              nGt = Math.round(gt);
            }
          }
          nextLt24 = nLt;
          nextGt24 = nGt;
          nextRailRub = profitEffective20RailRub(nLt, nGt, rate.cargoWeightKg);
        } else if (single20Lt) {
          if (railDeltaMode === "percent") {
            nextLt24 = Math.round(ltRail0 + ltRail0 * (railValue / 100));
          } else {
            nextLt24 = Math.round(ltRail0 + railValue);
          }
          nextRailRub = nextLt24;
        } else if (single20Gt) {
          if (railDeltaMode === "percent") {
            nextGt24 = Math.round(gtRail0 + gtRail0 * (railValue / 100));
          } else {
            nextGt24 = Math.round(gtRail0 + railValue);
          }
          nextRailRub = nextGt24;
        } else {
          const addRail =
            railDeltaMode === "percent"
              ? railRub * (railValue / 100)
              : railValue;
          nextRailRub = Math.round(railRub + addRail);
          if (nextSeaRouteRows.length) {
            nextSeaRouteRows = nextSeaRouteRows.map((row) => {
              const slot = normalizeContainerSlotValue(row.containerSlot);
              if (slot !== "40HQ") {
                return row;
              }
              const cur = rateNumericOrNaN(row.railRub40Hq);
              if (!Number.isFinite(cur) || cur < 0) {
                return row;
              }
              const rowAdd =
                railDeltaMode === "percent"
                  ? cur * (railValue / 100)
                  : railValue;
              return {
                ...row,
                railRub40Hq: Math.round(cur + rowAdd),
              };
            });
          }
        }

        undoPatch[rid] = snap;
        applied++;
        return {
          ...rate,
          seaUsd: nextSeaUsd,
          ...(nextSeaUsds.length ? { seaUsds: nextSeaUsds } : {}),
          ...(nextSeaRouteRows.length ? { seaRouteRows: nextSeaRouteRows } : {}),
          railRub: nextRailRub,
          ...(pair20
            ? { railRub20Lt24: nextLt24, railRub20Gt24: nextGt24 }
            : single20Lt
              ? { railRub20Lt24: nextLt24 }
              : single20Gt
                ? { railRub20Gt24: nextGt24 }
                : {}),
          updatedAt: new Date().toISOString(),
        };
      });

      if (!applied) {
        setStatus("Нет строк с корректными морем/ЖД для применения профита.", "error");
        return;
      }

      pushSalesProfitUndoPatch(undoPatch);
      await saveRates(updated);
      fullPublicationRefresh(updated);

      let msg =
        method === "percent"
          ? "Профит применён по процентам: море +" +
            seaValue +
            "%, ЖД +" +
            railValue +
            "%."
          : "Профит применён фиксированно: море +" +
            seaValue +
            " USD, ЖД +" +
            railValue +
            " RUB.";
      if (method === "percent") {
        msg +=
          " Если у 20′ указан только один тариф ЖД, процент добавляется к нему.";
      }
      if (method === "fixed") {
        msg +=
          " Для 20′ с двумя тарифами ЖД фикс добавляется один раз — к тарифу по весу строки (≤24 т или &gt;24 т). Если указан только один тариф ЖД, фикс добавляется к нему.";
      }
      msg += " Обработано строк: " + applied + ".";
      if (skipped) {
        msg += " Пропущено строк: " + skipped + ".";
      }
      msg +=
        Array.isArray(salesWorksetIds) && salesWorksetIds.length
          ? " Применение выполнено по таблице продаж."
          : " Применение выполнено по текущему отбору реестра.";
      setStatus(msg, "success");
    } finally {
      salesProfitApplyBtn.disabled = false;
      salesProfitApplyBtnFixed.disabled = false;
      syncSalesRevertButton();
    }
  }

  function formatCbrBannerDate(iso) {
    if (!iso) {
      return "";
    }
    try {
      const d = new Date(String(iso));
      if (Number.isNaN(d.getTime())) {
        return String(iso);
      }
      return d.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return String(iso);
    }
  }

  function formatUsdRubRate(value) {
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  }

  async function fetchCbrUsdRubRateFromCbrDaily() {
    const res = await fetch(CBR_JSON_URL, {
      mode: "cors",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("ответ сервера " + res.status);
    }
    const data = await res.json();
    const usd =
      data && data.Valute && data.Valute.USD ? data.Valute.USD : null;
    if (!usd || typeof usd.Value !== "number") {
      throw new Error("в ответе нет курса USD");
    }
    const nominal = Number(usd.Nominal);
    const n =
      Number.isFinite(nominal) && nominal > 0 ? nominal : 1;
    return {
      rubPerUsd: usd.Value / n,
      isoDate: data.Date ? String(data.Date) : "",
    };
  }

  function computeTotalDeliveryRub(rate, rubPerUsd) {
    const seaUsd = Number(rate.seaUsd);
    const railRub = Number(rate.railRub);
    if (
      !Number.isFinite(rubPerUsd) ||
      rubPerUsd <= 0 ||
      !Number.isFinite(seaUsd) ||
      seaUsd < 0
    ) {
      return Number.NaN;
    }
    const seaRub = seaUsd * rubPerUsd;
    const dt = normalizeDeliveryTerms(rate.deliveryTerms);
    let pickupRub = 0;
    if (dt === "EXW" || dt === "FCA") {
      const pickupUsd = Number(rate.deliveryExwFcaUsd);
      if (Number.isFinite(pickupUsd) && pickupUsd >= 0) {
        pickupRub = pickupUsd * rubPerUsd;
      }
    }
    const railOk = Number.isFinite(railRub) && railRub >= 0 ? railRub : 0;
    if (cbSortExcludeLastMile) {
      return seaRub + railOk + pickupRub;
    }
    const autoRub = Number(rate.autoRub);
    const autoOk = Number.isFinite(autoRub) && autoRub >= 0 ? autoRub : 0;
    let securityOk = 0;
    if (rate.cargoSecurity === "yes") {
      const sc = Number(rate.securityCostRub);
      if (Number.isFinite(sc) && sc >= 0) {
        securityOk = sc;
      }
    }
    return seaRub + railOk + pickupRub + autoOk + securityOk;
  }

  function syncCbrExcludeLastMileButton() {
    if (!(cbrExcludeLastMileBtn instanceof HTMLButtonElement)) {
      return;
    }
    cbrExcludeLastMileBtn.setAttribute(
      "aria-pressed",
      cbSortExcludeLastMile ? "true" : "false"
    );
    if (cbSortExcludeLastMile) {
      cbrExcludeLastMileBtn.textContent =
        "Учитывать авто и охрану при пересчёте ЦБ";
      cbrExcludeLastMileBtn.classList.add("is-active-sort");
      return;
    }
    cbrExcludeLastMileBtn.textContent =
      "Не учитывать стоимость последней мили при пересчёте ЦБ";
    cbrExcludeLastMileBtn.classList.remove("is-active-sort");
  }

  function syncCbrSortBanner() {
    if (!(cbrSortBanner instanceof HTMLElement)) {
      return;
    }
    if (
      publicationSortMode === "cbr_total_asc" &&
      typeof cbrRubPerUsd === "number" &&
      cbrRubPerUsd > 0
    ) {
      cbrSortBanner.hidden = false;
      const datePart =
        cbrRateLabel !== ""
          ? " Дата в ответе сервера: " + cbrRateLabel + "."
          : "";
      const formula = cbSortExcludeLastMile
        ? "(морской фрахт + сумма EXW/FCA в USD при этих условиях)×курс + ЖД до станции (без автодоставки «последняя миля», без охраны)."
        : "(морской фрахт + сумма EXW/FCA в USD при этих условиях)×курс + ЖД + авто до склада + охрана при «Да» и указанной сумме.";
      cbrSortBanner.textContent =
        "Включена сортировка по сумме в ₽: 1 USD ≈ " +
        formatUsdRubRate(cbrRubPerUsd) +
        " ₽ (данные ЦБ РФ, JSON cbr-xml-daily.ru)." +
        datePart +
        " Формула для ранжирования: " +
        formula +
        ' Отключите сортировку кнопкой «Вернуть обычный порядок».';
      if (cbrSortBtn instanceof HTMLButtonElement) {
        cbrSortBtn.textContent = "Вернуть обычный порядок";
        cbrSortBtn.classList.add("is-active-sort");
        cbrSortBtn.setAttribute("aria-pressed", "true");
      }
      return;
    }
    cbrSortBanner.hidden = true;
    cbrSortBanner.textContent = "";
    if (cbrSortBtn instanceof HTMLButtonElement) {
      cbrSortBtn.textContent = "Сортировать по сумме ₽ курс ЦБ";
      cbrSortBtn.classList.remove("is-active-sort");
      cbrSortBtn.setAttribute("aria-pressed", "false");
    }
  }

  function renderPublicationBody(allRates) {
    renderTable(allRates, activeDestination, activeYear, activeMonth);
  }

  function fullPublicationRefresh(allRates) {
    syncSalesApplyButtonsEnabled();
    repopulatePublicationFilters(allRates);
    renderPublicationBody(allRates);
  }

  function formatRegistryRailTriple(rate, moneyFormatter) {
    const dash = "—";
    const fmtMoney =
      typeof moneyFormatter === "function" ? moneyFormatter : formatNumber;
    const fmt = (n) => (Number.isFinite(n) ? fmtMoney(n) : dash);
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
          const neitherExplicitLtGt =
            !Number.isFinite(ltField) && !Number.isFinite(gtField);
          if (neitherExplicitLtGt) {
            cell20Lt = fmt(rail);
            cell20Gt = fmt(rail);
          } else if (!Number.isFinite(ltField)) {
            cell20Lt = fmt(rail);
          } else if (!Number.isFinite(gtField)) {
            /* Явно указан только один тариф (<24 или >24) — не копировать агрегат railRub во второй столбец. */
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

  /** КП (итоговая таблица): суммы вверх до целого; только ASCII-цифры (без запятой как разделителя дробной части). */
  function formatKpTariffCeilPlain(value) {
    const n = rateNumericOrNaN(value);
    if (!Number.isFinite(n)) {
      return "—";
    }
    return String(Math.ceil(n));
  }

  const KP_DIRECTIONS_COL_COUNT_MAX = 18;

  function kpStripTagsToPlain(fragment) {
    return String(fragment || "")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function kpTableCellLooksVacant(fragment) {
    const text = kpStripTagsToPlain(fragment);
    if (!text || text === "—" || text === "-" || text === "–") {
      return true;
    }
    const n = rateNumericOrNaN(text.replace(/\s/g, ""));
    return Number.isFinite(n) && n === 0;
  }

  function gatherKpUniqueShippingLinesForLead(ratesExpanded) {
    const set = new Set();
    ratesExpanded.forEach((rate) => {
      const disp = formatShippingLineDisplay(rate);
      const t = String(disp || "")
        .trim()
        .replace(/\s+/g, " ");
      if (t && t !== "—") {
        set.add(t);
      }
    });
    return [...set].sort((a, b) =>
      a.localeCompare(b, "ru", { sensitivity: "base" })
    );
  }

  function buildKpChinaFarEastLeadText(linesUnique) {
    if (!linesUnique.length) {
      return "Доставка грузов из Китая через Дальний Восток пароходами морских линий.";
    }
    const noun = linesUnique.length === 1 ? "морской линии" : "морских линий";
    return (
      "Доставка грузов из Китая через Дальний Восток пароходами " +
      noun +
      " " +
      linesUnique.join(", ") +
      "."
    );
  }

  function formatDeliveryExwFcaRegistryCell(rate) {
    const dt = normalizeDeliveryTerms(rate?.deliveryTerms);
    const n = rateNumericOrNaN(rate?.deliveryExwFcaUsd);
    if (dt === "FOB") {
      return "—";
    }
    if (!Number.isFinite(n) || n < 0) {
      return "—";
    }
    return dt + ": " + formatNumber(n);
  }

  function formatDeliveryExwFcaKpCell(rate) {
    const dt = normalizeDeliveryTerms(rate?.deliveryTerms);
    const n = rateNumericOrNaN(rate?.deliveryExwFcaUsd);
    if (dt === "FOB") {
      return "—";
    }
    if (!Number.isFinite(n) || n < 0) {
      return "—";
    }
    return dt + " " + formatKpTariffCeilPlain(n);
  }

  /** Первая строка заголовков ЖД в КП: «POD – станция» из реестра (по первой строке набора КП). */
  function kpBuildPodStationPrimaryLineForHead(sampleRate) {
    if (!sampleRate) {
      return "POD – ст. назнач.";
    }
    const pod = String(sampleRate.railTerminal || "").trim().replace(/\s+/g, " ");
    const st = formatDestinationStations(
      sampleRate.destinationStations || [sampleRate.destinationStation]
    )
      .trim()
      .replace(/\s+/g, " ");
    if (!pod && !st) {
      return "POD – ст. назнач.";
    }
    if (!pod) {
      return st;
    }
    if (!st) {
      return pod;
    }
    return pod + " – " + st;
  }

  function kpBuildAutoColumnHeadTh(sampleRate) {
    if (!sampleRate) {
      return '<th scope="col">Авто, RUB</th>';
    }
    const st = formatDestinationStations(
      sampleRate.destinationStations || [sampleRate.destinationStation]
    )
      .trim()
      .replace(/\s+/g, " ");
    const addr = formatWarehouseAddresses(sampleRate).trim().replace(/\s+/g, " ");
    const s = st || "—";
    const a = addr || "—";
    const full = "Авто (" + s + " — " + a + "), RUB";
    return (
      '<th scope="col" title="' +
      escapeHtml(full) +
      '">Авто (' +
      escapeHtml(s) +
      " — " +
      escapeHtml(a) +
      "), RUB</th>"
    );
  }

  function buildKpDirectionsTableHtml(expandedRates) {
    const headSample =
      Array.isArray(expandedRates) && expandedRates.length
        ? expandedRates[0]
        : null;
    const routePrimaryRaw = kpBuildPodStationPrimaryLineForHead(headSample);
    const railLtTh =
      '<th scope="col" title="' +
      escapeHtml(routePrimaryRaw + " — ЖД 20' <24 т, RUB") +
      '">ЖД 20&#39;<br />&lt;24т</th>';
    const railGtTh =
      '<th scope="col" title="' +
      escapeHtml(routePrimaryRaw + " — ЖД 20' >24 т, RUB") +
      '">ЖД 20&#39;<br />&gt;24т</th>';
    const rail40Th =
      '<th scope="col" title="' +
      escapeHtml(routePrimaryRaw + " — ЖД 40' HQ, RUB") +
      '">ЖД 40&#39;<br />HQ</th>';
    const autoColHeadHtml = kpBuildAutoColumnHeadTh(headSample);

    const rail3Memo = new WeakMap();
    function kpRailTripleForRate(rate) {
      let cached = rail3Memo.get(rate);
      if (!cached) {
        cached = formatRegistryRailTriple(rate, formatKpTariffCeilPlain);
        rail3Memo.set(rate, cached);
      }
      return cached;
    }

    const colDefs = [
      {
        collapse: false,
        screenOnly: false,
        head: '<th scope="col">Incoterms</th>',
        cell: (rate) =>
          escapeHtml(normalizeDeliveryTerms(rate?.deliveryTerms)),
      },
      {
        collapse: false,
        screenOnly: false,
        head: '<th scope="col">POL</th>',
        cell: (rate) =>
          escapeHtml(
            formatOriginPorts(rate.originPorts || [rate.origin])
          ),
      },
      {
        collapse: true,
        screenOnly: false,
        head: '<th scope="col">POD</th>',
        cell: (rate) => escapeHtml(rate.railTerminal || "—"),
      },
      {
        collapse: true,
        screenOnly: false,
        head: '<th scope="col">Станция назначения</th>',
        cell: (rate) =>
          escapeHtml(
            formatDestinationStations(
              rate.destinationStations || [rate.destinationStation]
            )
          ),
      },
      {
        collapse: true,
        screenOnly: false,
        head: '<th scope="col">Таможня</th>',
        cell: (rate) =>
          escapeHtml(formatCustomsClearance(rate.customsClearance)),
      },
      {
        collapse: true,
        screenOnly: false,
        head: '<th scope="col">Ближайшие выходы</th>',
        cell: (rate) =>
          escapeHtml(
            formatSailingDates(rate.nextSailingDates || rate.nextSailing)
          ),
      },
      {
        collapse: false,
        screenOnly: false,
        head: '<th scope="col">Морская линия</th>',
        cell: (rate) => escapeHtml(formatShippingLineDisplay(rate)),
      },
      {
        collapse: false,
        screenOnly: false,
        head: '<th scope="col">Контейнер</th>',
        cell: (rate) =>
          escapeHtml(formatContainerTypesDisplay(rate)),
      },
      {
        collapse: true,
        screenOnly: false,
        head: '<th scope="col">Фрахт, USD</th>',
        cell: (rate) => formatKpTariffCeilPlain(rate.seaUsd),
      },
      {
        collapse: true,
        screenOnly: false,
        head:
          '<th scope="col" title="Стоимость EXW или FCA (USD) при соответствующих Incoterms">EXW/FCA,<br />USD</th>',
        cell: (rate) => escapeHtml(formatDeliveryExwFcaKpCell(rate)),
      },
      {
        collapse: true,
        screenOnly: false,
        head: railLtTh,
        cell: (rate) => kpRailTripleForRate(rate).cell20Lt,
      },
      {
        collapse: true,
        screenOnly: false,
        head: railGtTh,
        cell: (rate) => kpRailTripleForRate(rate).cell20Gt,
      },
      {
        collapse: true,
        screenOnly: false,
        head: rail40Th,
        cell: (rate) => kpRailTripleForRate(rate).cell40,
      },
      {
        collapse: true,
        screenOnly: false,
        head: autoColHeadHtml,
        cell: (rate) => formatKpTariffCeilPlain(rate.autoRub),
      },
      {
        collapse: true,
        screenOnly: true,
        head:
          '<th scope="col" class="kp-col-screen-only">Транзит,<br />дней</th>',
        cell: (rate) => formatNumber(rate.transitDays),
      },
      {
        collapse: true,
        screenOnly: false,
        head:
          '<th scope="col">Срок действия<br />тарифа</th>',
        cell: (rate) => escapeHtml(formatTariffValidityRangeLabel(rate)),
      },
      {
        collapse: true,
        screenOnly: true,
        head:
          '<th scope="col" class="kp-col-screen-only">Комментарий</th>',
        cell: (rate) => escapeHtml(rate.manager || "—"),
      },
    ];

    const matrix = expandedRates.map((rate) =>
      colDefs.map((d) => d.cell(rate))
    );

    const keep = colDefs.map((d, j) => {
      if (!d.collapse) {
        return true;
      }
      if (!matrix.length) {
        return true;
      }
      return !matrix.every((row) => kpTableCellLooksVacant(row[j]));
    });

    const theadHtml =
      "<tr>" +
      colDefs
        .map((d, idx) => (keep[idx] ? d.head : ""))
        .filter(Boolean)
        .join("") +
      "</tr>";

    const visibleCount = keep.filter(Boolean).length;

    const bodyRows = expandedRates.map((rate, ri) => {
      const frag = matrix[ri];
      const tds = colDefs
        .map((d, j) => ({ d, html: frag[j], j }))
        .filter(({ j }) => keep[j])
        .map(({ d, html }) => {
          const cls = d.screenOnly ? ' class="kp-col-screen-only"' : "";
          return "<td" + cls + ">" + html + "</td>";
        });
      return "<tr>" + tds.join("") + "</tr>";
    });

    return {
      theadHtml,
      tbodyHtml: bodyRows.join(""),
      colCount: visibleCount || KP_DIRECTIONS_COL_COUNT_MAX,
    };
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

  function formatWarehouseAddresses(rate) {
    const list = getWarehouseAddressesForRate(rate);
    return list.length ? list.join(", ") : "—";
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
      const seaRouteRowsRaw = Array.isArray(rate.seaRouteRows) ? rate.seaRouteRows : [];
      const seaUsds = Array.isArray(rate.seaUsds) ? rate.seaUsds : [rate.seaUsd];
      const autoRubs = Array.isArray(rate.autoRubs) ? rate.autoRubs : [rate.autoRub];
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
          row.origin ||
            routeCombos[Math.min(index, Math.max(0, routeCombos.length - 1))]
              ?.origin ||
            ""
        ),
        shippingLine: String(
          row.shippingLine ||
            routeCombos[Math.min(index, Math.max(0, routeCombos.length - 1))]
              ?.shippingLine ||
            ""
        )
          .trim()
          .replace(/\s+/g, " "),
      }));
      origins.forEach((origin, originIndex) => {
        shippingLines.forEach((line, lineIndex) => {
          const bundleIdx = originIndex * shippingLines.length + lineIndex;
          const fromSlot = Number(seaUsds[bundleIdx]);
          const fromRate = Number(rate.seaUsd);
          const matching = seaRouteRowsNormalized.filter(
            (row) =>
              normalizeOriginPortToken(row.origin) ===
                normalizeOriginPortToken(origin) &&
              normalizeShippingLineToken(row.shippingLine) ===
                normalizeShippingLineToken(line)
          );
          function pushExpandedForRouteRow(routeRow) {
            let seaUsdValue = routeRow ? Number(routeRow.seaUsd) : Number.NaN;
            if (!Number.isFinite(seaUsdValue) || seaUsdValue < 0) {
              seaUsdValue = Number.isFinite(fromSlot)
                ? fromSlot
                : Number.isFinite(fromRate)
                  ? fromRate
                  : Number.NaN;
            }
            const sailingDate = routeRow
              ? String(routeRow.sailingDate || "")
              : "";
            const slot = routeRow
              ? normalizeContainerSlotValue(routeRow.containerSlot)
              : normalizeContainerSlotValue(rate.containerType);
            const ct = slot === "40HQ" ? "40HQ" : "20FT";
            let railRub20Lt24 = null;
            let railRub20Gt24 = null;
            let railRub40Hq = null;
            let railRub = Number.NaN;
            if (routeRow) {
              if (slot === "40HQ") {
                const n = rateNumericOrNaN(routeRow.railRub40Hq);
                if (Number.isFinite(n)) {
                  railRub40Hq = n;
                  railRub = n;
                }
              } else if (slot === "20LT24") {
                const n = rateNumericOrNaN(routeRow.railRub20Lt24);
                if (Number.isFinite(n)) {
                  railRub20Lt24 = n;
                  railRub = n;
                }
              } else {
                const n = rateNumericOrNaN(routeRow.railRub20Gt24);
                if (Number.isFinite(n)) {
                  railRub20Gt24 = n;
                  railRub = n;
                }
              }
            }
            if (!Number.isFinite(railRub)) {
              railRub = rateNumericOrNaN(rate.railRub);
              railRub20Lt24 = rate.railRub20Lt24;
              railRub20Gt24 = rate.railRub20Gt24;
              railRub40Hq = rate.railRub40Hq;
            }
            const podTerminal = routeRow
              ? String(routeRow.dvTerminal || "").trim()
              : String(rate.railTerminal || "").trim();
            const destStation = routeRow
              ? String(routeRow.destinationStation || "").trim()
              : String(rate.destinationStation || "").trim();
            const destStationsForRow = routeRow
              ? destStation
                ? [destStation]
                : []
              : Array.isArray(rate.destinationStations) && rate.destinationStations.length
                ? rate.destinationStations
                : destStation
                  ? [destStation]
                  : [];
            const unloadParts = routeRow
              ? String(routeRow.unloadAddress || "")
                  .split(";")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
            const addrLoop =
              routeRow && unloadParts.length
                ? unloadParts
                : addresses.length
                  ? addresses
                  : [""];
            addrLoop.forEach((address, addressIndex) => {
              const rowAuto = routeRow
                ? rateNumericOrNaN(routeRow.autoRub)
                : Number.NaN;
              const autoRubValue = Number.isFinite(rowAuto)
                ? rowAuto
                : Number(autoRubs[addressIndex]);
              expanded.push({
                ...rate,
                origin: String(origin || "").trim().toUpperCase(),
                originPorts: [String(origin || "").trim().toUpperCase()],
                railTerminal: podTerminal || String(rate.railTerminal || "").trim(),
                destinationStation:
                  destStation || String(rate.destinationStation || "").trim(),
                destinationStations:
                  destStationsForRow.length > 0
                    ? destStationsForRow
                    : rate.destinationStations,
                cargoDepartureTerminal: routeRow
                  ? podTerminal || rate.cargoDepartureTerminal
                  : rate.cargoDepartureTerminal,
                cargoDestinationStation: routeRow
                  ? destStation || rate.cargoDestinationStation
                  : rate.cargoDestinationStation,
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
                containerType: routeRow ? ct : String(rate.containerType || "40HQ"),
                containerTypes: routeRow ? [ct] : getRateContainerTypes(rate),
                railRub,
                railRub20Lt24,
                railRub20Gt24,
                railRub40Hq,
                seaRouteRows: routeRow ? [routeRow] : rate.seaRouteRows,
              });
            });
          }
          if (matching.length) {
            matching.forEach((routeRow) => pushExpandedForRouteRow(routeRow));
          } else {
            pushExpandedForRouteRow(null);
          }
        });
      });
    });
    return expanded;
  }

  function renderTable(rates, destination, filterYear, filterMonth) {
    const sorted = [...rates].sort(compareRatesForPublication);
    const filteredBase = sorted.filter(
      (item) =>
        item.destination === destination &&
        rateOverlapsPublicationMonth(item, filterYear, filterMonth)
    );

    if (!filteredBase.length) {
      tbody.innerHTML =
        '<tr><td colspan="20">В выбранной группе (направление и календарный месяц в шапке таблицы; учитывается пересечение со сроком действия тарифа) ставок пока нет.</td></tr>';
      syncCbrSortBanner();
      refreshSalesWorksetTable(rates);
      return;
    }

    const expandedBase = expandRatesByRouteDimensions(filteredBase);
    const filtered = applyPublicationTableFilters(expandedBase);
    if (!filtered.length) {
      tbody.innerHTML =
        '<tr><td colspan="20">Под выбранные порты, типы контейнера, морские линии или букирующих агентов ставок не найдено — измените галочки или «Не фильтровать».</td></tr>';
      syncCbrSortBanner();
      refreshSalesWorksetTable(rates);
      return;
    }

    let displayRows = filtered;
    if (
      publicationSortMode === "cbr_total_asc" &&
      typeof cbrRubPerUsd === "number" &&
      cbrRubPerUsd > 0
    ) {
      displayRows.sort((a, b) => {
        const ta = computeTotalDeliveryRub(a, cbrRubPerUsd);
        const tb = computeTotalDeliveryRub(b, cbrRubPerUsd);
        const na = Number.isNaN(ta);
        const nb = Number.isNaN(tb);
        if (na && nb) {
          return 0;
        }
        if (na) {
          return 1;
        }
        if (nb) {
          return -1;
        }
        if (ta === tb) {
          return String(b.updatedAt || "").localeCompare(
            String(a.updatedAt || "")
          );
        }
        return ta - tb;
      });
    }

    tbody.innerHTML = displayRows
      .map((rate) => {
        const periodLabel = formatTariffValidityRangeLabel(rate);
        const rail3 = formatRegistryRailTriple(rate);

        return (
          "<tr>" +
          "<td>" +
          escapeHtml(normalizeDeliveryTerms(rate.deliveryTerms)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatOriginPorts(rate.originPorts || [rate.origin])) +
          "</td>" +
          "<td>" +
          escapeHtml(rate.railTerminal || "—") +
          "</td>" +
          "<td>" +
          escapeHtml(
            formatDestinationStations(
              rate.destinationStations || [rate.destinationStation]
            )
          ) +
          "</td>" +
          "<td>" +
          escapeHtml(formatCustomsClearance(rate.customsClearance)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatSailingDates(rate.nextSailingDates || rate.nextSailing)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatShippingLineDisplay(rate)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatContainerTypesDisplay(rate)) +
          "</td>" +
          "<td>" +
          formatNumber(rate.seaUsd) +
          "</td>" +
          "<td>" +
          escapeHtml(formatDeliveryExwFcaRegistryCell(rate)) +
          "</td>" +
          '<td class="no-print">' +
          escapeHtml(formatBookingAgentDisplay(rate)) +
          "</td>" +
          "<td>" +
          rail3.cell20Lt +
          "</td>" +
          "<td>" +
          rail3.cell20Gt +
          "</td>" +
          "<td>" +
          rail3.cell40 +
          "</td>" +
          "<td>" +
          formatNumber(rate.autoRub) +
          "</td>" +
          "<td>" +
          formatNumber(rate.transitDays) +
          "</td>" +
          "<td>" +
          escapeHtml(periodLabel) +
          "</td>" +
          "<td>" +
          escapeHtml(formatDate(rate.updatedAt)) +
          "</td>" +
          "<td>" +
          escapeHtml(rate.manager || "—") +
          "</td>" +
          '<td class="no-print"><button type="button" class="btn-row-delete" data-action="delete" data-id="' +
          escapeHtml(rate.id) +
          '">Удалить</button></td>' +
          "</tr>"
        );
      })
      .join("");
    syncCbrSortBanner();
    refreshSalesWorksetTable(rates);
  }

  function syncSalesWorksetChrome() {
    const hasWs =
      Array.isArray(salesWorksetIds) && salesWorksetIds.length > 0;
    if (salesWorksetClearBtn instanceof HTMLButtonElement) {
      salesWorksetClearBtn.disabled = !hasWs;
    }
    if (salesPrintBtn instanceof HTMLButtonElement) {
      salesPrintBtn.disabled = !hasWs;
    }
  }

  function syncSalesPrintMeta() {
    if (!(salesPrintMeta instanceof HTMLElement)) {
      return;
    }
    const dest = activeDestination || "—";
    const monthIndex = Math.max(0, Math.min(11, Number(activeMonth) - 1));
    const monthName = months[monthIndex] || "";
    const n = Array.isArray(salesWorksetIds) ? salesWorksetIds.length : 0;
    const route = "ДВ → " + dest;
    salesPrintMeta.textContent =
      route +
      " · " +
      monthName +
      " " +
      String(activeYear || "") +
      (n > 0
        ? " · строк в отборе: " + n
        : " · сформируйте таблицу кнопкой выше");
  }

  async function triggerSalesWorksetPrint() {
    if (!Array.isArray(salesWorksetIds) || !salesWorksetIds.length) {
      setStatus("Сначала сформируйте таблицу для продаж.", "error");
      return;
    }
    const allRates = await loadRates();
    buildSalesKpDocument(allRates, true);
    syncSalesPrintMeta();
    document.body.classList.add("printing-sales-offer");
    let settled = false;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      document.body.classList.remove("printing-sales-offer");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.setTimeout(done, 3500);
    requestAnimationFrame(() => {
      window.print();
    });
  }

  function encodeSharePayload(payload) {
    try {
      return btoa(
        encodeURIComponent(JSON.stringify(payload)).replace(
          /%([0-9A-F]{2})/g,
          (_, p1) => String.fromCharCode(Number.parseInt(p1, 16))
        )
      );
    } catch {
      return "";
    }
  }

  function decodeSharePayload(raw) {
    try {
      const json = decodeURIComponent(
        Array.prototype.map
          .call(atob(String(raw || "")), (char) =>
            "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2)
          )
          .join("")
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function getCheckedFilterValues(container, inputName) {
    return [
      ...container.querySelectorAll('input[name="' + inputName + '"]:checked'),
    ]
      .map((node) =>
        node instanceof HTMLInputElement ? String(node.value || "").trim() : ""
      )
      .filter(Boolean);
  }

  function applyCheckedFilterValues(container, inputName, values) {
    const selected = new Set(
      (Array.isArray(values) ? values : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    );
    [...container.querySelectorAll('input[name="' + inputName + '"]')].forEach((node) => {
      if (!(node instanceof HTMLInputElement)) {
        return;
      }
      node.checked = selected.has(String(node.value || "").trim());
    });
  }

  function getPublicationFilterSharePayload() {
    return {
      v: 1,
      destination: activeDestination,
      year: activeYear,
      month: activeMonth,
      originPorts: getCheckedFilterValues(originPortFiltersWrap, "filterOriginPort"),
      containerTypes: getCheckedFilterValues(
        containerTypeFiltersWrap,
        "filterContainerType"
      ),
      shippingLines: getCheckedFilterValues(lineFiltersWrap, "filterShippingLine"),
      bookingAgents: getCheckedFilterValues(agentFiltersWrap, "filterBookingAgent"),
    };
  }

  async function hydratePublicationFiltersFromSharedLink() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(FILTER_SHARE_PARAM_KEY);
    if (!raw) {
      return;
    }
    const payload = decodeSharePayload(raw);
    if (!payload || typeof payload !== "object") {
      return;
    }

    const destination = String(payload.destination || "").trim();
    if (DESTINATIONS.includes(destination)) {
      activeDestination = destination;
    }
    const year = Number(payload.year);
    if (Number.isFinite(year) && year > 0) {
      activeYear = year;
    }
    const month = Number(payload.month);
    if (Number.isFinite(month) && month >= 1 && month <= 12) {
      activeMonth = month;
    }

    const rates = await loadRates();
    fullPublicationRefresh(rates);

    applyCheckedFilterValues(
      originPortFiltersWrap,
      "filterOriginPort",
      payload.originPorts
    );
    applyCheckedFilterValues(
      containerTypeFiltersWrap,
      "filterContainerType",
      payload.containerTypes
    );
    applyCheckedFilterValues(
      lineFiltersWrap,
      "filterShippingLine",
      payload.shippingLines
    );
    applyCheckedFilterValues(
      agentFiltersWrap,
      "filterBookingAgent",
      payload.bookingAgents
    );

    fullPublicationRefresh(rates);
  }

  function setShareStatus(text, isError) {
    if (!(salesShareStatus instanceof HTMLElement)) {
      return;
    }
    salesShareStatus.textContent = text;
    salesShareStatus.style.color = isError ? "#b91c1c" : "";
  }

  /**
   * execCommand(copy) чаще срабатывает без Clipboard API; без readonly лучше на iOS.
   */
  function copyTextViaExecCommand(text) {
    const value = String(text || "");
    if (!value) {
      return false;
    }
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("aria-hidden", "true");
    ta.setAttribute("autocomplete", "off");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.padding = "0";
    ta.style.margin = "0";
    ta.style.border = "none";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  async function copyTextToClipboardBestEffort(text) {
    const value = String(text || "");
    if (!value) {
      return false;
    }
    if (copyTextViaExecCommand(value)) {
      return true;
    }
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {
        /* нет жеста пользователя / политика браузера */
      }
    }
    return false;
  }

  /** Двухшаговое копирование КП: после await loadRates() жест снят — второй клик даёт новый жест. */
  let kpSharePendingCopyUrl = "";
  let kpSharePendingFingerprint = "";
  let kpSharePendingExpiresMs = 0;

  function buildKpSalesShareFingerprint() {
    return [
      [...(salesWorksetIds || [])].map(normalizeRateId).sort().join("\u001f"),
      String(activeDestination),
      String(activeYear),
      String(activeMonth),
      String(salesKpClientCompanyInput?.value || ""),
      String(salesKpRecipientFioInput?.value || ""),
      String(salesKpManagerSelect?.value || ""),
      String(salesKpCurrencyTermsInput?.value || ""),
      String(salesKpPaymentTermsInput?.value || ""),
      String(salesKpInsuranceTermsInput?.value || ""),
      String(salesManagerEmailInput?.value || ""),
    ].join("\u007f");
  }

  async function copyPreparedSalesKpUrlToClipboard(url) {
    const value = String(url || "");
    if (!value) {
      return false;
    }
    if (copyTextViaExecCommand(value)) {
      return true;
    }
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {
        /* ignore */
      }
    }
    return false;
  }

  async function copySalesKpShareLink() {
    if (!Array.isArray(salesWorksetIds) || !salesWorksetIds.length) {
      setShareStatus("Сначала сформируйте таблицу для продаж.", true);
      return;
    }
    const fp = buildKpSalesShareFingerprint();
    const now = Date.now();
    if (
      kpSharePendingCopyUrl &&
      kpSharePendingFingerprint === fp &&
      now < kpSharePendingExpiresMs
    ) {
      const urlSnapshot = kpSharePendingCopyUrl;
      const copied = await copyPreparedSalesKpUrlToClipboard(urlSnapshot);
      kpSharePendingCopyUrl = "";
      kpSharePendingFingerprint = "";
      kpSharePendingExpiresMs = 0;
      if (copied) {
        setShareStatus("Ссылка КП скопирована в буфер обмена.", false);
      } else {
        setShareStatus(
          "Не удалось записать в буфер. Откроется поле — выделите ссылку и скопируйте вручную.",
          true
        );
        try {
          window.prompt(
            "Ссылка КП — выделите и скопируйте (⌘C / Ctrl+C):",
            urlSnapshot
          );
        } catch (_) {
          setShareStatus(
            "Скопируйте ссылку из диалога выше или откройте сайт по HTTPS.",
            true
          );
        }
      }
      return;
    }

    const payload = {
      v: 1,
      createdAt: new Date().toISOString(),
      destination: activeDestination,
      year: activeYear,
      month: activeMonth,
      salesWorksetIds: salesWorksetIds,
      rates: (await loadRates()).filter((r) => salesWorksetIds.includes(normalizeRateId(r.id))),
      clientCompany: String(salesKpClientCompanyInput?.value || "").trim(),
      recipientFio: String(salesKpRecipientFioInput?.value || "").trim(),
      managerId: String(salesKpManagerSelect?.value || "vlad").trim(),
      currencyTerms: String(salesKpCurrencyTermsInput?.value || "").trim(),
      paymentTerms: String(salesKpPaymentTermsInput?.value || "").trim(),
      insuranceTerms: String(salesKpInsuranceTermsInput?.value || "").trim(),
      managerEmail: String(salesManagerEmailInput?.value || "").trim(),
    };
    const encoded = encodeSharePayload(payload);
    if (!encoded) {
      setShareStatus("Не удалось сформировать ссылку КП.", true);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set(SHARE_PARAM_KEY, encoded);
    url.searchParams.set("view", "kp");
    const shareUrl = url.toString();

    kpSharePendingCopyUrl = shareUrl;
    kpSharePendingFingerprint = fp;
    kpSharePendingExpiresMs = now + 4 * 60 * 1000;

    setShareStatus(
      "Ссылка готова. Нажмите «Скопировать ссылку КП» ещё раз — тогда браузер разрешит запись в буфер.",
      false
    );
  }

  async function hydrateSalesKpFromSharedLink() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(SHARE_PARAM_KEY);
    if (!raw) {
      return;
    }
    const payload = decodeSharePayload(raw);
    if (!payload || typeof payload !== "object") {
      return;
    }
    const sharedRates = Array.isArray(payload.rates) ? payload.rates : [];
    if (sharedRates.length) {
      try {
        await saveRates(sharedRates);
        refreshAutocompleteLists(sharedRates);
      } catch (error) {
        console.error("shared rates restore failed:", error);
      }
    }
    salesWorksetIds = Array.isArray(payload.salesWorksetIds)
      ? dedupePreserveOrder(payload.salesWorksetIds)
      : [];
    activeDestination = String(payload.destination || activeDestination);
    activeYear = Number(payload.year || activeYear);
    activeMonth = Number(payload.month || activeMonth);
    if (salesKpClientCompanyInput instanceof HTMLInputElement) {
      salesKpClientCompanyInput.value = String(payload.clientCompany || "");
    }
    if (salesKpRecipientFioInput instanceof HTMLInputElement) {
      salesKpRecipientFioInput.value = String(payload.recipientFio || "");
    }
    if (salesKpManagerSelect instanceof HTMLSelectElement) {
      salesKpManagerSelect.value = String(payload.managerId || "vlad");
    }
    if (salesKpCurrencyTermsInput instanceof HTMLInputElement) {
      salesKpCurrencyTermsInput.value = String(payload.currencyTerms || "");
    }
    if (salesKpPaymentTermsInput instanceof HTMLInputElement) {
      salesKpPaymentTermsInput.value = String(payload.paymentTerms || "");
    }
    if (salesKpInsuranceTermsInput instanceof HTMLInputElement) {
      salesKpInsuranceTermsInput.value = String(payload.insuranceTerms || "");
    }
    if (salesManagerEmailInput instanceof HTMLInputElement) {
      salesManagerEmailInput.value = String(payload.managerEmail || "");
    }
    syncFilterTabsActiveStates();
    fullPublicationRefresh(sharedRates.length ? sharedRates : await loadRates());
    if (params.get("view") === "kp") {
      document.body.classList.add("shared-kp-view");
      buildSalesKpDocument(sharedRates.length ? sharedRates : await loadRates(), false);
      const kpSheet = document.getElementById("sales-kp-print-sheet");
      if (kpSheet instanceof HTMLElement) {
        kpSheet.scrollIntoView({ block: "start" });
      }
      window.scrollTo(0, 0);
      setShareStatus(
        "Открыт режим просмотра КП по ссылке. Можно прокручивать весь документ.",
        false
      );
    }
    void reportSharedKpOpen(payload);
  }

  async function reportSharedKpOpen(payload) {
    if (!TRACKING_ENDPOINT) {
      return;
    }
    const managerEmail = String(payload?.managerEmail || "").trim();
    if (!managerEmail) {
      return;
    }
    const headers = {
      "Content-Type": "application/json",
    };
    if (TRACKING_WEBHOOK_SECRET) {
      headers["X-KP-Secret"] = TRACKING_WEBHOOK_SECRET;
    }
    try {
      const res = await fetch(TRACKING_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event: "kp_link_opened",
          openedAt: new Date().toISOString(),
          managerEmail: managerEmail,
          clientCompany: String(payload?.clientCompany || ""),
          recipientFio: String(payload?.recipientFio || ""),
          docNumber: salesKpLastDocNumber,
          destination: String(payload?.destination || ""),
          filterYear: payload?.year,
          filterMonth: payload?.month,
          openingPageUrl:
            typeof window !== "undefined"
              ? String(window.location.href || "").slice(0, 2048)
              : "",
        }),
      });
      if (!res.ok) {
        console.error("reportSharedKpOpen HTTP", res.status, await res.text());
      }
    } catch (e) {
      console.error("reportSharedKpOpen failed", e);
    }
  }

  function refreshSalesWorksetTable(allRates) {
    if (!(salesWorksetTbody instanceof HTMLElement)) {
      return;
    }
    const colspan = 7;

    syncSalesWorksetChrome();

    if (!Array.isArray(salesWorksetIds) || !salesWorksetIds.length) {
      salesWorksetTbody.innerHTML =
        '<tr><td colspan="' +
        colspan +
        '" class="sales-workset-placeholder">Таблица не сформирована. После нужного вида основного реестра нажмите «Сформировать таблицу для продаж».</td></tr>';
      return;
    }

    const byId = new Map();
    allRates.forEach((r) => {
      const k = normalizeRateId(r.id);
      if (!k) {
        return;
      }
      byId.set(k, r);
    });

    const rowsParts = [];

    salesWorksetIds.forEach((idRaw) => {
      const id = normalizeRateId(idRaw);
      if (!id) {
        return;
      }
      const rate = byId.get(id);
      if (!rate) {
        rowsParts.push(
          "<tr>" +
            "<td colspan=\"" +
            colspan +
            '" class="sales-workset-missing">' +
            "Ставка удалена из реестра (id было: " +
            escapeHtml(id) +
            ")" +
            "</td>" +
            "</tr>"
        );
        return;
      }

      const periodLabel = formatTariffValidityRangeLabel(rate);

      const expandedRates = expandRatesByRouteDimensions([rate]);
      expandedRates.forEach((expandedRate) => {
        rowsParts.push(
          "<tr data-rate-id=\"" +
          escapeHtml(id) +
          "\">" +
          "<td>" +
          escapeHtml(
            formatOriginPorts(expandedRate.originPorts || [expandedRate.origin])
          ) +
          "</td>" +
          "<td>" +
          escapeHtml(formatShippingLineDisplay(expandedRate)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatContainerTypesDisplay(expandedRate)) +
          "</td>" +
          "<td>" +
          formatNumber(expandedRate.seaUsd) +
          "</td>" +
          "<td>" +
          formatNumber(expandedRate.railRub) +
          "</td>" +
          "<td>" +
          escapeHtml(formatDate(expandedRate.updatedAt)) +
          "</td>" +
          "<td>" +
          escapeHtml(periodLabel) +
          "</td>" +
          "</tr>"
        );
      });
    });

    salesWorksetTbody.innerHTML = rowsParts.length
      ? rowsParts.join("")
      : '<tr><td colspan="' +
        colspan +
        '" class="sales-workset-placeholder">Нет данных по закреплённым id.</td></tr>';

    syncSalesPrintMeta();
    buildSalesKpDocument(allRates, false);
  }

  /** Уникальные адреса выгрузки из набора КП (порядок сохраняется). */
  function collectKpUnloadAddresses(expandedRates) {
    if (!Array.isArray(expandedRates) || !expandedRates.length) {
      return [];
    }
    const parts = [];
    const seen = new Set();
    expandedRates.forEach((r) => {
      const rawList = Array.isArray(r.warehouseAddresses)
        ? r.warehouseAddresses
        : [r.warehouseAddress];
      rawList.forEach((item) => {
        const d = String(item || "").trim().replace(/\s+/g, " ");
        if (!d) {
          return;
        }
        const k = d.toLocaleLowerCase("ru-RU");
        if (seen.has(k)) {
          return;
        }
        seen.add(k);
        parts.push(d);
      });
    });
    return parts;
  }

  /** Непустые адреса выгрузки из блока моря (уникальные, порядок полей в форме). */
  function collectBundleUnloadAddresses(bundle) {
    if (!(bundle instanceof HTMLElement)) {
      return [];
    }
    const out = [];
    const seen = new Set();
    bundle.querySelectorAll(".sea-route-unload").forEach((inp) => {
      if (!(inp instanceof HTMLInputElement)) {
        return;
      }
      const d = String(inp.value || "").trim().replace(/\s+/g, " ");
      if (!d) {
        return;
      }
      const k = d.toLocaleLowerCase("ru-RU");
      if (seen.has(k)) {
        return;
      }
      seen.add(k);
      out.push(d);
    });
    return out;
  }

  function buildSalesKpDocument(allRates, shouldIncrementSerial) {
    if (
      !(salesKpDocNum instanceof HTMLElement) ||
      !(salesKpDocDate instanceof HTMLElement) ||
      !(salesKpTbody instanceof HTMLElement)
    ) {
      return;
    }
    const now = new Date();
    if (shouldIncrementSerial || !salesKpLastDocNumber) {
      const clientCompany = String(salesKpClientCompanyInput?.value || "").trim();
      const prefix = getClientPrefix(clientCompany);
      const serial = getClientDailySerial(prefix, now, shouldIncrementSerial);
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yy = String(now.getFullYear()).slice(-2);
      salesKpLastDocNumber = "КП № FR/" + prefix + "-" + dd + mm + serial + "-" + yy;
      salesKpLastDocDate = formatDateRu(now);
    }
    salesKpDocNum.textContent = salesKpLastDocNumber;
    salesKpDocDate.textContent = salesKpLastDocDate;

    const autodeliveryLeadEl = document.getElementById(
      "sales-kp-autodelivery-lead"
    );
    const unloadAddressesKpEl = document.getElementById(
      "sales-kp-unload-addresses"
    );

    const managerId = String(salesKpManagerSelect?.value || "vlad").trim();
    const managerData = salesManagerCards[managerId] || salesManagerCards.vlad;
    const clientName = String(salesKpClientCompanyInput?.value || "").trim() || "—";
    const recipientFio = String(salesKpRecipientFioInput?.value || "").trim() || "—";
    const currencyTerms =
      String(salesKpCurrencyTermsInput?.value || "").trim() || "—";
    const paymentTerms =
      String(salesKpPaymentTermsInput?.value || "").trim() || "—";
    const insuranceTerms =
      String(salesKpInsuranceTermsInput?.value || "").trim() || "—";

    if (salesKpFromManager) {
      salesKpFromManager.textContent = managerData.fullName;
    }
    if (salesKpClientName) {
      salesKpClientName.textContent = clientName;
    }
    if (salesKpToRecipient) {
      salesKpToRecipient.textContent = recipientFio;
    }
    if (salesKpCurrency) {
      salesKpCurrency.textContent = currencyTerms;
    }
    if (salesKpPayment) {
      salesKpPayment.textContent = paymentTerms;
    }
    if (salesKpInsurance) {
      salesKpInsurance.textContent = insuranceTerms;
    }
    if (salesKpManagerCardName) {
      salesKpManagerCardName.textContent = managerData.fullName;
    }
    if (salesKpManagerCardDetail) {
      salesKpManagerCardDetail.innerHTML = managerData.detailHtml;
    }
    if (salesKpRouteSubtitle) {
      salesKpRouteSubtitle.textContent = "Мультимодальная схема Море + ЖД";
    }
    if (salesKpDestinationNode) {
      salesKpDestinationNode.textContent = String(activeDestination || "—");
    }

    const kpChinaLeadEl = document.getElementById("sales-kp-china-dv-lead");

    if (!Array.isArray(salesWorksetIds) || !salesWorksetIds.length) {
      if (kpChinaLeadEl instanceof HTMLElement) {
        kpChinaLeadEl.textContent = buildKpChinaFarEastLeadText([]);
      }
      if (salesKpTable instanceof HTMLTableElement) {
        const thead = salesKpTable.querySelector("thead");
        if (thead) {
          thead.innerHTML =
            "<tr>" +
            '<th colspan="' +
            String(KP_DIRECTIONS_COL_COUNT_MAX) +
            '" class="kp-table-placeholder-msg">' +
            "Заполняется после «Сформировать таблицу для продаж» или из ссылки КП." +
            "</th>" +
            "</tr>";
        }
      }
      salesKpTbody.innerHTML =
        '<tr><td colspan="' +
        String(KP_DIRECTIONS_COL_COUNT_MAX) +
        '">Таблица не сформирована. Нажмите «Сформировать таблицу для продаж».</td></tr>';
      if (autodeliveryLeadEl instanceof HTMLElement) {
        autodeliveryLeadEl.textContent =
          "Автодоставка до указанного склада выгрузки";
      }
      if (unloadAddressesKpEl instanceof HTMLElement) {
        unloadAddressesKpEl.innerHTML = "";
      }
      return;
    }

    const byId = new Map();
    allRates.forEach((rate) => {
      const id = normalizeRateId(rate.id);
      if (id) {
        byId.set(id, rate);
      }
    });

    const worksetRates = [];
    salesWorksetIds.forEach((idRaw) => {
      const id = normalizeRateId(idRaw);
      const rate = byId.get(id);
      if (!rate) {
        return;
      }
      worksetRates.push(rate);
    });

    const expandedWorksetRates = expandRatesByRouteDimensions(worksetRates);
    if (kpChinaLeadEl instanceof HTMLElement) {
      kpChinaLeadEl.textContent = buildKpChinaFarEastLeadText(
        gatherKpUniqueShippingLinesForLead(expandedWorksetRates)
      );
    }
    const unloadAddrs = collectKpUnloadAddresses(expandedWorksetRates);
    if (autodeliveryLeadEl instanceof HTMLElement) {
      autodeliveryLeadEl.textContent =
        unloadAddrs.length > 1
          ? "Автодоставка до указанных складов выгрузки"
          : "Автодоставка до указанного склада выгрузки";
    }
    if (unloadAddressesKpEl instanceof HTMLElement) {
      unloadAddressesKpEl.innerHTML = unloadAddrs.length
        ? unloadAddrs
            .map(
              (addr) =>
                '<div class="kp-cond-item"><span class="kp-cond-copy"><strong>Адрес выгрузки:</strong> ' +
                escapeHtml(addr) +
                "</span></div>"
            )
            .join("")
        : "";
    }

    const kpDir = buildKpDirectionsTableHtml(expandedWorksetRates);
    if (salesKpTable instanceof HTMLTableElement) {
      const thead = salesKpTable.querySelector("thead");
      if (thead) {
        thead.innerHTML = kpDir.theadHtml;
      }
    }
    const cc =
      kpDir.colCount > 0 ? kpDir.colCount : KP_DIRECTIONS_COL_COUNT_MAX;
    salesKpTbody.innerHTML = kpDir.tbodyHtml.trim()
      ? kpDir.tbodyHtml
      : '<tr><td colspan="' +
        String(cc) +
        '">Нет актуальных строк для печати КП.</td></tr>';
  }

  function getClientPrefix(companyName) {
    const cleaned = String(companyName || "").replace(/[^A-Za-zА-Яа-яЁё]/g, "");
    if (!cleaned) {
      return "XX";
    }
    return cleaned.slice(0, 2).toUpperCase().padEnd(2, "X");
  }

  function getClientDailySerial(prefix, date, increment) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yy = String(date.getFullYear()).slice(-2);
    const storageKey = "sales-kp-serial-" + prefix + "-" + dd + mm + yy;
    const current = Number(localStorage.getItem(storageKey) || "0");
    if (!increment) {
      const safe = current > 0 ? current : 1;
      return String(safe).padStart(2, "0");
    }
    const next = current + 1;
    localStorage.setItem(storageKey, String(next));
    return String(next).padStart(2, "0");
  }

  function formatDateRu(date) {
    return date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }) + " года";
  }

  function syncPrintRoute() {
    const routeLabel = "ДВ → " + activeDestination;
    if (printRouteTop) {
      printRouteTop.textContent = routeLabel;
    }
    if (printRouteBottom) {
      printRouteBottom.textContent = routeLabel;
    }
    syncSalesPrintMeta();
  }

  function datalistOptionWithLabelMarkup(value) {
    const escaped = escapeHtml(value);
    return '<option value="' + escaped + '">' + escaped + "</option>";
  }

  /**
   * WebKit/Safari часто не обновляет привязку подсказок после смены option в datalist.
   */
  function nudgeBookingAgentDatalistBindings() {
    const listId = bookingAgentSuggestions && bookingAgentSuggestions.id;
    if (!listId) {
      return;
    }
    const slotInputs = getBookingAgentSlotInputs();
    const seen = new Set();
    [...slotInputs].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      if (seen.has(input)) {
        return;
      }
      seen.add(input);
      if (input.getAttribute("list") !== listId) {
        return;
      }
      input.removeAttribute("list");
      void input.offsetHeight;
      input.setAttribute("list", listId);
    });
  }

  function getSelectedBookingAgentsFromQuickPicks() {
    return [
      ...bookingAgentQuickPicks.querySelectorAll(
        'input[name="bookingAgentQuickOptions"]:checked'
      ),
    ]
      .map((input) =>
        input instanceof HTMLInputElement ? String(input.value || "").trim() : ""
      )
      .filter(Boolean);
  }

  /** Собираем значение главного поля из чекбоксов (как терминалы/линии). */
  function syncBookingAgentQuickPicksToInput() {
    const selected = getSelectedBookingAgentsFromQuickPicks();
    distributeAgentNamesAcrossSlots(selected);
    syncBookingAgentLineVisibility();
    syncBookingAgentShippingLineDatalist();
    nudgeBookingAgentDatalistBindings();
  }

  /** Перед submit: если чекбоксы не трогали — сохраняем вручную введённое; иначе — как в решётке быстрого выбора. */
  function applyBookingAgentQuickPicksBeforeSubmit() {
    const selected = getSelectedBookingAgentsFromQuickPicks();
    if (selected.length) {
      distributeAgentNamesAcrossSlots(selected);
    }
    mergeBookingAgentSlotsToHiddenField();
    syncBookingAgentLineVisibility();
    syncBookingAgentShippingLineDatalist();
  }

  function bookingAgentDedupeKeysFromAllSlots() {
    const keys = new Set();
    getBookingAgentSlotInputs().forEach((input) => {
      String(input.value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((chunk) => {
          const k = normalizeBookingAgentDedupeKey(chunk);
          if (k) {
            keys.add(k);
          }
        });
    });
    return keys;
  }

  function syncBookingAgentInputToQuickPicks() {
    const selected = bookingAgentDedupeKeysFromAllSlots();
    [
      ...bookingAgentQuickPicks.querySelectorAll(
        'input[name="bookingAgentQuickOptions"]'
      ),
    ].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.checked = selected.has(normalizeBookingAgentDedupeKey(input.value));
    });
  }

  function rebuildBookingAgentQuickPickGrid(agentNamesAll) {
    const capped = bookingAgentPbSortDedupe(agentNamesAll).slice(
      0,
      MAX_BOOKING_AGENT_QUICK_PICKS
    );
    bookingAgentQuickPicks.innerHTML = capped
      .map((name) => {
        const escaped = escapeHtml(name);
        return (
          "<label>" +
          escaped +
          ' <input type="checkbox" name="bookingAgentQuickOptions" value="' +
          escaped +
          '" /></label>'
        );
      })
      .join("");
    syncBookingAgentInputToQuickPicks();
  }

  function refreshAutocompleteLists(rates) {
    const terminals = uniqueSorted(
      DEFAULT_RAIL_TERMINALS.concat(
        rates.map((item) => String(item.railTerminal || "").trim())
      )
    );
    const shippingLines = uniqueSorted(
      DEFAULT_SHIPPING_LINES.concat(
        rates.map((item) => String(item.shippingLine || "").trim()),
        readSavedList(LINES_KEY)
      )
    );
    const bookingAgents = uniqueSorted(
      DEFAULT_BOOKING_AGENT_SUGGESTIONS.concat(
        bookingAgentsPbCache.concat(
          rates.map((item) => String(item.bookingAgent || "").trim()),
          readSavedList(AGENTS_KEY)
        )
      )
    );
    const stationVals = [];
    rates.forEach((item) => {
      const list = Array.isArray(item.destinationStations)
        ? item.destinationStations
        : [item.destinationStation];
      list.forEach((s) => stationVals.push(String(s || "").trim()));
    });
    const stations = uniqueSorted(stationVals);
    terminalSuggestions.innerHTML = terminals
      .map((value) => datalistOptionWithLabelMarkup(value))
      .join("");
    shippingLineSuggestions.innerHTML = shippingLines
      .map((value) => datalistOptionWithLabelMarkup(value))
      .join("");
    bookingAgentSuggestions.innerHTML = bookingAgents
      .map((value) => datalistOptionWithLabelMarkup(value))
      .join("");
    stationSuggestions.innerHTML = stations
      .map((value) => datalistOptionWithLabelMarkup(value))
      .join("");
    sortDatalistOptions(terminalSuggestions);
    sortDatalistOptions(shippingLineSuggestions);
    sortDatalistOptions(bookingAgentSuggestions);
    sortDatalistOptions(stationSuggestions);
    rebuildBookingAgentQuickPickGrid(bookingAgents);
    syncBookingAgentShippingLineDatalist();
    nudgeBookingAgentDatalistBindings();
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "ru")
    );
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

  function formatWeightKg(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return "—";
    }
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 3,
    }).format(n);
  }

  function formatSecurityCostRub(value, cargoSecurity) {
    if (cargoSecurity !== "yes") {
      return "—";
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return "—";
    }
    return formatNumber(n);
  }

  function formatDate(isoString) {
    if (!isoString) {
      return "—";
    }
    return new Date(isoString).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatSailingDate(value) {
    if (!value) {
      return "—";
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
    return formatSailingDate(value);
  }

  function getSailingDates() {
    const inputs = [...sailingDatesWrap.querySelectorAll('input[name="nextSailingDates"]')];
    return inputs
      .map((input) => (input instanceof HTMLInputElement ? input.value : ""))
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function getOriginPorts() {
    const inputs = [...originPortsWrap.querySelectorAll('input[name="originPorts"]')];
    const unique = [];
    function addOriginCandidate(raw) {
      const normalized = String(raw || "")
        .trim()
        .toUpperCase();
      if (!normalized || unique.includes(normalized)) {
        return;
      }
      unique.push(normalized);
    }
    inputs.forEach((input) => {
      const raw = input instanceof HTMLInputElement ? input.value : "";
      String(raw || "")
        .split(",")
        .forEach((chunk) => {
          addOriginCandidate(chunk);
        });
      if (!String(raw || "").includes(",")) {
        addOriginCandidate(raw);
      }
    });
    const quickPicks = [
      ...originQuickPicks.querySelectorAll('input[name="originQuickPorts"]:checked'),
    ];
    quickPicks.forEach((input) => {
      const value =
        input instanceof HTMLInputElement ? input.value.trim().toUpperCase() : "";
      addOriginCandidate(value);
    });
    return unique;
  }

  function getShippingLinesFromInput() {
    /** Подмешиваем чекбоксы быстрого выбора: поле `#shippingLine` может не успеть обновиться в том же кадре события. */
    const unique = [];
    const seenNorm = new Set();
    function addLine(raw) {
      const line = String(raw || "")
        .trim()
        .replace(/\s+/g, " ");
      if (!line) {
        return;
      }
      const key = normalizeQuickOptionToken(line);
      if (seenNorm.has(key)) {
        return;
      }
      seenNorm.add(key);
      unique.push(line);
    }
    String(shippingLineInput.value || "")
      .split(",")
      .map((item) => item.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .forEach(addLine);
    getSelectedShippingLines().forEach(addLine);
    return unique;
  }

  /** Черновик дат тарифа при пересборе строк (ключ — normalizeShippingLineToken). */
  const tariffLineValidityDraft = {};

  function normalizeTariffLineWindowsFromRecord(rate) {
    const arr = Array.isArray(rate?.tariffLineWindows) ? rate.tariffLineWindows : null;
    if (arr && arr.length) {
      const out = [];
      for (let wi = 0; wi < arr.length; wi++) {
        const w = arr[wi];
        const sl = String(w?.shippingLine || "")
          .trim()
          .replace(/\s+/g, " ");
        const f = String(w?.tariffValidFrom || "").trim();
        const t = String(w?.tariffValidTo || "").trim();
        if (sl && f && t) {
          out.push({
            shippingLine: sl,
            tariffValidFrom: f,
            tariffValidTo: t,
          });
        }
      }
      if (out.length) {
        return out;
      }
    }
    const lines = getRateShippingLines(rate);
    const fIso = String(rate?.tariffValidFrom || "").trim();
    const tIso = String(rate?.tariffValidTo || "").trim();
    if (lines.length && fIso && tIso) {
      return lines.map((line) => ({
        shippingLine: String(line || "").trim(),
        tariffValidFrom: fIso,
        tariffValidTo: tIso,
      }));
    }
    return [];
  }

  function tariffKeySegmentFromWindows(windows) {
    if (!Array.isArray(windows) || !windows.length) {
      return "";
    }
    const sorted = [...windows].sort((a, b) => {
      const pa =
        normalizeShippingLineToken(a.shippingLine) +
        "\0" +
        a.tariffValidFrom +
        "\0" +
        a.tariffValidTo;
      const pb =
        normalizeShippingLineToken(b.shippingLine) +
        "\0" +
        b.tariffValidFrom +
        "\0" +
        b.tariffValidTo;
      return pa.localeCompare(pb, "ru", { sensitivity: "base" });
    });
    return sorted
      .map(
        (w) =>
          normalizeShippingLineToken(w.shippingLine) +
          "|" +
          w.tariffValidFrom +
          "|" +
          w.tariffValidTo
      )
      .join("||");
  }

  function tariffValidityBounds(rate) {
    const wins = normalizeTariffLineWindowsFromRecord(rate);
    if (wins.length) {
      let minT = Infinity;
      let maxT = -Infinity;
      let minD = null;
      let maxD = null;
      for (let i = 0; i < wins.length; i++) {
        const from = parseTariffIsoDateLocal(wins[i].tariffValidFrom);
        const to = parseTariffIsoDateLocal(wins[i].tariffValidTo);
        if (!from || !to) {
          continue;
        }
        const ft = from.getTime();
        const tt = to.getTime();
        if (ft < minT) {
          minT = ft;
          minD = from;
        }
        if (tt > maxT) {
          maxT = tt;
          maxD = to;
        }
      }
      if (minD && maxD) {
        return { from: minD, to: maxD };
      }
    }
    const fIso = String(rate?.tariffValidFrom || "").trim();
    const tIso = String(rate?.tariffValidTo || "").trim();
    if (fIso && tIso) {
      const from = parseTariffIsoDateLocal(fIso);
      const to = parseTariffIsoDateLocal(tIso);
      if (from && to) {
        return { from, to };
      }
    }
    return legacyTariffValidityRange(rate);
  }

  function rateOverlapsPublicationMonth(rate, filterYear, filterMonth) {
    const wins = normalizeTariffLineWindowsFromRecord(rate);
    const fy = Number(filterYear);
    const fm = Number(filterMonth);
    if (!Number.isFinite(fy) || !Number.isFinite(fm) || fm < 1 || fm > 12) {
      return false;
    }
    const monthEnd = new Date(fy, fm, 0);
    const monthStart = new Date(fy, fm - 1, 1);
    if (wins.length) {
      for (let i = 0; i < wins.length; i++) {
        const from = parseTariffIsoDateLocal(wins[i].tariffValidFrom);
        const to = parseTariffIsoDateLocal(wins[i].tariffValidTo);
        if (from && to && from <= monthEnd && to >= monthStart) {
          return true;
        }
      }
      return false;
    }
    const b = tariffValidityBounds(rate);
    if (!b) {
      return false;
    }
    return b.from <= monthEnd && b.to >= monthStart;
  }

  function compareRatesForPublication(a, b) {
    const ba = tariffValidityBounds(a);
    const bb = tariffValidityBounds(b);
    const ta = ba ? ba.from.getTime() : 0;
    const tb = bb ? bb.from.getTime() : 0;
    if (ta !== tb) {
      return tb - ta;
    }
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  }

  function formatTariffValidityRangeLabel(rate) {
    const b = tariffValidityBounds(rate);
    if (!b) {
      return "—";
    }
    return formatDateDdMmYy(b.from) + " – " + formatDateDdMmYy(b.to);
  }

  function tariffKeySegmentFromRecord(rate) {
    const wins = normalizeTariffLineWindowsFromRecord(rate);
    if (wins.length) {
      const seg = tariffKeySegmentFromWindows(wins);
      if (seg) {
        return seg;
      }
    }
    const f = String(rate?.tariffValidFrom || "").trim();
    const t = String(rate?.tariffValidTo || "").trim();
    if (f && t) {
      return f + "|" + t;
    }
    return (
      String(rate?.validMonth ?? "") +
      "|" +
      String(rate?.validYear ?? "") +
      "|" +
      String(rate?.validitySlot || "")
    );
  }

  function collectTariffLineWindowsFromDom() {
    if (!(tariffValidityRowsRoot instanceof HTMLElement)) {
      return [];
    }
    const out = [];
    tariffValidityRowsRoot.querySelectorAll(".tariff-validity-line-row").forEach(
      (node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        const name = String(node.dataset.lineDisplay || "").trim();
        const fInp = node.querySelector(".tariff-validity-from-input");
        const tInp = node.querySelector(".tariff-validity-to-input");
        const f = fInp instanceof HTMLInputElement ? fInp.value.trim() : "";
        const t = tInp instanceof HTMLInputElement ? tInp.value.trim() : "";
        if (name) {
          out.push({
            shippingLine: name,
            tariffValidFrom: f,
            tariffValidTo: t,
          });
        }
      }
    );
    return out;
  }

  function tariffKeySegmentFromFormData(formData) {
    void formData;
    return tariffKeySegmentFromWindows(collectTariffLineWindowsFromDom());
  }

  function escapeTariffAttr(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function snapshotTariffValidityDraftFromDom() {
    if (!(tariffValidityRowsRoot instanceof HTMLElement)) {
      return;
    }
    tariffValidityRowsRoot.querySelectorAll(".tariff-validity-line-row").forEach(
      (node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        const token = String(node.dataset.lineToken || "").trim();
        if (!token) {
          return;
        }
        const fInp = node.querySelector(".tariff-validity-from-input");
        const tInp = node.querySelector(".tariff-validity-to-input");
        const f = fInp instanceof HTMLInputElement ? fInp.value.trim() : "";
        const t = tInp instanceof HTMLInputElement ? tInp.value.trim() : "";
        if (f || t) {
          tariffLineValidityDraft[token] = { from: f, to: t };
        }
      }
    );
  }

  function syncTariffValidityRowsUi() {
    if (!(tariffValidityRowsRoot instanceof HTMLElement)) {
      return;
    }
    snapshotTariffValidityDraftFromDom();
    const lines = getShippingLinesFromInput();
    if (tariffValidityEmptyHint instanceof HTMLElement) {
      tariffValidityEmptyHint.hidden = lines.length > 0;
    }
    if (!lines.length) {
      tariffValidityRowsRoot.innerHTML = "";
      return;
    }
    const today = new Date();
    const defaultFrom = toIsoDateLocal(today);
    const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const defaultTo = toIsoDateLocal(endMonth);

    tariffValidityRowsRoot.innerHTML = lines
      .map((displayRaw) => {
        const display = String(displayRaw || "").trim().replace(/\s+/g, " ");
        const token = normalizeShippingLineToken(display);
        const escTok = escapeTariffAttr(token);
        const escDisp = escapeTariffAttr(display);
        return (
          '<div class="tariff-validity-line-row" data-line-token="' +
          escTok +
          '" data-line-display="' +
          escDisp +
          '">' +
          '<div class="tariff-validity-line-meta">' +
          '<span class="tariff-validity-line-badge">' +
          escDisp +
          "</span></div>" +
          '<div class="tariff-validity-range-row tariff-validity-range-row--lined">' +
          '<div class="tariff-validity-field">' +
          '<span class="tariff-validity-sub tariff-validity-sub--muted">С даты</span>' +
          '<input type="date" class="tariff-validity-from-input" required />' +
          "</div>" +
          '<span class="tariff-validity-dash">—</span>' +
          '<div class="tariff-validity-field">' +
          '<span class="tariff-validity-sub tariff-validity-sub--muted">По дату</span>' +
          '<input type="date" class="tariff-validity-to-input" required />' +
          "</div></div></div>"
        );
      })
      .join("");

    tariffValidityRowsRoot.querySelectorAll(".tariff-validity-line-row").forEach(
      (node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        const token = String(node.dataset.lineToken || "").trim();
        const draft = token ? tariffLineValidityDraft[token] : undefined;
        const fInp = node.querySelector(".tariff-validity-from-input");
        const tInp = node.querySelector(".tariff-validity-to-input");
        if (!(fInp instanceof HTMLInputElement) || !(tInp instanceof HTMLInputElement)) {
          return;
        }
        const fromDraft = draft?.from ? String(draft.from).trim() : "";
        const toDraft = draft?.to ? String(draft.to).trim() : "";
        fInp.value = fromDraft || defaultFrom;
        tInp.value = toDraft || defaultTo;
      }
    );
  }

  function wireTariffValidityInputs() {
    if (!(tariffValidityRowsRoot instanceof HTMLElement)) {
      return;
    }
    if (tariffValidityRowsRoot.dataset.tariffValidityWired === "1") {
      return;
    }
    tariffValidityRowsRoot.dataset.tariffValidityWired = "1";
    const validateRow = (row) => {
      if (!(row instanceof HTMLElement)) {
        return;
      }
      const fInp = row.querySelector(".tariff-validity-from-input");
      const tInp = row.querySelector(".tariff-validity-to-input");
      if (!(fInp instanceof HTMLInputElement) || !(tInp instanceof HTMLInputElement)) {
        return;
      }
      const a = parseTariffIsoDateLocal(fInp.value);
      const b = parseTariffIsoDateLocal(tInp.value);
      fInp.setCustomValidity("");
      tInp.setCustomValidity("");
      if (a && b && a.getTime() > b.getTime()) {
        tInp.setCustomValidity("Дата «по» не раньше даты «с».");
      }
    };
    tariffValidityRowsRoot.addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) {
        return;
      }
      if (
        !t.classList.contains("tariff-validity-from-input") &&
        !t.classList.contains("tariff-validity-to-input")
      ) {
        return;
      }
      const row = t.closest(".tariff-validity-line-row");
      validateRow(row instanceof HTMLElement ? row : null);
    });
    tariffValidityRowsRoot.addEventListener("change", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) {
        return;
      }
      if (
        !t.classList.contains("tariff-validity-from-input") &&
        !t.classList.contains("tariff-validity-to-input")
      ) {
        return;
      }
      const row = t.closest(".tariff-validity-line-row");
      validateRow(row instanceof HTMLElement ? row : null);
    });
  }

  function initTariffValidityDefaults() {
    syncTariffValidityRowsUi();
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

  function getDestinationStations() {
    const seenKeys = new Set();
    const unique = [];

    function addStationCandidate(raw) {
      const display = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
      if (!display) {
        return;
      }
      const key = display.toLocaleLowerCase("ru-RU");
      if (seenKeys.has(key)) {
        return;
      }
      seenKeys.add(key);
      unique.push(display);
    }

    [
      ...seaUsdWrap.querySelectorAll(".sea-route-station"),
    ].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      addStationCandidate(input.value);
    });

    const inputs = [
      ...destinationStationsWrap.querySelectorAll(
        'input[name="destinationStations"]'
      ),
    ];
    inputs.forEach((input) => {
      const raw = input instanceof HTMLInputElement ? input.value : "";
      String(raw || "")
        .split(",")
        .forEach((chunk) => addStationCandidate(chunk));
    });

    stationQuickPicks
      .querySelectorAll('input[name="destinationQuickStations"]:checked')
      .forEach((node) => {
        if (!(node instanceof HTMLInputElement)) {
          return;
        }
        addStationCandidate(node.value);
      });

    return unique;
  }

  function getWarehouseAddresses() {
    const seenKeys = new Set();
    const unique = [];
    function addWarehouseCandidate(raw) {
      const display = String(raw || "").trim().replace(/\s+/g, " ");
      if (!display) {
        return;
      }
      const key = display.toLocaleLowerCase("ru-RU");
      if (seenKeys.has(key)) {
        return;
      }
      seenKeys.add(key);
      unique.push(display);
    }
    [
      ...seaUsdWrap.querySelectorAll(".sea-route-unload"),
    ].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      addWarehouseCandidate(input.value);
    });
    [
      ...warehouseAddressesWrap.querySelectorAll('input[name="warehouseAddress"]'),
    ].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      addWarehouseCandidate(input.value);
    });
    return unique;
  }

  function syncQuickPickSelectionsToInputRows() {
    // Порты: как при клике по чекбоксам — все скрытые name=originPorts и поле «Название порта».
    syncOriginQuickPicksToInput();
    const selectedStations = [
      ...stationQuickPicks.querySelectorAll('input[name="destinationQuickStations"]:checked'),
    ]
      .map((node) => (node instanceof HTMLInputElement ? node.value.trim().replace(/\s+/g, " ") : ""))
      .filter(Boolean);

    const firstStationInput = destinationStationsWrap.querySelector(
      'input[name="destinationStations"]'
    );
    if (firstStationInput instanceof HTMLInputElement) {
      firstStationInput.value = selectedStations.join(", ");
    }
    if (newStationOptionInput instanceof HTMLInputElement) {
      newStationOptionInput.value = selectedStations.join(", ");
    }
  }

  function appendOriginPortRow(defaultValue) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "originPorts";
    input.value = defaultValue || "";
    originPortsWrap.appendChild(input);
  }

  function resetOriginPortRows() {
    originPortsWrap.innerHTML =
      '<input type="hidden" name="originPorts" id="origin-ports-primary" value="" />';
    [
      ...originQuickPicks.querySelectorAll('input[name="originQuickPorts"]'),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    syncOriginQuickPicksToInput();
  }

  function appendDestinationStationRow(defaultValue) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "destinationStations";
    input.value = defaultValue || "";
    destinationStationsWrap.appendChild(input);
    refreshCargoRouteSelectOptions();
  }

  function appendWarehouseAddressRow(defaultValue) {
    const row = document.createElement("div");
    row.className = "warehouse-address-row";

    const label = document.createElement("label");
    label.textContent = "Адрес склада выгрузки *";

    const controls = document.createElement("div");
    controls.className = "warehouse-address-controls";

    const input = document.createElement("input");
    input.name = "warehouseAddress";
    input.placeholder = "Например, МО, Подольск, Домодедовское ш., 12";
    input.value = defaultValue || "";
    input.required = true;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-remove-date";
    removeBtn.dataset.action = "remove-warehouse-address";
    removeBtn.textContent = "−";
    removeBtn.setAttribute("aria-label", "Удалить адрес выгрузки");

    controls.appendChild(input);
    controls.appendChild(removeBtn);
    row.appendChild(label);
    row.appendChild(controls);
    const autoSlot = document.createElement("div");
    autoSlot.className = "cost-follow cost-follow--auto";
    autoSlot.setAttribute("data-auto-rub-slot", "");
    row.appendChild(autoSlot);
    warehouseAddressesWrap.appendChild(row);
  }

  function resetDestinationStationRows() {
    destinationStationsWrap.innerHTML =
      '<input type="hidden" name="destinationStations" id="destination-stations-primary" value="" />';
    [
      ...stationQuickPicks.querySelectorAll(
        'input[name="destinationQuickStations"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    filterStationQuickPicksByDestination("");
    refreshCargoRouteSelectOptions();
  }

  function resetWarehouseAddressRows() {
    warehouseAddressesWrap.innerHTML =
      '<div class="warehouse-address-row"><label for="warehouseAddress-1">Адрес склада выгрузки 1 *</label><div class="warehouse-address-controls"><input id="warehouseAddress-1" name="warehouseAddress" required placeholder="Например, МО, Подольск, Домодедовское ш., 12" /><button type="button" id="add-warehouse-address-btn" class="btn-add-date" aria-label="Добавить адрес выгрузки">+</button></div><div class="cost-follow cost-follow--auto" data-auto-rub-slot></div></div>';
    const freshAddBtn = document.getElementById("add-warehouse-address-btn");
    if (freshAddBtn instanceof HTMLButtonElement) {
      freshAddBtn.addEventListener("click", () => {
        appendWarehouseAddressRow("");
        refreshWarehouseAddressRowLabels();
        syncAutoRubRowsToWarehouseAddresses();
      });
    }
  }

  function refreshWarehouseAddressRowLabels() {
    const rows = [...warehouseAddressesWrap.querySelectorAll(".warehouse-address-row")];
    rows.forEach((row, index) => {
      const idx = index + 1;
      const label = row.querySelector("label");
      const input = row.querySelector('input[name="warehouseAddress"]');
      if (!(label instanceof HTMLLabelElement) || !(input instanceof HTMLInputElement)) {
        return;
      }
      const inputId = "warehouseAddress-" + String(idx);
      input.id = inputId;
      label.htmlFor = inputId;
      label.textContent = "Адрес склада выгрузки " + String(idx) + " *";
    });
  }

  function getAutoRubValues() {
    return [
      ...autoDeliveryRowsWrap.querySelectorAll('input[name="autoRub"]'),
    ].map((input) => {
      const raw =
        input instanceof HTMLInputElement ? String(input.value || "").trim() : "";
      return raw === "" ? Number.NaN : Number(raw);
    });
  }

  function refreshDvTermInputFromBoxes(detailsInner, textInput) {
    const vals = [
      ...detailsInner.querySelectorAll(".sea-row-dv-term-cb:checked"),
    ]
      .map((n) => (n instanceof HTMLInputElement ? n.value.trim() : ""))
      .filter(Boolean);
    textInput.value = vals.join(", ");
  }

  function refreshStInputFromBoxes(detailsInner, textInput) {
    const vals = [
      ...detailsInner.querySelectorAll(".sea-row-station-cb:checked"),
    ]
      .map((n) => (n instanceof HTMLInputElement ? n.value.trim() : ""))
      .filter(Boolean);
    textInput.value = vals.join(", ");
  }

  function mirrorLegacyHiddenFromSeaRows() {
    const dvl = [...seaUsdWrap.querySelectorAll(".sea-route-dv-terminal")].map((el) =>
      el instanceof HTMLInputElement ? el.value.trim() : ""
    );
    railTerminalInput.value = dvl.filter(Boolean).join(", ");
    const stl = [...seaUsdWrap.querySelectorAll(".sea-route-station")].map((el) =>
      el instanceof HTMLInputElement ? el.value.trim() : ""
    );
    const hid = destinationStationsWrap.querySelector('input[name="destinationStations"]');
    if (hid instanceof HTMLInputElement) {
      const u = [];
      const s = new Set();
      stl.filter(Boolean).forEach((txt) => {
        const key = txt.toLocaleLowerCase("ru-RU");
        if (!s.has(key)) {
          s.add(key);
          u.push(txt);
        }
      });
      hid.value = u.join(", ");
    }
  }

  function snapshotSeaRailAmountsForRebuild() {
    /** @type {Record<string,{lt:string,gt:string,hq:string}>} */
    const out = {};
    railRubRowsWrap.querySelectorAll("[data-sea-rail-route]").forEach((blk) => {
      const ix = blk.getAttribute("data-sea-rail-route") || "";
      const ltInp = blk.querySelector('input[data-rail-slot="lt"]');
      const gtInp = blk.querySelector('input[data-rail-slot="gt"]');
      const hqInp = blk.querySelector('input[data-rail-slot="hq"]');
      out[ix] = {
        lt: ltInp instanceof HTMLInputElement ? ltInp.value : "",
        gt: gtInp instanceof HTMLInputElement ? gtInp.value : "",
        hq: hqInp instanceof HTMLInputElement ? hqInp.value : "",
      };
    });
    return out;
  }

  function railSlotHeadlineRu(slot) {
    if (slot === "20LT24") {
      return "20′ ft < 24 t";
    }
    if (slot === "20GT24") {
      return "20′ ft > 24 t";
    }
    return "40′ HQ";
  }

  function rebuildRailRubFromSeaRoutes() {
    const prevSnap = snapshotSeaRailAmountsForRebuild();
    railRubRowsWrap.innerHTML = "";
    const blocks = [...seaUsdWrap.querySelectorAll(".sea-route-block")];
    blocks.forEach((seaBlk, blockIndex) => {
      const stack = seaBlk.querySelector(".sea-route-maritime-stack");
      const segEls =
        stack instanceof HTMLElement
          ? [...stack.querySelectorAll(".sea-route-maritime-segment")]
          : [];
      const segmentNodes = segEls.length ? segEls : [seaBlk];
      segmentNodes.forEach((segEl, segIndex) => {
        const ixStr = String(blockIndex) + "-" + String(segIndex);
        const ctSel = segEl.querySelector(".sea-route-container-slot");
        const slot = normalizeContainerSlotValue(
          ctSel instanceof HTMLSelectElement ? ctSel.value : ""
        );
        const line = seaBlk.dataset.routeLine || "—";
        const dvEl = seaBlk.querySelector(".sea-route-dv-terminal");
        const stEl = seaBlk.querySelector(".sea-route-station");
        const dv = dvEl instanceof HTMLInputElement ? String(dvEl.value || "").trim() : "";
        const st = stEl instanceof HTMLInputElement ? String(stEl.value || "").trim() : "";
        const wrap = document.createElement("div");
        wrap.className = "rail-sea-route-bundle";
        wrap.dataset.seaRailRoute = ixStr;
        wrap.dataset.containerSlot = slot;
        const hdr = document.createElement("div");
        hdr.className = "rail-sea-route-hdr helper-text cost-follow-hint";
        hdr.textContent =
          "«" +
          (dv || "—") +
          "» → станция «" +
          (st || "—") +
          "» - " +
          railSlotHeadlineRu(slot) +
          " (" +
          line +
          ")";
        wrap.appendChild(hdr);
        const p = prevSnap[ixStr] || { lt: "", gt: "", hq: "" };
        if (slot === "40HQ") {
          const l = document.createElement("label");
          l.textContent = "ЖД сумма для этой связки, RUB *";
          const inp = document.createElement("input");
          inp.type = "number";
          inp.min = "0";
          inp.step = "1";
          inp.required = true;
          inp.dataset.railSlot = "hq";
          inp.className = "rail-rub-amount-input";
          inp.placeholder = "Сумма";
          inp.value = p.hq;
          wrap.appendChild(l);
          wrap.appendChild(inp);
        } else if (slot === "20LT24") {
          const l = document.createElement("label");
          l.textContent = "20′ ft < 24 t, RUB *";
          const inp = document.createElement("input");
          inp.type = "number";
          inp.min = "0";
          inp.step = "1";
          inp.required = true;
          inp.dataset.railSlot = "lt";
          inp.className = "rail-rub-amount-input";
          inp.placeholder = "Сумма";
          inp.value = p.lt;
          wrap.appendChild(l);
          wrap.appendChild(inp);
        } else {
          const l = document.createElement("label");
          l.textContent = "20′ ft > 24 t, RUB *";
          const inp = document.createElement("input");
          inp.type = "number";
          inp.min = "0";
          inp.step = "1";
          inp.required = true;
          inp.dataset.railSlot = "gt";
          inp.className = "rail-rub-amount-input";
          inp.placeholder = "Сумма";
          inp.value = p.gt;
          wrap.appendChild(l);
          wrap.appendChild(inp);
        }
        railRubRowsWrap.appendChild(wrap);
      });
    });
  }

  function snapshotAutoAmountsForRebuild() {
    /** @type {Record<string, string>} */
    const out = {};
    autoDeliveryRowsWrap.querySelectorAll("[data-sea-auto-route]").forEach((rowEl) => {
      const ix = rowEl.getAttribute("data-sea-auto-route") || "";
      const inp = rowEl.querySelector('input[name="autoRub"]');
      out[ix] = inp instanceof HTMLInputElement ? inp.value : "";
    });
    return out;
  }

  function rebuildAutoDeliveryFromSeaRoutes() {
    const prevA = snapshotAutoAmountsForRebuild();
    autoDeliveryRowsWrap.innerHTML = "";
    warehouseAddressesWrap.innerHTML = "";
    const addrSeen = new Set();
    const blocks = [...seaUsdWrap.querySelectorAll(".sea-route-block")];
    blocks.forEach((seaBlk, blockIndex) => {
      const unloadVals = collectBundleUnloadAddresses(seaBlk);
      unloadVals.forEach((addr) => {
        const keyAddr = addr.toLocaleLowerCase("ru-RU");
        if (addr && !addrSeen.has(keyAddr)) {
          addrSeen.add(keyAddr);
          const wh = document.createElement("input");
          wh.type = "hidden";
          wh.name = "warehouseAddress";
          wh.value = addr;
          warehouseAddressesWrap.appendChild(wh);
        }
      });
      const addrHdr =
        unloadVals.length === 0
          ? "—"
          : unloadVals.map((a) => "«" + a + "»").join(", ");
      const stack = seaBlk.querySelector(".sea-route-maritime-stack");
      const segEls =
        stack instanceof HTMLElement
          ? [...stack.querySelectorAll(".sea-route-maritime-segment")]
          : [];
      const segmentNodes = segEls.length ? segEls : [seaBlk];
      segmentNodes.forEach((segEl, segIndex) => {
        const ixStr = String(blockIndex) + "-" + String(segIndex);
        const line = seaBlk.dataset.routeLine || "—";
        const ctSel = segEl.querySelector(".sea-route-container-slot");
        const slot = normalizeContainerSlotValue(
          ctSel instanceof HTMLSelectElement ? ctSel.value : ""
        );
        const stEl = seaBlk.querySelector(".sea-route-station");
        const st =
          stEl instanceof HTMLInputElement ? String(stEl.value || "").trim() : "";
        const rowWrap = document.createElement("div");
        rowWrap.className = "auto-delivery-route-bundle";
        rowWrap.dataset.seaAutoRoute = ixStr;
        rowWrap.dataset.containerSlot = slot;
        const hdr = document.createElement("div");
        hdr.className = "auto-delivery-route-hdr helper-text cost-follow-hint";
        hdr.textContent =
          "«" +
          (st || "—") +
          "» - " +
          addrHdr +
          " - " +
          railSlotHeadlineRu(slot) +
          " (" +
          (line || "—") +
          ")";
        const lab = document.createElement("label");
        lab.textContent = "Авто доставка до адреса, RUB *";
        const inp = document.createElement("input");
        inp.type = "number";
        inp.name = "autoRub";
        inp.min = "0";
        inp.step = "1";
        inp.required = true;
        inp.className = "rail-rub-amount-input";
        inp.placeholder = "Например, 28000";
        inp.value = prevA[ixStr] || "";
        rowWrap.appendChild(hdr);
        rowWrap.appendChild(lab);
        rowWrap.appendChild(inp);
        autoDeliveryRowsWrap.appendChild(rowWrap);
      });
    });
  }

  function syncRailAutoSectionsFromSea() {
    mirrorLegacyHiddenFromSeaRows();
    rebuildRailRubFromSeaRoutes();
    rebuildAutoDeliveryFromSeaRoutes();
  }

  function onSeaUsdWrapDelegatedChange(event) {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.classList.contains("sea-route-container-slot")) {
      const bundle = target.closest(".sea-route-block");
      const seg = target.closest(".sea-route-maritime-segment");
      if (
        seg instanceof HTMLElement &&
        seg.getAttribute("data-maritime-primary") === "true" &&
        bundle instanceof HTMLElement
      ) {
        syncRailAutoSectionsFromSea();
      } else if (!seg?.closest(".sea-route-maritime-stack")) {
        syncRailAutoSectionsFromSea();
      }
      return;
    }
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name === "seaSailingDate") {
      const bundle = target.closest(".sea-route-block");
      const seg = target.closest(".sea-route-maritime-segment");
      if (
        bundle instanceof HTMLElement &&
        bundle.dataset.seaRouteCopy !== "1" &&
        seg instanceof HTMLElement &&
        seg.getAttribute("data-maritime-primary") === "true"
      ) {
        syncSeaSecondarySailingDatesFromPrimary(bundle);
      }
      return;
    }
    if (
      target.classList.contains("sea-route-port-input") ||
      target.classList.contains("sea-route-line-input")
    ) {
      const bundle = target.closest(".sea-route-block");
      if (bundle instanceof HTMLElement) {
        syncSeaRouteBundleRouteFromInputs(bundle);
      }
      mirrorLegacyHiddenFromSeaRows();
      syncRailAutoSectionsFromSea();
      return;
    }
    if (target.classList.contains("sea-row-dv-term-cb")) {
      const inner = target.closest(".sea-row-dv-details-inner");
      const bundle = target.closest(".sea-route-block");
      const ti = bundle?.querySelector(".sea-route-dv-terminal");
      if (inner instanceof HTMLElement && ti instanceof HTMLInputElement) {
        refreshDvTermInputFromBoxes(inner, ti);
      }
      syncRailAutoSectionsFromSea();
      return;
    }
    if (target.classList.contains("sea-row-station-cb")) {
      const inner = target.closest(".sea-row-st-details-inner");
      const bundle = target.closest(".sea-route-block");
      const ti = bundle?.querySelector(".sea-route-station");
      if (inner instanceof HTMLElement && ti instanceof HTMLInputElement) {
        refreshStInputFromBoxes(inner, ti);
      }
      syncRailAutoSectionsFromSea();
    }
  }

  function getSeaUsdValues() {
    return [...seaUsdWrap.querySelectorAll('input[name="seaUsd"]')].map((input) => {
      const raw =
        input instanceof HTMLInputElement ? String(input.value || "").trim() : "";
      return raw === "" ? Number.NaN : Number(raw);
    });
  }

  function snapshotMaritimeSegmentsFromBundle(bundle) {
    if (!(bundle instanceof HTMLElement)) {
      return [{ seaUsd: "", sailingDate: "", slot: "40HQ" }];
    }
    const stack = bundle.querySelector(".sea-route-maritime-stack");
    if (stack instanceof HTMLElement) {
      const segments = [
        ...stack.querySelectorAll(".sea-route-maritime-segment"),
      ];
      if (!segments.length) {
        return [{ seaUsd: "", sailingDate: "", slot: "40HQ" }];
      }
      return segments.map((seg) => {
        const seaInp = seg.querySelector('input[name="seaUsd"]');
        const dateInp = seg.querySelector('input[name="seaSailingDate"]');
        const ctSel = seg.querySelector(".sea-route-container-slot");
        return {
          seaUsd: seaInp instanceof HTMLInputElement ? seaInp.value.trim() : "",
          sailingDate:
            dateInp instanceof HTMLInputElement ? dateInp.value.trim() : "",
          slot: normalizeContainerSlotValue(
            ctSel instanceof HTMLSelectElement ? ctSel.value : ""
          ),
        };
      });
    }
    const seaInp = bundle.querySelector('input[name="seaUsd"]');
    const dateInp = bundle.querySelector('input[name="seaSailingDate"]');
    const ctSel = bundle.querySelector(".sea-route-container-slot");
    return [
      {
        seaUsd: seaInp instanceof HTMLInputElement ? seaInp.value.trim() : "",
        sailingDate:
          dateInp instanceof HTMLInputElement ? dateInp.value.trim() : "",
        slot: normalizeContainerSlotValue(
          ctSel instanceof HTMLSelectElement ? ctSel.value : ""
        ),
      },
    ];
  }

  function snapshotSeaRouteFullState(bundle) {
    if (!(bundle instanceof HTMLElement)) {
      return {
        snaps: [{ seaUsd: "", sailingDate: "", slot: "40HQ" }],
        dv: "",
        st: "",
        unload: [""],
        routeOrigin: "",
        routeLine: "",
      };
    }
    const rawUnload = [...bundle.querySelectorAll(".sea-route-unload")].map(
      (el) =>
        el instanceof HTMLInputElement ? String(el.value || "").trim() : ""
    );
    const dvEl = bundle.querySelector(".sea-route-dv-terminal");
    const stEl = bundle.querySelector(".sea-route-station");
    const portInp = bundle.querySelector(".sea-route-port-input");
    const lineInp = bundle.querySelector(".sea-route-line-input");
    let routeOrigin = normalizeOriginPortToken(
      String(bundle.dataset.routeOrigin || "")
    );
    let routeLine = String(bundle.dataset.routeLine || "")
      .trim()
      .replace(/\s+/g, " ");
    if (portInp instanceof HTMLInputElement) {
      routeOrigin = normalizeOriginPortToken(portInp.value);
    }
    if (lineInp instanceof HTMLInputElement) {
      routeLine = String(lineInp.value || "")
        .trim()
        .replace(/\s+/g, " ");
    }
    return {
      snaps: snapshotMaritimeSegmentsFromBundle(bundle).map((s) => ({
        seaUsd: String(s.seaUsd ?? ""),
        sailingDate: String(s.sailingDate ?? ""),
        slot: normalizeContainerSlotValue(s.slot),
      })),
      dv: dvEl instanceof HTMLInputElement ? dvEl.value.trim() : "",
      st: stEl instanceof HTMLInputElement ? stEl.value.trim() : "",
      unload: rawUnload.length ? rawUnload : [""],
      routeOrigin,
      routeLine,
    };
  }

  function syncSeaRouteBundleRouteFromInputs(bundle) {
    if (!(bundle instanceof HTMLElement)) {
      return;
    }
    const pi = bundle.querySelector(".sea-route-port-input");
    const li = bundle.querySelector(".sea-route-line-input");
    if (pi instanceof HTMLInputElement) {
      bundle.dataset.routeOrigin = normalizeOriginPortToken(pi.value);
    }
    if (li instanceof HTMLInputElement) {
      bundle.dataset.routeLine = String(li.value || "")
        .trim()
        .replace(/\s+/g, " ");
    }
  }

  function seaRoutePrimarySlotId(comboKey) {
    return "p-" + encodeURIComponent(comboKey);
  }

  function syncSeaSecondarySailingDatesFromPrimary(bundle) {
    if (!(bundle instanceof HTMLElement)) {
      return;
    }
    const primary = bundle.querySelector(
      '.sea-route-maritime-segment[data-maritime-primary="true"]'
    );
    const prDate = primary?.querySelector('input[name="seaSailingDate"]');
    if (!(prDate instanceof HTMLInputElement)) {
      return;
    }
    const v = prDate.value;
    bundle
      .querySelectorAll(
        '.sea-route-maritime-segment:not([data-maritime-primary="true"]) input[name="seaSailingDate"]'
      )
      .forEach((node) => {
        if (node instanceof HTMLInputElement) {
          node.value = v;
        }
      });
  }

  function createSeaMaritimeSegment(
    bundleIdx1,
    segIdx0,
    portLabel,
    lineLabel,
    snap,
    isPrimary,
    segOpts
  ) {
    const opts = segOpts || {};
    const editableRoute = Boolean(opts.editableRoute && isPrimary);
    const independentSailingDates = Boolean(opts.independentSailingDates);
    const idSuf = String(bundleIdx1) + "-" + String(segIdx0);
    const wrap = document.createElement("div");
    wrap.className = "sea-route-maritime-segment";
    if (isPrimary) {
      wrap.setAttribute("data-maritime-primary", "true");
    } else {
      const bar = document.createElement("div");
      bar.className = "sea-maritime-segment-toolbar";
      const rmBtn = document.createElement("button");
      rmBtn.type = "button";
      rmBtn.className = "btn-remove-sea-maritime-segment btn-mini-control";
      rmBtn.dataset.action = "remove-sea-maritime-segment";
      rmBtn.textContent = "−";
      rmBtn.setAttribute(
        "aria-label",
        "Убрать дополнительную строку моря"
      );
      bar.appendChild(rmBtn);
      wrap.appendChild(bar);
    }

    const maritimeGrid = document.createElement("div");
    maritimeGrid.className =
      "sea-usd-row sea-usd-row--grid sea-usd-route-maritime-grid";

    const ctLabel = document.createElement("label");
    ctLabel.className = "sea-grid-lab sea-grid-lab--ct";
    ctLabel.htmlFor = "seaRouteCt-" + idSuf;
    ctLabel.textContent = "Тип контейнера *";
    const ctSel = document.createElement("select");
    ctSel.className = "sea-route-container-slot";
    ctSel.id = "seaRouteCt-" + idSuf;
    ctSel.required = true;
    [
      ["20LT24", "20′ ft < 24 t, RUB *"],
      ["20GT24", "20′ ft > 24 t, RUB *"],
      ["40HQ", "40′ HQ *"],
    ].forEach(([val, text]) => {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = text;
      ctSel.appendChild(o);
    });
    ctSel.value = normalizeContainerSlotValue(snap.slot);

    const portLabelEl = document.createElement("label");
    portLabelEl.className = "sea-grid-lab sea-grid-lab--port";
    portLabelEl.textContent = "Порт отправления *";
    let portRo;
    if (editableRoute) {
      portRo = document.createElement("input");
      portRo.type = "text";
      portRo.className = "sea-route-port-input";
      portRo.id = "seaRoutePort-" + idSuf;
      portRo.setAttribute("list", "china-port-suggestions");
      portRo.required = true;
      portRo.placeholder = "Порт, например QINGDAO";
      portRo.autocomplete = "off";
      portRo.value =
        portLabel && portLabel !== "—" ? String(portLabel).trim() : "";
      portLabelEl.htmlFor = portRo.id;
    } else {
      portRo = document.createElement("span");
      portRo.className = "sea-route-port-display";
      portRo.textContent = portLabel || "—";
    }

    const lineLabelEl = document.createElement("label");
    lineLabelEl.className = "sea-grid-lab sea-grid-lab--line";
    lineLabelEl.textContent = "Морская линия *";
    let lineRo;
    if (editableRoute) {
      lineRo = document.createElement("input");
      lineRo.type = "text";
      lineRo.className = "sea-route-line-input";
      lineRo.id = "seaRouteLine-" + idSuf;
      lineRo.setAttribute("list", "shipping-line-suggestions");
      lineRo.required = true;
      lineRo.placeholder = "Линия";
      lineRo.autocomplete = "off";
      lineRo.value =
        lineLabel && lineLabel !== "—" ? String(lineLabel).trim() : "";
      lineLabelEl.htmlFor = lineRo.id;
    } else {
      lineRo = document.createElement("span");
      lineRo.className = "sea-route-line-display";
      if (isPrimary) {
        lineRo.id = "sea-route-line-ro-" + String(bundleIdx1);
      }
      lineRo.textContent = lineLabel || "—";
    }
    lineRo.title = portLabel
      ? portLabel + " → " + String(lineLabel || "")
      : String(lineLabel || "");
    portRo.title = lineRo.title || String(portLabel || "");

    const frLabel = document.createElement("label");
    frLabel.className = "sea-grid-lab sea-grid-lab--usd";
    frLabel.htmlFor = "seaUsd-" + idSuf;
    frLabel.textContent = "Фрахт USD *";
    frLabel.title = portLabel + " × " + lineLabel;

    const input = document.createElement("input");
    input.id = "seaUsd-" + idSuf;
    input.name = "seaUsd";
    input.type = "number";
    input.step = "0.01";
    input.min = "0";
    input.required = true;
    input.placeholder = "Например, 1450";
    input.value = snap.seaUsd || "";

    const dateLabel = document.createElement("label");
    dateLabel.className = "sea-grid-lab sea-grid-lab--date";
    dateLabel.htmlFor = "seaSailingDate-" + idSuf;
    dateLabel.textContent = "Дата выхода *";
    const dateInput = document.createElement("input");
    dateInput.id = "seaSailingDate-" + idSuf;
    dateInput.name = "seaSailingDate";
    dateInput.type = "date";
    dateInput.required = true;
    dateInput.value = snap.sailingDate || "";
    if (!isPrimary && !independentSailingDates) {
      dateInput.readOnly = true;
      dateInput.tabIndex = -1;
      dateInput.classList.add("sea-sailing-date--from-primary");
      dateInput.title =
        "Совпадает с датой выхода в первой строке этого блока";
    }

    maritimeGrid.appendChild(ctLabel);
    maritimeGrid.appendChild(ctSel);
    maritimeGrid.appendChild(portLabelEl);
    maritimeGrid.appendChild(portRo);
    maritimeGrid.appendChild(lineLabelEl);
    maritimeGrid.appendChild(lineRo);
    maritimeGrid.appendChild(frLabel);
    maritimeGrid.appendChild(input);
    maritimeGrid.appendChild(dateLabel);
    maritimeGrid.appendChild(dateInput);

    wrap.appendChild(maritimeGrid);
    return wrap;
  }

  function ensureSeaMaritimeStackFooter(stack) {
    let foot = stack.querySelector(".sea-maritime-stack-footer");
    if (foot instanceof HTMLElement) {
      return foot;
    }
    foot = document.createElement("div");
    foot.className = "sea-maritime-stack-footer";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-add-sea-maritime-segment btn-mini-control";
    btn.dataset.action = "add-sea-maritime-segment";
    btn.textContent = "+";
    btn.title =
      "Добавить ещё тип контейнера и фрахт для этой связки порта и линии";
    btn.setAttribute(
      "aria-label",
      "Добавить строку: тип контейнера и фрахт"
    );
    foot.appendChild(btn);
    stack.appendChild(foot);
    return foot;
  }

  function ensureSeaUnloadStackFooter(stack) {
    let foot = stack.querySelector(".sea-unload-stack-footer");
    if (foot instanceof HTMLElement) {
      return foot;
    }
    foot = document.createElement("div");
    foot.className = "sea-unload-stack-footer";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-add-sea-unload-row btn-mini-control";
    btn.dataset.action = "add-sea-unload-row";
    btn.textContent = "+";
    btn.title = "Добавить ещё один адрес выгрузки";
    btn.setAttribute("aria-label", "Добавить адрес выгрузки");
    foot.appendChild(btn);
    stack.appendChild(foot);
    return foot;
  }

  /**
   * @param {number} bundleIdx 1-based index блока
   * @param {number} rowIdx индекс строки в стеке
   */
  function createSeaUnloadRow(bundleIdx, rowIdx, value, isFirst) {
    const row = document.createElement("div");
    row.className = "sea-route-unload-row";
    const lab = document.createElement("label");
    lab.className = "sea-grid-lab sea-grid-lab--unload-inline";
    const inpId = "sea-route-unl-" + String(bundleIdx) + "-" + String(rowIdx);
    lab.htmlFor = inpId;
    lab.textContent = isFirst ? "Адрес выгрузки *" : "Адрес выгрузки";
    const wrapCtrl = document.createElement("div");
    wrapCtrl.className = "sea-route-unload-controls";
    const inp = document.createElement("input");
    inp.id = inpId;
    inp.className = "sea-route-unload";
    inp.type = "text";
    inp.placeholder = "МО, Подольск, …";
    inp.value = value || "";
    if (isFirst) {
      inp.required = true;
    }
    wrapCtrl.appendChild(inp);
    if (!isFirst) {
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn-remove-sea-unload-row btn-mini-control";
      rm.dataset.action = "remove-sea-unload-row";
      rm.textContent = "×";
      rm.title = "Удалить этот адрес";
      rm.setAttribute("aria-label", "Удалить адрес выгрузки");
      wrapCtrl.appendChild(rm);
    }
    row.appendChild(lab);
    row.appendChild(wrapCtrl);
    return row;
  }

  function handleSeaUsdMaritimeStackClick(event) {
    const t = event.target;
    if (!(t instanceof Element)) {
      return;
    }
    const copyBlockBtn = t.closest("[data-action='copy-sea-route-block']");
    if (copyBlockBtn instanceof HTMLButtonElement) {
      const bundle = copyBlockBtn.closest(".sea-route-block");
      if (!(bundle instanceof HTMLElement)) {
        return;
      }
      const origin = String(bundle.dataset.routeOrigin || "");
      const line = String(bundle.dataset.routeLine || "");
      const comboKey =
        normalizeOriginPortToken(origin) + "\u0000" + String(line || "").trim();
      const id =
        "c-" +
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10));
      seaRouteExtraCopies.push({ id, anchorComboKey: comboKey });
      pendingSeaRouteCopyState.set(id, snapshotSeaRouteFullState(bundle));
      syncSeaUsdRowsToRouteCombinations();
      return;
    }
    const rmBlockBtn = t.closest("[data-action='remove-sea-route-block']");
    if (rmBlockBtn instanceof HTMLButtonElement) {
      const bundle = rmBlockBtn.closest(".sea-route-block");
      if (!(bundle instanceof HTMLElement)) {
        return;
      }
      const origin = String(bundle.dataset.routeOrigin || "");
      const line = String(bundle.dataset.routeLine || "");
      const key =
        normalizeOriginPortToken(origin) + "\u0000" + String(line || "").trim();
      const slotId = String(bundle.dataset.seaRouteSlotId || "").trim();
      if (slotId.startsWith("c-")) {
        const ix = seaRouteExtraCopies.findIndex((x) => x.id === slotId);
        if (ix !== -1) {
          seaRouteExtraCopies.splice(ix, 1);
        }
        pendingSeaRouteCopyState.delete(slotId);
      } else {
        seaRouteBlockExclusions.add(key);
        for (let i = seaRouteExtraCopies.length - 1; i >= 0; i--) {
          if (seaRouteExtraCopies[i].anchorComboKey === key) {
            seaRouteExtraCopies.splice(i, 1);
          }
        }
      }
      syncSeaUsdRowsToRouteCombinations();
      return;
    }
    const addUnlBtn = t.closest("[data-action='add-sea-unload-row']");
    if (addUnlBtn instanceof HTMLButtonElement) {
      const stack = addUnlBtn.closest(".sea-route-unload-stack");
      const bundle = addUnlBtn.closest(".sea-route-block");
      if (!(stack instanceof HTMLElement) || !(bundle instanceof HTMLElement)) {
        return;
      }
      const foot = stack.querySelector(".sea-unload-stack-footer");
      const blocks = [...seaUsdWrap.querySelectorAll(".sea-route-block")];
      const idx = blocks.indexOf(bundle) + 1;
      const rowCount = stack.querySelectorAll(".sea-route-unload-row").length;
      const newRow = createSeaUnloadRow(idx, rowCount, "", false);
      if (foot instanceof HTMLElement) {
        stack.insertBefore(newRow, foot);
      } else {
        stack.appendChild(newRow);
      }
      syncRailAutoSectionsFromSea();
      return;
    }
    const rmUnlBtn = t.closest("[data-action='remove-sea-unload-row']");
    if (rmUnlBtn instanceof HTMLButtonElement) {
      const row = rmUnlBtn.closest(".sea-route-unload-row");
      const stack = rmUnlBtn.closest(".sea-route-unload-stack");
      if (!(row instanceof HTMLElement) || !(stack instanceof HTMLElement)) {
        return;
      }
      if (stack.querySelectorAll(".sea-route-unload-row").length <= 1) {
        return;
      }
      row.remove();
      const firstInp = stack.querySelector(".sea-route-unload");
      if (firstInp instanceof HTMLInputElement) {
        firstInp.required = true;
      }
      syncRailAutoSectionsFromSea();
      return;
    }
    const addBtn = t.closest("[data-action='add-sea-maritime-segment']");
    if (addBtn instanceof HTMLButtonElement) {
      const stack = addBtn.closest(".sea-route-maritime-stack");
      const bundle = addBtn.closest(".sea-route-block");
      if (!(stack instanceof HTMLElement) || !(bundle instanceof HTMLElement)) {
        return;
      }
      const blocks = [...seaUsdWrap.querySelectorAll(".sea-route-block")];
      const idx = blocks.indexOf(bundle) + 1;
      const segs = stack.querySelectorAll(".sea-route-maritime-segment");
      const segIdx = segs.length;
      const portLabel = bundle.dataset.routeOrigin
        ? String(bundle.dataset.routeOrigin).trim().toUpperCase()
        : "—";
      const lineLabel = String(bundle.dataset.routeLine || "").trim() || "—";
      const primary = stack.querySelector(
        '.sea-route-maritime-segment[data-maritime-primary="true"]'
      );
      const pDate = primary?.querySelector('input[name="seaSailingDate"]');
      const dateVal = pDate instanceof HTMLInputElement ? pDate.value : "";
      const snap = {
        seaUsd: "",
        sailingDate: dateVal,
        slot: "40HQ",
      };
      const el = createSeaMaritimeSegment(
        idx,
        segIdx,
        portLabel,
        lineLabel,
        snap,
        false,
        bundle.dataset.seaRouteCopy === "1"
          ? { editableRoute: false, independentSailingDates: true }
          : undefined
      );
      const footer = stack.querySelector(".sea-maritime-stack-footer");
      if (footer instanceof HTMLElement) {
        stack.insertBefore(el, footer);
      } else {
        stack.appendChild(el);
      }
      if (bundle.dataset.seaRouteCopy !== "1") {
        syncSeaSecondarySailingDatesFromPrimary(bundle);
      }
      syncRailAutoSectionsFromSea();
      return;
    }
    const rmBtn = t.closest("[data-action='remove-sea-maritime-segment']");
    if (rmBtn instanceof HTMLButtonElement) {
      const seg = rmBtn.closest(".sea-route-maritime-segment");
      if (
        !(seg instanceof HTMLElement) ||
        seg.getAttribute("data-maritime-primary") === "true"
      ) {
        return;
      }
      seg.remove();
      const bundleRm = rmBtn.closest(".sea-route-block");
      if (bundleRm instanceof HTMLElement) {
        syncRailAutoSectionsFromSea();
      }
    }
  }

  function getSeaRouteRows() {
    const rows = [];
    [...seaUsdWrap.querySelectorAll(".sea-route-block")].forEach(
      (bundle, blockIndex) => {
        const portInp = bundle.querySelector(".sea-route-port-input");
        const lineInp = bundle.querySelector(".sea-route-line-input");
        let origin = String(bundle.dataset.routeOrigin || "")
          .trim()
          .toUpperCase();
        let shippingLine = String(bundle.dataset.routeLine || "").trim();
        if (portInp instanceof HTMLInputElement) {
          origin = normalizeOriginPortToken(portInp.value);
        }
        if (lineInp instanceof HTMLInputElement) {
          shippingLine = String(lineInp.value || "")
            .trim()
            .replace(/\s+/g, " ");
        }
        const dvInp = bundle.querySelector(".sea-route-dv-terminal");
        const stInp = bundle.querySelector(".sea-route-station");
        const unloadParts = collectBundleUnloadAddresses(bundle);
        const unloadAddress = unloadParts.join("; ");
        const dvTerminal =
          dvInp instanceof HTMLInputElement
            ? String(dvInp.value || "").trim()
            : "";
        const destinationStation =
          stInp instanceof HTMLInputElement
            ? String(stInp.value || "").trim()
            : "";
        const stack = bundle.querySelector(".sea-route-maritime-stack");
        const segments =
          stack instanceof HTMLElement
            ? [...stack.querySelectorAll(".sea-route-maritime-segment")]
            : [];
        const pushSegment = (segEl, segIndex) => {
          const seaInp = segEl.querySelector('input[name="seaUsd"]');
          const dateInp = segEl.querySelector('input[name="seaSailingDate"]');
          const ctSel = segEl.querySelector(".sea-route-container-slot");
          let containerSlot = normalizeContainerSlotValue(
            ctSel instanceof HTMLSelectElement ? ctSel.value : ""
          );
          const seaRaw =
            seaInp instanceof HTMLInputElement
              ? String(seaInp.value || "").trim()
              : "";
          const dateRaw =
            dateInp instanceof HTMLInputElement
              ? String(dateInp.value || "").trim()
              : "";
          rows.push({
            seaUsd: seaRaw === "" ? Number.NaN : Number(seaRaw),
            sailingDate: dateRaw,
            containerSlot,
            dvTerminal,
            destinationStation,
            unloadAddress,
            origin,
            shippingLine,
            seaBundleBlockIndex: blockIndex,
            seaSegmentIndex: segIndex,
          });
        };
        if (segments.length) {
          segments.forEach((seg, si) => pushSegment(seg, si));
          return;
        }
        pushSegment(bundle, 0);
      }
    );
    return rows;
  }

  function syncSeaUsdRowsToRouteCombinations() {
    const originPorts = getOriginPorts();
    const shippingLines = getShippingLinesFromInput();
    const safeOrigins = originPorts.length ? originPorts : [""];
    const safeLines = shippingLines.length ? shippingLines : [""];
    const combos = [];
    safeOrigins.forEach((origin) => {
      safeLines.forEach((line) => {
        combos.push({
          origin: String(origin || "").trim().toUpperCase(),
          shippingLine: String(line || "").trim(),
        });
      });
    });
    const productKeys = new Set(
      combos.map(
        (c) =>
          normalizeOriginPortToken(c.origin) +
          "\u0000" +
          String(c.shippingLine || "").trim()
      )
    );
    for (const k of [...seaRouteBlockExclusions]) {
      if (!productKeys.has(k)) {
        seaRouteBlockExclusions.delete(k);
      }
    }
    const visibleCombos = combos.filter((combo) => {
      const k =
        normalizeOriginPortToken(combo.origin) +
        "\u0000" +
        String(combo.shippingLine || "").trim();
      return !seaRouteBlockExclusions.has(k);
    });
    const visibleKeySet = new Set(
      visibleCombos.map(
        (c) =>
          normalizeOriginPortToken(c.origin) +
          "\u0000" +
          String(c.shippingLine || "").trim()
      )
    );
    for (let i = seaRouteExtraCopies.length - 1; i >= 0; i--) {
      if (!visibleKeySet.has(seaRouteExtraCopies[i].anchorComboKey)) {
        pendingSeaRouteCopyState.delete(seaRouteExtraCopies[i].id);
        seaRouteExtraCopies.splice(i, 1);
      }
    }
    const renderRows = [];
    for (const combo of visibleCombos) {
      const comboKey =
        normalizeOriginPortToken(combo.origin) +
        "\u0000" +
        String(combo.shippingLine || "").trim();
      renderRows.push({
        combo,
        comboKey,
        slotId: seaRoutePrimarySlotId(comboKey),
        isCopy: false,
      });
      for (const ex of seaRouteExtraCopies) {
        if (ex.anchorComboKey === comboKey) {
          renderRows.push({
            combo,
            comboKey,
            slotId: ex.id,
            isCopy: true,
          });
        }
      }
    }
    const prevBundles = [...seaUsdWrap.querySelectorAll(".sea-route-block")];
    const prevByKey = new Map();
    const prevBySlotId = new Map();
    prevBundles.forEach((b) => {
      const state = snapshotSeaRouteFullState(b);
      const key =
        normalizeOriginPortToken(String(b.dataset.routeOrigin || "")) +
        "\u0000" +
        String(b.dataset.routeLine || "").trim();
      prevByKey.set(key, state);
      const sid = String(b.dataset.seaRouteSlotId || "").trim();
      if (sid) {
        prevBySlotId.set(sid, state);
      }
    });
    seaUsdWrap.innerHTML = "";
    for (let i = 0; i < renderRows.length; i++) {
      const idx = i + 1;
      const { combo, comboKey, slotId, isCopy } = renderRows[i];
      let prev = null;
      if (pendingSeaRouteCopyState.has(slotId)) {
        prev = pendingSeaRouteCopyState.get(slotId);
        pendingSeaRouteCopyState.delete(slotId);
      } else {
        prev = prevBySlotId.get(slotId);
        if (!prev && !isCopy) {
          prev = prevByKey.get(comboKey);
        }
      }
      if (!prev) {
        prev = {
          snaps: [{ seaUsd: "", sailingDate: "", slot: "40HQ" }],
          dv: "",
          st: "",
          unload: [""],
          routeOrigin: "",
          routeLine: "",
        };
      }
      const snaps =
        prev.snaps && prev.snaps.length
          ? prev.snaps.map((s) => ({
              seaUsd: String(s.seaUsd ?? ""),
              sailingDate: String(s.sailingDate ?? ""),
              slot: normalizeContainerSlotValue(s.slot),
            }))
          : [{ seaUsd: "", sailingDate: "", slot: "40HQ" }];
      const portLabel = isCopy
        ? String(
            "routeOrigin" in prev ? prev.routeOrigin : combo.origin || ""
          )
            .trim()
            .toUpperCase()
        : combo.origin || "—";
      const lineLabel = isCopy
        ? String(
            "routeLine" in prev ? prev.routeLine : combo.shippingLine || ""
          ).trim()
        : combo.shippingLine || "—";
      const bundle = document.createElement("div");
      bundle.className = "sea-route-block";
      bundle.dataset.seaRouteSlotId = slotId;
      if (isCopy) {
        bundle.dataset.seaRouteCopy = "1";
        bundle.dataset.routeOrigin = portLabel
          ? String(portLabel).trim().toUpperCase()
          : "";
        bundle.dataset.routeLine = lineLabel
          ? String(lineLabel).trim()
          : "";
      } else {
        bundle.removeAttribute("data-sea-route-copy");
        bundle.dataset.routeOrigin = combo.origin || "";
        bundle.dataset.routeLine = combo.shippingLine || "";
      }

      const detDv = document.createElement("details");
      detDv.className = "origin-quick-picks-details sea-row-dv-details";
      const sumDv = document.createElement("summary");
      sumDv.className = "origin-quick-picks-summary";
      sumDv.textContent = "Быстрый выбор терминала прибытия на ДВ";
      const panDv = document.createElement("div");
      panDv.className = "origin-quick-picks-panel sea-row-dv-details-inner";
      [...railTerminalQuickPicks.querySelectorAll("label")].forEach((mlab) => {
        const cloned = mlab.cloneNode(true);
        const cb = cloned.querySelector("input");
        if (!(cb instanceof HTMLInputElement)) {
          return;
        }
        cb.removeAttribute("name");
        cb.classList.add("sea-row-dv-term-cb");
        cb.checked = false;
        panDv.appendChild(cloned);
      });
      detDv.appendChild(sumDv);
      detDv.appendChild(panDv);

      const detSt = document.createElement("details");
      detSt.className = "origin-quick-picks-details sea-row-st-details";
      const sumSt = document.createElement("summary");
      sumSt.className = "origin-quick-picks-summary";
      sumSt.textContent = "Быстрый выбор станции назначения";
      const panSt = document.createElement("div");
      panSt.className = "origin-quick-picks-panel sea-row-st-details-inner";
      [...stationQuickPicks.querySelectorAll("label")].forEach((mlab) => {
        const cloned = mlab.cloneNode(true);
        const cb = cloned.querySelector("input");
        if (!(cb instanceof HTMLInputElement)) {
          return;
        }
        cb.removeAttribute("name");
        cb.classList.add("sea-row-station-cb");
        cb.checked = false;
        panSt.appendChild(cloned);
      });
      detSt.appendChild(sumSt);
      detSt.appendChild(panSt);

      const quickBar = document.createElement("div");
      quickBar.className = "sea-route-quick-picks-row";
      quickBar.appendChild(detDv);
      quickBar.appendChild(detSt);

      const maritimeStack = document.createElement("div");
      maritimeStack.className = "sea-route-maritime-stack";
      const segOpts = isCopy
        ? { editableRoute: true, independentSailingDates: true }
        : undefined;
      snaps.forEach((snap, sj) => {
        maritimeStack.appendChild(
          createSeaMaritimeSegment(
            idx,
            sj,
            portLabel,
            lineLabel,
            snap,
            sj === 0,
            segOpts
          )
        );
      });
      ensureSeaMaritimeStackFooter(maritimeStack);

      const landGrid = document.createElement("div");
      landGrid.className =
        "sea-usd-row sea-usd-row--grid sea-usd-route-land-grid";

      const dvLab = document.createElement("label");
      dvLab.className = "sea-grid-lab sea-grid-lab--dv";
      dvLab.textContent = "Терминал прибытия на ДВ *";
      const termIn = document.createElement("input");
      termIn.id = "sea-route-dv-" + String(idx);
      termIn.className = "sea-route-dv-terminal";
      termIn.type = "text";
      termIn.setAttribute("list", "terminal-suggestions");
      termIn.placeholder = "Терминал ДВ";
      termIn.required = true;
      termIn.value = (prev && prev.dv) || "";
      dvLab.htmlFor = termIn.id;

      [...panDv.querySelectorAll(".sea-row-dv-term-cb")].forEach((cb) => {
        if (!(cb instanceof HTMLInputElement)) {
          return;
        }
        const parts = termIn.value
          .split(/[,/]/)
          .map((s) => s.trim())
          .filter(Boolean);
        cb.checked = parts.some(
          (tok) =>
            normalizeQuickOptionToken(tok) ===
            normalizeQuickOptionToken(cb.value)
        );
      });

      const stLab = document.createElement("label");
      stLab.className = "sea-grid-lab sea-grid-lab--st";
      stLab.textContent = "Станция назначения *";
      const stIn = document.createElement("input");
      stIn.id = "sea-route-st-" + String(idx);
      stIn.className = "sea-route-station";
      stIn.type = "text";
      stIn.setAttribute("list", "station-suggestions");
      stIn.placeholder = "Станция";
      stIn.required = true;
      stIn.value = (prev && prev.st) || "";
      stLab.htmlFor = stIn.id;
      const stPieces = prev && prev.st
        ? prev.st.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
        : [];
      [...panSt.querySelectorAll(".sea-row-station-cb")].forEach((cb) => {
        if (!(cb instanceof HTMLInputElement)) {
          return;
        }
        cb.checked = stPieces.some(
          (tok) =>
            normalizeQuickOptionToken(tok) ===
            normalizeQuickOptionToken(cb.value)
        );
      });

      const unloadStackVals =
        prev && prev.unload && prev.unload.length ? prev.unload : [""];
      const unloadStack = document.createElement("div");
      unloadStack.className = "sea-route-unload-stack";
      unloadStackVals.forEach((uval, ur) => {
        unloadStack.appendChild(
          createSeaUnloadRow(idx, ur, uval, ur === 0)
        );
      });
      ensureSeaUnloadStackFooter(unloadStack);

      landGrid.appendChild(dvLab);
      landGrid.appendChild(termIn);
      landGrid.appendChild(stLab);
      landGrid.appendChild(stIn);
      landGrid.appendChild(unloadStack);

      const blockToolbar = document.createElement("div");
      blockToolbar.className = "sea-route-block-toolbar";
      const copyBlockBtn = document.createElement("button");
      copyBlockBtn.type = "button";
      copyBlockBtn.className = "btn-copy-sea-route-block";
      copyBlockBtn.dataset.action = "copy-sea-route-block";
      copyBlockBtn.textContent = "Скопировать";
      copyBlockBtn.setAttribute(
        "aria-label",
        "Скопировать блок фрахта с текущими данными полей"
      );
      const delBlockBtn = document.createElement("button");
      delBlockBtn.type = "button";
      delBlockBtn.className = "btn-remove-sea-route-block";
      delBlockBtn.dataset.action = "remove-sea-route-block";
      delBlockBtn.textContent = "Удалить блок фрахта";
      delBlockBtn.setAttribute(
        "aria-label",
        "Удалить блок фрахта для этой связки порта отправления и морской линии"
      );
      blockToolbar.appendChild(copyBlockBtn);
      blockToolbar.appendChild(delBlockBtn);

      bundle.appendChild(blockToolbar);
      bundle.appendChild(maritimeStack);
      if (bundle.dataset.seaRouteCopy !== "1") {
        syncSeaSecondarySailingDatesFromPrimary(bundle);
      }
      bundle.appendChild(landGrid);
      bundle.appendChild(quickBar);

      seaUsdWrap.appendChild(bundle);
    }
    seaUsdWrap
      .querySelectorAll(
        ".sea-route-dv-terminal, .sea-route-station, .sea-route-port-input, .sea-route-line-input"
      )
      .forEach((el) => {
        if (el instanceof HTMLInputElement) {
          enableDatalistOpenOnFocus(el);
        }
      });
    syncSailingDateOriginOptions();
    syncRailAutoSectionsFromSea();
    mergeExtraSailingRowsFromSeaBlocks();
  }

  function syncAutoRubRowsToWarehouseAddresses() {
    const rows = [
      ...warehouseAddressesWrap.querySelectorAll(".warehouse-address-row"),
    ];
    const prevValues = rows.map((rowEl) => {
      const prevInput = rowEl.querySelector('input[name="autoRub"]');
      return prevInput instanceof HTMLInputElement
        ? String(prevInput.value || "").trim()
        : "";
    });
    rows.forEach((rowEl, i) => {
      let slot = rowEl.querySelector("[data-auto-rub-slot]");
      if (!(slot instanceof HTMLElement)) {
        slot = document.createElement("div");
        slot.className = "cost-follow cost-follow--auto";
        slot.setAttribute("data-auto-rub-slot", "");
        rowEl.appendChild(slot);
      }
      slot.innerHTML = "";
      const idx = i + 1;

      const label = document.createElement("label");
      label.htmlFor = "autoRub-" + String(idx);
      label.textContent =
        "Авто до склада " + String(idx) + ", RUB *";

      const input = document.createElement("input");
      input.id = "autoRub-" + String(idx);
      input.name = "autoRub";
      input.type = "number";
      input.step = "1";
      input.min = "0";
      input.required = true;
      input.placeholder = "Например, 28000";
      input.value = prevValues[i] || "";

      slot.appendChild(label);
      slot.appendChild(input);
    });
  }

  function formatOriginPorts(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(", ");
    }
    return String(value || "—");
  }

  function normalizeOriginPortToken(value) {
    return String(value || "")
      .trim()
      .toUpperCase();
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

  function formatDestinationStations(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(", ");
    }
    return String(value || "—");
  }

  function formatCargoSecurity(value) {
    if (value === "yes") {
      return "Да";
    }
    if (value === "no") {
      return "Нет";
    }
    return "—";
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

  function tokensEqualRu(a, b) {
    return (
      String(a || "")
        .trim()
        .localeCompare(String(b || "").trim(), "ru", {
          sensitivity: "accent",
        }) === 0
    );
  }

  function addOptionToDatalist(datalistEl, value) {
    const isStationList = datalistEl.id === "station-suggestions";
    const exists = [...datalistEl.querySelectorAll("option")].some((option) =>
      isStationList
        ? tokensEqualRu(option.value, value)
        : option.value.trim().toUpperCase() === value.trim().toUpperCase()
    );
    if (exists) {
      return;
    }
    const option = document.createElement("option");
    option.value = value;
    datalistEl.appendChild(option);
    sortDatalistOptions(datalistEl);
  }

  function addCheckboxOption(container, checkboxName, value, destination) {
    const isStation = checkboxName === "destinationQuickStations";
    const bookingAgentQ = checkboxName === "bookingAgentQuickOptions";
    const exists = [
      ...container.querySelectorAll(`input[name="${checkboxName}"]`),
    ].some(
      (input) =>
        input instanceof HTMLInputElement &&
        (isStation || bookingAgentQ
          ? tokensEqualRu(input.value, value)
          : input.value.trim().toUpperCase() === value.trim().toUpperCase())
    );
    if (exists) {
      return;
    }
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = checkboxName;
    input.value = value;
    if (destination) {
      input.dataset.destination = String(destination);
    }
    label.appendChild(input);
    label.append(" " + value);
    container.appendChild(label);
    sortCheckboxOptions(container, checkboxName);
  }

  function sortDatalistOptions(datalistEl) {
    const values = [...datalistEl.querySelectorAll("option")]
      .map((option) => option.value.trim())
      .filter(Boolean)
      .sort((a, b) =>
        datalistEl.id === "station-suggestions"
          ? a.localeCompare(b, "ru", { sensitivity: "base" })
          : a.localeCompare(b, "en", { sensitivity: "base" })
      );
    datalistEl.innerHTML = values
      .map((value) => datalistOptionWithLabelMarkup(value))
      .join("");
  }

  function sortCheckboxOptions(container, checkboxName) {
    const sortLocale =
      checkboxName === "destinationQuickStations" ||
      checkboxName === "bookingAgentQuickOptions"
        ? "ru"
        : "en";
    const entries = [...container.querySelectorAll(`input[name="${checkboxName}"]`)]
      .map((input) => {
        if (!(input instanceof HTMLInputElement)) {
          return null;
        }
        return {
          value: input.value.trim(),
          checked: input.checked,
          destination: input.dataset.destination || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) =>
        a.value.localeCompare(b.value, sortLocale, {
          sensitivity: "base",
        })
      );

    container.innerHTML = entries
      .map((entry) => {
        const checked = entry.checked ? " checked" : "";
        const destinationAttr = entry.destination
          ? ' data-destination="' + escapeHtml(entry.destination) + '"'
          : "";
        return (
          '<label><input type="checkbox" name="' +
          checkboxName +
          '" value="' +
          escapeHtml(entry.value) +
          '"' +
          destinationAttr +
          checked +
          " /> " +
          escapeHtml(entry.value) +
          "</label>"
        );
      })
      .join("");
  }

  function normalizeQuickOptionToken(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function getSelectedShippingLines() {
    return [
      ...shippingLineQuickPicks.querySelectorAll(
        'input[name="shippingLineQuickOptions"]:checked'
      ),
    ]
      .map((input) =>
        input instanceof HTMLInputElement ? String(input.value || "").trim() : ""
      )
      .filter(Boolean);
  }

  function syncShippingLineQuickPicksToInput() {
    const selectedLines = getSelectedShippingLines();
    const fromInput = String(shippingLineInput.value || "")
      .split(",")
      .map((item) => item.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    const merged = [];
    const seenNorm = new Set();
    function addLine(line) {
      const lineNorm = String(line || "")
        .trim()
        .replace(/\s+/g, " ");
      if (!lineNorm) {
        return;
      }
      const key = normalizeQuickOptionToken(lineNorm);
      if (seenNorm.has(key)) {
        return;
      }
      seenNorm.add(key);
      merged.push(lineNorm);
    }
    fromInput.forEach(addLine);
    selectedLines.forEach((line) =>
      addLine(String(line || "").trim().replace(/\s+/g, " "))
    );

    if (shippingLineInput instanceof HTMLInputElement) {
      shippingLineInput.value = merged.join(", ");
    }
    syncBookingAgentShippingLineDatalist();
    syncSeaUsdRowsToRouteCombinations();
    syncTariffValidityRowsUi();
  }

  function syncShippingLineInputToQuickPicks() {
    const selected = new Set(
      String(shippingLineInput.value || "")
        .split(",")
        .map((item) => normalizeQuickOptionToken(item))
        .filter(Boolean)
    );
    [
      ...shippingLineQuickPicks.querySelectorAll(
        'input[name="shippingLineQuickOptions"]'
      ),
    ].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.checked = selected.has(normalizeQuickOptionToken(input.value));
    });
    syncBookingAgentShippingLineDatalist();
    syncSeaUsdRowsToRouteCombinations();
    syncTariffValidityRowsUi();
  }

  function isBookingAgentProvided(value) {
    const normalized = String(value || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    return normalized !== "" && normalized !== "нет";
  }

  /** Нужна ли привязка агента к морской линии: есть хотя бы один слот с реальным агентом (не пусто и не «нет»). */
  function bookingAgentMergedRequiresShippingLine(mergedAgentField) {
    const parts = String(mergedAgentField || "")
      .split(";")
      .map((p) => String(p || "").trim().replace(/\s+/g, " "))
      .filter(Boolean);
    return parts.some((p) => isBookingAgentProvided(p));
  }

  function syncBookingAgentShippingLineDatalist() {
    if (
      !(bookingAgentRouteLineSuggestions instanceof HTMLDataListElement) ||
      !(bookingAgentShippingLineInput instanceof HTMLInputElement)
    ) {
      return;
    }
    const lines = getShippingLinesFromInput();
    const merged = uniqueSorted(lines.concat(readSavedList(ROUTE_LINES_KEY)));
    bookingAgentRouteLineSuggestions.innerHTML = merged
      .map((value) => datalistOptionWithLabelMarkup(value))
      .join("");
    const current = String(bookingAgentShippingLineInput.value || "")
      .trim()
      .replace(/\s+/g, " ");
    if (
      current &&
      merged.length &&
      !merged.some(
        (line) =>
          normalizeShippingLineToken(line) ===
          normalizeShippingLineToken(current)
      )
    ) {
      bookingAgentShippingLineInput.value = "";
    }
  }

  function syncBookingAgentLineVisibility() {
    mergeBookingAgentSlotsToHiddenField();
    const shouldShow = getBookingAgentSlotInputs().some((inp) =>
      isBookingAgentProvided(String(inp.value || "").trim())
    );
    bookingAgentLineWrap.hidden = !shouldShow;
    if (!(bookingAgentShippingLineInput instanceof HTMLInputElement)) {
      return;
    }
    bookingAgentShippingLineInput.required = shouldShow;
    bookingAgentShippingLineInput.disabled = !shouldShow;
    if (!shouldShow) {
      bookingAgentShippingLineInput.value = "";
    } else {
      syncBookingAgentShippingLineDatalist();
    }
  }

  function formatBookingAgentDisplay(rate) {
    const agent = String(rate.bookingAgent || "").trim();
    if (!agent) {
      return "—";
    }
    if (!isBookingAgentProvided(agent)) {
      return agent;
    }
    const line = String(rate.bookingAgentShippingLine || "").trim();
    if (!line) {
      return agent;
    }
    const rateLine = String(rate.shippingLine || "").trim();
    if (
      rateLine &&
      normalizeShippingLineToken(rateLine) !== normalizeShippingLineToken(line)
    ) {
      return "—";
    }
    return agent + " (" + line + ")";
  }

  function getSelectedRailTerminals() {
    return [
      ...railTerminalQuickPicks.querySelectorAll(
        'input[name="railTerminalQuickOptions"]:checked'
      ),
    ]
      .map((input) =>
        input instanceof HTMLInputElement ? String(input.value || "").trim() : ""
      )
      .filter(Boolean);
  }

  function parseTerminalTokensForCargoSelect() {
    const raw = String(railTerminalInput.value || "");
    const parts = raw.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const key = normalizeQuickOptionToken(p);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(String(p).replace(/\s+/g, " ").trim());
    }
    return out;
  }

  function rebuildCargoTerminalSelect(terminalValues) {
    if (!(cargoDepartureTerminalSelect instanceof HTMLSelectElement)) {
      return;
    }
    const prev = cargoDepartureTerminalSelect.value;
    cargoDepartureTerminalSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent =
      terminalValues.length === 0
        ? "Сначала укажите терминал прибытия (ДВ) в маршруте выше"
        : "Выберите терминал отправления";
    cargoDepartureTerminalSelect.appendChild(placeholder);
    for (let i = 0; i < terminalValues.length; i++) {
      const t = terminalValues[i];
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      cargoDepartureTerminalSelect.appendChild(opt);
    }
    if (terminalValues.length === 0) {
      cargoDepartureTerminalSelect.disabled = true;
      cargoDepartureTerminalSelect.removeAttribute("required");
      cargoDepartureTerminalSelect.value = "";
    } else {
      cargoDepartureTerminalSelect.disabled = false;
      cargoDepartureTerminalSelect.setAttribute("required", "required");
      const keep = terminalValues.some((x) => x === prev);
      if (keep) {
        cargoDepartureTerminalSelect.value = prev;
      } else if (terminalValues.length === 1) {
        cargoDepartureTerminalSelect.value = terminalValues[0];
      } else {
        cargoDepartureTerminalSelect.value = "";
      }
    }
  }

  function rebuildCargoStationSelect(stationValues) {
    if (!(cargoDestinationStationSelect instanceof HTMLSelectElement)) {
      return;
    }
    const prev = cargoDestinationStationSelect.value;
    cargoDestinationStationSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent =
      stationValues.length === 0
        ? "Сначала укажите станции в блоке маршрута выше"
        : "Выберите станцию назначения";
    cargoDestinationStationSelect.appendChild(placeholder);
    for (let i = 0; i < stationValues.length; i++) {
      const s = stationValues[i];
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      cargoDestinationStationSelect.appendChild(opt);
    }
    if (stationValues.length === 0) {
      cargoDestinationStationSelect.disabled = true;
      cargoDestinationStationSelect.removeAttribute("required");
      cargoDestinationStationSelect.value = "";
    } else {
      cargoDestinationStationSelect.disabled = false;
      cargoDestinationStationSelect.setAttribute("required", "required");
      const keep = stationValues.some((x) => x === prev);
      if (keep) {
        cargoDestinationStationSelect.value = prev;
      } else if (stationValues.length === 1) {
        cargoDestinationStationSelect.value = stationValues[0];
      } else {
        cargoDestinationStationSelect.value = "";
      }
    }
  }

  function refreshCargoRouteSelectOptions() {
    rebuildCargoTerminalSelect(parseTerminalTokensForCargoSelect());
    rebuildCargoStationSelect(getDestinationStations());
  }

  function syncRailTerminalQuickPicksToInput() {
    const selectedTerminals = getSelectedRailTerminals();
    railTerminalInput.value = selectedTerminals.join(", ");
    refreshCargoRouteSelectOptions();
  }

  function syncRailTerminalInputToQuickPicks() {
    const selected = new Set(
      String(railTerminalInput.value || "")
        .split(/[,/]/)
        .map((item) => normalizeQuickOptionToken(item))
        .filter(Boolean)
    );
    [
      ...railTerminalQuickPicks.querySelectorAll(
        'input[name="railTerminalQuickOptions"]'
      ),
    ].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.checked = selected.has(normalizeQuickOptionToken(input.value));
    });
    refreshCargoRouteSelectOptions();
  }

  function syncStationQuickPicksToInput() {
    const selectedStations = [
      ...stationQuickPicks.querySelectorAll(
        'input[name="destinationQuickStations"]:checked'
      ),
    ]
      .map((node) =>
        node instanceof HTMLInputElement
          ? String(node.value || "").trim().replace(/\s+/g, " ")
          : ""
      )
      .filter(Boolean);
    const joined = selectedStations.join(", ");
    const firstStationInput = destinationStationsWrap.querySelector(
      'input[name="destinationStations"]'
    );
    if (!(firstStationInput instanceof HTMLInputElement)) {
      refreshCargoRouteSelectOptions();
      return;
    }
    firstStationInput.value = joined;
    if (newStationOptionInput instanceof HTMLInputElement) {
      newStationOptionInput.value = joined;
    }
    refreshCargoRouteSelectOptions();
  }

  function syncOriginQuickPicksToInput() {
    const selectedPorts = [
      ...originQuickPicks.querySelectorAll('input[name="originQuickPorts"]:checked'),
    ]
      .map((node) =>
        node instanceof HTMLInputElement ? String(node.value || "").trim().toUpperCase() : ""
      )
      .filter(Boolean);

    function portsFromCommaList(raw) {
      const out = [];
      String(raw || "")
        .split(",")
        .forEach((chunk) => {
          const u = String(chunk || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, " ");
          if (u) {
            out.push(u);
          }
        });
      return out;
    }

    const fromField =
      newPortOptionInput instanceof HTMLInputElement
        ? portsFromCommaList(newPortOptionInput.value)
        : [];

    const merged = [];
    const seen = new Set();
    function addPort(p) {
      const u = String(p || "").trim().toUpperCase().replace(/\s+/g, " ");
      if (!u || seen.has(u)) {
        return;
      }
      seen.add(u);
      merged.push(u);
    }
    fromField.forEach(addPort);
    selectedPorts.forEach(addPort);

    const joined = merged.join(", ");
    if (newPortOptionInput instanceof HTMLInputElement) {
      newPortOptionInput.value = joined;
    }
    originPortsWrap.querySelectorAll('input[name="originPorts"]').forEach((node) => {
      if (node instanceof HTMLInputElement) {
        node.value = joined;
      }
    });
  }

  function enableDatalistOpenOnFocus(inputEl) {
    const tryOpen = () => {
      if (typeof inputEl.showPicker === "function") {
        try {
          inputEl.showPicker();
        } catch (error) {
          // Игнорируем: браузер может блокировать showPicker без явного действия.
        }
      }
    };
    inputEl.addEventListener("focus", () => {
      setTimeout(tryOpen, 0);
    });
    inputEl.addEventListener("click", tryOpen);
  }

  function filterStationQuickPicksByDestination(destination) {
    const labels = [
      ...stationQuickPicks.querySelectorAll("label"),
    ];
    const destTrim = String(destination || "").trim();
    const showAll = !destTrim;
    labels.forEach((label) => {
      const input = label.querySelector('input[name="destinationQuickStations"]');
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const stationDestination = String(input.dataset.destination || "").trim();
      const visible =
        showAll ||
        !stationDestination ||
        stationDestination === destTrim;
      label.style.display = visible ? "inline-flex" : "none";
      if (!visible) {
        input.checked = false;
      }
    });
  }

  function sailingExtraRoutesPairKey(origin, line) {
    const o = normalizeOriginPortToken(origin);
    const l = normalizeShippingLineToken(line);
    if (!o || !l) {
      return "";
    }
    return o + "\0" + l;
  }

  function getUniqueSeaRoutePortLinePairs() {
    /** Без повторов: несколько блоков моря с тем же портом и линией (20′ / 40′) дают одну строку здесь. */
    const pairs = [];
    const seen = new Set();
    [...seaUsdWrap.querySelectorAll(".sea-route-block")].forEach((blk) => {
      const origin = normalizeOriginPortToken(String(blk.dataset.routeOrigin || ""));
      const line = String(blk.dataset.routeLine || "").trim().replace(/\s+/g, " ");
      if (!origin || !line) {
        return;
      }
      const k = sailingExtraRoutesPairKey(origin, line);
      if (!k || seen.has(k)) {
        return;
      }
      seen.add(k);
      pairs.push({ origin, line });
    });
    return pairs;
  }

  function getExtraSailingOriginChoices() {
    const uniq = [];
    const seenNorm = new Set();
    function push(raw) {
      const o = normalizeOriginPortToken(raw);
      if (!o || seenNorm.has(o)) {
        return;
      }
      seenNorm.add(o);
      uniq.push(o);
    }
    getOriginPorts().forEach(push);
    getUniqueSeaRoutePortLinePairs().forEach((pair) => push(pair.origin));
    uniq.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    return uniq;
  }

  function mergeExtraSailingRowsFromSeaBlocks() {
    if (!sailingDatesWrap || !seaUsdWrap) {
      return;
    }
    const pairs = getUniqueSeaRoutePortLinePairs();
    const rows = [...sailingDatesWrap.querySelectorAll(".sailing-date-row")];
    const covered = new Set();
    rows.forEach((rowEl) => {
      const sel = rowEl.querySelector('select[name="nextSailingDateOrigin"]');
      const li = rowEl.querySelector('input[name="nextSailingDateLine"]');
      const o =
        sel instanceof HTMLSelectElement
          ? normalizeOriginPortToken(sel.value || "")
          : "";
      const l =
        li instanceof HTMLInputElement
          ? String(li.value || "").trim().replace(/\s+/g, " ")
          : "";
      const k = sailingExtraRoutesPairKey(o, l);
      if (k) {
        covered.add(k);
      }
    });
    pairs.forEach((pair) => {
      const k = sailingExtraRoutesPairKey(pair.origin, pair.line);
      if (!k || covered.has(k)) {
        return;
      }
      appendSailingDateRow("", { origin: pair.origin, line: pair.line });
      covered.add(k);
    });
  }

  function appendSailingDateRow(dateValue, preset = null) {
    const p =
      preset && typeof preset === "object" ? preset : {};
    const dateRaw =
      typeof dateValue === "string" ? dateValue : String(dateValue || "");
    const row = document.createElement("div");
    row.className = "sailing-date-row sailing-date-row--with-line";

    const originSelect = document.createElement("select");
    originSelect.name = "nextSailingDateOrigin";
    originSelect.setAttribute("aria-label", "Порт отправления");

    const originPlaceholder = document.createElement("option");
    originPlaceholder.value = "";
    originPlaceholder.textContent = "Порт отправления (из блоков связки)";
    originSelect.appendChild(originPlaceholder);

    const lineInput = document.createElement("input");
    lineInput.name = "nextSailingDateLine";
    lineInput.setAttribute("list", "shipping-line-suggestions");
    lineInput.placeholder = "Морская линия";
    lineInput.setAttribute("aria-label", "Морская линия");

    const input = document.createElement("input");
    input.type = "date";
    input.name = "nextSailingDates";
    input.value = dateRaw.trim();

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn-copy-extra-sailing btn-mini-control";
    copyBtn.dataset.action = "copy-extra-sailing-row";
    copyBtn.textContent = "Копировать";
    copyBtn.setAttribute(
      "aria-label",
      "Копировать строку; дату выхода нужно указать заново"
    );

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-remove-date";
    removeBtn.dataset.action = "remove-date";
    removeBtn.textContent = "−";
    removeBtn.setAttribute("aria-label", "Удалить строку");

    row.appendChild(originSelect);
    row.appendChild(lineInput);
    row.appendChild(input);
    row.appendChild(copyBtn);
    row.appendChild(removeBtn);
    sailingDatesWrap.appendChild(row);

    syncSailingDateOriginOptions();

    const wantOrigin = normalizeOriginPortToken(String(p.origin || ""));
    if (wantOrigin) {
      const hasSame = [...originSelect.options].some(
        (opt) =>
          normalizeOriginPortToken(
            opt instanceof HTMLOptionElement ? opt.value : ""
          ) === wantOrigin
      );
      if (!hasSame) {
        const opt = document.createElement("option");
        opt.value = wantOrigin;
        opt.textContent = wantOrigin;
        originSelect.appendChild(opt);
      }
      originSelect.value = wantOrigin;
    }

    lineInput.value = String(p.line || "").trim();
  }

  function resetSailingDateRows() {
    sailingDatesWrap.innerHTML = "";
    mergeExtraSailingRowsFromSeaBlocks();
    if (!(extraSailingPanel instanceof HTMLElement)) {
      return;
    }
    extraSailingPanel.hidden = true;
    if (extraSailingToggle instanceof HTMLButtonElement) {
      extraSailingToggle.textContent = "Показать";
      extraSailingToggle.setAttribute("aria-expanded", "false");
    }
  }

  function syncSailingDateOriginOptions() {
    const origins = getExtraSailingOriginChoices();
    const selects = [
      ...sailingDatesWrap.querySelectorAll('select[name="nextSailingDateOrigin"]'),
    ];
    selects.forEach((selectNode) => {
      if (!(selectNode instanceof HTMLSelectElement)) {
        return;
      }
      const prevValue = String(selectNode.value || "").trim().toUpperCase();
      selectNode.innerHTML = "";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Порт отправления (из блоков связки)";
      selectNode.appendChild(placeholder);

      origins.forEach((origin) => {
        const option = document.createElement("option");
        option.value = origin;
        option.textContent = origin;
        selectNode.appendChild(option);
      });

      if (prevValue && origins.includes(prevValue)) {
        selectNode.value = prevValue;
      } else {
        selectNode.value = "";
      }
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildMonthFilterTabs() {
    monthTabsWrap.innerHTML = months
      .map((name, index) => {
        const value = index + 1;
        const shortLabel = escapeHtml(name.slice(0, 3));
        return (
          '<button type="button" class="rates-tab rates-tab-month" data-month="' +
          value +
          '">' +
          shortLabel +
          "</button>"
        );
      })
      .join("");
  }

  function refreshYearTabs(allRates) {
    const list = Array.isArray(allRates) ? allRates : [];
    const ys = new Set();
    list.forEach((r) => {
      const b = tariffValidityBounds(r);
      if (!b) {
        return;
      }
      let y = b.from.getFullYear();
      const yEnd = b.to.getFullYear();
      while (y <= yEnd) {
        ys.add(y);
        y++;
      }
    });
    if (!ys.size) {
      ys.add(FIXED_YEAR);
    }
    const years = [...ys].sort((a, b) => b - a);
    yearTabsWrap.innerHTML = years
      .map(
        (y) =>
          '<button type="button" class="rates-tab rates-tab-year" data-year="' +
          escapeHtml(String(y)) +
          '">' +
          escapeHtml(String(y)) +
          "</button>"
      )
      .join("");
    if (!years.some((y) => Number(y) === Number(activeYear))) {
      activeYear = years[0];
    }
  }

  function syncFilterTabsActiveStates() {
    [...tabsWrap.querySelectorAll(".rates-tab[data-destination]")].forEach(
      (tabButton) => {
        tabButton.classList.toggle(
          "is-active",
          tabButton.dataset.destination === activeDestination
        );
      }
    );
    [...yearTabsWrap.querySelectorAll(".rates-tab-year")].forEach(
      (btn) => {
        btn.classList.toggle(
          "is-active",
          Number(btn.dataset.year) === Number(activeYear)
        );
      }
    );
    [...monthTabsWrap.querySelectorAll(".rates-tab-month")].forEach((btn) => {
      btn.classList.toggle(
        "is-active",
        Number(btn.dataset.month) === Number(activeMonth)
      );
    });
  }
});
