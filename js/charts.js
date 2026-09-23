import { getCategory } from "./categories.js";
import { formatMoney } from "./dashboard.js";

export function renderCharts(transactions, categories, settings, wallets = []) {
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
    renderBalanceChart(balanceCanvas, transactions, settings, wallets);
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

function renderBalanceChart(canvas, transactions, settings, wallets = []) {
  const initialBalance = wallets.reduce((sum, w) => sum + (Number(w.initialBalance) || 0), 0);
  const sortedTransactions = [...transactions].sort((first, second) => first.date.localeCompare(second.date));

  const dailyDeltas = new Map();
  sortedTransactions.forEach((tx) => {
    let delta = 0;
    if (tx.type === "income") delta = tx.amount;
    else if (tx.type === "expense") delta = -tx.amount;

    if (delta !== 0) {
      dailyDeltas.set(tx.date, (dailyDeltas.get(tx.date) || 0) + delta);
    }
  });

  let runningBalance = initialBalance;
  const points = [];

  if (dailyDeltas.size === 0 && initialBalance > 0) {
    points.push({ label: "Inicio", value: initialBalance });
  } else {
    dailyDeltas.forEach((delta, dateText) => {
      runningBalance += delta;
      points.push({
        label: dateText.slice(5),
        value: runningBalance,
      });
    });
  }

  drawLine(canvas, points, settings);
}

function setupCanvas(canvas) {
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;

  // Medir el contenedor directo (.chart-card) para obtener el ancho real usable
  const card = canvas.closest(".chart-card");
  let width = 320;
  if (card && card.clientWidth > 0) {
    const cardStyle = window.getComputedStyle(card);
    const paddingLeft = parseFloat(cardStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(cardStyle.paddingRight) || 0;
    width = Math.floor(card.clientWidth - paddingLeft - paddingRight);
  } else if (canvas.clientWidth > 0) {
    width = canvas.clientWidth;
  }
  width = Math.max(width, 240);

  // Proporción óptima según tipo de gráfico
  let height = 260;
  if (canvas.id === "categoryChart") {
    height = width < 420 ? Math.max(300, 160 + 5 * 26) : Math.round(Math.min(width * 0.54, 300));
  } else if (canvas.id === "incomeExpenseChart") {
    height = Math.round(Math.min(Math.max(width * 0.52, 220), 280));
  } else if (canvas.id === "balanceChart") {
    height = Math.round(Math.min(Math.max(width * 0.38, 220), 300));
  }

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function truncateText(context, text, maxWidth) {
  if (context.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && context.measureText(truncated + "…").width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "…";
}

function drawEmpty(context, width, height) {
  context.fillStyle = getTextMutedColor();
  context.font = "500 14px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("Sin datos registrados todavía", width / 2, height / 2);
}

function drawDonut(canvas, segments, settings) {
  const { context, width, height } = setupCanvas(canvas);
  if (segments.length === 0) {
    drawEmpty(context, width, height);
    return;
  }

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const isMobile = width < 420;

  let centerX, centerY, radius;
  if (isMobile) {
    centerX = width / 2;
    centerY = 80;
    radius = Math.min(width * 0.28, 62);
  } else {
    centerX = width * 0.30;
    centerY = height * 0.50;
    radius = Math.min(width * 0.22, height * 0.38);
  }

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
  context.arc(centerX, centerY, radius * 0.60, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";

  // Leyenda protegida contra desbordamientos
  context.textAlign = "left";
  const topSegments = segments.slice(0, 5);

  if (isMobile) {
    // Modo móvil: leyenda apilada debajo del donut
    const startY = centerY + radius + 22;
    topSegments.forEach((segment, index) => {
      const y = startY + index * 26;
      if (y + 16 > height) return;

      context.fillStyle = segment.category.color;
      context.beginPath();
      context.arc(14, y + 4, 4.5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = getTextColor();
      context.font = "600 12px Inter, system-ui, sans-serif";
      const nameText = `${segment.category.icon} ${segment.category.name}`;
      const maxLabelWidth = width - 110;
      context.fillText(truncateText(context, nameText, maxLabelWidth), 26, y + 8);

      context.fillStyle = getTextMutedColor();
      context.font = "500 12px Lora, Georgia, serif";
      context.textAlign = "right";
      context.fillText(formatMoney(segment.value, settings.currency), width - 8, y + 8);
      context.textAlign = "left";
    });
  } else {
    // Modo escritorio: leyenda a la derecha con truncamiento inteligente
    const legendX = centerX + radius + 25;
    const maxLabelWidth = Math.max(width - legendX - 15, 60);
    const startY = Math.max(22, (height - topSegments.length * 36) / 2);

    topSegments.forEach((segment, index) => {
      const y = startY + index * 36;
      context.fillStyle = segment.category.color;
      context.beginPath();
      context.arc(legendX, y + 4, 5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = getTextColor();
      context.font = "600 13px Inter, system-ui, sans-serif";
      const nameText = `${segment.category.icon} ${segment.category.name}`;
      context.fillText(truncateText(context, nameText, maxLabelWidth), legendX + 14, y + 6);

      context.fillStyle = getTextMutedColor();
      context.font = "400 12px Lora, Georgia, serif";
      context.fillText(formatMoney(segment.value, settings.currency), legendX + 14, y + 22);
    });
  }
}

function drawBars(canvas, bars, settings) {
  const { context, width, height } = setupCanvas(canvas);
  const maxValue = Math.max(...bars.map((bar) => bar.value), 1);
  const chartBottom = height - 42;
  const chartTop = 32;
  const chartHeight = chartBottom - chartTop;
  const barWidth = Math.min(width * 0.22, 90);
  const spacing = width * 0.35;

  bars.forEach((bar, index) => {
    const x = width * 0.28 + index * spacing - barWidth / 2;
    const barHeight = Math.max((bar.value / maxValue) * chartHeight, bar.value > 0 ? 4 : 0);
    const y = chartBottom - barHeight;

    context.fillStyle = bar.color;
    roundRect(context, x, y, barWidth, barHeight, 6);
    context.fill();

    context.fillStyle = getTextColor();
    context.font = "600 13px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(bar.label, x + barWidth / 2, height - 16);

    context.fillStyle = getTextMutedColor();
    context.font = width < 360 ? "500 11px Lora, Georgia, serif" : "500 12px Lora, Georgia, serif";
    const valText = formatMoney(bar.value, settings.currency);
    context.fillText(valText, x + barWidth / 2, Math.max(y - 8, 18));
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

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const range = maxValue - minValue || 1;

  const paddingLeft = 58;
  const paddingRight = 24;
  const paddingTop = 32;
  const paddingBottom = 38;

  const drawableWidth = width - paddingLeft - paddingRight;
  const drawableHeight = height - paddingTop - paddingBottom;

  // Líneas guía horizontales sutiles
  context.strokeStyle = getBorderColor();
  context.lineWidth = 1;
  context.setLineDash([3, 3]);

  [0, 0.5, 1].forEach((fraction) => {
    const y = paddingTop + drawableHeight * (1 - fraction);
    context.beginPath();
    context.moveTo(paddingLeft, y);
    context.lineTo(width - paddingRight, y);
    context.stroke();

    // Monto en eje Y
    const amount = minValue + range * fraction;
    context.fillStyle = getTextMutedColor();
    context.font = "500 10px Lora, Georgia, serif";
    context.textAlign = "right";
    context.fillText(formatMoney(amount, settings.currency), paddingLeft - 8, y + 4);
  });
  context.setLineDash([]);

  // Trazo de la línea de evolución
  context.strokeStyle = primaryAccent;
  context.lineWidth = 2.5;
  context.beginPath();
  points.forEach((point, index) => {
    const x = paddingLeft + (points.length === 1 ? drawableWidth / 2 : (index / (points.length - 1)) * drawableWidth);
    const y = paddingTop + drawableHeight * (1 - (point.value - minValue) / range);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  // Puntos destacados en la línea
  const highlightIndices = points.length <= 8 
    ? points.map((_, i) => i) 
    : [0, Math.floor(points.length / 2), points.length - 1];

  highlightIndices.forEach((idx) => {
    const point = points[idx];
    if (!point) return;
    const x = paddingLeft + (points.length === 1 ? drawableWidth / 2 : (idx / (points.length - 1)) * drawableWidth);
    const y = paddingTop + drawableHeight * (1 - (point.value - minValue) / range);

    context.fillStyle = primaryAccent;
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();

    // Fecha en eje X
    if (point.label) {
      context.fillStyle = getTextMutedColor();
      context.font = "500 10px Inter, system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText(point.label, x, height - 12);
    }
  });

  // Saldo final en esquina superior derecha
  context.fillStyle = primaryAccent;
  context.font = "600 12px Lora, Georgia, serif";
  context.textAlign = "right";
  const lastVal = points[points.length - 1]?.value ?? 0;
  context.fillText(`Actual: ${formatMoney(lastVal, settings.currency)}`, width - paddingRight, 18);
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
