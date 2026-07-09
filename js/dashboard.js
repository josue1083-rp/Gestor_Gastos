export function calculateTotals(transactions, settings) {
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

export function formatMoney(value, currency) {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(dateText) {
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
