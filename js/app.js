import { clearState, createId, exportState, importState, loadState, saveState } from "./storage.js";
import { deleteCategory, getCategory, upsertCategory } from "./categories.js";
import { deleteTransaction, filterTransactions, upsertTransaction } from "./transactions.js";
import { calculateTotals, formatDate, formatMoney } from "./dashboard.js";
import { renderCharts } from "./charts.js";
import { requestNotificationPermission, sendLocalNotification, startNotificationScheduler } from "./notifications.js";

let state = loadState();

const elements = {
  headerBalance: document.getElementById("headerBalance"),
  totalBalance: document.getElementById("totalBalance"),
  totalIncome: document.getElementById("totalIncome"),
  totalExpenses: document.getElementById("totalExpenses"),
  monthlyBalance: document.getElementById("monthlyBalance"),
  monthRangeLabel: document.getElementById("monthRangeLabel"),
  transactionsTable: document.getElementById("transactionsTable"),
  emptyTransactions: document.getElementById("emptyTransactions"),
  rowTemplate: document.getElementById("transactionRowTemplate"),
  transactionModal: document.getElementById("transactionModal"),
  transactionForm: document.getElementById("transactionForm"),
  transactionModalTitle: document.getElementById("transactionModalTitle"),
  settingsModal: document.getElementById("settingsModal"),
  settingsForm: document.getElementById("settingsForm"),
  filtersForm: document.getElementById("filtersForm"),
  searchInput: document.getElementById("searchInput"),
  monthFilter: document.getElementById("monthFilter"),
  categoryFilter: document.getElementById("categoryFilter"),
  typeFilter: document.getElementById("typeFilter"),
  sortSelect: document.getElementById("sortSelect"),
  transactionId: document.getElementById("transactionId"),
  transactionType: document.getElementById("transactionType"),
  transactionAmount: document.getElementById("transactionAmount"),
  transactionCategory: document.getElementById("transactionCategory"),
  transactionDate: document.getElementById("transactionDate"),
  transactionDescription: document.getElementById("transactionDescription"),
  transactionPayment: document.getElementById("transactionPayment"),
  transactionNotes: document.getElementById("transactionNotes"),
  themeSelect: document.getElementById("themeSelect"),
  currencySelect: document.getElementById("currencySelect"),
  financialStartDay: document.getElementById("financialStartDay"),
  categoryId: document.getElementById("categoryId"),
  categoryName: document.getElementById("categoryName"),
  categoryIcon: document.getElementById("categoryIcon"),
  categoryColor: document.getElementById("categoryColor"),
  saveCategoryButton: document.getElementById("saveCategoryButton"),
  categoriesList: document.getElementById("categoriesList"),
  importInput: document.getElementById("importInput"),
  reminderTime: document.getElementById("reminderTime"),
  reminderLabel: document.getElementById("reminderLabel"),
  saveReminderButton: document.getElementById("saveReminderButton"),
  remindersList: document.getElementById("remindersList"),
  testNotificationButton: document.getElementById("testNotificationButton"),
};

initialize();

function initialize() {
  bindEvents();
  fillFinancialDays();
  applyTheme();
  render();
  registerServiceWorker();
  startNotificationScheduler(() => state.settings);
}

function bindEvents() {
  document.getElementById("addTransactionButton").addEventListener("click", () => openTransactionModal());
  document.getElementById("settingsButton").addEventListener("click", openSettingsModal);
  document.getElementById("exportButton").addEventListener("click", handleExport);
  document.getElementById("clearDataButton").addEventListener("click", handleClearData);

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.closeModal).close();
    });
  });

  elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
  const debouncedRenderTransactions = debounce(renderTransactions, 250);
  elements.filtersForm.addEventListener("input", debouncedRenderTransactions);
  elements.filtersForm.addEventListener("change", renderTransactions);
  elements.transactionType.addEventListener("change", populateTransactionCategories);
  elements.saveCategoryButton.addEventListener("click", handleCategorySave);
  elements.saveReminderButton.addEventListener("click", handleReminderSave);
  elements.testNotificationButton.addEventListener("click", handleTestNotification);
  elements.remindersList.addEventListener("click", handleReminderAction);
  elements.remindersList.addEventListener("change", handleReminderToggle);
  elements.importInput.addEventListener("change", handleImport);
  elements.transactionsTable.addEventListener("click", handleTransactionAction);
  elements.categoriesList.addEventListener("click", handleCategoryAction);
  window.addEventListener("resize", () => renderCharts(state.transactions, state.categories, state.settings));
}

