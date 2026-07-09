import { createId } from "./storage.js";

export function upsertCategory(categories, payload) {
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

export function deleteCategory(categories, transactions, categoryId) {
  if (transactions.some((transaction) => transaction.categoryId === categoryId)) {
    throw new Error("No puedes eliminar una categoria con movimientos asociados.");
  }

  if (categories.length <= 1) {
    throw new Error("Debe existir al menos una categoria.");
  }

  return categories.filter((category) => category.id !== categoryId);
}

export function getCategory(categories, categoryId) {
  return categories.find((category) => category.id === categoryId) || {
    id: "unknown",
    name: "Sin categoria",
    icon: "❔",
    color: "#64748b",
  };
}
