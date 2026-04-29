"use strict";

const STORAGE_KEY = "bambu_manager_v1";

const defaultState = {
    settings: {
        profitPercent: 100,
        manualRate: 120,
        packagingCost: 10,

        // موجودة من دلوقتي عشان لما نطوّر الـ HTML تبقى جاهزة
        electricityCostPerHour: 0,
        failurePercent: 0,
        shippingCost: 0,
        taxPercent: 0,
        minimumOrderPrice: 0,
        roundingStep: 1
    },
    printers: [
        {
            id: makeId(),
            name: "BAMBU LAB A1",
            rate: 35,
            maintenanceLimit: 200,
            currentHours: 0
        }
    ],
    materials: [
        {
            id: makeId(),
            name: "PLA",
            color: "Black",
            brand: "Bambu Lab",
            kgPrice: 1000
        }
    ],
    sales: []
};

let state = loadState();
let editingPrinterId = null;
let editingMaterialId = null;
let lastCalc = null;

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
    normalizeState();
    saveState();

    loadSettingsIntoUI();
    renderPrinters();
    renderMaterials();
    renderMachineSelect();

    if (!document.querySelector(".order-material-row")) {
        addOrderMaterialRow();
    }

    calculate();
    loadSales();
}

function makeId() {
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredCloneSafe(defaultState);

        const parsed = JSON.parse(raw);
        return mergeDeep(structuredCloneSafe(defaultState), parsed);
    } catch (e) {
        return structuredCloneSafe(defaultState);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function structuredCloneSafe(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function mergeDeep(target, source) {
    if (!source || typeof source !== "object") return target;

    Object.keys(source).forEach((key) => {
        if (
            source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key])
        ) {
            target[key] = mergeDeep(target[key] || {}, source[key]);
        } else {
            target[key] = source[key];
        }
    });

    return target;
}

function normalizeState() {
    if (!Array.isArray(state.printers)) state.printers = [];
    if (!Array.isArray(state.materials)) state.materials = [];
    if (!Array.isArray(state.sales)) state.sales = [];

    if (!state.settings) state.settings = structuredCloneSafe(defaultState.settings);

    state.settings = mergeDeep(structuredCloneSafe(defaultState.settings), state.settings);

    if (state.printers.length === 0) {
        state.printers.push(structuredCloneSafe(defaultState.printers[0]));
    }

    if (state.materials.length === 0) {
        state.materials.push(structuredCloneSafe(defaultState.materials[0]));
    }

    state.printers = state.printers.map((p) => ({
        id: p.id || makeId(),
        name: p.name || "ماكينة",
        rate: num(p.rate),
        maintenanceLimit: num(p.maintenanceLimit) || 200,
        currentHours: num(p.currentHours)
    }));

    state.materials = state.materials.map((m) => ({
        id: m.id || makeId(),
        name: m.name || "خامة",
        color: m.color || "",
        brand: m.brand || "",
        kgPrice: num(m.kgPrice)
    }));
}

function num(value) {
    if (value === null || value === undefined) return 0;

    let text = String(value)
        .trim()
        .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
        .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
        .replace(",", ".")
        .replace(/[^\d.-]/g, "");

    const n = parseFloat(text);
    return Number.isFinite(n) ? n : 0;
}

function money(value) {
    const n = num(value);
    return Math.round(n).toLocaleString("ar-EG");
}

function oneDecimal(value) {
    return (Math.round(num(value) * 10) / 10).toLocaleString("ar-EG");
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
}

function toast(message) {
    const el = document.getElementById("toast");
    if (!el) {
        alert(message);
        return;
    }

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
        el.classList.remove("show");
    }, 2300);
}

function showPage(page) {
    document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach((el) => el.classList.remove("active"));

    const pageEl = document.getElementById("page-" + page);
    if (pageEl) pageEl.classList.add("active");

    const buttons = document.querySelectorAll(".tab-btn");
    if (page === "calc" && buttons[0]) buttons[0].classList.add("active");
    if (page === "log" && buttons[1]) buttons[1].classList.add("active");
    if (page === "settings" && buttons[2]) buttons[2].classList.add("active");

    if (page === "log") loadSales();
}

