import { createId } from "./storage.js";

export function upsertTransaction(transactions, payload) {
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

export function deleteTransaction(transactions, transactionId) {
  return transactions.filter((transaction) => transaction.id !== transactionId);
}

export function filterTransactions(transactions, filters) {
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
