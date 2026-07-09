import { createId } from "./storage.js";

export function upsertTransaction(transactions, payload) {
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

export function deleteTransaction(transactions, transactionId) {
  return transactions.filter((transaction) => transaction.id !== transactionId);
}

export function filterTransactions(transactions, filters) {
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
