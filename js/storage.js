import { createDefaultWallets, WALLET_TYPES } from "./wallets.js";

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

export function createDefaultState() {
  return {
    wallets: createDefaultWallets(),
    savingsGoals: [],
    emergencyFund: { ...defaultEmergencyFund },
    transactions: [],
    categories: defaultCategories.map((category) => ({ ...category })),
    settings: { ...defaultSettings },
  };
}

export function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadState() {
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

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportState(state) {
  return JSON.stringify(normalizeState(state), null, 2);
}

export function importState(jsonText) {
  const parsedState = JSON.parse(jsonText);
  return normalizeState(parsedState);
}

export function normalizeState(state) {
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
