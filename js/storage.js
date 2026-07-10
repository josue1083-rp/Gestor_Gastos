const STORAGE_KEY = "personal-expense-manager:v1";

const defaultCategories = [
  { id: "salary", name: "Salario", icon: "💼", color: "#16a34a" },
  { id: "food", name: "Comida", icon: "🍽️", color: "#f97316" },
  { id: "transport", name: "Transporte", icon: "🚌", color: "#0ea5e9" },
  { id: "home", name: "Hogar", icon: "🏠", color: "#8b5cf6" },
  { id: "health", name: "Salud", icon: "🩺", color: "#ef4444" },
  { id: "fun", name: "Ocio", icon: "🎮", color: "#ec4899" },
  { id: "savings", name: "Ahorro", icon: "🐖", color: "#14b8a6" },
  { id: "other", name: "Otros", icon: "✨", color: "#64748b" },
];

const defaultSettings = {
  theme: "dark",
  currency: "DOP",
  financialStartDay: 1,
};

const supportedCurrencies = new Set(["DOP", "USD"]);

export function createDefaultState() {
  return {
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
    icon: String(category.icon || "✨").trim(),
    color: /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : "#64748b",
  };
}
