const SETTINGS_VERSION = 7;

const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  selectedPrinterId: "",
  general: {
    profitPercent: 100,
    defaultManualMinutes: 15,
    manualRate: 50,
    packagingCost: 10,
    electricityCostPerHour: 3,
    shippingCost: 0,
    failurePercent: 10,
    taxPercent: 0,
    discount: 0,
    roundingStep: 5
  },
  printers: [
    {
      id: "printer_default_a1",
      name: "BAMBU LAB A1",
      hourlyRate: 35,
      maintenanceLimit: 200,
      currentHours: 0
    }
  ],
  materials: []
};

let settings = structuredCloneSafe(DEFAULT_SETTINGS);
let salesCache = [];
let lastCalc = {};
let orderRowCounter = 0;
let editingPrinterId = "";
let editingMaterialId = "";

document.addEventListener("DOMContentLoaded", function () {
  loadSettings();
  normalizeSettings();
  saveSettings();
  renderAll();
  loadSales();
  calculate();
});

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toEnglishDigits(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
}

function num(value) {
  const clean = toEnglishDigits(value)
    .replace(/,/g, "")
    .replace(/٫/g, ".")
    .replace(/،/g, ".")
    .trim();

  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function money(value) {
  return Math.round(num(value)).toLocaleString("en-US");
}

function moneyExact(value) {
  return num(value).toLocaleString("en-US", {
    maximumFractionDigits: 2
  });
}

function currency(value) {
  return money(value) + " جنيه";
}

function currencyExact(value) {
  return moneyExact(value) + " جنيه";
}

function fixed(value, digits = 1) {
  return num(value).toFixed(digits);
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = num(value) === 0 ? "" : String(num(value));
}

function setInputValueKeepZero(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = String(num(value));
}

function getEl(id) {
  return document.getElementById(id);
}

function makeId(prefix) {
  return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
}

function toast(message) {
  const el = getEl("toast");
  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.add("show");

  setTimeout(function () {
    el.classList.remove("show");
  }, 2200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function reportError(context, error) {
  const message = context + ": " + (error && error.message ? error.message : String(error || "Unknown error"));

  try {
    if (window.Android && Android.logError) {
      Android.logError(message);
    } else {
      console.error(message);
    }
  } catch (logError) {
    console.error(message);
  }
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(function (page) {
    page.classList.remove("active");
  });

  document.querySelectorAll(".tab-btn").forEach(function (button) {
    button.classList.remove("active");
  });

  const page = getEl("page-" + name);
  if (page) page.classList.add("active");

  const map = {
    calc: 0,
    log: 1,
    settings: 2
  };

  const buttons = document.querySelectorAll(".tab-btn");
  if (buttons[map[name]]) {
    buttons[map[name]].classList.add("active");
  }

  if (name === "log") loadSales();
  if (name === "settings") renderSettings();
}

function loadSettings() {
  try {
    if (window.Android && Android.getAppSettings) {
      const raw = Android.getAppSettings();
      if (raw) {
        settings = JSON.parse(raw);
        return;
      }
    }
  } catch (e) {
    reportError("loadSettings Android", e);
  }

  try {
    const raw = localStorage.getItem("bambu_app_settings_v2");
    if (raw) {
      settings = JSON.parse(raw);
    }
  } catch (e) {
    reportError("loadSettings localStorage", e);
    settings = structuredCloneSafe(DEFAULT_SETTINGS);
  }
}

function saveSettings() {
  normalizeSettings();

  const raw = JSON.stringify(settings);

  try {
    localStorage.setItem("bambu_app_settings_v2", raw);
  } catch (e) {
    reportError("saveSettings localStorage", e);
  }

  try {
    if (window.Android && Android.setAppSettings) {
      Android.setAppSettings(raw);
    }
  } catch (e) {
    reportError("saveSettings Android", e);
  }
}

function normalizeSettings() {
  if (!settings || typeof settings !== "object") {
    settings = structuredCloneSafe(DEFAULT_SETTINGS);
  }

  if (!settings.general) settings.general = {};
  if (!Array.isArray(settings.printers)) settings.printers = [];
  if (!Array.isArray(settings.materials)) settings.materials = [];

  if (settings.printers.length === 0) {
    settings.printers = structuredCloneSafe(DEFAULT_SETTINGS.printers);
    settings.selectedPrinterId = "printer_default_a1";
  }

  settings.printers = settings.printers.map(function (p) {
    return {
      id: p.id || makeId("printer"),
      name: p.name || "BAMBU LAB A1",
      hourlyRate: p.hourlyRate === undefined || p.hourlyRate === null ? 35 : num(p.hourlyRate),
      maintenanceLimit: p.maintenanceLimit === undefined || p.maintenanceLimit === null ? 200 : num(p.maintenanceLimit),
      currentHours: num(p.currentHours)
    };
  });

  settings.materials = settings.materials.map(function (m) {
    return {
      id: m.id || makeId("mat"),
      name: m.name || "خامة",
      color: m.color || "",
      brand: m.brand || "",
      kgPrice: num(m.kgPrice)
    };
  });

  const g = settings.general;
  const d = DEFAULT_SETTINGS.general;

  g.profitPercent = g.profitPercent === undefined || g.profitPercent === null ? d.profitPercent : num(g.profitPercent);
  g.defaultManualMinutes = g.defaultManualMinutes === undefined || g.defaultManualMinutes === null ? d.defaultManualMinutes : num(g.defaultManualMinutes);
  g.manualRate = g.manualRate === undefined || g.manualRate === null ? d.manualRate : num(g.manualRate);
  g.packagingCost = g.packagingCost === undefined || g.packagingCost === null ? d.packagingCost : num(g.packagingCost);
  g.electricityCostPerHour = g.electricityCostPerHour === undefined || g.electricityCostPerHour === null ? d.electricityCostPerHour : num(g.electricityCostPerHour);
  g.shippingCost = g.shippingCost === undefined || g.shippingCost === null ? d.shippingCost : num(g.shippingCost);
  g.failurePercent = g.failurePercent === undefined || g.failurePercent === null ? d.failurePercent : num(g.failurePercent);
  g.taxPercent = g.taxPercent === undefined || g.taxPercent === null ? d.taxPercent : num(g.taxPercent);
  g.discount = g.discount === undefined || g.discount === null ? d.discount : num(g.discount);
  g.roundingStep = g.roundingStep === undefined || g.roundingStep === null ? d.roundingStep : num(g.roundingStep);

  if (!settings.selectedPrinterId || !settings.printers.some(function (p) { return p.id === settings.selectedPrinterId; })) {
    settings.selectedPrinterId = settings.printers[0].id;
  }

  settings.settingsVersion = SETTINGS_VERSION;
}

function renderAll() {
  renderMachineSelect();
  renderOrderMaterials();
  renderSettings();
  applyDefaultsToCalculator();
  updateMachineStatus();
}

function selectedPrinter() {
  return settings.printers.find(function (p) {
    return p.id === settings.selectedPrinterId;
  }) || settings.printers[0];
}

function renderMachineSelect() {
  const select = getEl("machineSelect");
  if (!select) return;

  select.innerHTML = "";

  settings.printers.forEach(function (printer) {
    const opt = document.createElement("option");
    opt.value = printer.id;
    opt.textContent = printer.name;
    select.appendChild(opt);
  });

  select.value = settings.selectedPrinterId;
}

function onMachineChanged() {
  settings.selectedPrinterId = getEl("machineSelect").value;

  const printer = selectedPrinter();
  if (printer) {
    setInputValue("machineRate", printer.hourlyRate);
  }

  saveSettings();
  updateMachineStatus();
  calculate();
}

function applyDefaultsToCalculator() {
  const printer = selectedPrinter();

  if (printer) {
    setInputValue("machineRate", printer.hourlyRate);
  }

  setInputValue("profitPercent", settings.general.profitPercent);
  setInputValue("manualMinutes", settings.general.defaultManualMinutes);
  setInputValue("manualRate", settings.general.manualRate);
  setInputValue("packagingCost", settings.general.packagingCost);
  setInputValue("electricityCostPerHour", settings.general.electricityCostPerHour);
  setInputValue("shippingCost", settings.general.shippingCost);
  setInputValue("failurePercent", settings.general.failurePercent);
  setInputValue("taxPercent", settings.general.taxPercent);
  setInputValue("discount", settings.general.discount);
  setInputValue("roundingStep", settings.general.roundingStep);
}

function updateMachineStatus() {
  const printer = selectedPrinter();
  if (!printer) return;

  const current = num(printer.currentHours);
  const limit = num(printer.maintenanceLimit) || 1;
  const printHoursInput = getEl("printHours");
  const printHours = printHoursInput ? num(printHoursInput.value) : 0;

  const machineHoursText = getEl("machineHoursText");
  if (machineHoursText) {
    machineHoursText.textContent = "الساعات المسجلة: " + fixed(current, 1) + " / " + fixed(limit, 0) + " س";
  }

  const afterOrderHours = getEl("afterOrderHours");
  if (afterOrderHours) {
    afterOrderHours.textContent = fixed(current + printHours, 1) + " س";
  }

  const maintenanceProgress = getEl("maintenanceProgress");
  if (maintenanceProgress) {
    const percent = Math.min(100, Math.max(0, (current / limit) * 100));
    maintenanceProgress.style.width = percent + "%";
  }
}

function resetSelectedMachineHours() {
  const printer = selectedPrinter();
  if (!printer) return;

  if (!confirm("تصفير ساعات الصيانة لهذه الماكينة؟")) return;

  printer.currentHours = 0;
  saveSettings();
  renderAll();
  calculate();

  try {
    if (window.Android && Android.setMaintenanceHours) {
      Android.setMaintenanceHours("0");
    }
  } catch (e) {
    reportError("resetSelectedMachineHours Android", e);
  }

  toast("تم تصفير ساعات الصيانة");
}

function materialLabel(mat) {
  const name = [mat.name, mat.color, mat.brand].filter(Boolean).join(" - ");
  return name + " (" + currency(mat.kgPrice) + " / كجم)";
}

function renderOrderMaterials() {
  const box = getEl("orderMaterials");
  const addBtn = getEl("addOrderMaterialBtn");
  if (!box) return;

  if (settings.materials.length === 0) {
    box.innerHTML = "<p>لا توجد خامات مضافة. افتح تبويب الإعدادات وأضف الخامة أولًا.</p>";
    box.dataset.hasRows = "0";
    if (addBtn) addBtn.disabled = true;
    return;
  }

  if (addBtn) addBtn.disabled = false;

  if (box.dataset.hasRows !== "1") {
    box.innerHTML = "";
    addOrderMaterialRow();
  } else {
    document.querySelectorAll(".order-material-select").forEach(function (sel) {
      fillMaterialSelect(sel, sel.value);
    });
  }
}

function fillMaterialSelect(select, selectedValue) {
  select.innerHTML = "";

  settings.materials.forEach(function (mat) {
    const opt = document.createElement("option");
    opt.value = mat.id;
    opt.textContent = materialLabel(mat);
    select.appendChild(opt);
  });

  if (selectedValue && settings.materials.some(function (m) { return m.id === selectedValue; })) {
    select.value = selectedValue;
  }
}

function addOrderMaterialRow(materialId = "", weight = "") {
  if (settings.materials.length === 0) {
    toast("أضف خامة من الإعدادات أولًا");
    showPage("settings");
    return;
  }

  const box = getEl("orderMaterials");
  if (!box) return;

  if (box.dataset.hasRows !== "1") {
    box.innerHTML = "";
  }

  box.dataset.hasRows = "1";

  const row = document.createElement("div");
  row.className = "filament-row";
  row.dataset.rowId = "row_" + (++orderRowCounter);

  const selectWrap = document.createElement("label");
  selectWrap.textContent = "الخامة";

  const select = document.createElement("select");
  select.className = "order-material-select";
  select.onchange = calculate;
  fillMaterialSelect(select, materialId || (settings.materials[0] ? settings.materials[0].id : ""));

  selectWrap.appendChild(select);

  const weightWrap = document.createElement("label");
  weightWrap.textContent = "الوزن جرام";

  const weightInput = document.createElement("input");
  weightInput.className = "order-material-weight";
  weightInput.type = "text";
  weightInput.inputMode = "decimal";
  weightInput.placeholder = "الوزن جرام";
  weightInput.value = num(weight) === 0 ? "" : String(num(weight));
  weightInput.oninput = calculate;

  weightWrap.appendChild(weightInput);

  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "×";
  del.onclick = function () {
    row.remove();

    if (document.querySelectorAll(".filament-row").length === 0) {
      box.dataset.hasRows = "0";
      renderOrderMaterials();
    }

    calculate();
  };

  row.appendChild(selectWrap);
  row.appendChild(weightWrap);
  row.appendChild(del);
  box.appendChild(row);

  calculate();
}

function getOrderMaterials() {
  if (settings.materials.length === 0) return [];

  const rows = Array.from(document.querySelectorAll(".filament-row"));

  return rows.map(function (row) {
    const select = row.querySelector(".order-material-select");
    const weightInput = row.querySelector(".order-material-weight");

    const matId = select ? select.value : "";
    const mat = settings.materials.find(function (m) {
      return m.id === matId;
    });

    const weight = num(weightInput ? weightInput.value : 0);
    const gramPrice = mat ? num(mat.kgPrice) / 1000 : 0;

    return {
      id: matId,
      name: mat ? mat.name : "",
      color: mat ? mat.color : "",
      brand: mat ? mat.brand : "",
      kgPrice: mat ? num(mat.kgPrice) : 0,
      gramPrice: gramPrice,
      weight: weight,
      cost: weight * gramPrice
    };
  }).filter(function (item) {
    return item.id;
  });
}

function hasOrderWork(printHours, materialWeight, manualMinutes, packagingCost, shippingCost) {
  return printHours > 0 || materialWeight > 0 || manualMinutes > 0 || packagingCost > 0 || shippingCost > 0;
}

function roundUpToStep(value, step) {
  const safeStep = num(step) > 0 ? num(step) : 1;
  if (num(value) <= 0) return 0;
  return Math.ceil(num(value) / safeStep) * safeStep;
}

function calculate() {
  const printHours = num(getEl("printHours") ? getEl("printHours").value : 0);
  const machineRate = num(getEl("machineRate") ? getEl("machineRate").value : 0);
  const electricityCostPerHour = num(getEl("electricityCostPerHour") ? getEl("electricityCostPerHour").value : 0);
  const manualMinutes = num(getEl("manualMinutes") ? getEl("manualMinutes").value : 0);
  const manualRate = num(getEl("manualRate") ? getEl("manualRate").value : 0);
  const packagingCostInput = num(getEl("packagingCost") ? getEl("packagingCost").value : 0);
  const shippingCostInput = num(getEl("shippingCost") ? getEl("shippingCost").value : 0);
  const failurePercent = num(getEl("failurePercent") ? getEl("failurePercent").value : 0);
  const taxPercent = num(getEl("taxPercent") ? getEl("taxPercent").value : 0);
  const profitPercent = num(getEl("profitPercent") ? getEl("profitPercent").value : 0);
  const discountInput = num(getEl("discount") ? getEl("discount").value : 0);
  const roundingStep = num(getEl("roundingStep") ? getEl("roundingStep").value : 5) || 5;

  const materials = getOrderMaterials();
  const materialWeight = materials.reduce(function (sum, m) {
    return sum + num(m.weight);
  }, 0);

  const materialCost = materials.reduce(function (sum, m) {
    return sum + num(m.cost);
  }, 0);

  const hasWork = hasOrderWork(printHours, materialWeight, manualMinutes, packagingCostInput, shippingCostInput);

  const depreciationCost = printHours * machineRate;
  const electricityCost = printHours * electricityCostPerHour;
  const manualCost = (manualMinutes / 60) * manualRate;
  const packagingCost = hasWork ? packagingCostInput : 0;
  const shippingCost = hasWork ? shippingCostInput : 0;

  const baseCost =
    materialCost +
    depreciationCost +
    electricityCost +
    manualCost +
    packagingCost +
    shippingCost;

  const riskCost = baseCost * (failurePercent / 100);
  const costBeforeTax = baseCost + riskCost;
  const taxCost = costBeforeTax * (taxPercent / 100);
  const totalCost = costBeforeTax + taxCost;

  const priceBeforeDiscount = totalCost * (1 + profitPercent / 100);
  const safeDiscountValue = Math.min(discountInput, priceBeforeDiscount);
  const priceAfterDiscount = Math.max(0, priceBeforeDiscount - safeDiscountValue);

  const finalPrice = hasWork ? roundUpToStep(priceAfterDiscount, roundingStep) : 0;
  const roundedAdjustment = finalPrice - priceAfterDiscount;
  const netProfit = finalPrice - totalCost;

  let weightedGramCost = 0;
  if (materialWeight > 0) {
    weightedGramCost = materialCost / materialWeight;
  } else if (materials.length > 0) {
    weightedGramCost = num(materials[0].gramPrice);
  }

  lastCalc = {
    hasWork: hasWork,
    printHours: printHours,
    machineRate: machineRate,
    depreciationCost: depreciationCost,
    electricityCostPerHour: electricityCostPerHour,
    electricityCost: electricityCost,
    materials: materials,
    materialWeight: materialWeight,
    materialCost: materialCost,
    weightedGramCost: weightedGramCost,
    manualMinutes: manualMinutes,
    manualRate: manualRate,
    manualCost: manualCost,
    packagingCost: packagingCost,
    shippingCost: shippingCost,
    baseCost: baseCost,
    failurePercent: failurePercent,
    riskCost: riskCost,
    costBeforeTax: costBeforeTax,
    taxPercent: taxPercent,
    taxCost: taxCost,
    totalCost: totalCost,
    profitPercent: profitPercent,
    priceBeforeDiscount: priceBeforeDiscount,
    discount: safeDiscountValue,
    priceAfterDiscount: priceAfterDiscount,
    roundingStep: roundingStep,
    roundedAdjustment: roundedAdjustment,
    finalPrice: finalPrice,
    netProfit: netProfit
  };

  const finalPriceEl = getEl("finalPrice");
  if (finalPriceEl) finalPriceEl.textContent = money(finalPrice);

  const totalCostEl = getEl("totalCost");
  if (totalCostEl) totalCostEl.textContent = money(totalCost);

  const netProfitEl = getEl("netProfit");
  if (netProfitEl) netProfitEl.textContent = money(netProfit);

  renderBreakdown();
  updateMachineStatus();
}

function renderBreakdown() {
  const box = getEl("breakdown");
  if (!box) return;

  const c = lastCalc || {};

  box.innerHTML = `
    <div>تكلفة الخامة: <strong>${currencyExact(c.materialCost || 0)}</strong></div>
    <div>تكلفة الماكينة: <strong>${currencyExact(c.depreciationCost || 0)}</strong></div>
    <div>الكهرباء: <strong>${currencyExact(c.electricityCost || 0)}</strong></div>
    <div>الشغل اليدوي: <strong>${currencyExact(c.manualCost || 0)}</strong></div>
    <div>التغليف: <strong>${currencyExact(c.packagingCost || 0)}</strong></div>
    <div>الشحن / المصاريف: <strong>${currencyExact(c.shippingCost || 0)}</strong></div>
    <div>Base Cost: <strong>${currencyExact(c.baseCost || 0)}</strong></div>
    <div>الهالك / المخاطرة (${fixed(c.failurePercent || 0, 1)}%): <strong>${currencyExact(c.riskCost || 0)}</strong></div>
    <div>قبل الضريبة: <strong>${currencyExact(c.costBeforeTax || 0)}</strong></div>
    <div>الضريبة (${fixed(c.taxPercent || 0, 1)}%): <strong>${currencyExact(c.taxCost || 0)}</strong></div>
    <div>إجمالي التكلفة: <strong>${currencyExact(c.totalCost || 0)}</strong></div>
    <div>السعر قبل الخصم: <strong>${currencyExact(c.priceBeforeDiscount || 0)}</strong></div>
    <div>الخصم: <strong>${currencyExact(c.discount || 0)}</strong></div>
    <div>بعد الخصم: <strong>${currencyExact(c.priceAfterDiscount || 0)}</strong></div>
    <div>فرق التقريب: <strong>${currencyExact(c.roundedAdjustment || 0)}</strong></div>
    <div>السعر النهائي: <strong>${currencyExact(c.finalPrice || 0)}</strong></div>
    <div>صافي الربح: <strong>${currencyExact(c.netProfit || 0)}</strong></div>
  `;
}

function saveGeneralFromCalculator() {
  settings.general.profitPercent = num(getEl("profitPercent").value);
  settings.general.defaultManualMinutes = num(getEl("manualMinutes").value);
  settings.general.manualRate = num(getEl("manualRate").value);
  settings.general.packagingCost = num(getEl("packagingCost").value);
  settings.general.electricityCostPerHour = num(getEl("electricityCostPerHour").value);
  settings.general.shippingCost = num(getEl("shippingCost").value);
  settings.general.failurePercent = num(getEl("failurePercent").value);
  settings.general.taxPercent = num(getEl("taxPercent").value);
  settings.general.discount = num(getEl("discount").value);
  settings.general.roundingStep = num(getEl("roundingStep").value);

  const printer = selectedPrinter();
  if (printer) {
    printer.hourlyRate = num(getEl("machineRate").value);
  }

  saveSettings();
  renderAll();
  toast("تم حفظ الإعدادات كأساسي");
}

function invoiceText() {
  calculate();

  const client = getEl("clientName").value.trim() || "عميل";
  const model = getEl("modelName").value.trim() || "طلب طباعة 3D";
  const date = new Date().toLocaleDateString("en-GB");

  const lines = [
    "✨ فاتورة طلب طباعة 3D ✨",
    "",
    "التاريخ: " + date,
    "العميل: " + client,
    "المجسم: " + model,
    ""
  ];

  if (lastCalc.discount > 0) {
    lines.push("الخصم: " + currency(lastCalc.discount));
  }

  lines.push("━━━━━━━━━━━━━━");
  lines.push("الإجمالي النهائي: " + currency(lastCalc.finalPrice));
  lines.push("━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("شكرًا لاختيارك لنا ✨");

  return lines.join("\n");
}

function copyText(text, okMessage) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(function () {
        toast(okMessage);
      })
      .catch(function () {
        fallbackCopy(text, okMessage);
      });
  } else {
    fallbackCopy(text, okMessage);
  }
}

function fallbackCopy(text, okMessage) {
  const tmp = document.createElement("textarea");
  tmp.value = text;
  document.body.appendChild(tmp);
  tmp.select();
  document.execCommand("copy");
  tmp.remove();
  toast(okMessage);
}

function copyInvoice() {
  calculate();

  if (!lastCalc.hasWork) {
    toast("أدخل بيانات الطلب أولًا");
    return;
  }

  copyText(invoiceText(), "تم نسخ الفاتورة");
}

function sendWhatsApp() {
  calculate();

  if (!lastCalc.hasWork) {
    toast("أدخل بيانات الطلب أولًا");
    return;
  }

  copyText(invoiceText(), "تم نسخ نص الفاتورة للواتساب");
}

function buildPrintInvoiceHtml() {
  const client = getEl("clientName").value.trim() || "عميل";
  const model = getEl("modelName").value.trim() || "طلب طباعة 3D";
  const date = new Date().toLocaleDateString("en-GB");

  const discountBlock = lastCalc.discount > 0
    ? "<p>الخصم: " + currency(lastCalc.discount) + "</p>"
    : "";

  return `
    <!doctype html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8">
      <title>فاتورة طلب طباعة 3D</title>
      <style>
        body { font-family: sans-serif; direction: rtl; padding: 24px; }
        .invoice { max-width: 520px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 14px; }
        h1 { margin-top: 0; }
        .total { font-size: 24px; font-weight: bold; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="invoice">
        <h1>✨ فاتورة طلب طباعة 3D ✨</h1>
        <p>التاريخ: ${escapeHtml(date)}</p>
        <p>العميل: ${escapeHtml(client)}</p>
        <p>المجسم: ${escapeHtml(model)}</p>
        ${discountBlock}
        <hr>
        <p class="total">الإجمالي النهائي: ${currency(lastCalc.finalPrice)}</p>
        <hr>
        <p>شكرًا لاختيارك لنا ✨</p>
      </div>
    </body>
    </html>
  `;
}

function printInvoice() {
  calculate();

  if (!lastCalc.hasWork) {
    toast("أدخل بيانات الطلب أولًا");
    return;
  }

  const html = buildPrintInvoiceHtml();

  try {
    if (window.Android && Android.printPage) {
      try {
        Android.printPage(html);
      } catch (e1) {
        Android.printPage();
      }
    } else {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.print();
      } else {
        window.print();
      }
    }
  } catch (e) {
    reportError("printInvoice", e);
    window.print();
  }
}

function confirmSale() {
  calculate();

  if (!lastCalc.hasWork || lastCalc.finalPrice <= 0) {
    toast("لا يمكن تسجيل بيعة فاضية");
    return;
  }

  const client = getEl("clientName").value.trim() || "عميل";
  const model = getEl("modelName").value.trim() || "مجسم";
  const printer = selectedPrinter();

  const sale = {
    id: Date.now(),
    date: new Date().toLocaleString("en-GB"),
    client: client,
    model: model,

    sale: lastCalc.finalPrice,
    profit: lastCalc.netProfit,
    hours: lastCalc.printHours,
    weight: lastCalc.materialWeight,
    waste: 0,

    printerName: printer ? printer.name : "",
    machineRate: lastCalc.machineRate,
    machineCost: lastCalc.depreciationCost,

    materialsJson: JSON.stringify(lastCalc.materials),
    materialCost: lastCalc.materialCost,
    averageGramCost: lastCalc.weightedGramCost,

    electricityCostPerHour: lastCalc.electricityCostPerHour,
    electricityCost: lastCalc.electricityCost,

    manualMinutes: lastCalc.manualMinutes,
    manualRate: lastCalc.manualRate,
    manualCost: lastCalc.manualCost,

    packagingCost: lastCalc.packagingCost,
    shippingCost: lastCalc.shippingCost,

    baseCost: lastCalc.baseCost,
    failurePercent: lastCalc.failurePercent,
    riskCost: lastCalc.riskCost,

    taxPercent: lastCalc.taxPercent,
    taxCost: lastCalc.taxCost,

    totalCost: lastCalc.totalCost,
    profitPercent: lastCalc.profitPercent,
    priceBeforeDiscount: lastCalc.priceBeforeDiscount,
    discount: lastCalc.discount,
    priceAfterDiscount: lastCalc.priceAfterDiscount,
    roundingStep: lastCalc.roundingStep,
    roundedAdjustment: lastCalc.roundedAdjustment,

    finalPrice: lastCalc.finalPrice,
    netProfit: lastCalc.netProfit
  };

  try {
    if (window.Android && Android.saveSale) {
      Android.saveSale(JSON.stringify(sale));
    } else {
      const local = JSON.parse(localStorage.getItem("bambu_sales_v2") || "[]");
      local.unshift(sale);
      localStorage.setItem("bambu_sales_v2", JSON.stringify(local));
    }
  } catch (e) {
    reportError("confirmSale saveSale", e);
    toast("حدث خطأ أثناء حفظ البيعة");
    return;
  }

  if (printer) {
    printer.currentHours = num(printer.currentHours) + lastCalc.printHours;
    saveSettings();

    try {
      if (window.Android && Android.setMaintenanceHours) {
        Android.setMaintenanceHours(String(printer.currentHours));
      }
    } catch (e) {
      reportError("confirmSale setMaintenanceHours", e);
    }
  }

  clearOrderFormAfterSale();
  toast("تم تسجيل البيعة في الدفتر");
  loadSales();
  renderAll();
}

function clearOrderFormAfterSale() {
  getEl("clientName").value = "";
  getEl("modelName").value = "";
  getEl("printHours").value = "";

  const manualMinutes = getEl("manualMinutes");
  if (manualMinutes) manualMinutes.value = String(num(settings.general.defaultManualMinutes) || "");

  const discount = getEl("discount");
  if (discount) discount.value = num(settings.general.discount) === 0 ? "" : String(num(settings.general.discount));

  const orderBox = getEl("orderMaterials");
  if (orderBox) {
    orderBox.dataset.hasRows = "0";
  }

  renderOrderMaterials();
  calculate();
}

function loadSales() {
  try {
    if (window.Android && Android.getSales) {
      salesCache = JSON.parse(Android.getSales() || "[]");
    } else {
      salesCache = JSON.parse(localStorage.getItem("bambu_sales_v2") || "[]");
    }
  } catch (e) {
    reportError("loadSales", e);
    salesCache = [];
  }

  renderSales();
}

function renderSales() {
  const box = getEl("salesList");
  if (!box) return;

  box.innerHTML = "";

  if (!salesCache.length) {
    box.innerHTML = "<p>لا توجد مبيعات مسجلة.</p>";
  } else {
    salesCache.forEach(function (sale) {
      const card = document.createElement("div");
      card.className = "sale-card";

      card.innerHTML = `
        <h3>${escapeHtml(sale.client || "عميل")}</h3>
        <p>${escapeHtml(sale.model || "مجسم")}</p>
        <p>${escapeHtml(sale.date || "")}</p>
        <p>السعر النهائي: <strong>${currency(sale.sale || sale.finalPrice || 0)}</strong></p>
        <p>صافي الربح: <strong>${currency(sale.profit || sale.netProfit || 0)}</strong></p>
        <p>التكلفة: <strong>${currency(sale.totalCost || 0)}</strong></p>
        <p>وقت الطباعة: ${fixed(sale.hours || 0, 1)} س</p>
        <p>الخامة: ${fixed(sale.weight || 0, 1)} جم</p>
        <button type="button" onclick="copySaleInvoice(${Number(sale.id)})">نسخ الفاتورة</button>
        <button type="button" onclick="deleteSale(${Number(sale.id)})">حذف البيعة</button>
      `;

      box.appendChild(card);
    });
  }

  renderStats();
}

function renderStats() {
  const totalSales = salesCache.reduce(function (sum, s) {
    return sum + num(s.sale || s.finalPrice);
  }, 0);

  const totalProfit = salesCache.reduce(function (sum, s) {
    return sum + num(s.profit || s.netProfit);
  }, 0);

  const totalHours = salesCache.reduce(function (sum, s) {
    return sum + num(s.hours);
  }, 0);

  const totalWeight = salesCache.reduce(function (sum, s) {
    return sum + num(s.weight);
  }, 0);

  const statSales = getEl("statSales");
  if (statSales) statSales.textContent = currency(totalSales);

  const statProfit = getEl("statProfit");
  if (statProfit) statProfit.textContent = currency(totalProfit);

  const statHours = getEl("statHours");
  if (statHours) statHours.textContent = fixed(totalHours, 1) + " س";

  const statWeight = getEl("statWeight");
  if (statWeight) statWeight.textContent = fixed(totalWeight / 1000, 2) + " كجم";
}

function copySaleInvoice(id) {
  const sale = salesCache.find(function (s) {
    return Number(s.id) === Number(id);
  });

  if (!sale) return;

  const lines = [
    "✨ فاتورة طلب طباعة 3D ✨",
    "",
    "التاريخ: " + (sale.date || ""),
    "العميل: " + (sale.client || "عميل"),
    "المجسم: " + (sale.model || "طلب طباعة 3D"),
    "",
    "━━━━━━━━━━━━━━",
    "الإجمالي النهائي: " + currency(sale.sale || sale.finalPrice || 0),
    "━━━━━━━━━━━━━━",
    "",
    "شكرًا لاختيارك لنا ✨"
  ];

  copyText(lines.join("\n"), "تم نسخ الفاتورة");
}

function deleteSale(id) {
  if (!confirm("حذف البيعة من السجل؟")) return;

  try {
    if (window.Android && Android.deleteSale) {
      Android.deleteSale(String(id));
      loadSales();
      toast("تم حذف البيعة");
      return;
    }
  } catch (e) {
    reportError("deleteSale Android", e);
  }

  salesCache = salesCache.filter(function (s) {
    return Number(s.id) !== Number(id);
  });

  localStorage.setItem("bambu_sales_v2", JSON.stringify(salesCache));
  renderSales();
  toast("تم حذف البيعة");
}

function clearSales() {
  if (!confirm("مسح كل سجل المبيعات؟")) return;

  try {
    if (window.Android && Android.clearSales) {
      Android.clearSales();
      loadSales();
      toast("تم مسح السجل");
      return;
    }
  } catch (e) {
    reportError("clearSales Android", e);
  }

  salesCache = [];
  localStorage.setItem("bambu_sales_v2", "[]");
  renderSales();
  toast("تم مسح السجل");
}

function exportCSV() {
  loadSales();

  if (!salesCache.length) {
    toast("لا يوجد سجل للتصدير");
    return;
  }

  const headers = [
    "date",
    "client",
    "model",
    "finalPrice",
    "totalCost",
    "netProfit",
    "hours",
    "weight",
    "materialCost",
    "machineCost",
    "electricityCost",
    "manualCost",
    "packagingCost",
    "shippingCost",
    "failurePercent",
    "riskCost",
    "taxPercent",
    "taxCost",
    "profitPercent",
    "discount",
    "roundingStep"
  ];

  const rows = salesCache.map(function (s) {
    return [
      s.date || "",
      s.client || "",
      s.model || "",
      s.sale || s.finalPrice || 0,
      s.totalCost || 0,
      s.profit || s.netProfit || 0,
      s.hours || 0,
      s.weight || 0,
      s.materialCost || 0,
      s.machineCost || 0,
      s.electricityCost || 0,
      s.manualCost || 0,
      s.packagingCost || 0,
      s.shippingCost || 0,
      s.failurePercent || 0,
      s.riskCost || 0,
      s.taxPercent || 0,
      s.taxCost || 0,
      s.profitPercent || 0,
      s.discount || 0,
      s.roundingStep || 0
    ];
  });

  const csv = [headers].concat(rows)
    .map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell).replace(/"/g, '""') + '"';
      }).join(",");
    })
    .join("\n");

  try {
    if (window.Android && Android.exportCSV) {
      Android.exportCSV(csv);
      toast("تم تصدير السجل");
      return;
    }
  } catch (e) {
    reportError("exportCSV Android", e);
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bambu-sales.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function renderSettings() {
  setInputValue("setProfitPercent", settings.general.profitPercent);
  setInputValue("setDefaultManualMinutes", settings.general.defaultManualMinutes);
  setInputValue("setManualRate", settings.general.manualRate);
  setInputValue("setPackagingCost", settings.general.packagingCost);
  setInputValue("setElectricityCostPerHour", settings.general.electricityCostPerHour);
  setInputValue("setShippingCost", settings.general.shippingCost);
  setInputValue("setFailurePercent", settings.general.failurePercent);
  setInputValue("setTaxPercent", settings.general.taxPercent);
  setInputValue("setDiscount", settings.general.discount);
  setInputValue("setRoundingStep", settings.general.roundingStep);

  renderPrintersList();
  renderMaterialsList();
}

function saveGeneralSettings() {
  settings.general.profitPercent = num(getEl("setProfitPercent").value);
  settings.general.defaultManualMinutes = num(getEl("setDefaultManualMinutes").value);
  settings.general.manualRate = num(getEl("setManualRate").value);
  settings.general.packagingCost = num(getEl("setPackagingCost").value);
  settings.general.electricityCostPerHour = num(getEl("setElectricityCostPerHour").value);
  settings.general.shippingCost = num(getEl("setShippingCost").value);
  settings.general.failurePercent = num(getEl("setFailurePercent").value);
  settings.general.taxPercent = num(getEl("setTaxPercent").value);
  settings.general.discount = num(getEl("setDiscount").value);
  settings.general.roundingStep = num(getEl("setRoundingStep").value) || 5;

  saveSettings();
  applyDefaultsToCalculator();
  calculate();
  toast("تم حفظ الإعدادات العامة");
}

function renderPrintersList() {
  const box = getEl("printersList");
  if (!box) return;

  box.innerHTML = "";

  settings.printers.forEach(function (printer) {
    const div = document.createElement("div");
    div.className = "list-item";

    div.innerHTML = `
      <strong>${escapeHtml(printer.name)}</strong>
      <p>سعر الساعة: ${currency(printer.hourlyRate)} - الصيانة: ${fixed(printer.currentHours, 1)} / ${fixed(printer.maintenanceLimit, 0)} س</p>
      <button type="button" onclick="editPrinter('${printer.id}')">تعديل</button>
      <button type="button" onclick="deletePrinter('${printer.id}')">حذف</button>
    `;

    box.appendChild(div);
  });
}

function savePrinter() {
  const name = getEl("printerName").value.trim();
  const hourlyRate = num(getEl("printerRate").value);
  const maintenanceLimit = num(getEl("printerMaintenanceLimit").value) || 200;
  const currentHours = num(getEl("printerCurrentHours").value);

  if (!name) {
    toast("اكتب اسم الماكينة");
    return;
  }

  if (editingPrinterId) {
    const printer = settings.printers.find(function (p) {
      return p.id === editingPrinterId;
    });

    if (printer) {
      printer.name = name;
      printer.hourlyRate = hourlyRate;
      printer.maintenanceLimit = maintenanceLimit;
      printer.currentHours = currentHours;
    }
  } else {
    const printer = {
      id: makeId("printer"),
      name: name,
      hourlyRate: hourlyRate,
      maintenanceLimit: maintenanceLimit,
      currentHours: currentHours
    };

    settings.printers.push(printer);

    if (!settings.selectedPrinterId) {
      settings.selectedPrinterId = printer.id;
    }
  }

  saveSettings();
  cancelPrinterEdit();
  renderAll();
  calculate();
  toast("تم حفظ الماكينة");
}

function editPrinter(id) {
  const printer = settings.printers.find(function (p) {
    return p.id === id;
  });

  if (!printer) return;

  editingPrinterId = id;

  getEl("printerName").value = printer.name;
  setInputValue("printerRate", printer.hourlyRate);
  setInputValue("printerMaintenanceLimit", printer.maintenanceLimit);
  setInputValue("printerCurrentHours", printer.currentHours);

  const hint = getEl("printerEditHint");
  if (hint) hint.style.display = "block";

  const saveBtn = getEl("printerSaveBtn");
  if (saveBtn) saveBtn.textContent = "حفظ تعديل الماكينة";

  const cancelBtn = getEl("printerCancelBtn");
  if (cancelBtn) cancelBtn.style.display = "inline-block";
}

function cancelPrinterEdit() {
  editingPrinterId = "";

  if (getEl("printerName")) getEl("printerName").value = "";
  if (getEl("printerRate")) getEl("printerRate").value = "";
  if (getEl("printerMaintenanceLimit")) getEl("printerMaintenanceLimit").value = "";
  if (getEl("printerCurrentHours")) getEl("printerCurrentHours").value = "";

  const hint = getEl("printerEditHint");
  if (hint) hint.style.display = "none";

  const saveBtn = getEl("printerSaveBtn");
  if (saveBtn) saveBtn.textContent = "إضافة ماكينة";

  const cancelBtn = getEl("printerCancelBtn");
  if (cancelBtn) cancelBtn.style.display = "none";
}

function deletePrinter(id) {
  if (settings.printers.length <= 1) {
    toast("لازم تسيب ماكينة واحدة على الأقل");
    return;
  }

  if (!confirm("حذف الماكينة؟")) return;

  settings.printers = settings.printers.filter(function (p) {
    return p.id !== id;
  });

  if (settings.selectedPrinterId === id) {
    settings.selectedPrinterId = settings.printers[0].id;
  }

  saveSettings();
  renderAll();
  calculate();
  toast("تم حذف الماكينة");
}

function renderMaterialsList() {
  const box = getEl("materialsList");
  if (!box) return;

  box.innerHTML = "";

  if (settings.materials.length === 0) {
    box.innerHTML = "<p>لا توجد خامات مضافة.</p>";
    return;
  }

  settings.materials.forEach(function (mat) {
    const div = document.createElement("div");
    div.className = "list-item";

    div.innerHTML = `
      <strong>${escapeHtml([mat.name, mat.color, mat.brand].filter(Boolean).join(" - "))}</strong>
      <p>السعر: ${currency(mat.kgPrice)} / كجم</p>
      <button type="button" onclick="editMaterial('${mat.id}')">تعديل</button>
      <button type="button" onclick="deleteMaterial('${mat.id}')">حذف</button>
    `;

    box.appendChild(div);
  });
}

function saveMaterial() {
  const name = getEl("matName").value.trim();
  const color = getEl("matColor").value.trim();
  const brand = getEl("matBrand").value.trim();
  const kgPrice = num(getEl("matKgPrice").value);

  if (!name) {
    toast("اكتب اسم الخامة");
    return;
  }

  if (kgPrice <= 0) {
    toast("اكتب سعر الكيلو");
    return;
  }

  if (editingMaterialId) {
    const mat = settings.materials.find(function (m) {
      return m.id === editingMaterialId;
    });

    if (mat) {
      mat.name = name;
      mat.color = color;
      mat.brand = brand;
      mat.kgPrice = kgPrice;
    }
  } else {
    settings.materials.push({
      id: makeId("mat"),
      name: name,
      color: color,
      brand: brand,
      kgPrice: kgPrice
    });
  }

  saveSettings();
  cancelMaterialEdit();
  renderAll();
  calculate();
  toast("تم حفظ الخامة");
}

function editMaterial(id) {
  const mat = settings.materials.find(function (m) {
    return m.id === id;
  });

  if (!mat) return;

  editingMaterialId = id;

  getEl("matName").value = mat.name;
  getEl("matColor").value = mat.color;
  getEl("matBrand").value = mat.brand;
  setInputValue("matKgPrice", mat.kgPrice);

  const hint = getEl("materialEditHint");
  if (hint) hint.style.display = "block";

  const saveBtn = getEl("materialSaveBtn");
  if (saveBtn) saveBtn.textContent = "حفظ تعديل الخامة";

  const cancelBtn = getEl("materialCancelBtn");
  if (cancelBtn) cancelBtn.style.display = "inline-block";
}

function cancelMaterialEdit() {
  editingMaterialId = "";

  if (getEl("matName")) getEl("matName").value = "";
  if (getEl("matColor")) getEl("matColor").value = "";
  if (getEl("matBrand")) getEl("matBrand").value = "";
  if (getEl("matKgPrice")) getEl("matKgPrice").value = "";

  const hint = getEl("materialEditHint");
  if (hint) hint.style.display = "none";

  const saveBtn = getEl("materialSaveBtn");
  if (saveBtn) saveBtn.textContent = "إضافة خامة";

  const cancelBtn = getEl("materialCancelBtn");
  if (cancelBtn) cancelBtn.style.display = "none";
}

function deleteMaterial(id) {
  if (!confirm("حذف الخامة؟")) return;

  settings.materials = settings.materials.filter(function (m) {
    return m.id !== id;
  });

  saveSettings();

  const box = getEl("orderMaterials");
  if (box) box.dataset.hasRows = "0";

  renderAll();
  calculate();
  toast("تم حذف الخامة");
}
