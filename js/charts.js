import { getCategory } from "./categories.js";
import { formatMoney } from "./dashboard.js";

export function renderCharts(transactions, categories, settings) {
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
    renderBalanceChart(balanceCanvas, transactions, settings);
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

function renderBalanceChart(canvas, transactions, settings) {
  const sortedTransactions = [...transactions].sort((first, second) => first.date.localeCompare(second.date));
  let balance = 0;
  const points = sortedTransactions.map((transaction) => {
    if (transaction.type === "income") {
      balance += transaction.amount;
    } else if (transaction.type === "expense") {
      balance -= transaction.amount;
    }
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
  const width = canvas.clientWidth || canvas.width || 400;
  const height = Math.round(width * 0.62);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
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