function loadSettingsIntoUI() {
    setValue("profitPercent", state.settings.profitPercent);
    setValue("manualRate", state.settings.manualRate);
    setValue("packagingCost", state.settings.packagingCost);

    setValue("setProfitPercent", state.settings.profitPercent);
    setValue("setManualRate", state.settings.manualRate);
    setValue("setPackagingCost", state.settings.packagingCost);
}

function saveGeneralFromCalculator() {
    state.settings.profitPercent = num(getValue("profitPercent"));
    state.settings.manualRate = num(getValue("manualRate"));
    state.settings.packagingCost = num(getValue("packagingCost"));

    saveState();
    loadSettingsIntoUI();
    toast("تم حفظ إعدادات الحاسبة كأساسي");
    calculate();
}

function saveGeneralSettings() {
    state.settings.profitPercent = num(getValue("setProfitPercent"));
    state.settings.manualRate = num(getValue("setManualRate"));
    state.settings.packagingCost = num(getValue("setPackagingCost"));

    saveState();
    loadSettingsIntoUI();
    toast("تم حفظ الإعدادات العامة");
    calculate();
}

function renderMachineSelect() {
    const select = document.getElementById("machineSelect");
    if (!select) return;

    const oldValue = select.value;

    select.innerHTML = state.printers
        .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
        .join("");

    if (oldValue && state.printers.some((p) => p.id === oldValue)) {
        select.value = oldValue;
    }

    if (!select.value && state.printers[0]) {
        select.value = state.printers[0].id;
    }

    onMachineChanged();
}

function selectedPrinter() {
    const id = getValue("machineSelect");
    return state.printers.find((p) => p.id === id) || state.printers[0] || null;
}

function onMachineChanged() {
    const printer = selectedPrinter();
    if (!printer) return;

    setValue("machineRate", printer.rate);
    updateMaintenanceUI();
    calculate();
}

function updateMaintenanceUI() {
    const printer = selectedPrinter();
    if (!printer) return;

    const printHours = num(getValue("printHours"));
    const current = num(printer.currentHours);
    const limit = num(printer.maintenanceLimit) || 200;
    const after = current + printHours;
    const percent = Math.min(100, Math.max(0, (current / limit) * 100));

    setText("machineHoursText", `الساعات المسجلة: ${oneDecimal(current)} / ${oneDecimal(limit)} س`);
    setText("afterOrderHours", `${oneDecimal(after)} س`);

    const progress = document.getElementById("maintenanceProgress");
    if (progress) progress.style.width = percent + "%";
}

function resetSelectedMachineHours() {
    const printer = selectedPrinter();
    if (!printer) return;

    if (!confirm("تأكيد تصفير ساعات الصيانة للماكينة المختارة؟")) return;

    printer.currentHours = 0;
    saveState();
    renderPrinters();
    updateMaintenanceUI();
    toast("تم تصفير ساعات الصيانة");
}

function renderPrinters() {
    const list = document.getElementById("printersList");
    if (!list) return;

    if (state.printers.length === 0) {
        list.innerHTML = `<div class="empty-note">لا توجد ماكينات.</div>`;
        return;
    }

    list.innerHTML = state.printers.map((p) => {
        return `
            <div class="item-card">
                <div class="item-head">
                    <div>
                        <div class="item-title">${escapeHtml(p.name)}</div>
                        <div class="item-sub">
                            سعر الساعة: ${money(p.rate)} جنيه<br>
                            الصيانة: ${oneDecimal(p.currentHours)} / ${oneDecimal(p.maintenanceLimit)} ساعة
                        </div>
                    </div>
                    <div class="item-price">${money(p.rate)} ج/س</div>
                </div>
                <div class="item-actions">
                    <button class="secondary" onclick="editPrinter('${p.id}')">تعديل</button>
                    <button class="danger" onclick="deletePrinter('${p.id}')">حذف</button>
                </div>
            </div>
        `;
    }).join("");
}

