export function calculateTotals(transactions, settings) {
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
export function calculatePeriodicAverages(transactions) {
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

export function formatMoney(value, currency = "DOP") {
  const safeCurrency = ["DOP", "USD", "EUR"].includes(currency) ? currency : "DOP";
  const locale = safeCurrency === "USD" ? "en-US" : safeCurrency === "EUR" ? "es-ES" : "es-DO";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatDate(dateText) {
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
