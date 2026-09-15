(function () {
  "use strict";

  // Source: js/storage.js
  const STORAGE_KEY = "personal-expense-manager:v1";

  const defaultCategories = [
    { id: "salary", name: "Salario", icon: "💼", color: "#4F7A5C" },
    { id: "food", name: "Comida", icon: "🍽️", color: "#C6633C" },
    { id: "transport", name: "Transporte", icon: "🚌", color: "#B37D4E" },
    { id: "home", name: "Hogar", icon: "🏠", color: "#8C6D58" },
    { id: "health", name: "Salud", icon: "🩺", color: "#B84C4C" },
    { id: "fun", name: "Ocio", icon: "🎮", color: "#A8587A" },
    { id: "savings", name: "Ahorro", icon: "🐖", color: "#3B6E53" },
    { id: "other", name: "Otros", icon: "✨", color: "#7A6F63" },
  ];

  const defaultSettings = {
    theme: "light",
    currency: "DOP",
    financialStartDay: 1,
    activeView: "viewPrincipal",
    reminders: [
      {
        id: "default-reminder",
        time: "20:00",
        label: "Recordatorio diario de gastos",
        enabled: true,
      },
    ],
  };

  const defaultEmergencyFund = {
    targetMonths: 3,
    currentAmount: 0,
    customTarget: 0,
  };

  const supportedCurrencies = new Set(["DOP", "USD", "EUR"]);

  function createDefaultState() {
    return {
      wallets: createDefaultWallets(),
      savingsGoals: [],
      emergencyFund: { ...defaultEmergencyFund },
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

    // Normalizar carteras
    const rawWallets = Array.isArray(safeState.wallets) && safeState.wallets.length > 0
      ? safeState.wallets
      : createDefaultWallets();
    const wallets = rawWallets.map(normalizeWallet).filter(Boolean);
    const finalWallets = wallets.length > 0 ? wallets : createDefaultWallets();

    // Normalizar categorías
    const categories = Array.isArray(safeState.categories) && safeState.categories.length > 0
      ? safeState.categories.map(normalizeCategory).filter(Boolean)
      : defaultCategories.map((c) => ({ ...c }));

    // Normalizar transacciones con compatibilidad hacia atrás
    const rawTransactions = Array.isArray(safeState.transactions) ? safeState.transactions : [];
    const transactions = rawTransactions
      .map((tx) => normalizeTransaction(tx, finalWallets))
      .filter(Boolean);

    // Normalizar Metas de ahorro
    const rawGoals = Array.isArray(safeState.savingsGoals) ? safeState.savingsGoals : [];
    const savingsGoals = rawGoals.map(normalizeSavingsGoal).filter(Boolean);

    // Normalizar Fondo de emergencia
    const emergencyFund = normalizeEmergencyFund(safeState.emergencyFund);

    return {
      wallets: finalWallets,
      savingsGoals,
      emergencyFund,
      transactions,
      categories: categories.length > 0 ? categories : defaultCategories,
      settings: {
        ...defaultSettings,
        ...normalizeSettings(safeState.settings),
      },
    };
  }

  function normalizeWallet(wallet) {
    if (!wallet || typeof wallet !== "object") {
      return null;
    }

    const type = wallet.type === WALLET_TYPES.TARJETA ? WALLET_TYPES.TARJETA : WALLET_TYPES.EFECTIVO;
    return {
      id: String(wallet.id || createId()),
      name: String(wallet.name || (type === WALLET_TYPES.TARJETA ? "Tarjeta" : "Efectivo")).trim(),
      type,
      initialBalance: Number(wallet.initialBalance) || 0,
      balance: Number(wallet.balance) || 0,
      icon: String(wallet.icon || (type === WALLET_TYPES.TARJETA ? "💳" : "💵")).trim(),
      color: /^#[0-9a-f]{6}$/i.test(wallet.color)
        ? wallet.color
        : type === WALLET_TYPES.TARJETA
          ? "#C6633C"
          : "#4F7A5C",
      createdAt: String(wallet.createdAt || new Date().toISOString()),
    };
  }

  function normalizeSavingsGoal(goal) {
    if (!goal || typeof goal !== "object") {
      return null;
    }

    const targetAmount = Number(goal.targetAmount) || 0;
    if (targetAmount <= 0) {
      return null;
    }

    return {
      id: String(goal.id || createId()),
      name: String(goal.name || "Meta de ahorro").trim(),
      targetAmount,
      currentAmount: Math.max(0, Number(goal.currentAmount) || 0),
      deadline: String(goal.deadline || "").trim(),
      icon: String(goal.icon || "🎯").trim(),
      color: /^#[0-9a-f]{6}$/i.test(goal.color) ? goal.color : "#C6633C",
      createdAt: String(goal.createdAt || new Date().toISOString()),
    };
  }

  function normalizeEmergencyFund(fund) {
    if (!fund || typeof fund !== "object") {
      return { ...defaultEmergencyFund };
    }

    return {
      targetMonths: Math.max(1, Math.min(24, Number(fund.targetMonths) || 3)),
      currentAmount: Math.max(0, Number(fund.currentAmount) || 0),
      customTarget: Math.max(0, Number(fund.customTarget) || 0),
    };
  }

  function normalizeSettings(settings) {
    if (!settings || typeof settings !== "object") {
      return { ...defaultSettings };
    }

    const rawReminders = Array.isArray(settings.reminders) ? settings.reminders : defaultSettings.reminders;
    const reminders = rawReminders
      .map(normalizeReminder)
      .filter(Boolean)
      .slice(0, 10);

    return {
      ...settings,
      theme: settings.theme === "dark" ? "dark" : "light",
      currency: supportedCurrencies.has(settings.currency) ? settings.currency : defaultSettings.currency,
      financialStartDay: Math.max(1, Math.min(28, Number(settings.financialStartDay) || 1)),
      activeView: typeof settings.activeView === "string" ? settings.activeView : defaultSettings.activeView,
      reminders: reminders.length > 0 ? reminders : defaultSettings.reminders,
    };
  }

  function normalizeReminder(reminder) {
    if (!reminder || typeof reminder !== "object") {
      return null;
    }
    const time = String(reminder.time || "20:00").trim();
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return null;
    }
    return {
      id: String(reminder.id || createId()),
      time,
      label: String(reminder.label || "Recordatorio de gastos").trim().slice(0, 40),
      enabled: Boolean(reminder.enabled),
    };
  }

  function normalizeTransaction(transaction, wallets = []) {
    if (!transaction || typeof transaction !== "object") {
      return null;
    }

    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    // Identificar cartera por defecto o resolver desde paymentMethod legacy
    const cashWallet = wallets.find((w) => w.type === WALLET_TYPES.EFECTIVO) || wallets[0];
    const cardWallet = wallets.find((w) => w.type === WALLET_TYPES.TARJETA) || wallets[1] || wallets[0];

    const rawPayment = String(transaction.paymentMethod || "").trim().toLowerCase();
    let resolvedWalletId = transaction.walletId;
    let transactionType = transaction.type;
    let transferType = transaction.transferType || "none";
    let sourceWalletId = transaction.sourceWalletId || null;
    let targetWalletId = transaction.targetWalletId || null;

    if (!resolvedWalletId) {
      if (["tarjeta", "card", "debito", "credito", "transferencia", "banco"].some((w) => rawPayment.includes(w))) {
        resolvedWalletId = cardWallet?.id || cashWallet?.id;
      } else if (rawPayment.includes("retiro")) {
        transactionType = "transfer";
        transferType = "withdrawal";
        sourceWalletId = cardWallet?.id;
        targetWalletId = cashWallet?.id;
        resolvedWalletId = cashWallet?.id;
      } else if (rawPayment.includes("deposito") || rawPayment.includes("abono")) {
        transactionType = "transfer";
        transferType = "deposit";
        sourceWalletId = cashWallet?.id;
        targetWalletId = cardWallet?.id;
        resolvedWalletId = cardWallet?.id;
      } else {
        resolvedWalletId = cashWallet?.id;
      }
    }

    // Validar que el walletId resuelto exista entre las carteras
    const walletExists = wallets.some((w) => w.id === resolvedWalletId);
    if (!walletExists) {
      resolvedWalletId = cashWallet?.id;
    }

    const validTypes = ["income", "expense", "transfer"];
    const finalType = validTypes.includes(transactionType) ? transactionType : "expense";

    const validFrequencies = ["none", "weekly", "biweekly", "monthly"];
    const recurringFrequency = validFrequencies.includes(transaction.recurringFrequency)
      ? transaction.recurringFrequency
      : transaction.isRecurring ? "monthly" : "none";

    return {
      id: String(transaction.id || createId()),
      type: finalType,
      amount,
      categoryId: String(transaction.categoryId || "other"),
      walletId: String(resolvedWalletId),
      sourceWalletId: sourceWalletId ? String(sourceWalletId) : null,
      targetWalletId: targetWalletId ? String(targetWalletId) : null,
      transferType: transferType || "none",
      isRecurring: Boolean(transaction.isRecurring || recurringFrequency !== "none"),
      recurringFrequency,
      description: String(transaction.description || (finalType === "transfer" ? "Transferencia" : "Movimiento")).trim(),
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
      icon: String(category.icon || "✨").trim(),
      color: /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : "#7A6F63",
    };
  }


  // Source: js/categories.js
  function upsertCategory(categories, payload) {
    const category = {
      id: payload.id || createId(),
      name: payload.name.trim(),
      icon: payload.icon.trim() || "✨",
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
      icon: "❔",
      color: "#64748b",
    };
  }


  // Source: js/transactions.js
  function upsertTransaction(transactions, payload) {
    const now = new Date().toISOString();
    const type = payload.type === "income" ? "income" : payload.type === "transfer" ? "transfer" : "expense";
    const isRecurring = Boolean(payload.isRecurring);
    const recurringFrequency = payload.recurringFrequency || (isRecurring ? "monthly" : "none");

    const transaction = {
      id: payload.id || createId(),
      type,
      amount: Number(payload.amount),
      categoryId: type === "transfer" ? "other" : (payload.categoryId || "other"),
      walletId: payload.walletId || payload.sourceWalletId || "wallet-cash",
      sourceWalletId: payload.sourceWalletId || (type === "transfer" ? payload.walletId : null),
      targetWalletId: payload.targetWalletId || null,
      transferType: payload.transferType || (type === "transfer" ? "transfer" : "none"),
      isRecurring,
      recurringFrequency,
      description: payload.description.trim(),
      date: payload.date,
      paymentMethod: (payload.paymentMethod || "").trim(),
      notes: (payload.notes || "").trim(),
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
    const searchTerm = (filters.search || "").trim().toLowerCase();

    return transactions
      .filter((transaction) => {
        if (!filters.type || filters.type === "all") return true;
        return transaction.type === filters.type;
      })
      .filter((transaction) => {
        if (!filters.categoryId || filters.categoryId === "all") return true;
        return transaction.categoryId === filters.categoryId;
      })
      .filter((transaction) => {
        if (!filters.walletId || filters.walletId === "all") return true;
        return (
          transaction.walletId === filters.walletId ||
          transaction.sourceWalletId === filters.walletId ||
          transaction.targetWalletId === filters.walletId
        );
      })
      .filter((transaction) => !filters.month || transaction.date.startsWith(filters.month))
      .filter((transaction) => {
        if (!searchTerm) {
          return true;
        }

        return [
          transaction.description,
          transaction.notes,
          transaction.paymentMethod,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchTerm);
      })
      .sort((first, second) => sortTransactions(first, second, filters.sort));
  }

  function validateTransaction(transaction) {
    if (!["income", "expense", "transfer"].includes(transaction.type)) {
      throw new Error("Selecciona un tipo de movimiento valido.");
    }

    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
      throw new Error("El monto debe ser mayor que cero.");
    }

    if (transaction.type !== "transfer" && !transaction.categoryId) {
      throw new Error("Selecciona una categoria.");
    }

    if (!transaction.description) {
      throw new Error("La descripcion es obligatoria.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
      throw new Error("Selecciona una fecha valida.");
    }

    if (transaction.type === "transfer") {
      if (!transaction.sourceWalletId || !transaction.targetWalletId) {
        throw new Error("Debes indicar la cartera de origen y de destino.");
      }
      if (transaction.sourceWalletId === transaction.targetWalletId) {
        throw new Error("La cartera de origen y de destino no pueden ser la misma.");
      }
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

    const monthlyIncome = sumByType(monthlyTransactions, "income");
    const monthlyExpenses = sumByType(monthlyTransactions, "expense");

    return {
      totalIncome,
      totalExpenses,
      totalBalance: totalIncome - totalExpenses,
      monthlyIncome,
      monthlyExpenses,
      monthlyBalance: monthlyIncome - monthlyExpenses,
      monthRangeLabel: formatDateRange(start, end),
    };
  }

  /**
   * Calcula las medias de gasto por distintos periodos temporales:
   * - Semanal
   * - Mensual
   * - Trimestral
   * - Semestral
   * - Anual
   * - Diario
   * - Tasa de ahorro
   */
  function calculatePeriodicAverages(transactions) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const expenses = transactions.filter((tx) => tx.type === "expense");

    if (expenses.length === 0) {
      return {
        dailyAverage: 0,
        weeklyAverage: 0,
        monthlyAverage: 0,
        quarterlyAverage: 0,
        semiannualAverage: 0,
        annualAverage: 0,
        savingsRate: 0,
        activeMonthsCount: 0,
      };
    }

    // Agrupar gastos por meses únicos (YYYY-MM)
    const monthExpenseMap = new Map();
    const weekExpenseMap = new Map();

    expenses.forEach((tx) => {
      const monthKey = tx.date.slice(0, 7); // YYYY-MM
      monthExpenseMap.set(monthKey, (monthExpenseMap.get(monthKey) || 0) + tx.amount);

      // Calcular llave de semana (YYYY-Www)
      const txDate = parseLocalDate(tx.date);
      const weekNumber = getWeekNumber(txDate);
      const weekKey = `${txDate.getFullYear()}-W${weekNumber}`;
      weekExpenseMap.set(weekKey, (weekExpenseMap.get(weekKey) || 0) + tx.amount);
    });

    const totalExpenseAmount = expenses.reduce((sum, tx) => sum + tx.amount, 0);
    const totalIncomeAmount = sumByType(transactions, "income");

    const distinctMonths = Math.max(1, monthExpenseMap.size);
    const distinctWeeks = Math.max(1, weekExpenseMap.size);

    const monthlyAverage = totalExpenseAmount / distinctMonths;
    const weeklyAverage = totalExpenseAmount / distinctWeeks;
    const dailyAverage = monthlyAverage / 30;
    const quarterlyAverage = monthlyAverage * 3;
    const semiannualAverage = monthlyAverage * 6;
    const annualAverage = monthlyAverage * 12;

    // Tasa de ahorro global
    const savingsRate =
      totalIncomeAmount > 0
        ? Math.max(0, Math.round(((totalIncomeAmount - totalExpenseAmount) / totalIncomeAmount) * 100))
        : 0;

    return {
      dailyAverage,
      weeklyAverage,
      monthlyAverage,
      quarterlyAverage,
      semiannualAverage,
      annualAverage,
      savingsRate,
      activeMonthsCount: distinctMonths,
    };
  }

  function formatMoney(value, currency = "DOP") {
    const safeCurrency = ["DOP", "USD", "EUR"].includes(currency) ? currency : "DOP";
    const locale = safeCurrency === "USD" ? "en-US" : safeCurrency === "EUR" ? "es-ES" : "es-DO";

    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  function formatDate(dateText) {
    return new Intl.DateTimeFormat("es-DO", {
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

    const start =
      currentDay >= startDay
        ? new Date(year, month, startDay)
        : new Date(year, month - 1, startDay);
    const end =
      currentDay >= startDay
        ? new Date(year, month + 1, startDay - 1, 23, 59, 59)
        : new Date(year, month, startDay - 1, 23, 59, 59);

    return { start, end };
  }

  function formatDateRange(start, end) {
    const formatter = new Intl.DateTimeFormat("es-DO", {
      day: "2-digit",
      month: "short",
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  }

  function parseLocalDate(dateText) {
    const [year, month, day] = (dateText || new Date().toISOString().slice(0, 10)).split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  }

  function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  }


  // Source: js/charts.js
  function renderCharts(transactions, categories, settings, wallets = []) {
    const categoryCanvas = document.getElementById("categoryChart");
    const incomeExpenseCanvas = document.getElementById("incomeExpenseChart");
    const balanceCanvas = document.getElementById("balanceChart");

    if (categoryCanvas) {
      renderCategoryChart(categoryCanvas, transactions, categories, settings);
    }
    if (incomeExpenseCanvas) {
      renderIncomeExpenseChart(incomeExpenseCanvas, transactions, settings);
    }
    if (balanceCanvas) {
      renderBalanceChart(balanceCanvas, transactions, settings, wallets);
    }
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

    const isDark = settings.theme === "dark";
    const incomeColor = isDark ? "#7FAF8C" : "#4F7A5C";
    const expenseColor = isDark ? "#D97A7A" : "#B84C4C";

    drawBars(canvas, [
      { label: "Ingresos", value: income, color: incomeColor },
      { label: "Gastos", value: expenses, color: expenseColor },
    ], settings);
  }

  function renderBalanceChart(canvas, transactions, settings, wallets = []) {
    const initialBalance = wallets.reduce((sum, w) => sum + (Number(w.initialBalance) || 0), 0);
    const sortedTransactions = [...transactions].sort((first, second) => first.date.localeCompare(second.date));

    const dailyDeltas = new Map();
    sortedTransactions.forEach((tx) => {
      let delta = 0;
      if (tx.type === "income") delta = tx.amount;
      else if (tx.type === "expense") delta = -tx.amount;

      if (delta !== 0) {
        dailyDeltas.set(tx.date, (dailyDeltas.get(tx.date) || 0) + delta);
      }
    });

    let runningBalance = initialBalance;
    const points = [];

    if (dailyDeltas.size === 0 && initialBalance > 0) {
      points.push({ label: "Inicio", value: initialBalance });
    } else {
      dailyDeltas.forEach((delta, dateText) => {
        runningBalance += delta;
        points.push({
          label: dateText.slice(5),
          value: runningBalance,
        });
      });
    }

    drawLine(canvas, points, settings);
  }

  function setupCanvas(canvas) {
    const context = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const rawWidth =
      canvas.clientWidth ||
      canvas.parentElement?.clientWidth ||
      Number(canvas.getAttribute("width")) ||
      400;
    const width = Math.max(rawWidth, 120);
    const height = Math.round(width * 0.45); // cleaner aspect ratio for wide charts

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }

  function drawEmpty(context, width, height) {
    context.fillStyle = getTextMutedColor();
    context.font = "500 14px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("Sin datos registrados todavia", width / 2, height / 2);
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

    // Centro hueco del donut
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.58, 0, Math.PI * 2);
    context.fill();
    context.globalCompositeOperation = "source-over";

    // Leyenda
    context.textAlign = "left";
    segments.slice(0, 5).forEach((segment, index) => {
      const y = 30 + index * 32;
      context.fillStyle = segment.category.color;
      context.beginPath();
      context.arc(width * 0.63, y, 5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = getTextColor();
      context.font = "600 13px Inter, system-ui, sans-serif";
      context.fillText(`${segment.category.icon} ${segment.category.name}`, width * 0.67, y + 4);

      context.fillStyle = getTextMutedColor();
      context.font = "400 12px Lora, Georgia, serif";
      context.fillText(formatMoney(segment.value, settings.currency), width * 0.67, y + 18);
    });
  }

  function drawBars(canvas, bars, settings) {
    const { context, width, height } = setupCanvas(canvas);
    const maxValue = Math.max(...bars.map((bar) => bar.value), 1);
    const barWidth = width * 0.22;
    const chartBottom = height - 44;
    const chartTop = 26;
    const chartHeight = chartBottom - chartTop;

    bars.forEach((bar, index) => {
      const x = width * (0.28 + index * 0.32);
      const barHeight = (bar.value / maxValue) * chartHeight;
      context.fillStyle = bar.color;
      roundRect(context, x, chartBottom - barHeight, barWidth, barHeight, 8);
      context.fill();

      context.fillStyle = getTextColor();
      context.font = "600 13px Inter, system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText(bar.label, x + barWidth / 2, height - 20);

      context.fillStyle = getTextMutedColor();
      context.font = "600 12px Lora, Georgia, serif";
      context.fillText(formatMoney(bar.value, settings.currency), x + barWidth / 2, chartBottom - barHeight - 8);
    });
  }

  function drawLine(canvas, points, settings) {
    const { context, width, height } = setupCanvas(canvas);
    if (points.length === 0) {
      drawEmpty(context, width, height);
      return;
    }

    const isDark = settings.theme === "dark";
    const primaryAccent = isDark ? "#E08657" : "#C6633C";

    const values = points.map((point) => point.value);
    const minValue = Math.min(...values, 0);
    const maxValue = Math.max(...values, 1);
    const padding = 34;
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

    // Línea de evolución
    context.strokeStyle = primaryAccent;
    context.lineWidth = 2.5;
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

    // Puntos destacados
    points.slice(-4).forEach((point, index, visiblePoints) => {
      const originalIndex = points.length - visiblePoints.length + index;
      const x = padding + (points.length === 1 ? drawableWidth : (originalIndex / (points.length - 1)) * drawableWidth);
      const y = height - padding - ((point.value - minValue) / range) * drawableHeight;
      context.fillStyle = primaryAccent;
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    });

    context.fillStyle = getTextMutedColor();
    context.font = "500 12px Lora, Georgia, serif";
    context.textAlign = "right";
    context.fillText(formatMoney(maxValue, settings.currency), width - padding, 20);
    context.fillText(formatMoney(points.at(-1).value, settings.currency), width - padding, height - 12);
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
    return getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#2B2420";
  }

  function getTextMutedColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#7A6F63";
  }

  function getBorderColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "#EDE4D8";
  }


  // Source: js/app.js
  let state = loadState();

  const elements = {
    // Header y Drawer
    menuButton: document.getElementById("menuButton"),
    closeDrawerButton: document.getElementById("closeDrawerButton"),
    drawerBackdrop: document.getElementById("drawerBackdrop"),
    navDrawer: document.getElementById("navDrawer"),
    themeToggleButton: document.getElementById("themeToggleButton"),
    settingsNavButton: document.getElementById("settingsNavButton"),
    headerBalance: document.getElementById("headerBalance"),
    navLinks: document.querySelectorAll(".nav-link"),
    viewSections: document.querySelectorAll(".view-section"),

    // Vista 1: Principal
    totalBalance: document.getElementById("totalBalance"),
    monthlyBalance: document.getElementById("monthlyBalance"),
    totalIncome: document.getElementById("totalIncome"),
    totalExpenses: document.getElementById("totalExpenses"),
    monthRangeLabel: document.getElementById("monthRangeLabel"),
    walletsListContainer: document.getElementById("walletsListContainer"),
    totalCashBalance: document.getElementById("totalCashBalance"),
    totalCardBalance: document.getElementById("totalCardBalance"),
    quickTransferButton: document.getElementById("quickTransferButton"),
    savingsGoalsContainer: document.getElementById("savingsGoalsContainer"),
    newGoalButton: document.getElementById("newGoalButton"),
    manageFundButton: document.getElementById("manageFundButton"),
    fundMonthsLabel: document.getElementById("fundMonthsLabel"),
    fundCurrentAmount: document.getElementById("fundCurrentAmount"),
    fundProgressBar: document.getElementById("fundProgressBar"),
    fundTargetLabel: document.getElementById("fundTargetLabel"),
    fundPercentageLabel: document.getElementById("fundPercentageLabel"),

    // Vista 2: Estadísticas
    avgWeekly: document.getElementById("avgWeekly"),
    avgMonthly: document.getElementById("avgMonthly"),
    avgQuarterly: document.getElementById("avgQuarterly"),
    avgSemiannual: document.getElementById("avgSemiannual"),
    avgAnnual: document.getElementById("avgAnnual"),
    savingsRate: document.getElementById("savingsRate"),

    // Vista 3: Historial
    filtersForm: document.getElementById("filtersForm"),
    searchInput: document.getElementById("searchInput"),
    monthFilter: document.getElementById("monthFilter"),
    categoryFilter: document.getElementById("categoryFilter"),
    typeFilter: document.getElementById("typeFilter"),
    walletFilter: document.getElementById("walletFilter"),
    sortSelect: document.getElementById("sortSelect"),
    filterCountSummary: document.getElementById("filterCountSummary"),
    transactionsTable: document.getElementById("transactionsTable"),
    emptyTransactions: document.getElementById("emptyTransactions"),
    rowTemplate: document.getElementById("transactionRowTemplate"),

    // Vista 4: Configuración
    preferencesForm: document.getElementById("preferencesForm"),
    themeSelect: document.getElementById("themeSelect"),
    currencySelect: document.getElementById("currencySelect"),
    financialStartDay: document.getElementById("financialStartDay"),
    walletManageForm: document.getElementById("walletManageForm"),
    manageWalletId: document.getElementById("manageWalletId"),
    manageWalletName: document.getElementById("manageWalletName"),
    manageWalletType: document.getElementById("manageWalletType"),
    manageWalletBalance: document.getElementById("manageWalletBalance"),
    manageWalletsList: document.getElementById("manageWalletsList"),
    categoryId: document.getElementById("categoryId"),
    categoryName: document.getElementById("categoryName"),
    categoryIcon: document.getElementById("categoryIcon"),
    categoryColor: document.getElementById("categoryColor"),
    saveCategoryButton: document.getElementById("saveCategoryButton"),
    categoriesList: document.getElementById("categoriesList"),
    reminderTime: document.getElementById("reminderTime"),
    reminderLabel: document.getElementById("reminderLabel"),
    saveReminderButton: document.getElementById("saveReminderButton"),
    remindersList: document.getElementById("remindersList"),
    testNotificationButton: document.getElementById("testNotificationButton"),
    emergencyFundSettingsForm: document.getElementById("emergencyFundSettingsForm"),
    targetMonthsInput: document.getElementById("targetMonthsInput"),
    customTargetFundInput: document.getElementById("customTargetFundInput"),
    exportButton: document.getElementById("exportButton"),
    importInput: document.getElementById("importInput"),
    clearDataButton: document.getElementById("clearDataButton"),

    // Modales y formularios
    addTransactionButton: document.getElementById("addTransactionButton"),
    transactionModal: document.getElementById("transactionModal"),
    transactionForm: document.getElementById("transactionForm"),
    transactionModalTitle: document.getElementById("transactionModalTitle"),
    transactionId: document.getElementById("transactionId"),
    transactionType: document.getElementById("transactionType"),
    transactionAmount: document.getElementById("transactionAmount"),
    transactionWallet: document.getElementById("transactionWallet"),
    targetWalletField: document.getElementById("targetWalletField"),
    transactionTargetWallet: document.getElementById("transactionTargetWallet"),
    categoryFieldLabel: document.getElementById("categoryFieldLabel"),
    transactionCategory: document.getElementById("transactionCategory"),
    transactionDate: document.getElementById("transactionDate"),
    transactionRecurring: document.getElementById("transactionRecurring"),
    transactionFrequency: document.getElementById("transactionFrequency"),
    transactionDescription: document.getElementById("transactionDescription"),
    transactionNotes: document.getElementById("transactionNotes"),

    // Modal Transferencia Rápida
    transferModal: document.getElementById("transferModal"),
    transferForm: document.getElementById("transferForm"),
    quickSourceWallet: document.getElementById("quickSourceWallet"),
    quickTargetWallet: document.getElementById("quickTargetWallet"),
    quickTransferAmount: document.getElementById("quickTransferAmount"),
    quickTransferDate: document.getElementById("quickTransferDate"),
    quickTransferDesc: document.getElementById("quickTransferDesc"),

    // Modal Metas
    goalModal: document.getElementById("goalModal"),
    goalForm: document.getElementById("goalForm"),
    goalId: document.getElementById("goalId"),
    goalName: document.getElementById("goalName"),
    goalTargetAmount: document.getElementById("goalTargetAmount"),
    goalCurrentAmount: document.getElementById("goalCurrentAmount"),
    goalDeadline: document.getElementById("goalDeadline"),
    goalIcon: document.getElementById("goalIcon"),

    // Modal Fondo Aporte
    fundContributionModal: document.getElementById("fundContributionModal"),
    fundContributionForm: document.getElementById("fundContributionForm"),
    fundOpType: document.getElementById("fundOpType"),
    fundOpAmount: document.getElementById("fundOpAmount"),
  };

  initialize();

  function initialize() {
    bindEvents();
    fillFinancialDays();
    applyTheme();
    switchView(state.settings.activeView || "viewPrincipal");
    render();
    registerServiceWorker();
    startNotificationScheduler(() => state.settings);

    // Re-render charts after layout is settled to get accurate canvas clientWidths
    setTimeout(() => {
      renderCharts(state.transactions, state.categories, state.settings);
    }, 150);
  }

  function bindEvents() {
    // Navegación SPA y Drawer
    elements.menuButton.addEventListener("click", openDrawer);
    elements.closeDrawerButton.addEventListener("click", closeDrawer);
    elements.drawerBackdrop.addEventListener("click", closeDrawer);

    elements.navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        switchView(link.dataset.view);
        closeDrawer();
      });
    });

    elements.settingsNavButton.addEventListener("click", () => {
      switchView("viewConfiguracion");
    });

    elements.themeToggleButton.addEventListener("click", toggleTheme);

    // Cerrar modales con [data-close-modal]
    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => {
        const modal = document.getElementById(button.dataset.closeModal);
        if (modal) modal.close();
      });
    });

    // Modales principales
    elements.addTransactionButton.addEventListener("click", () => openTransactionModal());
    elements.quickTransferButton.addEventListener("click", openQuickTransferModal);
    elements.newGoalButton.addEventListener("click", () => openGoalModal());
    elements.manageFundButton.addEventListener("click", openFundContributionModal);

    // Formularios
    elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
    elements.transactionType.addEventListener("change", handleTransactionTypeChange);
    elements.transactionRecurring.addEventListener("change", () => {
      elements.transactionFrequency.style.display = elements.transactionRecurring.checked ? "inline-block" : "none";
    });

    elements.transferForm.addEventListener("submit", handleQuickTransferSubmit);
    elements.goalForm.addEventListener("submit", handleGoalSubmit);
    elements.fundContributionForm.addEventListener("submit", handleFundContributionSubmit);
    elements.emergencyFundSettingsForm.addEventListener("submit", handleFundSettingsSubmit);
    elements.preferencesForm.addEventListener("submit", handlePreferencesSubmit);
    elements.walletManageForm.addEventListener("submit", handleWalletManageSubmit);

    // Filtros Historial con Debounce
    const debouncedRenderTransactions = debounce(renderTransactions, 200);
    elements.filtersForm.addEventListener("input", debouncedRenderTransactions);
    elements.filtersForm.addEventListener("change", renderTransactions);

    // Categorías y Recordatorios
    elements.saveCategoryButton.addEventListener("click", handleCategorySave);
    elements.saveReminderButton.addEventListener("click", handleReminderSave);
    elements.testNotificationButton.addEventListener("click", handleTestNotification);
    elements.remindersList.addEventListener("click", handleReminderAction);
    elements.remindersList.addEventListener("change", handleReminderToggle);

    // Acciones en tablas y listas
    elements.transactionsTable.addEventListener("click", handleTransactionAction);
    elements.categoriesList.addEventListener("click", handleCategoryAction);
    elements.manageWalletsList.addEventListener("click", handleWalletManageAction);
    elements.savingsGoalsContainer.addEventListener("click", handleGoalCardAction);

    // Respaldo
    elements.exportButton.addEventListener("click", handleExport);
    elements.importInput.addEventListener("change", handleImport);
    elements.clearDataButton.addEventListener("click", handleClearData);

    // Resize de gráficos
    window.addEventListener("resize", () => {
      renderCharts(state.transactions, state.categories, state.settings, state.wallets);
    });
  }

  /* ==========================================================
     Navegación SPA & Vistas
     ========================================================== */
  function switchView(viewId) {
    const targetView = document.getElementById(viewId) ? viewId : "viewPrincipal";

    elements.viewSections.forEach((section) => {
      section.classList.toggle("active", section.id === targetView);
    });

    elements.navLinks.forEach((link) => {
      link.classList.toggle("active", link.dataset.view === targetView);
    });

    state.settings.activeView = targetView;
    saveState(state);

    // Si se abre estadísticas, redibujar canvas
    if (targetView === "viewEstadisticas") {
      setTimeout(() => {
        renderCharts(state.transactions, state.categories, state.settings, state.wallets);
      }, 50);
    }
  }

  function openDrawer() {
    elements.navDrawer.classList.add("active");
    elements.drawerBackdrop.classList.add("active");
  }

  function closeDrawer() {
    elements.navDrawer.classList.remove("active");
    elements.drawerBackdrop.classList.remove("active");
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveState(state);
    renderCharts(state.transactions, state.categories, state.settings, state.wallets);
  }

  function applyTheme() {
    const isDark = state.settings.theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    elements.themeToggleButton.textContent = isDark ? "☀️" : "🌙";
    elements.themeSelect.value = state.settings.theme;
  }

  /* ==========================================================
     Renderizado General
     ========================================================== */
  function render() {
    saveState(state);
    applyTheme();
    populateDropdowns();

    renderDashboard();
    renderWallets();
    renderSavingsGoals();
    renderEmergencyFund();
    renderAverages();
    renderTransactions();
    renderConfigViews();

    renderCharts(state.transactions, state.categories, state.settings, state.wallets);
  }

  /* 1. Vista Principal: Dashboard y Totales */
  function renderDashboard() {
    const totals = calculateTotals(state.transactions, state.settings);
    const currency = state.settings.currency;

    elements.headerBalance.textContent = formatMoney(totals.totalBalance, currency);
    elements.totalBalance.textContent = formatMoney(totals.totalBalance, currency);
    elements.totalIncome.textContent = formatMoney(totals.totalIncome, currency);
    elements.totalExpenses.textContent = formatMoney(totals.totalExpenses, currency);
    elements.monthlyBalance.textContent = formatMoney(totals.monthlyBalance, currency);
    elements.monthRangeLabel.textContent = totals.monthRangeLabel;
  }

  /* 5. Carteras (Capacitores: 5.1 Efectivo, 5.2 Tarjetas, 5.3 Subtotales) */
  function renderWallets() {
    const breakdown = getWalletBreakdown(state.wallets, state.transactions);
    const currency = state.settings.currency;

    elements.walletsListContainer.replaceChildren();

    breakdown.wallets.forEach((wallet) => {
      const card = document.createElement("div");
      card.className = "wallet-card";
      card.innerHTML = `
        <div class="wallet-card__header">
          <span style="font-size: 1.4rem;">${escapeHTML(wallet.icon)}</span>
          <span class="wallet-card__type">${wallet.type === WALLET_TYPES.TARJETA ? "Tarjeta / Banco" : "Efectivo"}</span>
        </div>
        <div>
          <strong style="font-size: 1rem; color: var(--text);">${escapeHTML(wallet.name)}</strong>
        </div>
        <div class="wallet-card__balance" style="color: ${wallet.balance >= 0 ? "var(--text)" : "var(--expense)"}">
          ${formatMoney(wallet.balance, currency)}
        </div>
      `;
      elements.walletsListContainer.append(card);
    });

    // 5.3 Subtotales consolidados
    elements.totalCashBalance.textContent = formatMoney(breakdown.totalCash, currency);
    elements.totalCardBalance.textContent = formatMoney(breakdown.totalCard, currency);
  }

  /* 6. Metas de Ahorro */
  function renderSavingsGoals() {
    const currency = state.settings.currency;
    elements.savingsGoalsContainer.replaceChildren();

    if (!state.savingsGoals || state.savingsGoals.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.className = "hint";
      emptyMsg.style.padding = "0.75rem 0";
      emptyMsg.textContent = "Aún no has creado metas de ahorro. Haz clic en '+ Nueva meta'.";
      elements.savingsGoalsContainer.append(emptyMsg);
      return;
    }

    state.savingsGoals.forEach((goal) => {
      const percent = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
      const card = document.createElement("div");
      card.className = "goal-card";
      card.dataset.id = goal.id;
      card.innerHTML = `
        <div class="goal-card__header">
          <span>${escapeHTML(goal.icon)} ${escapeHTML(goal.name)}</span>
          <span class="amount-serif" style="color: var(--income);">${formatMoney(goal.currentAmount, currency)}</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar" style="width: ${percent}%;"></div>
        </div>
        <div class="goal-card__footer">
          <span>Meta: ${formatMoney(goal.targetAmount, currency)} ${goal.deadline ? `· Límite: ${goal.deadline}` : ""}</span>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <strong>${percent}%</strong>
            <button class="small-button" data-action="add-to-goal" type="button">+ Aporte</button>
            <button class="small-button small-button--danger" data-action="delete-goal" type="button">✕</button>
          </div>
        </div>
      `;
      elements.savingsGoalsContainer.append(card);
    });
  }

  /* 7. Fondo de Emergencia */
  function renderEmergencyFund() {
    const currency = state.settings.currency;
    const fund = state.emergencyFund || { targetMonths: 3, currentAmount: 0, customTarget: 0 };
    const averages = calculatePeriodicAverages(state.transactions);

    const estimatedMonthlyExpense = averages.monthlyAverage > 0 ? averages.monthlyAverage : 10000;
    const targetAmount = fund.customTarget > 0 ? fund.customTarget : estimatedMonthlyExpense * fund.targetMonths;

    const percent = targetAmount > 0 ? Math.min(100, Math.round((fund.currentAmount / targetAmount) * 100)) : 0;

    elements.fundMonthsLabel.textContent = `Meta: ${fund.targetMonths} meses de gastos`;
    elements.fundCurrentAmount.textContent = formatMoney(fund.currentAmount, currency);
    elements.fundProgressBar.style.width = `${percent}%`;
    elements.fundTargetLabel.textContent = `Objetivo: ${formatMoney(targetAmount, currency)}`;
    elements.fundPercentageLabel.textContent = `${percent}% cubierto`;
  }

  /* 2. Estadísticas: Medias Periódicas */
  function renderAverages() {
    const averages = calculatePeriodicAverages(state.transactions);
    const currency = state.settings.currency;

    elements.avgWeekly.textContent = formatMoney(averages.weeklyAverage, currency);
    elements.avgMonthly.textContent = formatMoney(averages.monthlyAverage, currency);
    elements.avgQuarterly.textContent = formatMoney(averages.quarterlyAverage, currency);
    elements.avgSemiannual.textContent = formatMoney(averages.semiannualAverage, currency);
    elements.avgAnnual.textContent = formatMoney(averages.annualAverage, currency);
    elements.savingsRate.textContent = `${averages.savingsRate}%`;
  }

  /* 3. Historial de Movimientos */
  function renderTransactions() {
    const filters = getFilters();
    const transactions = filterTransactions(state.transactions, filters);
    const currency = state.settings.currency;

    elements.transactionsTable.replaceChildren();
    elements.emptyTransactions.hidden = transactions.length > 0;
    elements.filterCountSummary.textContent = `${transactions.length} movimiento${transactions.length === 1 ? "" : "s"} encontrado${transactions.length === 1 ? "" : "s"}`;

    transactions.forEach((tx) => {
      const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
      row.dataset.id = tx.id;

      const wallet = getWallet(state.wallets, tx.walletId);
      const category = getCategory(state.categories, tx.categoryId);

      row.querySelector('[data-cell="date"]').textContent = formatDate(tx.date);
      row.querySelector('[data-cell="description"]').textContent = tx.description;

      const notesCell = row.querySelector('[data-cell="notes"]');
      const noteBits = [];
      if (tx.isRecurring) noteBits.push("🔄 Recurrente");
      if (tx.notes) noteBits.push(tx.notes);
      notesCell.textContent = noteBits.join(" · ");

      // Celda Cartera
      const walletCell = row.querySelector('[data-cell="wallet"]');
      if (tx.type === "transfer") {
        const source = getWallet(state.wallets, tx.sourceWalletId);
        const target = getWallet(state.wallets, tx.targetWalletId);
        walletCell.textContent = `${source.icon} ${source.name} ➔ ${target.icon} ${target.name}`;
      } else {
        walletCell.textContent = `${wallet.icon} ${wallet.name}`;
      }

      // Celda Categoría
      const catCell = row.querySelector('[data-cell="category"]');
      if (tx.type === "transfer") {
        catCell.innerHTML = `<span class="category-pill">🔄 Transferencia</span>`;
      } else {
        catCell.innerHTML = `
          <span class="category-pill" style="border-color: ${escapeHTML(category.color)}40;">
            <span>${escapeHTML(category.icon)}</span> <span>${escapeHTML(category.name)}</span>
          </span>
        `;
      }

      // Celda Monto
      const amountCell = row.querySelector('[data-cell="amount"]');
      if (tx.type === "income") {
        amountCell.textContent = `+${formatMoney(tx.amount, currency)}`;
        amountCell.className = "amount-income amount-serif";
      } else if (tx.type === "expense") {
        amountCell.textContent = `-${formatMoney(tx.amount, currency)}`;
        amountCell.className = "amount-expense amount-serif";
      } else {
        amountCell.textContent = `⇄ ${formatMoney(tx.amount, currency)}`;
        amountCell.className = "amount-serif";
      }

      elements.transactionsTable.append(row);
    });
  }

  /* 4. Configuración */
  function renderConfigViews() {
    elements.themeSelect.value = state.settings.theme;
    elements.currencySelect.value = state.settings.currency;
    elements.financialStartDay.value = String(state.settings.financialStartDay);
    elements.targetMonthsInput.value = String(state.emergencyFund.targetMonths || 3);
    elements.customTargetFundInput.value = String(state.emergencyFund.customTarget || 0);

    renderManageWallets();
    renderCategories();
    renderReminders();
  }

  function renderManageWallets() {
    elements.manageWalletsList.replaceChildren();
    state.wallets.forEach((wallet) => {
      const item = document.createElement("div");
      item.className = "wallet-manage-item";
      item.dataset.id = wallet.id;
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="font-size: 1.25rem;">${escapeHTML(wallet.icon)}</span>
          <div>
            <strong>${escapeHTML(wallet.name)}</strong>
            <small style="display: block; color: var(--text-muted); font-size: 0.78rem;">
              ${wallet.type === WALLET_TYPES.TARJETA ? "Tarjeta" : "Efectivo"} · Inicial: ${formatMoney(wallet.initialBalance, state.settings.currency)}
            </small>
          </div>
        </div>
        <div class="table-actions">
          <button class="small-button" data-action="edit-wallet" type="button">Editar</button>
          <button class="small-button small-button--danger" data-action="delete-wallet" type="button">Eliminar</button>
        </div>
      `;
      elements.manageWalletsList.append(item);
    });
  }

  function renderCategories() {
    elements.categoriesList.replaceChildren();
    state.categories.forEach((category) => {
      const item = document.createElement("div");
      item.className = "category-item";
      item.dataset.id = category.id;
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span class="color-dot" style="background:${escapeHTML(category.color)}"></span>
          <strong>${escapeHTML(category.icon)} ${escapeHTML(category.name)}</strong>
        </div>
        <div class="table-actions">
          <button class="small-button" data-action="edit-category" type="button">Editar</button>
          <button class="small-button small-button--danger" data-action="delete-category" type="button">Eliminar</button>
        </div>
      `;
      elements.categoriesList.append(item);
    });
  }

  function renderReminders() {
    elements.remindersList.replaceChildren();
    const reminders = state.settings.reminders || [];
    if (reminders.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.className = "hint";
      emptyMsg.textContent = "No hay recordatorios configurados.";
      elements.remindersList.append(emptyMsg);
      return;
    }

    reminders.forEach((reminder) => {
      const item = document.createElement("div");
      item.className = "reminder-item";
      item.dataset.id = reminder.id;
      item.innerHTML = `
        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
          <input type="checkbox" data-action="toggle-reminder" ${reminder.enabled ? "checked" : ""} />
          <strong>⏰ ${escapeHTML(reminder.time)}</strong>
          <span style="font-size: 0.85rem;">- ${escapeHTML(reminder.label || "Recordatorio")}</span>
        </label>
        <button class="small-button small-button--danger" data-action="delete-reminder" type="button">Eliminar</button>
      `;
      elements.remindersList.append(item);
    });
  }

  /* ==========================================================
     Manejo de Formularios y Modales
     ========================================================== */
  function populateDropdowns() {
    // Categorías
    const catOptions = state.categories
      .map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.icon)} ${escapeHTML(c.name)}</option>`)
      .join("");
    elements.transactionCategory.innerHTML = catOptions;
    elements.categoryFilter.innerHTML = `<option value="all">Todas las categorías</option>${catOptions}`;

    // Carteras
    const walletOptions = state.wallets
      .map((w) => `<option value="${escapeHTML(w.id)}">${escapeHTML(w.icon)} ${escapeHTML(w.name)}</option>`)
      .join("");

    elements.transactionWallet.innerHTML = walletOptions;
    elements.transactionTargetWallet.innerHTML = walletOptions;
    elements.quickSourceWallet.innerHTML = walletOptions;
    elements.quickTargetWallet.innerHTML = walletOptions;
    elements.walletFilter.innerHTML = `<option value="all">Todas las carteras</option>${walletOptions}`;

    // Preseleccionar target wallet diferente de source si es posible
    if (state.wallets.length > 1) {
      elements.quickTargetWallet.value = state.wallets[1].id;
      elements.transactionTargetWallet.value = state.wallets[1].id;
    }
  }

  function fillFinancialDays() {
    elements.financialStartDay.innerHTML = Array.from({ length: 28 }, (_, index) => {
      const day = index + 1;
      return `<option value="${day}">Día ${day}</option>`;
    }).join("");
  }

  function openTransactionModal(transaction = null) {
    elements.transactionForm.reset();
    elements.transactionId.value = transaction?.id || "";
    elements.transactionModalTitle.textContent = transaction ? "Editar movimiento" : "Nuevo movimiento";
    elements.transactionType.value = transaction?.type || "expense";
    elements.transactionAmount.value = transaction?.amount || "";
    elements.transactionWallet.value = transaction?.walletId || state.wallets[0]?.id || "";
    elements.transactionTargetWallet.value = transaction?.targetWalletId || state.wallets[1]?.id || "";
    elements.transactionCategory.value = transaction?.categoryId || state.categories[0]?.id || "";
    elements.transactionDate.value = transaction?.date || new Date().toISOString().slice(0, 10);
    elements.transactionRecurring.checked = Boolean(transaction?.isRecurring);
    elements.transactionFrequency.value = transaction?.recurringFrequency || "monthly";
    elements.transactionFrequency.style.display = transaction?.isRecurring ? "inline-block" : "none";
    elements.transactionDescription.value = transaction?.description || "";
    elements.transactionNotes.value = transaction?.notes || "";

    handleTransactionTypeChange();
    elements.transactionModal.showModal();
  }

  function handleTransactionTypeChange() {
    const isTransfer = elements.transactionType.value === "transfer";
    elements.targetWalletField.style.display = isTransfer ? "flex" : "none";
    elements.categoryFieldLabel.style.display = isTransfer ? "none" : "flex";

    const walletLabel = document.getElementById("walletFieldLabel");
    if (walletLabel) {
      const textNode = walletLabel.childNodes[0];
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = isTransfer ? "Cartera origen " : "Cartera ";
      }
    }
  }

  function handleTransactionSubmit(event) {
    event.preventDefault();

    try {
      const type = elements.transactionType.value;
      const existingTransaction = state.transactions.find((t) => t.id === elements.transactionId.value);

      state.transactions = upsertTransaction(state.transactions, {
        id: elements.transactionId.value,
        type,
        amount: elements.transactionAmount.value,
        walletId: elements.transactionWallet.value,
        sourceWalletId: elements.transactionWallet.value,
        targetWalletId: type === "transfer" ? elements.transactionTargetWallet.value : null,
        categoryId: type === "transfer" ? "other" : elements.transactionCategory.value,
        date: elements.transactionDate.value,
        isRecurring: elements.transactionRecurring.checked,
        recurringFrequency: elements.transactionRecurring.checked ? elements.transactionFrequency.value : "none",
        description: elements.transactionDescription.value,
        notes: elements.transactionNotes.value,
        createdAt: existingTransaction?.createdAt,
      });

      elements.transactionModal.close();
      render();
    } catch (error) {
      alert(error.message);
    }
  }

  /* Modal Transferencia Rápida (Retiro / Depósito) */
  function openQuickTransferModal() {
    elements.transferForm.reset();
    elements.quickTransferDate.value = new Date().toISOString().slice(0, 10);
    elements.quickTransferAmount.value = "";
    elements.quickTransferDesc.value = "Transferencia entre carteras";

    if (state.wallets.length >= 2) {
      elements.quickSourceWallet.value = state.wallets[0].id;
      elements.quickTargetWallet.value = state.wallets[1].id;
    }
    elements.transferModal.showModal();
  }

  function handleQuickTransferSubmit(event) {
    event.preventDefault();
    try {
      const sourceId = elements.quickSourceWallet.value;
      const targetId = elements.quickTargetWallet.value;
      const amount = Number(elements.quickTransferAmount.value);

      if (sourceId === targetId) {
        alert("La cartera origen y destino no pueden ser la misma.");
        return;
      }

      const sourceWallet = getWallet(state.wallets, sourceId);
      const targetWallet = getWallet(state.wallets, targetId);

      state.transactions = upsertTransaction(state.transactions, {
        type: "transfer",
        amount,
        walletId: sourceId,
        sourceWalletId: sourceId,
        targetWalletId: targetId,
        description: elements.quickTransferDesc.value.trim() || `Traspaso: ${sourceWallet.name} ➔ ${targetWallet.name}`,
        date: elements.quickTransferDate.value,
        notes: "Transferencia rápida interna",
      });

      elements.transferModal.close();
      render();
    } catch (error) {
      alert(error.message);
    }
  }

  /* Modal Metas de Ahorro */
  function openGoalModal(goal = null) {
    elements.goalForm.reset();
    elements.goalId.value = goal?.id || "";
    elements.goalName.value = goal?.name || "";
    elements.goalTargetAmount.value = goal?.targetAmount || "";
    elements.goalCurrentAmount.value = goal?.currentAmount || 0;
    elements.goalDeadline.value = goal?.deadline || "";
    elements.goalIcon.value = goal?.icon || "🎯";
    elements.goalModal.showModal();
  }

  function handleGoalSubmit(event) {
    event.preventDefault();
    const name = elements.goalName.value.trim();
    const targetAmount = Number(elements.goalTargetAmount.value);
    const currentAmount = Number(elements.goalCurrentAmount.value) || 0;

    if (!name || targetAmount <= 0) {
      alert("Indica un nombre y un monto objetivo válido.");
      return;
    }

    const goalId = elements.goalId.value;
    const goalObj = {
      id: goalId || createId(),
      name,
      targetAmount,
      currentAmount,
      deadline: elements.goalDeadline.value,
      icon: elements.goalIcon.value.trim() || "🎯",
    };

    if (goalId) {
      state.savingsGoals = state.savingsGoals.map((g) => (g.id === goalId ? { ...g, ...goalObj } : g));
    } else {
      state.savingsGoals = [...state.savingsGoals, goalObj];
    }

    elements.goalModal.close();
    render();
  }

  function handleGoalCardAction(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const card = button.closest(".goal-card");
    if (!card) return;

    const goalId = card.dataset.id;
    const goal = state.savingsGoals.find((g) => g.id === goalId);
    if (!goal) return;

    if (button.dataset.action === "delete-goal" && confirm(`¿Eliminar la meta "${goal.name}"?`)) {
      state.savingsGoals = state.savingsGoals.filter((g) => g.id !== goalId);
      render();
      return;
    }

    if (button.dataset.action === "add-to-goal") {
      const rawAmount = prompt(`Monto a sumar a "${goal.name}":`, "500");
      const amount = Number(rawAmount);
      if (amount && amount > 0) {
        goal.currentAmount = (goal.currentAmount || 0) + amount;
        render();
      }
    }
  }

  /* Modal Fondo de Emergencia */
  function openFundContributionModal() {
    elements.fundContributionForm.reset();
    elements.fundContributionModal.showModal();
  }

  function handleFundContributionSubmit(event) {
    event.preventDefault();
    const opType = elements.fundOpType.value;
    const amount = Number(elements.fundOpAmount.value);

    if (!amount || amount <= 0) {
      alert("Ingresa un monto válido.");
      return;
    }

    state.emergencyFund = state.emergencyFund || { targetMonths: 3, currentAmount: 0, customTarget: 0 };

    if (opType === "deposit") {
      state.emergencyFund.currentAmount += amount;
    } else {
      state.emergencyFund.currentAmount = Math.max(0, state.emergencyFund.currentAmount - amount);
    }

    elements.fundContributionModal.close();
    render();
  }

  function handleFundSettingsSubmit(event) {
    event.preventDefault();
    const targetMonths = Number(elements.targetMonthsInput.value) || 3;
    const customTarget = Number(elements.customTargetFundInput.value) || 0;

    state.emergencyFund.targetMonths = targetMonths;
    state.emergencyFund.customTarget = customTarget;
    render();
    alert("Objetivo del fondo de emergencia actualizado.");
  }

  /* Config: Preferencias */
  function handlePreferencesSubmit(event) {
    event.preventDefault();
    state.settings.theme = elements.themeSelect.value;
    state.settings.currency = elements.currencySelect.value;
    state.settings.financialStartDay = Number(elements.financialStartDay.value);
    applyTheme();
    render();
    alert("Preferencias guardadas.");
  }

  /* Config: Carteras */
  function handleWalletManageSubmit(event) {
    event.preventDefault();
    try {
      const id = elements.manageWalletId.value;
      const name = elements.manageWalletName.value;
      const type = elements.manageWalletType.value;
      const initialBalance = Number(elements.manageWalletBalance.value) || 0;

      state.wallets = upsertWallet(state.wallets, {
        id,
        name,
        type,
        initialBalance,
      });

      elements.manageWalletId.value = "";
      elements.manageWalletName.value = "";
      elements.manageWalletBalance.value = "";
      render();
    } catch (error) {
      alert(error.message);
    }
  }

  function handleWalletManageAction(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const walletId = button.closest(".wallet-manage-item").dataset.id;
    const wallet = state.wallets.find((w) => w.id === walletId);
    if (!wallet) return;

    if (button.dataset.action === "edit-wallet") {
      elements.manageWalletId.value = wallet.id;
      elements.manageWalletName.value = wallet.name;
      elements.manageWalletType.value = wallet.type;
      elements.manageWalletBalance.value = wallet.initialBalance;
      elements.manageWalletName.focus();
      return;
    }

    if (button.dataset.action === "delete-wallet" && confirm(`¿Eliminar la cartera "${wallet.name}"?`)) {
      try {
        state.wallets = deleteWallet(state.wallets, state.transactions, walletId);
        render();
      } catch (error) {
        alert(error.message);
      }
    }
  }

  /* Config: Categorías */
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

  function handleCategoryAction(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const categoryId = button.closest(".category-item").dataset.id;
    const category = getCategory(state.categories, categoryId);

    if (button.dataset.action === "edit-category") {
      elements.categoryId.value = category.id;
      elements.categoryName.value = category.name;
      elements.categoryIcon.value = category.icon;
      elements.categoryColor.value = category.color;
      return;
    }

    if (button.dataset.action === "delete-category" && confirm(`¿Eliminar la categoría "${category.name}"?`)) {
      try {
        state.categories = deleteCategory(state.categories, state.transactions, categoryId);
        render();
      } catch (error) {
        alert(error.message);
      }
    }
  }

  function resetCategoryForm() {
    elements.categoryId.value = "";
    elements.categoryName.value = "";
    elements.categoryIcon.value = "";
    elements.categoryColor.value = "#C6633C";
  }

  /* Config: Recordatorios */
  async function handleReminderSave() {
    const currentReminders = state.settings.reminders || [];
    if (currentReminders.length >= 10) {
      alert("Has alcanzado el límite máximo de 10 recordatorios.");
      return;
    }

    const time = elements.reminderTime.value;
    const label = elements.reminderLabel.value.trim() || "Recordatorio de gastos";

    if (!/^\d{2}:\d{2}$/.test(time)) {
      alert("Selecciona una hora válida.");
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) return;

    state.settings.reminders = [
      ...currentReminders,
      { id: createId(), time, label, enabled: true },
    ];
    elements.reminderLabel.value = "";
    render();
  }

  function handleReminderToggle(event) {
    const target = event.target;
    if (target.dataset.action !== "toggle-reminder") return;
    const reminderId = target.closest(".reminder-item").dataset.id;
    state.settings.reminders = (state.settings.reminders || []).map((r) =>
      r.id === reminderId ? { ...r, enabled: target.checked } : r
    );
    render();
  }

  function handleReminderAction(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const reminderId = button.closest(".reminder-item").dataset.id;
    if (button.dataset.action === "delete-reminder") {
      state.settings.reminders = (state.settings.reminders || []).filter((r) => r.id !== reminderId);
      render();
    }
  }

  async function handleTestNotification() {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    const success = await sendLocalNotification("Recordatorio de Prueba 🔔", {
      body: "¡Las notificaciones del Gestor de Gastos están activadas correctamente!",
    });
    if (!success) {
      alert("Verifica los permisos de notificación en tu navegador.");
    }
  }

  /* Acciones en Tabla Historial */
  function handleTransactionAction(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const transactionId = button.closest("tr").dataset.id;
    const transaction = state.transactions.find((item) => item.id === transactionId);

    if (button.dataset.action === "edit") {
      openTransactionModal(transaction);
      return;
    }

    if (button.dataset.action === "delete" && confirm("¿Eliminar este movimiento?")) {
      state.transactions = deleteTransaction(state.transactions, transactionId);
      render();
    }
  }

  /* Config: Respaldo y Datos */
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
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("El archivo excede el límite de 2MB permitido.");
      event.target.value = "";
      return;
    }

    try {
      const text = await file.text();
      state = importState(text);
      render();
      alert("Datos importados exitosamente.");
    } catch {
      alert("No se pudo importar el archivo. Verifica que sea un JSON válido.");
    } finally {
      event.target.value = "";
    }
  }

  function handleClearData() {
    if (!confirm("Esto eliminará todos los datos guardados en este navegador. ¿Continuar?")) {
      return;
    }
    clearState();
    state = loadState();
    resetCategoryForm();
    render();
  }

  /* Helpers */
  function getFilters() {
    return {
      search: elements.searchInput.value,
      month: elements.monthFilter.value,
      categoryId: elements.categoryFilter.value,
      type: elements.typeFilter.value,
      walletId: elements.walletFilter.value,
      sort: elements.sortSelect.value,
    };
  }

  function escapeHTML(str) {
    if (typeof str !== "string") return str;
    return str.replace(
      /[&<>'"]/g,
      (tag) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        }[tag] || tag)
    );
  }

  function debounce(fn, delay = 200) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => undefined);
    }
  }

})();
