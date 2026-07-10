(function () {
  "use strict";

  // Source: js/storage.js
  const STORAGE_KEY = "personal-expense-manager:v1";

  const defaultCategories = [
    { id: "salary", name: "Salario", icon: "💵", color: "#16a34a" },
    { id: "food", name: "Comida", icon: "🍔¸", color: "#f97316" },
    { id: "transport", name: "Transporte", icon: "🚗", color: "#0ea5e9" },
    { id: "home", name: "Hogar", icon: "🏠 ", color: "#8b5cf6" },
    { id: "fun", name: "Ocio", icon: "🏖️", color: "#ec4899" },
    { id: "savings", name: "Ahorro", icon: "💰", color: "#14b8a6" },
    { id: "other", name: "Otros", icon: "🤷‍", color: "#64748b" },
  ];

  const defaultSettings = {
    theme: "light",
    currency: "DOP",
    financialStartDay: 1,
  };

  const supportedCurrencies = new Set(["DOP", "USD"]);

  function createDefaultState() {
    return {
      transactions: [],
      categories: defaultCategories.map((category) => ({ ...category })),
      settings: { ...defaultSettings },
    };
  }

  function createId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function loadState() {
    try {
      const rawState = localStorage.getItem(STORAGE_KEY);
      if (!rawState) {
        return createDefaultState();
      }

      const parsedState = JSON.parse(rawState);
      return normalizeState(parsedState);
    } catch {
      return createDefaultState();
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function exportState(state) {
    return JSON.stringify(normalizeState(state), null, 2);
  }

  function importState(jsonText) {
    const parsedState = JSON.parse(jsonText);
    return normalizeState(parsedState);
  }

  function normalizeState(state) {
    const safeState = state && typeof state === "object" ? state : {};
    const transactions = Array.isArray(safeState.transactions) ? safeState.transactions : [];
    const categories = Array.isArray(safeState.categories) && safeState.categories.length > 0
      ? safeState.categories
      : defaultCategories;

    return {
      transactions: transactions.map(normalizeTransaction).filter(Boolean),
      categories: categories.map(normalizeCategory).filter(Boolean),
      settings: {
        ...defaultSettings,
        ...normalizeSettings(safeState.settings),
      },
    };
  }

  function normalizeSettings(settings) {
    if (!settings || typeof settings !== "object") {
      return {};
    }

    return {
      ...settings,
      currency: supportedCurrencies.has(settings.currency) ? settings.currency : defaultSettings.currency,
    };
  }

  function normalizeTransaction(transaction) {
    if (!transaction || typeof transaction !== "object") {
      return null;
    }

    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    return {
      id: String(transaction.id || createId()),
      type: transaction.type === "income" ? "income" : "expense",
      amount,
      categoryId: String(transaction.categoryId || "other"),
      description: String(transaction.description || "Movimiento").trim(),
      date: String(transaction.date || new Date().toISOString().slice(0, 10)),
      paymentMethod: String(transaction.paymentMethod || "").trim(),
      notes: String(transaction.notes || "").trim(),
      createdAt: String(transaction.createdAt || new Date().toISOString()),
      updatedAt: String(transaction.updatedAt || new Date().toISOString()),
    };
  }

  function normalizeCategory(category) {
    if (!category || typeof category !== "object") {
      return null;
    }

    return {
      id: String(category.id || createId()),
      name: String(category.name || "Categoria").trim(),
      icon: String(category.icon || "âœ¨").trim().slice(0, 3),
      color: /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : "#64748b",
    };
  }


  // Source: js/categories.js

  function upsertCategory(categories, payload) {
    const category = {
      id: payload.id || createId(),
      name: payload.name.trim(),
      icon: payload.icon.trim() || "âœ¨",
      color: payload.color,
    };

    if (!category.name) {
      throw new Error("La categoria necesita un nombre.");
    }

    const existingIndex = categories.findIndex((item) => item.id === category.id);
    if (existingIndex >= 0) {
      return categories.map((item) => (item.id === category.id ? category : item));
    }

    return [...categories, category];
  }

  function deleteCategory(categories, transactions, categoryId) {
    if (transactions.some((transaction) => transaction.categoryId === categoryId)) {
      throw new Error("No puedes eliminar una categoria con movimientos asociados.");
    }

    if (categories.length <= 1) {
      throw new Error("Debe existir al menos una categoria.");
    }

    return categories.filter((category) => category.id !== categoryId);
  }

  function getCategory(categories, categoryId) {
    return categories.find((category) => category.id === categoryId) || {
      id: "unknown",
      name: "Sin categoria",
      icon: "â”",
      color: "#64748b",
    };
  }


  // Source: js/transactions.js

  function upsertTransaction(transactions, payload) {
    const now = new Date().toISOString();
    const transaction = {
      id: payload.id || createId(),
      type: payload.type,
      amount: Number(payload.amount),
      categoryId: payload.categoryId,
      description: payload.description.trim(),
      date: payload.date,
      paymentMethod: payload.paymentMethod.trim(),
      notes: payload.notes.trim(),
      createdAt: payload.createdAt || now,
      updatedAt: now,
    };

    validateTransaction(transaction);

    const existingIndex = transactions.findIndex((item) => item.id === transaction.id);
    if (existingIndex >= 0) {
      return transactions.map((item) => (item.id === transaction.id ? transaction : item));
    }

    return [transaction, ...transactions];
  }

  function deleteTransaction(transactions, transactionId) {
    return transactions.filter((transaction) => transaction.id !== transactionId);
  }

  function filterTransactions(transactions, filters) {
    const searchTerm = filters.search.trim().toLowerCase();

    return transactions
      .filter((transaction) => filters.type === "all" || transaction.type === filters.type)
      .filter((transaction) => filters.categoryId === "all" || transaction.categoryId === filters.categoryId)
      .filter((transaction) => !filters.month || transaction.date.startsWith(filters.month))
      .filter((transaction) => {
        if (!searchTerm) {
          return true;
        }

        return [transaction.description, transaction.notes, transaction.paymentMethod]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm);
      })
      .sort((first, second) => sortTransactions(first, second, filters.sort));
  }

  function validateTransaction(transaction) {
    if (!["income", "expense"].includes(transaction.type)) {
      throw new Error("Selecciona un tipo valido.");
    }

    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
      throw new Error("El monto debe ser mayor que cero.");
    }

    if (!transaction.categoryId) {
      throw new Error("Selecciona una categoria.");
    }

    if (!transaction.description) {
      throw new Error("La descripcion es obligatoria.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
      throw new Error("Selecciona una fecha valida.");
    }
  }

  function sortTransactions(first, second, sortMode) {
    if (sortMode === "date-asc") {
      return first.date.localeCompare(second.date);
    }

    if (sortMode === "amount-desc") {
      return second.amount - first.amount;
    }

    if (sortMode === "amount-asc") {
      return first.amount - second.amount;
    }

    return second.date.localeCompare(first.date);
  }


  // Source: js/dashboard.js
  function calculateTotals(transactions, settings) {
    const totalIncome = sumByType(transactions, "income");
    const totalExpenses = sumByType(transactions, "expense");
    const { start, end } = getFinancialMonthRange(new Date(), settings.financialStartDay);
    const monthlyTransactions = transactions.filter((transaction) => {
      const transactionDate = parseLocalDate(transaction.date);
      return transactionDate >= start && transactionDate <= end;
    });

    return {
      totalIncome,
      totalExpenses,
      totalBalance: totalIncome - totalExpenses,
      monthlyBalance: sumByType(monthlyTransactions, "income") - sumByType(monthlyTransactions, "expense"),
      monthRangeLabel: formatDateRange(start, end),
    };
  }

  function formatMoney(value, currency) {
    return new Intl.NumberFormat("es-VE", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatDate(dateText) {
    return new Intl.DateTimeFormat("es-VE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(parseLocalDate(dateText));
  }

  function sumByType(transactions, type) {
    return transactions
      .filter((transaction) => transaction.type === type)
      .reduce((total, transaction) => total + transaction.amount, 0);
  }

  function getFinancialMonthRange(referenceDate, financialStartDay) {
    const startDay = Math.min(Math.max(Number(financialStartDay) || 1, 1), 28);
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const currentDay = referenceDate.getDate();

    const start = currentDay >= startDay
      ? new Date(year, month, startDay)
      : new Date(year, month - 1, startDay);
    const end = currentDay >= startDay
      ? new Date(year, month + 1, startDay - 1, 23, 59, 59)
      : new Date(year, month, startDay - 1, 23, 59, 59);

    return { start, end };
  }

  function formatDateRange(start, end) {
    const formatter = new Intl.DateTimeFormat("es-VE", {
      day: "2-digit",
      month: "short",
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  }

  function parseLocalDate(dateText) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(year, month - 1, day);
  }


  // Source: js/charts.js

  function renderCharts(transactions, categories, settings) {
    renderCategoryChart(document.getElementById("categoryChart"), transactions, categories, settings);
    renderIncomeExpenseChart(document.getElementById("incomeExpenseChart"), transactions, settings);
    renderBalanceChart(document.getElementById("balanceChart"), transactions, settings);
  }

  function renderCategoryChart(canvas, transactions, categories, settings) {
    const expensesByCategory = transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((groups, transaction) => {
        groups[transaction.categoryId] = (groups[transaction.categoryId] || 0) + transaction.amount;
        return groups;
      }, {});

    const segments = Object.entries(expensesByCategory).map(([categoryId, value]) => ({
      category: getCategory(categories, categoryId),
      value,
    }));

    drawDonut(canvas, segments, settings);
  }

  function renderIncomeExpenseChart(canvas, transactions, settings) {
    const income = transactions
      .filter((transaction) => transaction.type === "income")
      .reduce((total, transaction) => total + transaction.amount, 0);
    const expenses = transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((total, transaction) => total + transaction.amount, 0);

    drawBars(canvas, [
      { label: "Ingresos", value: income, color: "#16a34a" },
      { label: "Gastos", value: expenses, color: "#dc2626" },
    ], settings);
  }

  function renderBalanceChart(canvas, transactions, settings) {
    const sortedTransactions = [...transactions].sort((first, second) => first.date.localeCompare(second.date));
    let balance = 0;
    const points = sortedTransactions.map((transaction) => {
      balance += transaction.type === "income" ? transaction.amount : -transaction.amount;
      return {
        label: transaction.date.slice(5),
        value: balance,
      };
    });

    drawLine(canvas, points, settings);
  }

  function setupCanvas(canvas) {
    const context = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || canvas.width;
    const height = Math.round(width * 0.62);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }

  function drawEmpty(context, width, height) {
    context.fillStyle = getTextMutedColor();
    context.font = "600 14px system-ui";
    context.textAlign = "center";
    context.fillText("Sin datos todavia", width / 2, height / 2);
  }

  function drawDonut(canvas, segments, settings) {
    const { context, width, height } = setupCanvas(canvas);
    if (segments.length === 0) {
      drawEmpty(context, width, height);
      return;
    }

    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const centerX = width * 0.32;
    const centerY = height * 0.48;
    const radius = Math.min(width, height) * 0.28;
    let startAngle = -Math.PI / 2;

    segments.forEach((segment) => {
      const slice = (segment.value / total) * Math.PI * 2;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.arc(centerX, centerY, radius, startAngle, startAngle + slice);
      context.closePath();
      context.fillStyle = segment.category.color;
      context.fill();
      startAngle += slice;
    });

    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.56, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = "source-over";

    context.textAlign = "left";
    segments.slice(0, 5).forEach((segment, index) => {
      const y = 34 + index * 31;
      context.fillStyle = segment.category.color;
      context.fillRect(width * 0.62, y - 10, 12, 12);
      context.fillStyle = getTextColor();
      context.font = "700 13px system-ui";
      context.fillText(`${segment.category.icon} ${segment.category.name}`, width * 0.67, y);
      context.fillStyle = getTextMutedColor();
      context.font = "600 12px system-ui";
      context.fillText(formatMoney(segment.value, settings.currency), width * 0.67, y + 16);
    });
  }

  function drawBars(canvas, bars, settings) {
    const { context, width, height } = setupCanvas(canvas);
    const maxValue = Math.max(...bars.map((bar) => bar.value), 1);
    const barWidth = width * 0.22;
    const chartBottom = height - 46;
    const chartTop = 24;
    const chartHeight = chartBottom - chartTop;

    bars.forEach((bar, index) => {
      const x = width * (0.28 + index * 0.32);
      const barHeight = (bar.value / maxValue) * chartHeight;
      context.fillStyle = bar.color;
      roundRect(context, x, chartBottom - barHeight, barWidth, barHeight, 12);
      context.fill();
      context.fillStyle = getTextColor();
      context.font = "800 13px system-ui";
      context.textAlign = "center";
      context.fillText(bar.label, x + barWidth / 2, height - 22);
      context.fillStyle = getTextMutedColor();
      context.font = "700 12px system-ui";
      context.fillText(formatMoney(bar.value, settings.currency), x + barWidth / 2, chartBottom - barHeight - 8);
    });
  }

  function drawLine(canvas, points, settings) {
    const { context, width, height } = setupCanvas(canvas);
    if (points.length === 0) {
      drawEmpty(context, width, height);
      return;
    }

    const values = points.map((point) => point.value);
    const minValue = Math.min(...values, 0);
    const maxValue = Math.max(...values, 1);
    const padding = 32;
    const drawableWidth = width - padding * 2;
    const drawableHeight = height - padding * 2;
    const range = maxValue - minValue || 1;

    context.strokeStyle = getBorderColor();
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding, padding);
    context.lineTo(padding, height - padding);
    context.lineTo(width - padding, height - padding);
    context.stroke();

    context.strokeStyle = "#2563eb";
    context.lineWidth = 3;
    context.beginPath();
    points.forEach((point, index) => {
      const x = padding + (points.length === 1 ? drawableWidth : (index / (points.length - 1)) * drawableWidth);
      const y = height - padding - ((point.value - minValue) / range) * drawableHeight;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();

    points.slice(-4).forEach((point, index, visiblePoints) => {
      const originalIndex = points.length - visiblePoints.length + index;
      const x = padding + (points.length === 1 ? drawableWidth : (originalIndex / (points.length - 1)) * drawableWidth);
      const y = height - padding - ((point.value - minValue) / range) * drawableHeight;
      context.fillStyle = "#2563eb";
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    });

    context.fillStyle = getTextMutedColor();
    context.font = "700 12px system-ui";
    context.textAlign = "right";
    context.fillText(formatMoney(maxValue, settings.currency), width - padding, 18);
    context.fillText(formatMoney(points.at(-1).value, settings.currency), width - padding, height - 10);
  }

  function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height);
    context.lineTo(x, y + height);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
  }

  function getTextColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--text").trim();
  }

  function getTextMutedColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim();
  }

  function getBorderColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--border").trim();
  }


  // Source: js/app.js

  let state = loadState();

  const elements = {
    headerBalance: document.getElementById("headerBalance"),
    totalBalance: document.getElementById("totalBalance"),
    totalIncome: document.getElementById("totalIncome"),
    totalExpenses: document.getElementById("totalExpenses"),
    monthlyBalance: document.getElementById("monthlyBalance"),
    monthRangeLabel: document.getElementById("monthRangeLabel"),
    transactionsTable: document.getElementById("transactionsTable"),
    emptyTransactions: document.getElementById("emptyTransactions"),
    rowTemplate: document.getElementById("transactionRowTemplate"),
    transactionModal: document.getElementById("transactionModal"),
    transactionForm: document.getElementById("transactionForm"),
    transactionModalTitle: document.getElementById("transactionModalTitle"),
    settingsModal: document.getElementById("settingsModal"),
    settingsForm: document.getElementById("settingsForm"),
    filtersForm: document.getElementById("filtersForm"),
    searchInput: document.getElementById("searchInput"),
    monthFilter: document.getElementById("monthFilter"),
    categoryFilter: document.getElementById("categoryFilter"),
    typeFilter: document.getElementById("typeFilter"),
    sortSelect: document.getElementById("sortSelect"),
    transactionId: document.getElementById("transactionId"),
    transactionType: document.getElementById("transactionType"),
    transactionAmount: document.getElementById("transactionAmount"),
    transactionCategory: document.getElementById("transactionCategory"),
    transactionDate: document.getElementById("transactionDate"),
    transactionDescription: document.getElementById("transactionDescription"),
    transactionPayment: document.getElementById("transactionPayment"),
    transactionNotes: document.getElementById("transactionNotes"),
    themeSelect: document.getElementById("themeSelect"),
    currencySelect: document.getElementById("currencySelect"),
    financialStartDay: document.getElementById("financialStartDay"),
    categoryId: document.getElementById("categoryId"),
    categoryName: document.getElementById("categoryName"),
    categoryIcon: document.getElementById("categoryIcon"),
    categoryColor: document.getElementById("categoryColor"),
    saveCategoryButton: document.getElementById("saveCategoryButton"),
    categoriesList: document.getElementById("categoriesList"),
    importInput: document.getElementById("importInput"),
  };

  initialize();

  function initialize() {
    bindEvents();
    fillFinancialDays();
    applyTheme();
    render();
    registerServiceWorker();
  }

  function bindEvents() {
    document.getElementById("addTransactionButton").addEventListener("click", () => openTransactionModal());
    document.getElementById("settingsButton").addEventListener("click", openSettingsModal);
    document.getElementById("exportButton").addEventListener("click", handleExport);
    document.getElementById("clearDataButton").addEventListener("click", handleClearData);

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => {
        document.getElementById(button.dataset.closeModal).close();
      });
    });

    elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
    elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
    elements.filtersForm.addEventListener("input", renderTransactions);
    elements.filtersForm.addEventListener("change", renderTransactions);
    elements.transactionType.addEventListener("change", populateTransactionCategories);
    elements.saveCategoryButton.addEventListener("click", handleCategorySave);
    elements.importInput.addEventListener("change", handleImport);
    elements.transactionsTable.addEventListener("click", handleTransactionAction);
    elements.categoriesList.addEventListener("click", handleCategoryAction);
    window.addEventListener("resize", () => renderCharts(state.transactions, state.categories, state.settings));
  }

  function render() {
    saveState(state);
    applyTheme();
    renderDashboard();
    populateCategorySelects();
    renderTransactions();
    renderCategories();
    renderSettings();
    renderCharts(state.transactions, state.categories, state.settings);
  }

  function renderDashboard() {
    const totals = calculateTotals(state.transactions, state.settings);
    elements.headerBalance.textContent = formatMoney(totals.totalBalance, state.settings.currency);
    elements.totalBalance.textContent = formatMoney(totals.totalBalance, state.settings.currency);
    elements.totalIncome.textContent = formatMoney(totals.totalIncome, state.settings.currency);
    elements.totalExpenses.textContent = formatMoney(totals.totalExpenses, state.settings.currency);
    elements.monthlyBalance.textContent = formatMoney(totals.monthlyBalance, state.settings.currency);
    elements.monthRangeLabel.textContent = totals.monthRangeLabel;
  }

  function renderTransactions() {
    const transactions = filterTransactions(state.transactions, getFilters());
    elements.transactionsTable.replaceChildren();
    elements.emptyTransactions.hidden = transactions.length > 0;

    transactions.forEach((transaction) => {
      const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
      const category = getCategory(state.categories, transaction.categoryId);
      row.dataset.id = transaction.id;
      row.querySelector('[data-cell="date"]').textContent = formatDate(transaction.date);
      row.querySelector('[data-cell="description"]').textContent = transaction.description;
      row.querySelector('[data-cell="notes"]').textContent = buildNotes(transaction);
      row.querySelector('[data-cell="category"]').innerHTML = `
        <span class="category-pill" style="border: 1px solid ${category.color}33">
          <span>${category.icon}</span><span>${category.name}</span>
        </span>
      `;
      const amountCell = row.querySelector('[data-cell="amount"]');
      amountCell.textContent = `${transaction.type === "income" ? "+" : "-"}${formatMoney(transaction.amount, state.settings.currency)}`;
      amountCell.className = transaction.type === "income" ? "amount-income" : "amount-expense";
      elements.transactionsTable.append(row);
    });
  }

  function renderCategories() {
    elements.categoriesList.replaceChildren();
    state.categories.forEach((category) => {
      const item = document.createElement("div");
      item.className = "category-item";
      item.dataset.id = category.id;
      item.innerHTML = `
        <div class="category-item__meta">
          <span class="color-dot" style="background:${category.color}"></span>
          <strong>${category.icon} ${category.name}</strong>
        </div>
        <div class="table-actions">
          <button class="small-button" type="button" data-action="edit-category">Editar</button>
          <button class="small-button small-button--danger" type="button" data-action="delete-category">Eliminar</button>
        </div>
      `;
      elements.categoriesList.append(item);
    });
  }

  function renderSettings() {
    elements.themeSelect.value = state.settings.theme;
    elements.currencySelect.value = state.settings.currency;
    elements.financialStartDay.value = String(state.settings.financialStartDay);
  }

  function populateCategorySelects() {
    const categoryOptions = state.categories
      .map((category) => `<option value="${category.id}">${category.icon} ${category.name}</option>`)
      .join("");

    elements.transactionCategory.innerHTML = categoryOptions;
    elements.categoryFilter.innerHTML = `<option value="all">Todas</option>${categoryOptions}`;
  }

  function populateTransactionCategories() {
    if (!elements.transactionCategory.value && state.categories.length > 0) {
      elements.transactionCategory.value = state.categories[0].id;
    }
  }

  function fillFinancialDays() {
    elements.financialStartDay.innerHTML = Array.from({ length: 28 }, (_, index) => {
      const day = index + 1;
      return `<option value="${day}">Dia ${day}</option>`;
    }).join("");
  }

  function openTransactionModal(transaction = null) {
    elements.transactionForm.reset();
    elements.transactionId.value = transaction?.id || "";
    elements.transactionModalTitle.textContent = transaction ? "Editar movimiento" : "Nuevo movimiento";
    elements.transactionType.value = transaction?.type || "expense";
    elements.transactionAmount.value = transaction?.amount || "";
    elements.transactionCategory.value = transaction?.categoryId || state.categories[0]?.id || "";
    elements.transactionDate.value = transaction?.date || new Date().toISOString().slice(0, 10);
    elements.transactionDescription.value = transaction?.description || "";
    elements.transactionPayment.value = transaction?.paymentMethod || "";
    elements.transactionNotes.value = transaction?.notes || "";
    elements.transactionModal.showModal();
  }

  function openSettingsModal() {
    renderSettings();
    renderCategories();
    elements.settingsModal.showModal();
  }

  function handleTransactionSubmit(event) {
    event.preventDefault();

    try {
      const existingTransaction = state.transactions.find((item) => item.id === elements.transactionId.value);
      state.transactions = upsertTransaction(state.transactions, {
        id: elements.transactionId.value,
        type: elements.transactionType.value,
        amount: elements.transactionAmount.value,
        categoryId: elements.transactionCategory.value,
        description: elements.transactionDescription.value,
        date: elements.transactionDate.value,
        paymentMethod: elements.transactionPayment.value,
        notes: elements.transactionNotes.value,
        createdAt: existingTransaction?.createdAt,
      });
      elements.transactionModal.close();
      render();
    } catch (error) {
      alert(error.message);
    }
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    state.settings = {
      theme: elements.themeSelect.value,
      currency: elements.currencySelect.value,
      financialStartDay: Number(elements.financialStartDay.value),
    };
    elements.settingsModal.close();
    render();
  }

  function handleCategorySave() {
    try {
      state.categories = upsertCategory(state.categories, {
        id: elements.categoryId.value,
        name: elements.categoryName.value,
        icon: elements.categoryIcon.value,
        color: elements.categoryColor.value,
      });
      resetCategoryForm();
      render();
    } catch (error) {
      alert(error.message);
    }
  }

  function handleTransactionAction(event) {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    const transactionId = button.closest("tr").dataset.id;
    const transaction = state.transactions.find((item) => item.id === transactionId);

    if (button.dataset.action === "edit") {
      openTransactionModal(transaction);
      return;
    }

    if (button.dataset.action === "delete" && confirm("Â¿Eliminar este movimiento?")) {
      state.transactions = deleteTransaction(state.transactions, transactionId);
      render();
    }
  }

  function handleCategoryAction(event) {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    const categoryId = button.closest(".category-item").dataset.id;
    const category = getCategory(state.categories, categoryId);

    if (button.dataset.action === "edit-category") {
      elements.categoryId.value = category.id;
      elements.categoryName.value = category.name;
      elements.categoryIcon.value = category.icon;
      elements.categoryColor.value = category.color;
      return;
    }

    if (button.dataset.action === "delete-category" && confirm("Â¿Eliminar esta categoria?")) {
      try {
        state.categories = deleteCategory(state.categories, state.transactions, categoryId);
        render();
      } catch (error) {
        alert(error.message);
      }
    }
  }

  function handleExport() {
    const blob = new Blob([exportState(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gestor-gastos-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      state = importState(text);
      render();
      alert("Datos importados correctamente.");
    } catch {
      alert("No se pudo importar el archivo. Revisa que sea un JSON valido.");
    } finally {
      event.target.value = "";
    }
  }

  function handleClearData() {
    if (!confirm("Esto eliminara todos los datos guardados en este navegador. Â¿Continuar?")) {
      return;
    }

    clearState();
    state = loadState();
    resetCategoryForm();
    render();
  }

  function getFilters() {
    return {
      search: elements.searchInput.value,
      month: elements.monthFilter.value,
      categoryId: elements.categoryFilter.value,
      type: elements.typeFilter.value,
      sort: elements.sortSelect.value,
    };
  }

  function buildNotes(transaction) {
    const metadata = [transaction.paymentMethod, transaction.notes].filter(Boolean).join(" Â· ");
    return metadata || (transaction.type === "income" ? "Ingreso" : "Gasto");
  }

  function resetCategoryForm() {
    elements.categoryId.value = "";
    elements.categoryName.value = "";
    elements.categoryIcon.value = "";
    elements.categoryColor.value = "#2563eb";
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.settings.theme;
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => undefined);
    }
  }

})();