function render() {
  saveState(state);
  applyTheme();
  renderDashboard();
  populateCategorySelects();
  renderTransactions();
  renderCategories();
  renderReminders();
  renderSettings();
  renderCharts(state.transactions, state.categories, state.settings);
}

function renderDashboard() {
  const totals = calculateTotals(state.transactions, state.settings);
  elements.headerBalance.textContent = formatMoney(totals.totalBalance, state.settings.currency);
  elements.totalBalance.textContent = formatMoney(totals.totalBalance, state.settings.currency);
  elements.totalIncome.textContent = formatMoney(totals.totalIncome, state.settings.currency);
  elements.totalExpenses.textContent = formatMoney(totals.totalExpenses, state.settings.currency);
  elements.monthlyBalance.textContent = formatMoney(totals.monthlyBalance, state.settings.currency);
  elements.monthRangeLabel.textContent = totals.monthRangeLabel;
}

function escapeHTML(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>'"]/g, 
    (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function renderTransactions() {
  const transactions = filterTransactions(state.transactions, getFilters());
  elements.transactionsTable.replaceChildren();
  elements.emptyTransactions.hidden = transactions.length > 0;

  transactions.forEach((transaction) => {
    const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
    const category = getCategory(state.categories, transaction.categoryId);
    row.dataset.id = transaction.id;
    row.querySelector('[data-cell="date"]').textContent = formatDate(transaction.date);
    row.querySelector('[data-cell="description"]').textContent = transaction.description;
    row.querySelector('[data-cell="notes"]').textContent = buildNotes(transaction);
    row.querySelector('[data-cell="category"]').innerHTML = `
      <span class="category-pill" style="border: 1px solid ${escapeHTML(category.color)}33">
        <span>${escapeHTML(category.icon)}</span><span>${escapeHTML(category.name)}</span>
      </span>
    `;
    const amountCell = row.querySelector('[data-cell="amount"]');
    amountCell.textContent = `${transaction.type === "income" ? "+" : "-"}${formatMoney(transaction.amount, state.settings.currency)}`;
    amountCell.className = transaction.type === "income" ? "amount-income" : "amount-expense";
    elements.transactionsTable.append(row);
  });
}

function renderCategories() {
  elements.categoriesList.replaceChildren();
  state.categories.forEach((category) => {
    const item = document.createElement("div");
    item.className = "category-item";
    item.dataset.id = category.id;
    item.innerHTML = `
      <div class="category-item__meta">
        <span class="color-dot" style="background:${escapeHTML(category.color)}"></span>
        <strong>${escapeHTML(category.icon)} ${escapeHTML(category.name)}</strong>
      </div>
      <div class="table-actions">
        <button class="small-button" type="button" data-action="edit-category">Editar</button>
        <button class="small-button small-button--danger" type="button" data-action="delete-category">Eliminar</button>
      </div>
    `;
    elements.categoriesList.append(item);
  });
}

function renderSettings() {
  elements.themeSelect.value = state.settings.theme;
  elements.currencySelect.value = state.settings.currency;
  elements.financialStartDay.value = String(state.settings.financialStartDay);
}

function populateCategorySelects() {
  const categoryOptions = state.categories
    .map((category) => `<option value="${escapeHTML(category.id)}">${escapeHTML(category.icon)} ${escapeHTML(category.name)}</option>`)
    .join("");

  elements.transactionCategory.innerHTML = categoryOptions;
  elements.categoryFilter.innerHTML = `<option value="all">Todas</option>${categoryOptions}`;
}

function populateTransactionCategories() {
  if (!elements.transactionCategory.value && state.categories.length > 0) {
    elements.transactionCategory.value = state.categories[0].id;
  }
}

function fillFinancialDays() {
  elements.financialStartDay.innerHTML = Array.from({ length: 28 }, (_, index) => {
    const day = index + 1;
    return `<option value="${day}">Dia ${day}</option>`;
  }).join("");
}

function openTransactionModal(transaction = null) {
  elements.transactionForm.reset();
  elements.transactionId.value = transaction?.id || "";
  elements.transactionModalTitle.textContent = transaction ? "Editar movimiento" : "Nuevo movimiento";
  elements.transactionType.value = transaction?.type || "expense";
  elements.transactionAmount.value = transaction?.amount || "";
  elements.transactionCategory.value = transaction?.categoryId || state.categories[0]?.id || "";
  elements.transactionDate.value = transaction?.date || new Date().toISOString().slice(0, 10);
  elements.transactionDescription.value = transaction?.description || "";
  elements.transactionPayment.value = transaction?.paymentMethod || "";
  elements.transactionNotes.value = transaction?.notes || "";
  elements.transactionModal.showModal();
}

function openSettingsModal() {
  renderSettings();
  renderCategories();
  renderReminders();
  elements.settingsModal.showModal();
}

function handleTransactionSubmit(event) {
  event.preventDefault();

  try {
    const existingTransaction = state.transactions.find((item) => item.id === elements.transactionId.value);
    state.transactions = upsertTransaction(state.transactions, {
      id: elements.transactionId.value,
      type: elements.transactionType.value,
      amount: elements.transactionAmount.value,
      categoryId: elements.transactionCategory.value,
      description: elements.transactionDescription.value,
      date: elements.transactionDate.value,
      paymentMethod: elements.transactionPayment.value,
      notes: elements.transactionNotes.value,
      createdAt: existingTransaction?.createdAt,
    });
    elements.transactionModal.close();
    render();
  } catch (error) {
    alert(error.message);
  }
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  state.settings = {
    ...state.settings,
    theme: elements.themeSelect.value,
    currency: elements.currencySelect.value,
    financialStartDay: Number(elements.financialStartDay.value),
  };
  elements.settingsModal.close();
  render();
}

function handleCategorySave() {
  try {
    state.categories = upsertCategory(state.categories, {
      id: elements.categoryId.value,
      name: elements.categoryName.value,
      icon: elements.categoryIcon.value,
      color: elements.categoryColor.value,
    });
    resetCategoryForm();
    render();
  } catch (error) {
    alert(error.message);
  }
}

function handleTransactionAction(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const transactionId = button.closest("tr").dataset.id;
  const transaction = state.transactions.find((item) => item.id === transactionId);

  if (button.dataset.action === "edit") {
    openTransactionModal(transaction);
    return;
  }

  if (button.dataset.action === "delete" && confirm("¿Eliminar este movimiento?")) {
    state.transactions = deleteTransaction(state.transactions, transactionId);
    render();
  }
}

function handleCategoryAction(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const categoryId = button.closest(".category-item").dataset.id;
  const category = getCategory(state.categories, categoryId);

  if (button.dataset.action === "edit-category") {
    elements.categoryId.value = category.id;
    elements.categoryName.value = category.name;
    elements.categoryIcon.value = category.icon;
    elements.categoryColor.value = category.color;
    return;
  }

  if (button.dataset.action === "delete-category" && confirm("¿Eliminar esta categoria?")) {
    try {
      state.categories = deleteCategory(state.categories, state.transactions, categoryId);
      render();
    } catch (error) {
      alert(error.message);
    }
  }
}

function renderReminders() {
  elements.remindersList.replaceChildren();
  const reminders = state.settings.reminders || [];
  if (reminders.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "hint";
    emptyMsg.textContent = "No hay recordatorios configurados.";
    elements.remindersList.append(emptyMsg);
    return;
  }

  reminders.forEach((reminder) => {
    const item = document.createElement("div");
    item.className = "category-item";
    item.dataset.id = reminder.id;
    item.innerHTML = `
      <div class="category-item__meta">
        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
          <input type="checkbox" data-action="toggle-reminder" ${reminder.enabled ? "checked" : ""} />
          <strong>⏰ ${escapeHTML(reminder.time)}</strong>
          <span>- ${escapeHTML(reminder.label || "Recordatorio")}</span>
        </label>
      </div>
      <div class="table-actions">
        <button class="small-button small-button--danger" type="button" data-action="delete-reminder">Eliminar</button>
      </div>
    `;
    elements.remindersList.append(item);
  });
}

async function handleReminderSave() {
  const currentReminders = state.settings.reminders || [];
  if (currentReminders.length >= 10) {
    alert("Has alcanzado el limite maximo de 10 recordatorios.");
    return;
  }

  const time = elements.reminderTime.value;
  const label = elements.reminderLabel.value.trim() || "Recordatorio de gastos";

  if (!/^\d{2}:\d{2}$/.test(time)) {
    alert("Selecciona una hora valida.");
    return;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    return;
  }

  const newReminder = {
    id: createId(),
    time,
    label,
    enabled: true,
  };

  state.settings.reminders = [...currentReminders, newReminder];
  elements.reminderLabel.value = "";
  render();
}

function handleReminderToggle(event) {
  const target = event.target;
  if (target.dataset.action !== "toggle-reminder") {
    return;
  }
  const reminderId = target.closest(".category-item").dataset.id;
  state.settings.reminders = (state.settings.reminders || []).map((rem) =>
    rem.id === reminderId ? { ...rem, enabled: target.checked } : rem
  );
  render();
}

function handleReminderAction(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const reminderId = button.closest(".category-item").dataset.id;
  if (button.dataset.action === "delete-reminder") {
    state.settings.reminders = (state.settings.reminders || []).filter((rem) => rem.id !== reminderId);
    render();
  }
}

async function handleTestNotification() {
  const granted = await requestNotificationPermission();
  if (!granted) {
    return;
  }
  const success = await sendLocalNotification("Notificación de Prueba 🔔", {
    body: "¡Las notificaciones del Gestor de Gastos están funcionando correctamente!",
  });
  if (!success) {
    alert("No se pudo mostrar la notificacion. Verifica los permisos de tu navegador.");
  }
}

function handleExport() {
  const blob = new Blob([exportState(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gestor-gastos-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function debounce(fn, delay = 250) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

async function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  if (file.size > MAX_FILE_SIZE) {
    alert("El archivo excede el limite de 2MB permitido.");
    event.target.value = "";
    return;
  }

  try {
    const text = await file.text();
    state = importState(text);
    render();
    alert("Datos importados correctamente.");
  } catch {
    alert("No se pudo importar el archivo. Revisa que sea un JSON valido.");
  } finally {
    event.target.value = "";
  }
}

function handleClearData() {
  if (!confirm("Esto eliminara todos los datos guardados en este navegador. ¿Continuar?")) {
    return;
  }

  clearState();
  state = loadState();
  resetCategoryForm();
  render();
}

function getFilters() {
  return {
    search: elements.searchInput.value,
    month: elements.monthFilter.value,
    categoryId: elements.categoryFilter.value,
    type: elements.typeFilter.value,
    sort: elements.sortSelect.value,
  };
}

function buildNotes(transaction) {
  const metadata = [transaction.paymentMethod, transaction.notes].filter(Boolean).join(" · ");
  return metadata || (transaction.type === "income" ? "Ingreso" : "Gasto");
}

function resetCategoryForm() {
  elements.categoryId.value = "";
  elements.categoryName.value = "";
  elements.categoryIcon.value = "";
  elements.categoryColor.value = "#2563eb";
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => undefined);
  }
}
