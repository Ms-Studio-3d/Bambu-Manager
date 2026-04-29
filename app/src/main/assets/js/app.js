"use strict";

const STORAGE_KEY = "bambu_manager_v2";

const defaultState = {
    settings: {
        profitPercent: 100,
        manualRate: 120,
        packagingCost: 10,
        electricityCostPerHour: 0,
        failurePercent: 10,
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
    extras: [
        {
            id: makeId(),
            name: "إزالة دعامات",
            cost: 20
        },
        {
            id: makeId(),
            name: "تجميع / تركيب",
            cost: 25
        },
        {
            id: makeId(),
            name: "تعديل ملف",
            cost: 30
        }
    ],
    sales: []
};

let state = loadState();

let editingPrinterId = null;
let editingMaterialId = null;
let editingExtraId = null;
let lastCalc = null;

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
    normalizeState();
    saveState();

    loadSettingsIntoUI();
    renderPrinters();
    renderMaterials();
    renderExtras();
    renderMachineSelect();

    if (!document.querySelector(".order-material-row")) {
        addOrderMaterialRow();
    }

    calculate();
    loadSales();
}

/* ========================= */
/* BASIC HELPERS */
/* ========================= */

function makeId() {
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

function structuredCloneSafe(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function loadState() {
    try {
        const rawV2 = localStorage.getItem(STORAGE_KEY);
        if (rawV2) {
            return mergeDeep(structuredCloneSafe(defaultState), JSON.parse(rawV2));
        }

        // محاولة ترحيل بيانات النسخة القديمة
        const oldRaw = localStorage.getItem("bambu_manager_v1");
        if (oldRaw) {
            const oldState = JSON.parse(oldRaw);
            return mergeDeep(structuredCloneSafe(defaultState), oldState);
        }

        return structuredCloneSafe(defaultState);
    } catch (e) {
        return structuredCloneSafe(defaultState);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    if (!state.settings) state.settings = {};
    state.settings = mergeDeep(structuredCloneSafe(defaultState.settings), state.settings);

    if (!Array.isArray(state.printers)) state.printers = [];
    if (!Array.isArray(state.materials)) state.materials = [];
    if (!Array.isArray(state.extras)) state.extras = [];
    if (!Array.isArray(state.sales)) state.sales = [];

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

    state.extras = state.extras.map((x) => ({
        id: x.id || makeId(),
        name: x.name || "بند إضافي",
        cost: num(x.cost)
    }));

    state.sales = state.sales.map((s) => ({
        id: s.id || makeId(),
        date: s.date || new Date().toISOString(),
        status: s.status || "عرض سعر",
        notes: s.notes || "",
        ...s
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
    return Math.round(num(value)).toLocaleString("ar-EG");
}

function formatNumber(value) {
    const rounded = Math.round(num(value) * 100) / 100;
    return rounded.toLocaleString("ar-EG");
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

/* ========================= */
/* NAVIGATION */
/* ========================= */

function showPage(page) {
    document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach((el) => el.classList.remove("active"));

    const pageEl = document.getElementById("page-" + page);
    if (pageEl) pageEl.classList.add("active");

    const buttons = document.querySelectorAll(".tab-btn");

    if (page === "calc" && buttons[0]) buttons[0].classList.add("active");
    if (page === "orders" && buttons[1]) buttons[1].classList.add("active");
    if (page === "reports" && buttons[2]) buttons[2].classList.add("active");
    if (page === "settings" && buttons[3]) buttons[3].classList.add("active");

    if (page === "orders" || page === "reports") {
        loadSales();
    }
}

/* ========================= */
/* SETTINGS */
/* ========================= */

function loadSettingsIntoUI() {
    const s = state.settings;

    setValue("profitPercent", s.profitPercent);
    setValue("manualRate", s.manualRate);
    setValue("packagingCost", s.packagingCost);
    setValue("electricityCostPerHour", s.electricityCostPerHour);
    setValue("failurePercent", s.failurePercent);
    setValue("shippingCost", s.shippingCost);
    setValue("taxPercent", s.taxPercent);
    setValue("minimumOrderPrice", s.minimumOrderPrice);
    setValue("roundingStep", s.roundingStep);

    setValue("setProfitPercent", s.profitPercent);
    setValue("setManualRate", s.manualRate);
    setValue("setPackagingCost", s.packagingCost);
    setValue("setElectricityCostPerHour", s.electricityCostPerHour);
    setValue("setFailurePercent", s.failurePercent);
    setValue("setShippingCost", s.shippingCost);
    setValue("setTaxPercent", s.taxPercent);
    setValue("setMinimumOrderPrice", s.minimumOrderPrice);
    setValue("setRoundingStep", s.roundingStep);
}

function saveGeneralFromCalculator() {
    state.settings.profitPercent = num(getValue("profitPercent"));
    state.settings.manualRate = num(getValue("manualRate"));
    state.settings.packagingCost = num(getValue("packagingCost"));
    state.settings.electricityCostPerHour = num(getValue("electricityCostPerHour"));
    state.settings.failurePercent = num(getValue("failurePercent"));
    state.settings.shippingCost = num(getValue("shippingCost"));
    state.settings.taxPercent = num(getValue("taxPercent"));
    state.settings.minimumOrderPrice = num(getValue("minimumOrderPrice"));
    state.settings.roundingStep = num(getValue("roundingStep")) || 1;

    saveState();
    loadSettingsIntoUI();
    calculate();
    toast("تم حفظ القيم الحالية كأساسي");
}

function saveGeneralSettings() {
    state.settings.profitPercent = num(getValue("setProfitPercent"));
    state.settings.manualRate = num(getValue("setManualRate"));
    state.settings.packagingCost = num(getValue("setPackagingCost"));
    state.settings.electricityCostPerHour = num(getValue("setElectricityCostPerHour"));
    state.settings.failurePercent = num(getValue("setFailurePercent"));
    state.settings.shippingCost = num(getValue("setShippingCost"));
    state.settings.taxPercent = num(getValue("setTaxPercent"));
    state.settings.minimumOrderPrice = num(getValue("setMinimumOrderPrice"));
    state.settings.roundingStep = num(getValue("setRoundingStep")) || 1;

    saveState();
    loadSettingsIntoUI();
    calculate();
    toast("تم حفظ إعدادات التسعير");
}

/* ========================= */
/* PRINTERS */
/* ========================= */

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

    list.innerHTML = state.printers.map((p) => `
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
    `).join("");
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

/* ========================= */
/* MATERIALS */
/* ========================= */

function materialLabel(m) {
    return [m.name, m.color, m.brand].filter(Boolean).join(" - ");
}

function renderMaterials() {
    const list = document.getElementById("materialsList");

    if (list) {
        if (!state.materials.length) {
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
    calculate();
    toast("تم حذف الخامة");
}

/* ========================= */
/* ORDER MATERIAL ROWS */
/* ========================= */

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

/* ========================= */
/* EXTRAS */
/* ========================= */

function renderExtras() {
    renderExtrasSettings();
    renderQuickExtras();
}

function renderExtrasSettings() {
    const list = document.getElementById("extrasSettingsList");
    if (!list) return;

    if (!state.extras.length) {
        list.innerHTML = `<div class="empty-note">لا توجد بنود ثابتة.</div>`;
        return;
    }

    list.innerHTML = state.extras.map((x) => `
        <div class="item-card">
            <div class="item-head">
                <div>
                    <div class="item-title">${escapeHtml(x.name)}</div>
                    <div class="item-sub">تكلفة ثابتة قابلة للاختيار وقت التسعير</div>
                </div>
                <div class="item-price">${money(x.cost)} ج</div>
            </div>

            <div class="item-actions">
                <button class="secondary" onclick="editExtra('${x.id}')">تعديل</button>
                <button class="danger" onclick="deleteExtra('${x.id}')">حذف</button>
            </div>
        </div>
    `).join("");
}

function renderQuickExtras() {
    const list = document.getElementById("quickExtrasList");
    if (!list) return;

    if (!state.extras.length) {
        list.innerHTML = `<div class="empty-note">لا توجد بنود ثابتة. أضفها من الإعدادات.</div>`;
        return;
    }

    list.innerHTML = state.extras.map((x) => `
        <label class="extra-check">
            <input type="checkbox" class="quick-extra-check" value="${escapeHtml(x.id)}" onchange="calculate()">
            <span>
                <strong>${escapeHtml(x.name)}</strong>
                <small>${money(x.cost)} جنيه</small>
            </span>
        </label>
    `).join("");
}

function saveExtra() {
    const name = getValue("extraName").trim();
    const cost = num(getValue("extraCost"));

    if (!name) {
        toast("اكتب اسم البند");
        return;
    }

    if (cost <= 0) {
        toast("اكتب تكلفة البند");
        return;
    }

    if (editingExtraId) {
        const x = state.extras.find((item) => item.id === editingExtraId);

        if (x) {
            x.name = name;
            x.cost = cost;
        }

        cancelExtraEdit(false);
        toast("تم تعديل البند");
    } else {
        state.extras.push({
            id: makeId(),
            name,
            cost
        });

        clearExtraForm();
        toast("تمت إضافة البند");
    }

    saveState();
    renderExtras();
    calculate();
}

function editExtra(id) {
    const x = state.extras.find((item) => item.id === id);
    if (!x) return;

    editingExtraId = id;

    setValue("extraName", x.name);
    setValue("extraCost", x.cost);

    const saveBtn = document.getElementById("extraSaveBtn");
    const cancelBtn = document.getElementById("extraCancelBtn");

    if (saveBtn) saveBtn.textContent = "حفظ تعديل البند";
    if (cancelBtn) cancelBtn.style.display = "inline-block";

    showPage("settings");
}

function cancelExtraEdit(showToast = true) {
    editingExtraId = null;
    clearExtraForm();

    const saveBtn = document.getElementById("extraSaveBtn");
    const cancelBtn = document.getElementById("extraCancelBtn");

    if (saveBtn) saveBtn.textContent = "إضافة بند";
    if (cancelBtn) cancelBtn.style.display = "none";

    if (showToast) toast("تم إلغاء تعديل البند");
}

function clearExtraForm() {
    setValue("extraName", "");
    setValue("extraCost", "");
}

function deleteExtra(id) {
    if (!confirm("حذف البند الثابت؟")) return;

    state.extras = state.extras.filter((x) => x.id !== id);

    saveState();
    renderExtras();
    calculate();
    toast("تم حذف البند");
}

function getSelectedExtras() {
    const checks = Array.from(document.querySelectorAll(".quick-extra-check:checked"));

    const selected = checks.map((check) => {
        const extra = state.extras.find((x) => x.id === check.value);
        if (!extra) return null;

        return {
            id: extra.id,
            name: extra.name,
            cost: num(extra.cost)
        };
    }).filter(Boolean);

    const manualName = getValue("manualExtraName").trim();
    const manualCost = num(getValue("manualExtraCost"));

    if (manualName && manualCost > 0) {
        selected.push({
            id: "manual",
            name: manualName,
            cost: manualCost
        });
    }

    return selected;
}

/* ========================= */
/* CALCULATION */
/* ========================= */

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

    const electricityCostPerHour = num(getValue("electricityCostPerHour"));
    const failurePercent = num(getValue("failurePercent"));
    const shippingCost = num(getValue("shippingCost"));
    const taxPercent = num(getValue("taxPercent"));
    const minimumOrderPrice = num(getValue("minimumOrderPrice"));
    const roundingStep = num(getValue("roundingStep")) || 1;

    const orderMaterials = getOrderMaterials();
    const selectedExtras = getSelectedExtras();

    const materialWeight = orderMaterials.reduce((sum, item) => sum + num(item.weight), 0);
    const materialCost = orderMaterials.reduce((sum, item) => sum + num(item.cost), 0);

    const weightedGramPrice = materialWeight > 0 ? materialCost / materialWeight : 0;
    const wasteCost = wasteWeight * weightedGramPrice;

    const machineCost = printHours * machineRate;
    const electricityCost = printHours * electricityCostPerHour;
    const manualCost = (manualMinutes / 60) * manualRate;
    const extrasCost = selectedExtras.reduce((sum, item) => sum + num(item.cost), 0);

    // نفس منطق الديسكتوب + إضافات الموبايل
    const baseCost =
        materialCost +
        wasteCost +
        machineCost +
        electricityCost +
        manualCost +
        packagingCost +
        shippingCost +
        extrasCost;

    const riskCost = baseCost * (failurePercent / 100);
    const costBeforeTax = baseCost + riskCost;
    const taxCost = costBeforeTax * (taxPercent / 100);
    const totalCost = costBeforeTax + taxCost;

    let finalPrice = totalCost * (1 + profitPercent / 100);
    finalPrice = finalPrice - discount;

    if (minimumOrderPrice > 0) {
        finalPrice = Math.max(finalPrice, minimumOrderPrice);
    }

    finalPrice = applyRounding(finalPrice, roundingStep);
    finalPrice = Math.max(0, finalPrice);

    const netProfit = finalPrice - totalCost;

    lastCalc = {
        clientName: getValue("clientName").trim(),
        modelName: getValue("modelName").trim(),
        status: getValue("orderStatus") || "عرض سعر",
        notes: getValue("orderNotes").trim(),

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
        electricityCostPerHour,
        electricityCost,

        shippingCost,
        failurePercent,
        riskCost,

        taxPercent,
        taxCost,

        profitPercent,
        discount,

        extrasCost,
        selectedExtras,

        totalCost,
        finalPrice,
        netProfit,

        orderMaterials
    };

    setText("totalCost", money(totalCost));
    setText("finalPrice", money(finalPrice));
    setText("netProfit", money(netProfit));

    renderPriceBreakdown(lastCalc);
    updateMaintenanceUI();

    return lastCalc;
}

function applyRounding(value, step) {
    if (!step || step <= 1) return Math.ceil(value);
    return Math.ceil(value / step) * step;
}

function renderPriceBreakdown(calc) {
    const box = document.getElementById("priceBreakdown");
    if (!box) return;

    box.innerHTML = `
        <div><span>الخامات</span><strong>${money(calc.materialCost)} ج</strong></div>
        <div><span>الهالك</span><strong>${money(calc.wasteCost)} ج</strong></div>
        <div><span>الماكينة</span><strong>${money(calc.machineCost)} ج</strong></div>
        <div><span>الكهرباء</span><strong>${money(calc.electricityCost)} ج</strong></div>
        <div><span>الشغل اليدوي</span><strong>${money(calc.manualCost)} ج</strong></div>
        <div><span>التغليف</span><strong>${money(calc.packagingCost)} ج</strong></div>
        <div><span>الشحن</span><strong>${money(calc.shippingCost)} ج</strong></div>
        <div><span>بنود إضافية</span><strong>${money(calc.extrasCost)} ج</strong></div>
        <div><span>مخاطرة / فشل</span><strong>${money(calc.riskCost)} ج</strong></div>
        <div><span>ضريبة</span><strong>${money(calc.taxCost)} ج</strong></div>
        <div><span>الخصم</span><strong>${money(calc.discount)} ج</strong></div>
    `;
}

/* ========================= */
/* ORDERS / SALES */
/* ========================= */

function confirmSale() {
    const calc = calculate();

    if (!calc.modelName) {
        toast("اكتب اسم المجسم أو الطلب الأول");
        return;
    }

    if (calc.finalPrice <= 0) {
        toast("السعر النهائي صفر، راجع بيانات التسعير");
        return;
    }

    const sale = {
        id: makeId(),
        date: new Date().toISOString(),
        ...calc
    };

    state.sales.unshift(sale);

    const printer = selectedPrinter();
    if (printer && calc.status !== "عرض سعر" && calc.status !== "ملغي") {
        printer.currentHours = num(printer.currentHours) + num(calc.printHours);
    }

    saveState();
    loadSales();
    renderPrinters();
    renderMachineSelect();

    toast("تم حفظ الطلب");
    clearOrderAfterSale();
}

function clearOrderAfterSale() {
    setValue("clientName", "");
    setValue("modelName", "");
    setValue("orderNotes", "");
    setValue("printHours", "");
    setValue("wasteWeight", "");
    setValue("manualMinutes", "");
    setValue("discount", "");
    setValue("manualExtraName", "");
    setValue("manualExtraCost", "");

    document.querySelectorAll(".quick-extra-check").forEach((check) => {
        check.checked = false;
    });

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
    renderReports();
}

function getFilteredSales() {
    const search = getValue("ordersSearch").trim().toLowerCase();
    const status = getValue("ordersStatusFilter");

    return state.sales.filter((sale) => {
        const text = [
            sale.clientName,
            sale.modelName,
            sale.printerName,
            sale.status,
            sale.notes
        ].join(" ").toLowerCase();

        const matchSearch = !search || text.includes(search);
        const matchStatus = !status || sale.status === status;

        return matchSearch && matchStatus;
    });
}

function renderSales() {
    const list = document.getElementById("salesList");
    if (!list) return;

    const sales = getFilteredSales();

    if (!sales.length) {
        list.innerHTML = `<div class="empty-note">لا توجد طلبات مسجلة.</div>`;
        return;
    }

    list.innerHTML = sales.map((sale) => {
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
                            الوقت: ${formatNumber(sale.printHours)} س<br>
                            الحالة: ${escapeHtml(sale.status || "عرض سعر")}
                        </div>
                    </div>

                    <div class="item-price">${money(sale.finalPrice)} ج</div>
                </div>

                <div class="item-sub">
                    التكلفة: ${money(sale.totalCost)} ج —
                    الربح: ${money(sale.netProfit)} ج
                    ${sale.notes ? `<br>ملاحظات: ${escapeHtml(sale.notes)}` : ""}
                </div>

                <div class="item-actions">
                    <button class="secondary" onclick="changeSaleStatus('${sale.id}')">تغيير الحالة</button>
                    <button class="secondary" onclick="copyInvoice('${sale.id}')">نسخ الفاتورة</button>
                    <button class="secondary" onclick="printInvoice('${sale.id}')">طباعة</button>
                    <button class="danger" onclick="deleteSale('${sale.id}')">حذف</button>
                </div>
            </div>
        `;
    }).join("");
}

function changeSaleStatus(id) {
    const sale = state.sales.find((s) => s.id === id);
    if (!sale) return;

    const statuses = ["عرض سعر", "مؤكد", "قيد الطباعة", "جاهز", "تم التسليم", "ملغي"];
    const currentIndex = statuses.indexOf(sale.status);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % statuses.length : 0;

    sale.status = statuses[nextIndex];

    saveState();
    loadSales();
    toast(`تم تغيير الحالة إلى: ${sale.status}`);
}

function deleteSale(id) {
    if (!confirm("حذف الطلب من السجل؟")) return;

    state.sales = state.sales.filter((s) => s.id !== id);

    saveState();
    loadSales();
    toast("تم حذف الطلب");
}

function clearSales() {
    if (!state.sales.length) {
        toast("السجل فارغ بالفعل");
        return;
    }

    if (!confirm("مسح كل الطلبات؟")) return;

    state.sales = [];

    saveState();
    loadSales();
    toast("تم مسح السجل");
}

/* ========================= */
/* STATS / REPORTS */
/* ========================= */

function renderStats() {
    const count = state.sales.length;
    const activeSales = state.sales.filter((s) => s.status !== "ملغي");

    const salesTotal = activeSales.reduce((sum, s) => sum + num(s.finalPrice), 0);
    const profitTotal = activeSales.reduce((sum, s) => sum + num(s.netProfit), 0);
    const hoursTotal = activeSales.reduce((sum, s) => sum + num(s.printHours), 0);
    const weightTotalGram = activeSales.reduce((sum, s) => sum + num(s.materialWeight) + num(s.wasteWeight), 0);

    const avgProfit = activeSales.length ? profitTotal / activeSales.length : 0;
    const profitPerHour = hoursTotal > 0 ? profitTotal / hoursTotal : 0;

    setText("statOrdersCount", count.toLocaleString("ar-EG"));
    setText("statSales", `${money(salesTotal)} جنيه`);
    setText("statProfit", `${money(profitTotal)} جنيه`);
    setText("statHours", `${oneDecimal(hoursTotal)} س`);
    setText("statWeight", `${formatNumber(weightTotalGram / 1000)} كجم`);
    setText("statAvgProfit", `${money(avgProfit)} جنيه`);
    setText("statProfitPerHour", `${money(profitPerHour)} جنيه`);

    const topStatus = getTopStatus();
    setText("statTopStatus", topStatus);
}

function getTopStatus() {
    if (!state.sales.length) return "-";

    const counts = {};

    state.sales.forEach((s) => {
        const status = s.status || "عرض سعر";
        counts[status] = (counts[status] || 0) + 1;
    });

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
}

function renderReports() {
    renderReportsSummary();
    renderMaterialsReport();
}

function renderReportsSummary() {
    const box = document.getElementById("reportsSummary");
    if (!box) return;

    if (!state.sales.length) {
        box.innerHTML = `<div class="empty-note">لا توجد بيانات كافية للتقارير.</div>`;
        return;
    }

    const activeSales = state.sales.filter((s) => s.status !== "ملغي");

    const totalOrders = state.sales.length;
    const delivered = state.sales.filter((s) => s.status === "تم التسليم").length;
    const pending = state.sales.filter((s) => ["مؤكد", "قيد الطباعة", "جاهز"].includes(s.status)).length;
    const quotes = state.sales.filter((s) => s.status === "عرض سعر").length;

    const totalCost = activeSales.reduce((sum, s) => sum + num(s.totalCost), 0);
    const totalRevenue = activeSales.reduce((sum, s) => sum + num(s.finalPrice), 0);
    const totalProfit = activeSales.reduce((sum, s) => sum + num(s.netProfit), 0);

    box.innerHTML = `
        <div class="report-row">
            <span>إجمالي الطلبات</span>
            <strong>${totalOrders.toLocaleString("ar-EG")}</strong>
        </div>
        <div class="report-row">
            <span>تم التسليم</span>
            <strong>${delivered.toLocaleString("ar-EG")}</strong>
        </div>
        <div class="report-row">
            <span>طلبات تحت التنفيذ</span>
            <strong>${pending.toLocaleString("ar-EG")}</strong>
        </div>
        <div class="report-row">
            <span>عروض سعر</span>
            <strong>${quotes.toLocaleString("ar-EG")}</strong>
        </div>
        <div class="report-row">
            <span>إجمالي التكلفة</span>
            <strong>${money(totalCost)} جنيه</strong>
        </div>
        <div class="report-row">
            <span>إجمالي البيع</span>
            <strong>${money(totalRevenue)} جنيه</strong>
        </div>
        <div class="report-row">
            <span>إجمالي الربح</span>
            <strong>${money(totalProfit)} جنيه</strong>
        </div>
    `;
}

function renderMaterialsReport() {
    const box = document.getElementById("materialsReport");
    if (!box) return;

    const usage = {};

    state.sales.forEach((sale) => {
        if (sale.status === "ملغي") return;

        (sale.orderMaterials || []).forEach((m) => {
            const key = m.materialName || "خامة";

            if (!usage[key]) {
                usage[key] = {
                    weight: 0,
                    cost: 0
                };
            }

            usage[key].weight += num(m.weight);
            usage[key].cost += num(m.cost);
        });
    });

    const rows = Object.entries(usage).sort((a, b) => b[1].weight - a[1].weight);

    if (!rows.length) {
        box.innerHTML = `<div class="empty-note">لا توجد بيانات خامات.</div>`;
        return;
    }

    box.innerHTML = rows.map(([name, data]) => `
        <div class="report-row">
            <span>${escapeHtml(name)}</span>
            <strong>${formatNumber(data.weight)} جم / ${money(data.cost)} جنيه</strong>
        </div>
    `).join("");
}

/* ========================= */
/* INVOICE / COPY / PRINT */
/* ========================= */

function getSaleForAction(id) {
    if (id) return state.sales.find((s) => s.id === id) || null;
    return calculate();
}

function buildInvoice(sale) {
    const materialsText = (sale.orderMaterials || [])
        .map((m) => `- ${m.materialName}: ${formatNumber(m.weight)} جم = ${money(m.cost)} جنيه`)
        .join("\n");

    const extrasText = (sale.selectedExtras || [])
        .map((x) => `- ${x.name}: ${money(x.cost)} جنيه`)
        .join("\n");

    return [
        "Bambu Business Manager",
        "-------------------------",
        `العميل: ${sale.clientName || "-"}`,
        `المجسم / الطلب: ${sale.modelName || "-"}`,
        `الحالة: ${sale.status || "-"}`,
        `الماكينة: ${sale.printerName || "-"}`,
        sale.notes ? `ملاحظات: ${sale.notes}` : "",
        "",
        "الخامات:",
        materialsText || "-",
        "",
        "بنود إضافية:",
        extrasText || "-",
        "",
        `وقت الطباعة: ${formatNumber(sale.printHours)} ساعة`,
        `وزن الهالك: ${formatNumber(sale.wasteWeight)} جم`,
        `الشغل اليدوي: ${formatNumber(sale.manualMinutes)} دقيقة`,
        "",
        `تكلفة الخامات: ${money(sale.materialCost)} جنيه`,
        `تكلفة الهالك: ${money(sale.wasteCost)} جنيه`,
        `تكلفة الماكينة: ${money(sale.machineCost)} جنيه`,
        `تكلفة الكهرباء: ${money(sale.electricityCost)} جنيه`,
        `تكلفة الشغل اليدوي: ${money(sale.manualCost)} جنيه`,
        `تكلفة التغليف: ${money(sale.packagingCost)} جنيه`,
        `تكلفة الشحن: ${money(sale.shippingCost)} جنيه`,
        `بنود إضافية: ${money(sale.extrasCost)} جنيه`,
        `مخاطرة / فشل: ${money(sale.riskCost)} جنيه`,
        `ضريبة: ${money(sale.taxCost)} جنيه`,
        `التكلفة عليك: ${money(sale.totalCost)} جنيه`,
        `الخصم: ${money(sale.discount)} جنيه`,
        "-------------------------",
        `السعر النهائي: ${money(sale.finalPrice)} جنيه`,
        `صافي الربح: ${money(sale.netProfit)} جنيه`
    ].filter(Boolean).join("\n");
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

/* ========================= */
/* CSV EXPORT */
/* ========================= */

function exportCSV() {
    if (!state.sales.length) {
        toast("لا توجد بيانات للتصدير");
        return;
    }

    const headers = [
        "date",
        "client",
        "model",
        "status",
        "printer",
        "print_hours",
        "material_weight_g",
        "waste_weight_g",
        "material_cost",
        "machine_cost",
        "electricity_cost",
        "manual_cost",
        "packaging_cost",
        "shipping_cost",
        "extras_cost",
        "risk_cost",
        "tax_cost",
        "discount",
        "total_cost",
        "final_price",
        "net_profit",
        "notes"
    ];

    const rows = state.sales.map((s) => [
        s.date,
        s.clientName,
        s.modelName,
        s.status,
        s.printerName,
        s.printHours,
        s.materialWeight,
        s.wasteWeight,
        round2(s.materialCost),
        round2(s.machineCost),
        round2(s.electricityCost),
        round2(s.manualCost),
        round2(s.packagingCost),
        round2(s.shippingCost),
        round2(s.extrasCost),
        round2(s.riskCost),
        round2(s.taxCost),
        round2(s.discount),
        round2(s.totalCost),
        round2(s.finalPrice),
        round2(s.netProfit),
        s.notes
    ]);

    const csv = [headers, ...rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "bambu-orders.csv";
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

function round2(value) {
    return Math.round(num(value) * 100) / 100;
}
