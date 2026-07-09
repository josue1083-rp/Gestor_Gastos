import { getCategory } from "./categories.js";
import { formatMoney } from "./dashboard.js";

export function renderCharts(transactions, categories, settings) {
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
