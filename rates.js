document.addEventListener("DOMContentLoaded", async () => {
  const STORAGE_KEY = "factoriall-rates-v1";
  const SALES_PROFIT_UNDO_STACK_KEY = "factoriall-rates-sales-profit-undo-v1";
  /** Имя коллекции в PocketBase: одна запись на агента, текстовое поле `name`. */
  const BOOKING_AGENTS_COLLECTION = "booking_agents";
  const API_BASE = "https://pocketbase-production-3100.up.railway.app";
  let bookingAgentsPbCache = [];
  const DESTINATIONS = ["MOSCOW", "ST. PETERSBURG", "MINSK"];
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

  const form = document.getElementById("rates-form");
  const destinationSelect = document.getElementById("destination");
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
  const addDestinationStationBtn = document.getElementById(
    "add-destination-station-btn"
  );
  const warehouseAddressesWrap = document.getElementById("warehouse-addresses-wrap");
  const addWarehouseAddressBtn = document.getElementById("add-warehouse-address-btn");
  const originQuickPicks = document.getElementById("origin-quick-picks");
  const stationQuickPicks = document.getElementById("station-quick-picks");
  const portsSelectAllBtn = document.getElementById("ports-select-all");
  const portsClearAllBtn = document.getElementById("ports-clear-all");
  const stationsSelectAllBtn = document.getElementById("stations-select-all");
  const stationsClearAllBtn = document.getElementById("stations-clear-all");
  const addPortOptionBtn = document.getElementById("add-port-option");
  const addStationOptionBtn = document.getElementById("add-station-option");
  const shippingLineInput = document.getElementById("shippingLine");
  const shippingLineQuickPicks = document.getElementById("shipping-line-quick-picks");
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
  const newShippingLineOptionInput = document.getElementById("new-shipping-line-option");
  const addBookingAgentOptionBtn = document.getElementById("add-booking-agent-option");
  const newBookingAgentOptionInput = document.getElementById("new-booking-agent-option");
  const railTerminalInput = document.getElementById("railTerminal");
  const railTerminalQuickPicks = document.getElementById("rail-terminal-quick-picks");
  const terminalsSelectAllBtn = document.getElementById("terminals-select-all");
  const terminalsClearAllBtn = document.getElementById("terminals-clear-all");
  const newPortOptionInput = document.getElementById("new-port-option");
  const newStationOptionInput = document.getElementById("new-station-option");
  const chinaPortSuggestions = document.getElementById("china-port-suggestions");
  const sailingDatesWrap = document.getElementById("sailing-dates-wrap");
  const addSailingDateBtn = document.getElementById("add-sailing-date-btn");
  const monthSelect = document.getElementById("validMonth");
  const yearInput = document.getElementById("validYear");
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
  const containerTypeSelect = document.getElementById("containerType");
  const railRubDefaultWrap = document.getElementById("rail-rub-default-wrap");
  const railRubDefaultInput = document.getElementById("railRub");
  const seaUsdWrap = document.getElementById("sea-usd-wrap");
  const autoRubWrap = document.getElementById("auto-rub-wrap");
  const railRub20Wrap = document.getElementById("rail-rub-20-wrap");
  const railRub20Lt24Input = document.getElementById("railRub20Lt24");
  const railRub20Gt24Input = document.getElementById("railRub20Gt24");
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

  if (
    !form ||
    !destinationSelect ||
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
    !addDestinationStationBtn ||
    !warehouseAddressesWrap ||
    !addWarehouseAddressBtn ||
    !seaUsdWrap ||
    !autoRubWrap ||
    !originQuickPicks ||
    !stationQuickPicks ||
    !portsSelectAllBtn ||
    !portsClearAllBtn ||
    !stationsSelectAllBtn ||
    !stationsClearAllBtn ||
    !addPortOptionBtn ||
    !addStationOptionBtn ||
    !shippingLineInput ||
    !shippingLineQuickPicks ||
    !bookingAgentInput ||
    !bookingAgentLineWrap ||
    !bookingAgentShippingLineInput ||
    !linesSelectAllBtn ||
    !linesClearAllBtn ||
    !addShippingLineOptionBtn ||
    !newShippingLineOptionInput ||
    !addBookingAgentOptionBtn ||
    !newBookingAgentOptionInput ||
    !railTerminalInput ||
    !railTerminalQuickPicks ||
    !terminalsSelectAllBtn ||
    !terminalsClearAllBtn ||
    !newPortOptionInput ||
    !newStationOptionInput ||
    !chinaPortSuggestions ||
    !sailingDatesWrap ||
    !addSailingDateBtn ||
    !monthSelect ||
    !yearInput ||
    !periodEl
  ) {
    return;
  }

  document.getElementById("year-rates").textContent = String(
    new Date().getFullYear()
  );

  months.forEach((monthName, index) => {
    const option = document.createElement("option");
    option.value = String(index + 1);
    option.textContent = monthName;
    monthSelect.appendChild(option);
  });

  const now = new Date();
  monthSelect.value = String(now.getMonth() + 1);
  yearInput.value = String(FIXED_YEAR);
  periodEl.textContent = buildCurrentPeriodText(now);
  syncPrintRoute();
  sortDatalistOptions(chinaPortSuggestions);
  sortDatalistOptions(stationSuggestions);
  sortCheckboxOptions(originQuickPicks, "originQuickPorts");
  sortCheckboxOptions(stationQuickPicks, "destinationQuickStations");
  sortCheckboxOptions(shippingLineQuickPicks, "shippingLineQuickOptions");
  filterStationQuickPicksByDestination(String(destinationSelect.value || "MOSCOW"));
  refreshWarehouseAddressRowLabels();
  syncAutoRubRowsToWarehouseAddresses();
  syncSeaUsdRowsToRouteCombinations();
  syncOriginQuickPicksToInput();
  syncShippingLineInputToQuickPicks();
  syncRailTerminalInputToQuickPicks();
  syncBookingAgentLineVisibility();
  syncRailRubVisibility();
  enableDatalistOpenOnFocus(shippingLineInput);
  enableDatalistOpenOnFocus(railTerminalInput);
  enableDatalistOpenOnFocus(bookingAgentInput);
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    syncQuickPickSelectionsToInputRows();
    syncShippingLineQuickPicksToInput();
    syncRailTerminalQuickPicksToInput();

    const formData = new FormData(form);
    const originPorts = getOriginPorts();
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
      ["destination", "Выберите финальное направление."],
      ["railTerminal", "Заполните терминал прибытия на Дальнем Востоке."],
      ["containerType", "Выберите тип контейнера."],
      ["shippingLine", "Заполните морскую линию."],
      ["bookingAgent", "Заполните букирующего агента (или НЕТ)."],
      ["customsClearance", "Выберите таможенную очистку."],
      ["validitySlot", "Выберите период действия."],
      ["validMonth", "Выберите месяц."],
      ["validYear", "Выберите год."],
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

    const containerTypeRaw = String(formData.get("containerType") || "").trim();
    if (containerTypeRaw === "20FT") {
      const railLt24Raw = String(formData.get("railRub20Lt24") || "").trim();
      const railGt24Raw = String(formData.get("railRub20Gt24") || "").trim();
      if (!railLt24Raw || !railGt24Raw) {
        setStatus(
          "Для контейнера 20FT заполните оба поля ЖД: для < 24 t и > 24 t.",
          "error"
        );
        return;
      }
    } else {
      const railDefaultRaw = String(formData.get("railRub") || "").trim();
      if (!railDefaultRaw) {
        setStatus("Заполните поле ЖД терминал отправления–станция назначения, RUB.", "error");
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

    if (!originPorts.length) {
      setStatus(
        "Добавьте хотя бы один порт отправления (вручную или через чекбоксы).",
        "error"
      );
      return;
    }

    const shippingLines = getShippingLinesFromInput();
    if (!shippingLines.length) {
      setStatus("Добавьте хотя бы одну морскую линию.", "error");
      return;
    }
    if (!destinationStations.length) {
      setStatus(
        "Добавьте хотя бы одну станцию назначения (вручную или через чекбоксы).",
        "error"
      );
      return;
    }
    if (!warehouseAddresses.length) {
      setStatus("Добавьте хотя бы один адрес склада выгрузки.", "error");
      return;
    }
    syncAutoRubRowsToWarehouseAddresses();
    syncSeaUsdRowsToRouteCombinations();
    const seaRouteRows = getSeaRouteRows();
    const routeCombos = buildOriginLineCombinations(originPorts, shippingLines);
    const seaRouteRowsWithKeys = seaRouteRows.map((row, index) => ({
      origin: routeCombos[index] ? routeCombos[index].origin : "",
      shippingLine: routeCombos[index] ? routeCombos[index].shippingLine : "",
      seaUsd: row.seaUsd,
      sailingDate: row.sailingDate,
    }));
    const seaUsds = seaRouteRowsWithKeys.map((row) => row.seaUsd);
    const autoRubs = getAutoRubValues();
    const expectedSeaRows = routeCombos.length;
    if (seaRouteRows.length < expectedSeaRows) {
      setStatus("Заполните фрахт и дату выхода для каждой строки порт + линия.", "error");
      return;
    }
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
    }
    if (autoRubs.length < warehouseAddresses.length) {
      setStatus("Заполните стоимость авто до каждого склада выгрузки.", "error");
      return;
    }
    for (let i = 0; i < warehouseAddresses.length; i++) {
      const value = autoRubs[i];
      if (!Number.isFinite(value) || value < 0) {
        setStatus(
          "Проверьте стоимость авто до склада выгрузки " + String(i + 1) + ".",
          "error"
        );
        return;
      }
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
    const railRub20Lt24Raw = String(formData.get("railRub20Lt24") || "").trim();
    const railRub20Gt24Raw = String(formData.get("railRub20Gt24") || "").trim();
    const railRubDefaultRaw = String(formData.get("railRub") || "").trim();
    const railRub20Lt24 =
      railRub20Lt24Raw === "" ? null : Number(railRub20Lt24Raw);
    const railRub20Gt24 =
      railRub20Gt24Raw === "" ? null : Number(railRub20Gt24Raw);
    const railRubDefault =
      railRubDefaultRaw === "" ? Number.NaN : Number(railRubDefaultRaw);
    const effectiveRailRubFor20 =
      cargoWeightKgValue != null && cargoWeightKgValue > 24000
        ? railRub20Gt24
        : railRub20Lt24;
    const finalRailRub =
      containerTypeRaw === "20FT" ? effectiveRailRubFor20 : railRubDefault;

    const bookingAgentRaw = String(formData.get("bookingAgent") || "").trim();
    const bookingAgentLineRaw = String(
      formData.get("bookingAgentShippingLine") || ""
    ).trim();
    if (isBookingAgentProvided(bookingAgentRaw) && !bookingAgentLineRaw) {
      setStatus("Укажите, для какой морской линии используется букирующий агент.", "error");
      return;
    }

    const rate = {
      id: buildRateId(formData),
      origin: originPorts[0] || "",
      originPorts,
      destination: String(formData.get("destination")),
      railTerminal: String(formData.get("railTerminal") || "").trim(),
      destinationStation: destinationStations[0] || "",
      destinationStations,
      containerType: containerTypeRaw,
      cargoSecurity: cargoSecurityRaw,
      tnvedCode: tnvedTrim,
      cargoWeightKg: cargoWeightKgValue,
      shippingLine: String(formData.get("shippingLine") || "").trim(),
      shippingLines,
      bookingAgent: bookingAgentRaw,
      bookingAgentShippingLine: bookingAgentLineRaw,
      customsClearance: customsClearanceRaw,
      validitySlot: String(formData.get("validitySlot")),
      validMonth: Number(formData.get("validMonth")),
      validYear: Number(formData.get("validYear")),
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
          seaRouteRowsWithKeys.map((row) => row.sailingDate).filter(Boolean)
        ),
      ],
      manager: String(formData.get("manager") || "").trim(),
      updatedAt: new Date().toISOString(),
    };

    if (
      Number.isNaN(rate.validMonth) ||
      Number.isNaN(rate.validYear) ||
      Number.isNaN(rate.railRub) ||
      Number.isNaN(rate.transitDays)
    ) {
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
      setStatus("Ставка обновлена для выбранного периода.", "success");
    } else {
      rates.push(rate);
      setStatus("Ставка опубликована.", "success");
    }

    await saveRates(rates);
    if (isBookingAgentProvided(bookingAgentRaw)) {
      await createBookingAgentPbRecord(bookingAgentRaw);
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
    monthSelect.value = String(now.getMonth() + 1);
    yearInput.value = String(FIXED_YEAR);
    syncSecurityCostVisibility();
    syncRailRubVisibility();
    syncShippingLineQuickPicksToInput();
    syncRailTerminalQuickPicksToInput();
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
  });

  addStationOptionBtn.addEventListener("click", () => {
    const value = String(newStationOptionInput.value || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!value) {
      return;
    }
    addOptionToDatalist(stationSuggestions, value);
    addCheckboxOption(
      stationQuickPicks,
      "destinationQuickStations",
      value,
      String(destinationSelect.value || "MOSCOW")
    );
    filterStationQuickPicksByDestination(String(destinationSelect.value || "MOSCOW"));
    newStationOptionInput.value = "";
  });

  addShippingLineOptionBtn.addEventListener("click", () => {
    const value = String(newShippingLineOptionInput.value || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!value) {
      return;
    }
    addOptionToDatalist(shippingLineSuggestions, value);
    addCheckboxOption(shippingLineQuickPicks, "shippingLineQuickOptions", value);
    shippingLineInput.value = value;
    syncShippingLineInputToQuickPicks();
    newShippingLineOptionInput.value = "";
  });

  addBookingAgentOptionBtn.addEventListener("click", async () => {
    const value = String(newBookingAgentOptionInput.value || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!value) {
      return;
    }
    await createBookingAgentPbRecord(value);
    try {
      const latest = await loadRates();
      refreshAutocompleteLists(latest);
    } catch (_) {
      refreshAutocompleteLists([]);
    }
    bookingAgentInput.value = value;
    newBookingAgentOptionInput.value = "";
    syncBookingAgentLineVisibility();
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

  shippingLineQuickPicks.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name !== "shippingLineQuickOptions") {
      return;
    }
    syncShippingLineQuickPicksToInput();
  });

  shippingLineInput.addEventListener("input", () => {
    syncShippingLineInputToQuickPicks();
  });
  bookingAgentInput.addEventListener("input", () => {
    syncBookingAgentLineVisibility();
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

  originQuickPicks.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name !== "originQuickPorts") {
      return;
    }
    syncOriginQuickPicksToInput();
    syncSeaUsdRowsToRouteCombinations();
  });

  originPortsWrap.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name !== "originPorts") {
      return;
    }
    syncSeaUsdRowsToRouteCombinations();
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

  destinationSelect.addEventListener("change", () => {
    filterStationQuickPicksByDestination(String(destinationSelect.value || "MOSCOW"));
    syncStationQuickPicksToInput();
  });
  containerTypeSelect?.addEventListener("change", () => {
    syncRailRubVisibility();
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

  function syncRailRubVisibility() {
    if (
      !(containerTypeSelect instanceof HTMLSelectElement) ||
      !(railRubDefaultWrap instanceof HTMLElement) ||
      !(railRub20Wrap instanceof HTMLElement) ||
      !(railRubDefaultInput instanceof HTMLInputElement) ||
      !(railRub20Lt24Input instanceof HTMLInputElement) ||
      !(railRub20Gt24Input instanceof HTMLInputElement)
    ) {
      return;
    }

    const is20Ft = String(containerTypeSelect.value || "") === "20FT";
    railRubDefaultWrap.hidden = is20Ft;
    railRub20Wrap.hidden = !is20Ft;

    railRubDefaultInput.required = !is20Ft;
    railRub20Lt24Input.required = is20Ft;
    railRub20Gt24Input.required = is20Ft;

    if (is20Ft) {
      railRubDefaultInput.value = "";
      return;
    }
    railRub20Lt24Input.value = "";
    railRub20Gt24Input.value = "";
  }

  form.querySelectorAll('input[name="cargoSecurity"]').forEach((el) => {
    el.addEventListener("change", syncSecurityCostVisibility);
  });
  syncSecurityCostVisibility();

  originPortsWrap.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.dataset.action !== "remove-origin-port") {
      return;
    }
    if (originPortsWrap.querySelectorAll(".origin-port-row").length <= 1) {
      const onlyInput = originPortsWrap.querySelector('input[name="originPorts"]');
      if (onlyInput instanceof HTMLInputElement) {
        onlyInput.value = "";
      }
      return;
    }
    target.closest(".origin-port-row")?.remove();
  });

  addDestinationStationBtn.addEventListener("click", () => {
    appendDestinationStationRow("");
  });

  addWarehouseAddressBtn.addEventListener("click", () => {
    appendWarehouseAddressRow("");
    refreshWarehouseAddressRowLabels();
    syncAutoRubRowsToWarehouseAddresses();
  });

  destinationStationsWrap.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.dataset.action !== "remove-destination-station") {
      return;
    }
    if (
      destinationStationsWrap.querySelectorAll(".destination-station-row").length <= 1
    ) {
      const onlyInput = destinationStationsWrap.querySelector(
        'input[name="destinationStations"]'
      );
      if (onlyInput instanceof HTMLInputElement) {
        onlyInput.value = "";
      }
      return;
    }
    target.closest(".destination-station-row")?.remove();
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

  addSailingDateBtn.addEventListener("click", () => {
    appendSailingDateRow("");
  });

  sailingDatesWrap.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
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
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!action || !id) {
      return;
    }

    if (action === "delete") {
      const rates = (await loadRates()).filter((rate) => rate.id !== id);
      await saveRates(rates);
      refreshAutocompleteLists(rates);
      refreshYearTabs(rates);
      syncFilterTabsActiveStates();
      fullPublicationRefresh(rates);
      setStatus("Ставка удалена.", "success");
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
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Ссылка на активный фильтр скопирована в буфер обмена.", "success");
    } catch (error) {
      setStatus("Не удалось скопировать. Ссылка: " + shareUrl, "error");
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

  function buildCurrentPeriodText(date) {
    const day = date.getDate();
    const half = day <= 15 ? "1-15" : "15-конец месяца";
    const monthName = months[date.getMonth()];
    return "Текущий рабочий период: " + half + " (" + monthName + " " + date.getFullYear() + ")";
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
    return [
      normalizedPorts,
      normalizedStations,
      String(formData.get("destination")),
      String(formData.get("containerType") || "").trim(),
      cargoSecurityForId,
      String(formData.get("customsClearance") || ""),
      String(formData.get("bookingAgent") || "").trim(),
      String(formData.get("validMonth")),
      String(formData.get("validYear")),
      String(formData.get("validitySlot")),
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

    return [
      normalizedPorts,
      normalizedStations,
      String(rate.destination || ""),
      String(rate.containerType || "").trim(),
      cargoSecurityForId,
      String(rate.customsClearance || ""),
      String(rate.bookingAgent || "").trim(),
      String(rate.validMonth ?? ""),
      String(rate.validYear ?? ""),
      String(rate.validitySlot || ""),
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
    return copy;
  }

  async function loadRates() {
    const auth = pocketBaseAuthHeaders();
    if (!auth.Authorization) {
      return [];
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
      return (data.items || []).map((record) =>
        normalizePocketBaseRateRecord(record)
      );
    } catch (e) {
      return [];
    }
  }

  async function saveRates(rates) {
    const auth = pocketBaseAuthHeaders();
    if (!auth.Authorization) {
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

  async function fetchBookingAgentsPb() {
    bookingAgentsPbCache = [];
    const auth = pocketBaseAuthHeaders();
    if (!auth.Authorization) {
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/collections/${BOOKING_AGENTS_COLLECTION}/records?perPage=500&sort=name`,
        { headers: { ...auth } }
      );
      if (!res.ok) {
        if (res.status === 404) {
          console.warn(
            "[rates] PocketBase: коллекция \"" +
              BOOKING_AGENTS_COLLECTION +
              "\" не найдена — создайте её в админке (поле name, text)."
          );
        }
        return;
      }
      const data = await res.json();
      const names = (data.items || [])
        .map((it) =>
          String(it.name == null ? "" : it.name)
            .trim()
            .replace(/\s+/g, " ")
        )
        .filter(Boolean);
      bookingAgentsPbCache = [...new Set(names.filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ru")
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
      if (typeof setStatus === "function") {
        setStatus("Войдите в систему, чтобы сохранить агента в общий справочник.", "error");
      }
      return false;
    }
    await fetchBookingAgentsPb();
    if (bookingAgentNameExists(bookingAgentsPbCache, trimmed)) {
      return true;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/collections/${BOOKING_AGENTS_COLLECTION}/records`,
        {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        }
      );
      if (!res.ok) {
        const detail = await res.text();
        console.warn("booking_agents POST", res.status, detail);
        if (typeof setStatus === "function") {
          setStatus(
            "Не удалось добавить агента в справочник (коллекция booking_agents / права API). Код: " +
              res.status +
              ".",
            "error"
          );
        }
        return false;
      }
      await fetchBookingAgentsPb();
      return true;
    } catch (err) {
      console.warn("booking_agents POST failed:", err);
      if (typeof setStatus === "function") {
        setStatus("Ошибка сети при сохранении агента в справочник.", "error");
      }
      return false;
    }
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
        Number(item.validYear) === Number(filterYear) &&
        Number(item.validMonth) === Number(filterMonth)
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
      const ctSet = [
        ...new Set(
          base.map((r) => String(r.containerType || "").trim()).filter(Boolean)
        ),
      ].sort((a, b) =>
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
          wantedCt.has(String(r.containerType || "").trim())
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
    const sorted = [...allRates].sort((a, b) => {
      if (a.validYear !== b.validYear) {
        return b.validYear - a.validYear;
      }
      if (a.validMonth !== b.validMonth) {
        return b.validMonth - a.validMonth;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    const filteredBase = sorted.filter(
      (item) =>
        item.destination === destination &&
        Number(item.validYear) === Number(filterYear) &&
        Number(item.validMonth) === Number(filterMonth)
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
        if (!Number.isFinite(seaUsd) || seaUsd < 0) {
          skipped++;
          return rate;
        }

        const pair20 = profitHas20RailPair(rate);
        if (!pair20 && (!Number.isFinite(railRub) || railRub < 0)) {
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
        } else {
          const addRail =
            railDeltaMode === "percent"
              ? railRub * (railValue / 100)
              : railValue;
          nextRailRub = Math.round(railRub + addRail);
        }

        undoPatch[rid] = snap;
        applied++;
        return {
          ...rate,
          seaUsd: nextSeaUsd,
          ...(nextSeaUsds.length ? { seaUsds: nextSeaUsds } : {}),
          ...(nextSeaRouteRows.length ? { seaRouteRows: nextSeaRouteRows } : {}),
          railRub: nextRailRub,
          ...(pair20 ? { railRub20Lt24: nextLt24, railRub20Gt24: nextGt24 } : {}),
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
      if (method === "fixed") {
        msg +=
          " Для 20′ с двумя тарифами ЖД фикс добавляется один раз — к тарифу по весу строки (≤24 т или &gt;24 т).";
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
    const railOk = Number.isFinite(railRub) && railRub >= 0 ? railRub : 0;
    if (cbSortExcludeLastMile) {
      return seaRub + railOk;
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
    return seaRub + railOk + autoOk + securityOk;
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
        ? "морской фрахт (USD)×курс + ЖД до станции (без автодоставки «последняя миля», без охраны)."
        : "морской фрахт (USD)×курс + ЖД + авто до склада + охрана при «Да» и указанной сумме.";
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

  /** КП (итоговая таблица): суммы вверх до целого; только ASCII-цифры (без запятой как разделителя дробной части). */
  function formatKpTariffCeilPlain(value) {
    const n = rateNumericOrNaN(value);
    if (!Number.isFinite(n)) {
      return "—";
    }
    return String(Math.ceil(n));
  }

  const KP_DIRECTIONS_COL_COUNT = 17;

  function buildKpDirectionsTheadHtml() {
    const railLt =
      "ЖД ТЕРМИНАЛ ОТПРАВЛ.–СТ. НАЗНАЧ.<br />ДЛЯ 20'FT &lt; 24 T, RUB";
    const railGt =
      "ЖД ТЕРМИНАЛ ОТПРАВЛ.–СТ. НАЗНАЧ.<br />ДЛЯ 20'FT &gt; 24 T, RUB";
    const rail40 =
      "ЖД ТЕРМИНАЛ ОТПРАВЛ.–СТ. НАЗНАЧ.<br />ДЛЯ 40' HQ, RUB";
    return (
      "<tr>" +
      '<th scope="col">Отправление</th>' +
      '<th scope="col">ЖД терминал</th>' +
      '<th scope="col">Станция назначения</th>' +
      '<th scope="col">Таможня</th>' +
      '<th scope="col">Склад выгрузки</th>' +
      '<th scope="col">Ближайшие выходы</th>' +
      '<th scope="col">Морская линия</th>' +
      '<th scope="col">Контейнер</th>' +
      '<th scope="col">Море, USD</th>' +
      '<th scope="col">' +
      railLt +
      "</th>" +
      '<th scope="col">' +
      railGt +
      "</th>" +
      '<th scope="col">' +
      rail40 +
      "</th>" +
      '<th scope="col">Авто, RUB</th>' +
      '<th scope="col" class="kp-col-screen-only">Транзит, дней</th>' +
      '<th scope="col" class="kp-col-screen-only">Период действия</th>' +
      '<th scope="col" class="kp-col-screen-only">Комментарий</th>' +
      "</tr>"
    );
  }

  function buildKpDirectionsRowHtml(rate) {
    const periodLabel =
      months[(rate.validMonth || 1) - 1] +
      " " +
      rate.validYear +
      ", " +
      (rate.validitySlot === "H1" ? "1-15" : "15-конец");
    const rail3 = formatRegistryRailTriple(rate, formatKpTariffCeilPlain);
    return (
      "<tr>" +
      "<td>" +
      escapeHtml(
        formatOriginPorts(rate.originPorts || [rate.origin]) + " → VLADIVOSTOK"
      ) +
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
      escapeHtml(formatWarehouseAddresses(rate)) +
      "</td>" +
      "<td>" +
      escapeHtml(formatSailingDates(rate.nextSailingDates || rate.nextSailing)) +
      "</td>" +
      "<td>" +
      escapeHtml(formatShippingLineDisplay(rate)) +
      "</td>" +
      "<td>" +
      escapeHtml(String(rate.containerType || "—")) +
      "</td>" +
      "<td>" +
      formatKpTariffCeilPlain(rate.seaUsd) +
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
      formatKpTariffCeilPlain(rate.autoRub) +
      "</td>" +
      '<td class="kp-col-screen-only">' +
      formatNumber(rate.transitDays) +
      "</td>" +
      '<td class="kp-col-screen-only">' +
      escapeHtml(periodLabel) +
      "</td>" +
      '<td class="kp-col-screen-only">' +
      escapeHtml(rate.manager || "—") +
      "</td>" +
      "</tr>"
    );
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
        origin: normalizeOriginPortToken(row.origin || routeCombos[index]?.origin || ""),
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
              seaUsd: Number.isFinite(seaUsdValue) ? seaUsdValue : Number(rate.seaUsd),
              seaUsds: [Number.isFinite(seaUsdValue) ? seaUsdValue : Number(rate.seaUsd)],
              nextSailingDates: sailingDate
                ? [sailingDate]
                : Array.isArray(rate.nextSailingDates)
                  ? rate.nextSailingDates
                  : [],
              warehouseAddress: address,
              warehouseAddresses: [address],
              autoRub: Number.isFinite(autoRubValue) ? autoRubValue : Number(rate.autoRub),
              autoRubs: [
                Number.isFinite(autoRubValue) ? autoRubValue : Number(rate.autoRub),
              ],
            });
          });
        });
      });
    });
    return expanded;
  }

  function renderTable(rates, destination, filterYear, filterMonth) {
    const sorted = [...rates].sort((a, b) => {
      if (a.validYear !== b.validYear) {
        return b.validYear - a.validYear;
      }
      if (a.validMonth !== b.validMonth) {
        return b.validMonth - a.validMonth;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    const filteredBase = sorted.filter(
      (item) =>
        item.destination === destination &&
        Number(item.validYear) === Number(filterYear) &&
        Number(item.validMonth) === Number(filterMonth)
    );

    if (!filteredBase.length) {
      tbody.innerHTML =
        '<tr><td colspan="20">В выбранной группе (направление, год, месяц) ставок пока нет.</td></tr>';
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
        const periodLabel =
          months[(rate.validMonth || 1) - 1] +
          " " +
          rate.validYear +
          ", " +
          (rate.validitySlot === "H1" ? "1-15" : "15-конец");
        const rail3 = formatRegistryRailTriple(rate);

        return (
          "<tr>" +
          "<td>" +
          escapeHtml(formatOriginPorts(rate.originPorts || [rate.origin]) + " → VLADIVOSTOK") +
          "</td>" +
          "<td>" +
          escapeHtml(rate.destination) +
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
          escapeHtml(formatWarehouseAddresses(rate)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatSailingDates(rate.nextSailingDates || rate.nextSailing)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatShippingLineDisplay(rate)) +
          "</td>" +
          "<td>" +
          escapeHtml(rate.containerType) +
          "</td>" +
          '<td class="no-print">' +
          escapeHtml(formatBookingAgentDisplay(rate)) +
          "</td>" +
          "<td>" +
          formatNumber(rate.seaUsd) +
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
    const route = "VLADIVOSTOK → " + dest;
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

  async function copySalesKpShareLink() {
    if (!Array.isArray(salesWorksetIds) || !salesWorksetIds.length) {
      setShareStatus("Сначала сформируйте таблицу для продаж.", true);
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
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("Ссылка КП скопирована в буфер обмена.", false);
    } catch {
      setShareStatus("Не удалось скопировать. Ссылка: " + shareUrl, true);
    }
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

      const periodLabel =
        months[(rate.validMonth || 1) - 1] +
        " " +
        rate.validYear +
        ", " +
        (rate.validitySlot === "H1" ? "1-15" : "15-конец");

      const expandedRates = expandRatesByRouteDimensions([rate]);
      expandedRates.forEach((expandedRate) => {
        rowsParts.push(
          "<tr data-rate-id=\"" +
          escapeHtml(id) +
          "\">" +
          "<td>" +
          escapeHtml(
            formatOriginPorts(expandedRate.originPorts || [expandedRate.origin]) + " → VLADIVOSTOK"
          ) +
          "</td>" +
          "<td>" +
          escapeHtml(formatShippingLineDisplay(expandedRate)) +
          "</td>" +
          "<td>" +
          escapeHtml(String(expandedRate.containerType || "—")) +
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

    if (salesKpTable instanceof HTMLTableElement) {
      const thead = salesKpTable.querySelector("thead");
      if (thead) {
        thead.innerHTML = buildKpDirectionsTheadHtml();
      }
    }

    if (!Array.isArray(salesWorksetIds) || !salesWorksetIds.length) {
      salesKpTbody.innerHTML =
        '<tr><td colspan="' +
        KP_DIRECTIONS_COL_COUNT +
        '">Таблица не сформирована. Нажмите «Сформировать таблицу для продаж».</td></tr>';
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
    const rows = expandedWorksetRates.map((rate) => buildKpDirectionsRowHtml(rate));
    salesKpTbody.innerHTML = rows.length
      ? rows.join("")
      : '<tr><td colspan="' +
        KP_DIRECTIONS_COL_COUNT +
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
    const routeLabel = "VLADIVOSTOK → " + activeDestination;
    if (printRouteTop) {
      printRouteTop.textContent = routeLabel;
    }
    if (printRouteBottom) {
      printRouteBottom.textContent = routeLabel;
    }
    syncSalesPrintMeta();
  }

  function refreshAutocompleteLists(rates) {
    const terminals = uniqueSorted(
      DEFAULT_RAIL_TERMINALS.concat(
        rates.map((item) => String(item.railTerminal || "").trim())
      )
    );
    const shippingLines = uniqueSorted(
      DEFAULT_SHIPPING_LINES.concat(
        rates.map((item) => String(item.shippingLine || "").trim())
      )
    );
    const bookingAgents = uniqueSorted(
      bookingAgentsPbCache.concat(
        rates.map((item) => String(item.bookingAgent || "").trim())
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
      .map((value) => '<option value="' + escapeHtml(value) + '"></option>')
      .join("");
    shippingLineSuggestions.innerHTML = shippingLines
      .map((value) => '<option value="' + escapeHtml(value) + '"></option>')
      .join("");
    bookingAgentSuggestions.innerHTML = bookingAgents
      .map((value) => '<option value="' + escapeHtml(value) + '"></option>')
      .join("");
    stationSuggestions.innerHTML = stations
      .map((value) => '<option value="' + escapeHtml(value) + '"></option>')
      .join("");
    sortDatalistOptions(terminalSuggestions);
    sortDatalistOptions(shippingLineSuggestions);
    sortDatalistOptions(bookingAgentSuggestions);
    sortDatalistOptions(stationSuggestions);
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
    return String(shippingLineInput.value || "")
      .split(",")
      .map((item) => item.trim().replace(/\s+/g, " "))
      .filter(Boolean);
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

    const inputs = [
      ...destinationStationsWrap.querySelectorAll(
        'input[name="destinationStations"]'
      ),
    ];
    inputs.forEach((input) => {
      const raw = input instanceof HTMLInputElement ? input.value : "";
      addStationCandidate(raw);
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
    [
      ...warehouseAddressesWrap.querySelectorAll('input[name="warehouseAddress"]'),
    ].forEach((input) => {
      const display =
        input instanceof HTMLInputElement
          ? String(input.value || "").trim().replace(/\s+/g, " ")
          : "";
      if (!display) {
        return;
      }
      const key = display.toLocaleLowerCase("ru-RU");
      if (seenKeys.has(key)) {
        return;
      }
      seenKeys.add(key);
      unique.push(display);
    });
    return unique;
  }

  function syncQuickPickSelectionsToInputRows() {
    // Дублируем первую выбранную опцию в первую строку ввода,
    // чтобы любые проверки/интеграции, читающие только input-строки,
    // тоже считали поля заполненными.
    const selectedPorts = [
      ...originQuickPicks.querySelectorAll('input[name="originQuickPorts"]:checked'),
    ]
      .map((node) => (node instanceof HTMLInputElement ? node.value.trim().toUpperCase() : ""))
      .filter(Boolean);
    const selectedStations = [
      ...stationQuickPicks.querySelectorAll('input[name="destinationQuickStations"]:checked'),
    ]
      .map((node) => (node instanceof HTMLInputElement ? node.value.trim().replace(/\s+/g, " ") : ""))
      .filter(Boolean);

    const firstPortInput = originPortsWrap.querySelector('input[name="originPorts"]');
    if (firstPortInput instanceof HTMLInputElement) {
      firstPortInput.value = selectedPorts.join(", ");
    }

    const firstStationInput = destinationStationsWrap.querySelector(
      'input[name="destinationStations"]'
    );
    if (
      firstStationInput instanceof HTMLInputElement &&
      !firstStationInput.value.trim() &&
      selectedStations.length
    ) {
      firstStationInput.value = selectedStations[0];
    }
  }

  function appendOriginPortRow(defaultValue) {
    const row = document.createElement("div");
    row.className = "origin-port-row";

    const input = document.createElement("input");
    input.name = "originPorts";
    input.setAttribute("list", "china-port-suggestions");
    input.placeholder = "Например, SHANGHAI";
    input.value = defaultValue || "";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-remove-date";
    removeBtn.dataset.action = "remove-origin-port";
    removeBtn.textContent = "−";
    removeBtn.setAttribute("aria-label", "Удалить порт");

    row.appendChild(input);
    row.appendChild(removeBtn);
    originPortsWrap.appendChild(row);
  }

  function resetOriginPortRows() {
    originPortsWrap.innerHTML =
      '<div class="origin-port-row"><input name="originPorts" list="china-port-suggestions" placeholder="Например, SHANGHAI" /></div>';
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
    const row = document.createElement("div");
    row.className = "destination-station-row";

    const input = document.createElement("input");
    input.name = "destinationStations";
    input.setAttribute("list", "station-suggestions");
    input.placeholder = "Например, Ворсино";
    input.value = defaultValue || "";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-remove-date";
    removeBtn.dataset.action = "remove-destination-station";
    removeBtn.textContent = "−";
    removeBtn.setAttribute("aria-label", "Удалить станцию");

    row.appendChild(input);
    row.appendChild(removeBtn);
    destinationStationsWrap.appendChild(row);
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
    warehouseAddressesWrap.appendChild(row);
  }

  function resetDestinationStationRows() {
    destinationStationsWrap.innerHTML =
      '<div class="destination-station-row"><input name="destinationStations" list="station-suggestions" placeholder="Например, Ворсино" /><button type="button" id="add-destination-station-btn" class="btn-add-date" aria-label="Добавить станцию">+</button></div>';
    const freshAddBtn = document.getElementById("add-destination-station-btn");
    if (freshAddBtn instanceof HTMLButtonElement) {
      freshAddBtn.addEventListener("click", () => {
        appendDestinationStationRow("");
      });
    }
    [
      ...stationQuickPicks.querySelectorAll(
        'input[name="destinationQuickStations"]'
      ),
    ].forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
      }
    });
    filterStationQuickPicksByDestination(String(destinationSelect.value || "MOSCOW"));
  }

  function resetWarehouseAddressRows() {
    warehouseAddressesWrap.innerHTML =
      '<div class="warehouse-address-row"><label for="warehouseAddress-1">Адрес склада выгрузки 1 *</label><div class="warehouse-address-controls"><input id="warehouseAddress-1" name="warehouseAddress" required placeholder="Например, МО, Подольск, Домодедовское ш., 12" /><button type="button" id="add-warehouse-address-btn" class="btn-add-date" aria-label="Добавить адрес выгрузки">+</button></div></div>';
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
    return [...autoRubWrap.querySelectorAll('input[name="autoRub"]')].map((input) => {
      const raw =
        input instanceof HTMLInputElement ? String(input.value || "").trim() : "";
      return raw === "" ? Number.NaN : Number(raw);
    });
  }

  function getSeaUsdValues() {
    return [...seaUsdWrap.querySelectorAll('input[name="seaUsd"]')].map((input) => {
      const raw =
        input instanceof HTMLInputElement ? String(input.value || "").trim() : "";
      return raw === "" ? Number.NaN : Number(raw);
    });
  }

  function getSeaRouteRows() {
    const seaInputs = [...seaUsdWrap.querySelectorAll('input[name="seaUsd"]')];
    const dateInputs = [...seaUsdWrap.querySelectorAll('input[name="seaSailingDate"]')];
    const routeRows = [];
    for (let i = 0; i < seaInputs.length; i++) {
      const seaRaw =
        seaInputs[i] instanceof HTMLInputElement
          ? String(seaInputs[i].value || "").trim()
          : "";
      const dateRaw =
        dateInputs[i] instanceof HTMLInputElement
          ? String(dateInputs[i].value || "").trim()
          : "";
      routeRows.push({
        seaUsd: seaRaw === "" ? Number.NaN : Number(seaRaw),
        sailingDate: dateRaw,
      });
    }
    return routeRows;
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
    const prevSeaValues = [...seaUsdWrap.querySelectorAll('input[name="seaUsd"]')].map((input) =>
      input instanceof HTMLInputElement ? String(input.value || "").trim() : ""
    );
    const prevDateValues = [
      ...seaUsdWrap.querySelectorAll('input[name="seaSailingDate"]'),
    ].map((input) =>
      input instanceof HTMLInputElement ? String(input.value || "").trim() : ""
    );
    seaUsdWrap.innerHTML = "";
    for (let i = 0; i < combos.length; i++) {
      const idx = i + 1;
      const combo = combos[i];
      const portLabel = combo.origin || "—";
      const lineLabel = combo.shippingLine || "—";
      const row = document.createElement("div");
      row.className = "sea-usd-row";

      const label = document.createElement("label");
      label.htmlFor = "seaUsd-" + String(idx);
      label.textContent =
        "Фрахт для строки " +
        String(idx) +
        " (" +
        portLabel +
        " / " +
        lineLabel +
        "), USD *";

      const input = document.createElement("input");
      input.id = "seaUsd-" + String(idx);
      input.name = "seaUsd";
      input.type = "number";
      input.step = "0.01";
      input.min = "0";
      input.required = true;
      input.placeholder = "Например, 1450";
      input.value = prevSeaValues[i] || "";

      const dateLabel = document.createElement("label");
      dateLabel.htmlFor = "seaSailingDate-" + String(idx);
      dateLabel.textContent = "Дата выхода для строки " + String(idx) + " *";

      const dateInput = document.createElement("input");
      dateInput.id = "seaSailingDate-" + String(idx);
      dateInput.name = "seaSailingDate";
      dateInput.type = "date";
      dateInput.required = true;
      dateInput.value = prevDateValues[i] || "";

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(dateLabel);
      row.appendChild(dateInput);
      seaUsdWrap.appendChild(row);
    }
    syncSailingDateOriginOptions();
  }

  function syncAutoRubRowsToWarehouseAddresses() {
    const addressCount = Math.max(
      1,
      warehouseAddressesWrap.querySelectorAll(".warehouse-address-row").length
    );
    const prevValues = [...autoRubWrap.querySelectorAll('input[name="autoRub"]')].map((input) =>
      input instanceof HTMLInputElement ? String(input.value || "").trim() : ""
    );
    autoRubWrap.innerHTML = "";
    for (let i = 0; i < addressCount; i++) {
      const idx = i + 1;
      const row = document.createElement("div");
      row.className = "auto-rub-row";

      const label = document.createElement("label");
      label.htmlFor = "autoRub-" + String(idx);
      label.textContent =
        "Авто до склада выгрузки " + String(idx) + ", RUB *";

      const input = document.createElement("input");
      input.id = "autoRub-" + String(idx);
      input.name = "autoRub";
      input.type = "number";
      input.step = "1";
      input.min = "0";
      input.required = true;
      input.placeholder = "Например, 28000";
      input.value = prevValues[i] || "";

      row.appendChild(label);
      row.appendChild(input);
      autoRubWrap.appendChild(row);
    }
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

  function normalizeShippingLineToken(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("ru-RU");
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
    const exists = [
      ...container.querySelectorAll(`input[name="${checkboxName}"]`),
    ].some(
      (input) =>
        input instanceof HTMLInputElement &&
        (isStation
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
      .map((value) => '<option value="' + escapeHtml(value) + '"></option>')
      .join("");
  }

  function sortCheckboxOptions(container, checkboxName) {
    const sortLocale =
      checkboxName === "destinationQuickStations" ? "ru" : "en";
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
    shippingLineInput.value = selectedLines.join(", ");
    syncBookingAgentShippingLineDatalist();
    syncSeaUsdRowsToRouteCombinations();
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
  }

  function isBookingAgentProvided(value) {
    const normalized = String(value || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
    return normalized !== "" && normalized !== "нет";
  }

  function syncBookingAgentShippingLineDatalist() {
    if (
      !(bookingAgentRouteLineSuggestions instanceof HTMLDataListElement) ||
      !(bookingAgentShippingLineInput instanceof HTMLInputElement)
    ) {
      return;
    }
    const lines = getShippingLinesFromInput();
    const sorted = [...new Set(lines)].sort((a, b) =>
      a.localeCompare(b, "ru", { sensitivity: "base" })
    );
    bookingAgentRouteLineSuggestions.innerHTML = sorted
      .map((value) => '<option value="' + escapeHtml(value) + '"></option>')
      .join("");
    const current = String(bookingAgentShippingLineInput.value || "")
      .trim()
      .replace(/\s+/g, " ");
    if (
      current &&
      sorted.length &&
      !sorted.some(
        (line) =>
          normalizeShippingLineToken(line) ===
          normalizeShippingLineToken(current)
      )
    ) {
      bookingAgentShippingLineInput.value = "";
    }
  }

  function syncBookingAgentLineVisibility() {
    const shouldShow = isBookingAgentProvided(bookingAgentInput.value);
    bookingAgentLineWrap.hidden = !shouldShow;
    bookingAgentShippingLineInput.required = shouldShow;
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

  function syncRailTerminalQuickPicksToInput() {
    const selectedTerminals = getSelectedRailTerminals();
    railTerminalInput.value = selectedTerminals.join(", ");
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
    const firstStationInput = destinationStationsWrap.querySelector(
      'input[name="destinationStations"]'
    );
    if (!(firstStationInput instanceof HTMLInputElement)) {
      return;
    }
    firstStationInput.value = selectedStations.join(", ");
  }

  function syncOriginQuickPicksToInput() {
    const selectedPorts = [
      ...originQuickPicks.querySelectorAll('input[name="originQuickPorts"]:checked'),
    ]
      .map((node) =>
        node instanceof HTMLInputElement ? String(node.value || "").trim().toUpperCase() : ""
      )
      .filter(Boolean);
    const firstPortInput = originPortsWrap.querySelector('input[name="originPorts"]');
    if (!(firstPortInput instanceof HTMLInputElement)) {
      return;
    }
    firstPortInput.value = selectedPorts.join(", ");
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
    labels.forEach((label) => {
      const input = label.querySelector('input[name="destinationQuickStations"]');
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const stationDestination = String(input.dataset.destination || "");
      const visible = !stationDestination || stationDestination === destination;
      label.style.display = visible ? "inline-flex" : "none";
      if (!visible) {
        input.checked = false;
      }
    });
  }

  function appendSailingDateRow(defaultValue) {
    const row = document.createElement("div");
    row.className = "sailing-date-row sailing-date-row--with-line";

    const originSelect = document.createElement("select");
    originSelect.name = "nextSailingDateOrigin";

    const originPlaceholder = document.createElement("option");
    originPlaceholder.value = "";
    originPlaceholder.textContent = "Порт отправления (из маршрута)";
    originSelect.appendChild(originPlaceholder);

    const input = document.createElement("input");
    input.type = "date";
    input.name = "nextSailingDates";
    input.required = true;
    input.value = defaultValue || "";

    const lineInput = document.createElement("input");
    lineInput.name = "nextSailingDateLine";
    lineInput.setAttribute("list", "shipping-line-suggestions");
    lineInput.placeholder = "Для какой линии (при необходимости)";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-remove-date";
    removeBtn.dataset.action = "remove-date";
    removeBtn.textContent = "−";
    removeBtn.setAttribute("aria-label", "Удалить дату");

    row.appendChild(originSelect);
    row.appendChild(lineInput);
    row.appendChild(input);
    row.appendChild(removeBtn);
    sailingDatesWrap.appendChild(row);
    syncSailingDateOriginOptions();
  }

  function resetSailingDateRows() {
    sailingDatesWrap.innerHTML =
      '<div class="sailing-date-row sailing-date-row--with-line"><select name="nextSailingDateOrigin"><option value="">Порт отправления (из маршрута)</option></select><input name="nextSailingDateLine" list="shipping-line-suggestions" placeholder="Для какой линии (при необходимости)" /><input name="nextSailingDates" type="date" required /><button type="button" id="add-sailing-date-btn" class="btn-add-date" aria-label="Добавить дату">+</button></div>';
    const freshAddBtn = document.getElementById("add-sailing-date-btn");
    if (freshAddBtn instanceof HTMLButtonElement) {
      freshAddBtn.addEventListener("click", () => {
        appendSailingDateRow("");
      });
    }
    syncSailingDateOriginOptions();
  }

  function syncSailingDateOriginOptions() {
    const origins = getOriginPorts();
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
      placeholder.textContent = "Порт отправления (из маршрута)";
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

  function refreshYearTabs() {
    const years = [FIXED_YEAR];
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
    activeYear = FIXED_YEAR;
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