function savePrinter() {
    const name = getValue("printerName").trim();
    const rate = num(getValue("printerRate"));
    const maintenanceLimit = num(getValue("printerMaintenanceLimit")) || 200;
    const currentHours = num(getValue("printerCurrentHours"));

    if (!name) {
        toast("اكتب اسم الماكينة");
        return;
    }

    if (editingPrinterId) {
        const p = state.printers.find((x) => x.id === editingPrinterId);
        if (p) {
            p.name = name;
            p.rate = rate;
            p.maintenanceLimit = maintenanceLimit;
            p.currentHours = currentHours;
        }
        cancelPrinterEdit(false);
        toast("تم تعديل الماكينة");
    } else {
        state.printers.push({
            id: makeId(),
            name,
            rate,
            maintenanceLimit,
            currentHours
        });
        clearPrinterForm();
        toast("تمت إضافة الماكينة");
    }

    saveState();
    renderPrinters();
    renderMachineSelect();
    calculate();
}

function editPrinter(id) {
    const p = state.printers.find((x) => x.id === id);
    if (!p) return;

    editingPrinterId = id;
    setValue("printerName", p.name);
    setValue("printerRate", p.rate);
    setValue("printerMaintenanceLimit", p.maintenanceLimit);
    setValue("printerCurrentHours", p.currentHours);

    const hint = document.getElementById("printerEditHint");
    const saveBtn = document.getElementById("printerSaveBtn");
    const cancelBtn = document.getElementById("printerCancelBtn");

    if (hint) hint.style.display = "block";
    if (saveBtn) saveBtn.textContent = "حفظ تعديل الماكينة";
    if (cancelBtn) cancelBtn.style.display = "inline-block";

    showPage("settings");
}

function cancelPrinterEdit(showToast = true) {
    editingPrinterId = null;
    clearPrinterForm();

    const hint = document.getElementById("printerEditHint");
    const saveBtn = document.getElementById("printerSaveBtn");
    const cancelBtn = document.getElementById("printerCancelBtn");

    if (hint) hint.style.display = "none";
    if (saveBtn) saveBtn.textContent = "إضافة ماكينة";
    if (cancelBtn) cancelBtn.style.display = "none";

    if (showToast) toast("تم إلغاء تعديل الماكينة");
}

function clearPrinterForm() {
    setValue("printerName", "");
    setValue("printerRate", "");
    setValue("printerMaintenanceLimit", "");
    setValue("printerCurrentHours", "");
}

function deletePrinter(id) {
    if (state.printers.length <= 1) {
        toast("لازم تسيب ماكينة واحدة على الأقل");
        return;
    }

    if (!confirm("حذف الماكينة؟")) return;

    state.printers = state.printers.filter((p) => p.id !== id);
    saveState();
    renderPrinters();
    renderMachineSelect();
    toast("تم حذف الماكينة");
}

function renderMaterials() {
    const list = document.getElementById("materialsList");
    if (list) {
        if (state.materials.length === 0) {
            list.innerHTML = `<div class="empty-note">لا توجد خامات.</div>`;
        } else {
            list.innerHTML = state.materials.map((m) => {
                const gramPrice = num(m.kgPrice) / 1000;
                return `
                    <div class="item-card">
                        <div class="item-head">
                            <div>
                                <div class="item-title">${escapeHtml(materialLabel(m))}</div>
                                <div class="item-sub">
                                    سعر الكيلو: ${money(m.kgPrice)} جنيه<br>
                                    سعر الجرام: ${formatNumber(gramPrice)} جنيه
                                </div>
                            </div>
                            <div class="item-price">${formatNumber(gramPrice)} ج/جم</div>
                        </div>
                        <div class="item-actions">
                            <button class="secondary" onclick="editMaterial('${m.id}')">تعديل</button>
                            <button class="danger" onclick="deleteMaterial('${m.id}')">حذف</button>
                        </div>
                    </div>
                `;
            }).join("");
        }
    }

    refreshOrderMaterialSelects();
}

function materialLabel(m) {
    return [m.name, m.color, m.brand].filter(Boolean).join(" - ");
}

