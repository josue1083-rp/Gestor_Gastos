import { createId } from "./storage.js";

export const WALLET_TYPES = Object.freeze({
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta",
});

export function createDefaultWallets() {
  return [
    {
      id: "wallet-cash",
      name: "Efectivo",
      type: WALLET_TYPES.EFECTIVO,
      initialBalance: 0,
      balance: 0,
      color: "#4F7A5C", // Verde salvia
      icon: "💵",
      createdAt: new Date().toISOString(),
    },
    {
      id: "wallet-card-1",
      name: "Tarjeta 1",
      type: WALLET_TYPES.TARJETA,
      initialBalance: 0,
      balance: 0,
      color: "#C6633C", // Terracota
      icon: "💳",
      createdAt: new Date().toISOString(),
    },
  ];
}

export function getWallet(wallets, walletId) {
  return (
    wallets.find((w) => w.id === walletId) || {
      id: "wallet-fallback",
      name: "Cartera General",
      type: WALLET_TYPES.EFECTIVO,
      color: "#7A6F63",
      icon: "👛",
      balance: 0,
    }
  );
}

export function upsertWallet(wallets, payload) {
  const name = String(payload.name || "").trim();
  if (!name) {
    throw new Error("El nombre de la cartera es obligatorio.");
  }

  const type = payload.type === WALLET_TYPES.TARJETA ? WALLET_TYPES.TARJETA : WALLET_TYPES.EFECTIVO;
  const initialBalance = Number(payload.initialBalance) || 0;
  const icon = String(payload.icon || (type === WALLET_TYPES.TARJETA ? "💳" : "💵")).trim();
  const color = /^#[0-9a-f]{6}$/i.test(payload.color)
    ? payload.color
    : type === WALLET_TYPES.TARJETA
      ? "#C6633C"
      : "#4F7A5C";

  const wallet = {
    id: payload.id || createId(),
    name,
    type,
    initialBalance,
    balance: initialBalance,
    icon,
    color,
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const existingIndex = wallets.findIndex((w) => w.id === wallet.id);
  if (existingIndex >= 0) {
    return wallets.map((w) => (w.id === wallet.id ? { ...w, ...wallet } : w));
  }

  return [...wallets, wallet];
}

export function deleteWallet(wallets, transactions, walletId) {
  if (wallets.length <= 1) {
    throw new Error("Debes mantener al menos una cartera activa.");
  }

  const hasTransactions = transactions.some(
    (tx) => tx.walletId === walletId || tx.sourceWalletId === walletId || tx.targetWalletId === walletId
  );

  if (hasTransactions) {
    throw new Error("No puedes eliminar una cartera que tiene movimientos registrados.");
  }

  return wallets.filter((w) => w.id !== walletId);
}

/**
 * Calcula de manera pura y segura los saldos actuales de cada cartera
 * a partir de su balance inicial y la lista de transacciones.
 */
export function calculateWalletBalances(wallets, transactions) {
  const balanceMap = new Map();

  wallets.forEach((w) => {
    balanceMap.set(w.id, Number(w.initialBalance) || 0);
  });

  // Si hay movimientos asociados a carteras desconocidas o legacy, se asignan a la primera cartera
  const defaultWalletId = wallets[0]?.id || "wallet-cash";

  transactions.forEach((tx) => {
    const amount = Number(tx.amount) || 0;

    if (tx.type === "transfer") {
      const sourceId = tx.sourceWalletId || tx.walletId || defaultWalletId;
      const targetId = tx.targetWalletId || defaultWalletId;

      balanceMap.set(sourceId, (balanceMap.get(sourceId) || 0) - amount);
      balanceMap.set(targetId, (balanceMap.get(targetId) || 0) + amount);
      return;
    }

    const walletId = tx.walletId || defaultWalletId;
    const current = balanceMap.get(walletId) || 0;

    if (tx.type === "income") {
      balanceMap.set(walletId, current + amount);
    } else if (tx.type === "expense") {
      balanceMap.set(walletId, current - amount);
    }
  });

  return wallets.map((w) => ({
    ...w,
    balance: balanceMap.get(w.id) || 0,
  }));
}

/**
 * Agrupa las carteras con sus balances en:
 * - 5.1: Carteras de tipo Efectivo
 * - 5.2: Carteras de tipo Tarjeta
 * - 5.3: Subtotales consolidados
 */
export function getWalletBreakdown(wallets, transactions) {
  const updatedWallets = calculateWalletBalances(wallets, transactions);

  const cashWallets = updatedWallets.filter((w) => w.type === WALLET_TYPES.EFECTIVO);
  const cardWallets = updatedWallets.filter((w) => w.type === WALLET_TYPES.TARJETA);

  const totalCash = cashWallets.reduce((sum, w) => sum + w.balance, 0);
  const totalCard = cardWallets.reduce((sum, w) => sum + w.balance, 0);
  const totalConsolidated = totalCash + totalCard;

  return {
    wallets: updatedWallets,
    cashWallets,
    cardWallets,
    totalCash,
    totalCard,
    totalConsolidated,
  };
}