function saveMaterial() {
    const name = getValue("matName").trim();
    const color = getValue("matColor").trim();
    const brand = getValue("matBrand").trim();
    const kgPrice = num(getValue("matKgPrice"));

    if (!name) {
        toast("اكتب اسم الخامة");
        return;
    }

    if (kgPrice <= 0) {
        toast("اكتب سعر الكيلو");
        return;
    }

    if (editingMaterialId) {
        const m = state.materials.find((x) => x.id === editingMaterialId);
        if (m) {
            m.name = name;
            m.color = color;
            m.brand = brand;
            m.kgPrice = kgPrice;
        }
        cancelMaterialEdit(false);
        toast("تم تعديل الخامة");
    } else {
        state.materials.push({
            id: makeId(),
            name,
            color,
            brand,
            kgPrice
        });
        clearMaterialForm();
        toast("تمت إضافة الخامة");
    }

    saveState();
    renderMaterials();
    calculate();
}

function editMaterial(id) {
    const m = state.materials.find((x) => x.id === id);
    if (!m) return;

    editingMaterialId = id;
    setValue("matName", m.name);
    setValue("matColor", m.color);
    setValue("matBrand", m.brand);
    setValue("matKgPrice", m.kgPrice);

    const hint = document.getElementById("materialEditHint");
    const saveBtn = document.getElementById("materialSaveBtn");
    const cancelBtn = document.getElementById("materialCancelBtn");

    if (hint) hint.style.display = "block";
    if (saveBtn) saveBtn.textContent = "حفظ تعديل الخامة";
    if (cancelBtn) cancelBtn.style.display = "inline-block";

    showPage("settings");
}

function cancelMaterialEdit(showToast = true) {
    editingMaterialId = null;
    clearMaterialForm();

    const hint = document.getElementById("materialEditHint");
    const saveBtn = document.getElementById("materialSaveBtn");
    const cancelBtn = document.getElementById("materialCancelBtn");

    if (hint) hint.style.display = "none";
    if (saveBtn) saveBtn.textContent = "إضافة خامة";
    if (cancelBtn) cancelBtn.style.display = "none";

    if (showToast) toast("تم إلغاء تعديل الخامة");
}

function clearMaterialForm() {
    setValue("matName", "");
    setValue("matColor", "");
    setValue("matBrand", "");
    setValue("matKgPrice", "");
}

function deleteMaterial(id) {
    if (state.materials.length <= 1) {
        toast("لازم تسيب خامة واحدة على الأقل");
        return;
    }

    if (!confirm("حذف الخامة؟")) return;

    state.materials = state.materials.filter((m) => m.id !== id);
    saveState();
    renderMaterials();
    toast("تم حذف الخامة");
}

function addOrderMaterialRow(materialId = "", weight = "") {
    const container = document.getElementById("orderMaterials");
    if (!container) return;

    const row = document.createElement("div");
    row.className = "material-row order-material-row";
    row.innerHTML = `
        <div class="field">
            <label>الخامة</label>
            <select class="order-material-select" onchange="calculate()"></select>
        </div>
        <div class="field">
            <label>الوزن بالجرام</label>
            <input class="order-material-weight" type="text" inputmode="decimal" placeholder="مثال: 120" value="${escapeAttr(weight)}" oninput="calculate()">
        </div>
        <button class="danger" type="button" onclick="removeOrderMaterialRow(this)">حذف</button>
    `;

    container.appendChild(row);
    refreshOneMaterialSelect(row.querySelector(".order-material-select"), materialId);
    calculate();
}

function removeOrderMaterialRow(button) {
    const rows = document.querySelectorAll(".order-material-row");
    if (rows.length <= 1) {
        toast("لازم خامة واحدة على الأقل في الطلب");
        return;
    }

    button.closest(".order-material-row").remove();
    calculate();
}

function refreshOrderMaterialSelects() {
    document.querySelectorAll(".order-material-select").forEach((select) => {
        const old = select.value;
        refreshOneMaterialSelect(select, old);
    });
}

function refreshOneMaterialSelect(select, selectedId = "") {
    if (!select) return;

    select.innerHTML = state.materials
        .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(materialLabel(m))}</option>`)
        .join("");

    if (selectedId && state.materials.some((m) => m.id === selectedId)) {
        select.value = selectedId;
    } else if (state.materials[0]) {
        select.value = state.materials[0].id;
    }
}

function getOrderMaterials() {
    const rows = Array.from(document.querySelectorAll(".order-material-row"));

    return rows.map((row) => {
        const materialId = row.querySelector(".order-material-select")?.value || "";
        const weight = num(row.querySelector(".order-material-weight")?.value || 0);
        const material = state.materials.find((m) => m.id === materialId) || null;
        const gramPrice = material ? num(material.kgPrice) / 1000 : 0;
        const cost = weight * gramPrice;

        return {
            materialId,
            materialName: material ? materialLabel(material) : "خامة",
            weight,
            gramPrice,
            cost
        };
    }).filter((x) => x.weight > 0);
}

function calculate() {
    const printer = selectedPrinter();

    const printHours = num(getValue("printHours"));
    const machineRate = num(getValue("machineRate")) || (printer ? num(printer.rate) : 0);
    const wasteWeight = num(getValue("wasteWeight"));
    const manualMinutes = num(getValue("manualMinutes"));
    const profitPercent = num(getValue("profitPercent"));
    const discount = num(getValue("discount"));
    const manualRate = num(getValue("manualRate"));
    const packagingCost = num(getValue("packagingCost"));

    const orderMaterials = getOrderMaterials();

    const materialWeight = orderMaterials.reduce((sum, item) => sum + item.weight, 0);
    const materialCost = orderMaterials.reduce((sum, item) => sum + item.cost, 0);

    const weightedGramPrice = materialWeight > 0 ? materialCost / materialWeight : 0;
    const wasteCost = wasteWeight * weightedGramPrice;

    const machineCost = printHours * machineRate;
    const electricityCost = printHours * num(state.settings.electricityCostPerHour);
    const manualCost = (manualMinutes / 60) * manualRate;

    const baseCost =
        materialCost +
        wasteCost +
        machineCost +
        electricityCost +
        manualCost +
        packagingCost +
        num(state.settings.shippingCost);

    const riskCost = baseCost * (num(state.settings.failurePercent) / 100);
    const costBeforeTax = baseCost + riskCost;
    const taxCost = costBeforeTax * (num(state.settings.taxPercent) / 100);
    const totalCost = costBeforeTax + taxCost;

    let finalPrice = totalCost * (1 + profitPercent / 100);
    finalPrice = finalPrice - discount;

    const minimumOrderPrice = num(state.settings.minimumOrderPrice);
    if (minimumOrderPrice > 0) {
        finalPrice = Math.max(finalPrice, minimumOrderPrice);
    }

    finalPrice = applyRounding(finalPrice, num(state.settings.roundingStep));
    finalPrice = Math.max(0, finalPrice);

    const netProfit = finalPrice - totalCost;

    lastCalc = {
        clientName: getValue("clientName").trim(),
        modelName: getValue("modelName").trim(),
        printerId: printer ? printer.id : "",
        printerName: printer ? printer.name : "",
        printHours,
        machineRate,
        machineCost,
        materialWeight,
        wasteWeight,
        weightedGramPrice,
        materialCost,
        wasteCost,
        manualMinutes,
        manualRate,
        manualCost,
        packagingCost,
        electricityCost,
        shippingCost: num(state.settings.shippingCost),
        failurePercent: num(state.settings.failurePercent),
        riskCost,
        taxPercent: num(state.settings.taxPercent),
        taxCost,
        profitPercent,
        discount,
        totalCost,
        finalPrice,
        netProfit,
        orderMaterials
    };

    setText("totalCost", money(totalCost));
    setText("finalPrice", money(finalPrice));
    setText("netProfit", money(netProfit));

    updateMaintenanceUI();

    return lastCalc;
}

function applyRounding(value, step) {
    if (!step || step <= 1) return Math.ceil(value);
    return Math.ceil(value / step) * step;
}

function confirmSale() {
    const calc = calculate();

    if (!calc.modelName) {
        toast("اكتب اسم المجسم الأول");
        return;
    }

    if (calc.finalPrice <= 0) {
        toast("السعر النهائي صفر، راجع بيانات التسعير");
        return;
    }

    const sale = {
        id: makeId(),
        date: new Date().toISOString(),
        status: "تم البيع",
        ...calc
    };

    state.sales.unshift(sale);

    const printer = selectedPrinter();
    if (printer) {
        printer.currentHours = num(printer.currentHours) + num(calc.printHours);
    }

    saveState();
    loadSales();
    renderPrinters();
    renderMachineSelect();

    toast("تم تسجيل البيعة في الدفتر");
    clearOrderAfterSale();
}

function clearOrderAfterSale() {
    setValue("clientName", "");
    setValue("modelName", "");
    setValue("printHours", "");
    setValue("wasteWeight", "");
    setValue("manualMinutes", "");
    setValue("discount", "");

    const container = document.getElementById("orderMaterials");
    if (container) {
        container.innerHTML = "";
        addOrderMaterialRow();
    }

    calculate();
}

function loadSales() {
    renderSales();
    renderStats();
}

function renderSales() {
    const list = document.getElementById("salesList");
    if (!list) return;

    if (!state.sales.length) {
        list.innerHTML = `<div class="empty-note">لا توجد مبيعات مسجلة.</div>`;
        return;
    }

    list.innerHTML = state.sales.map((sale) => {
        const date = new Date(sale.date);
        const dateText = Number.isNaN(date.getTime())
            ? ""
            : date.toLocaleString("ar-EG");

        return `
            <div class="item-card">
                <div class="item-head">
                    <div>
                        <div class="item-title">${escapeHtml(sale.modelName || "طلب بدون اسم")}</div>
                        <div class="item-sub">
                            العميل: ${escapeHtml(sale.clientName || "غير محدد")}<br>
                            الماكينة: ${escapeHtml(sale.printerName || "-")}<br>
                            التاريخ: ${escapeHtml(dateText)}<br>
                            الوزن: ${formatNumber(num(sale.materialWeight) + num(sale.wasteWeight))} جم /
                            الوقت: ${formatNumber(sale.printHours)} س
                        </div>
                    </div>
                    <div class="item-price">${money(sale.finalPrice)} ج</div>
                </div>
                <div class="item-sub">
                    التكلفة: ${money(sale.totalCost)} ج —
                    الربح: ${money(sale.netProfit)} ج —
                    الحالة: ${escapeHtml(sale.status || "تم البيع")}
                </div>
                <div class="item-actions">
                    <button class="secondary" onclick="copyInvoice('${sale.id}')">نسخ الفاتورة</button>
                    <button class="secondary" onclick="printInvoice('${sale.id}')">طباعة</button>
                    <button class="danger" onclick="deleteSale('${sale.id}')">حذف</button>
                </div>
            </div>
        `;
    }).join("");
}

function renderStats() {
    const salesTotal = state.sales.reduce((sum, s) => sum + num(s.finalPrice), 0);
    const profitTotal = state.sales.reduce((sum, s) => sum + num(s.netProfit), 0);
    const hoursTotal = state.sales.reduce((sum, s) => sum + num(s.printHours), 0);
    const weightTotalGram = state.sales.reduce((sum, s) => {
        return sum + num(s.materialWeight) + num(s.wasteWeight);
    }, 0);

    setText("statSales", `${money(salesTotal)} جنيه`);
    setText("statProfit", `${money(profitTotal)} جنيه`);
    setText("statHours", `${oneDecimal(hoursTotal)} س`);
    setText("statWeight", `${formatNumber(weightTotalGram / 1000)} كجم`);
}

function deleteSale(id) {
    const sale = state.sales.find((s) => s.id === id);
    if (!sale) return;

    if (!confirm("حذف العملية من السجل؟")) return;

    state.sales = state.sales.filter((s) => s.id !== id);
    saveState();
    loadSales();
    toast("تم حذف العملية");
}

function clearSales() {
    if (!state.sales.length) {
        toast("السجل فارغ بالفعل");
        return;
    }

    if (!confirm("مسح كل السجل؟")) return;

    state.sales = [];
    saveState();
    loadSales();
    toast("تم مسح السجل");
}

function getSaleForAction(id) {
    if (id) return state.sales.find((s) => s.id === id) || null;
    return calculate();
}

function buildInvoice(sale) {
    const materialsText = (sale.orderMaterials || [])
        .map((m) => `- ${m.materialName}: ${formatNumber(m.weight)} جم = ${money(m.cost)} جنيه`)
        .join("\n");

    return [
        "Bambu Business Manager",
        "-------------------------",
        `العميل: ${sale.clientName || "-"}`,
        `المجسم: ${sale.modelName || "-"}`,
        `الماكينة: ${sale.printerName || "-"}`,
        "",
        "الخامات:",
        materialsText || "-",
        "",
        `وقت الطباعة: ${formatNumber(sale.printHours)} ساعة`,
        `وزن الهالك: ${formatNumber(sale.wasteWeight)} جم`,
        `الشغل اليدوي: ${formatNumber(sale.manualMinutes)} دقيقة`,
        "",
        `تكلفة الخامات: ${money(sale.materialCost)} جنيه`,
        `تكلفة الهالك: ${money(sale.wasteCost)} جنيه`,
        `تكلفة الماكينة: ${money(sale.machineCost)} جنيه`,
        `تكلفة الشغل اليدوي: ${money(sale.manualCost)} جنيه`,
        `تكلفة التغليف: ${money(sale.packagingCost)} جنيه`,
        `التكلفة عليك: ${money(sale.totalCost)} جنيه`,
        `الخصم: ${money(sale.discount)} جنيه`,
        "-------------------------",
        `السعر النهائي: ${money(sale.finalPrice)} جنيه`,
        `صافي الربح: ${money(sale.netProfit)} جنيه`
    ].join("\n");
}

function copyInvoice(id) {
    const sale = getSaleForAction(id);
    if (!sale) {
        toast("لا توجد فاتورة للنسخ");
        return;
    }

    const text = buildInvoice(sale);

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => toast("تم نسخ الفاتورة"))
            .catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function sendWhatsApp() {
    const sale = calculate();
    const text = buildInvoice(sale);

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => toast("تم نسخ نص الواتساب"))
            .catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();

    try {
        document.execCommand("copy");
        toast("تم النسخ");
    } catch (e) {
        alert(text);
    }

    document.body.removeChild(area);
}

function printInvoice(id) {
    const sale = getSaleForAction(id);
    if (!sale) {
        toast("لا توجد فاتورة للطباعة");
        return;
    }

    const area = document.getElementById("invoicePrintArea");
    if (!area) return;

    const lines = buildInvoice(sale)
        .split("\n")
        .map((line) => `<div>${escapeHtml(line) || "&nbsp;"}</div>`)
        .join("");

    area.innerHTML = `
        <div style="max-width:700px;margin:0 auto;font-size:16px;line-height:1.8">
            <h2 style="text-align:center">Bambu Business Manager</h2>
            ${lines}
        </div>
    `;

    window.print();
}

function exportCSV() {
    if (!state.sales.length) {
        toast("لا توجد بيانات للتصدير");
        return;
    }

    const headers = [
        "date",
        "client",
        "model",
        "printer",
        "print_hours",
        "material_weight_g",
        "waste_weight_g",
        "total_cost",
        "final_price",
        "net_profit"
    ];

    const rows = state.sales.map((s) => [
        s.date,
        s.clientName,
        s.modelName,
        s.printerName,
        s.printHours,
        s.materialWeight,
        s.wasteWeight,
        Math.round(num(s.totalCost) * 100) / 100,
        Math.round(num(s.finalPrice) * 100) / 100,
        Math.round(num(s.netProfit) * 100) / 100
    ]);

    const csv = [headers, ...rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "bambu-sales.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    toast("تم تصدير CSV");
}

function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

function formatNumber(value) {
    const n = num(value);
    const rounded = Math.round(n * 100) / 100;
    return rounded.toLocaleString("ar-EG");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
    return escapeHtml(value);
}
