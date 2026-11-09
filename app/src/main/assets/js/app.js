"use strict";

const STORAGE_KEY = "bambu_manager_v3";
const DRAFT_KEY = "bambu_manager_current_draft_v1";

const defaultState = {
    settings: {
        profitPercent: 100,
        manualRate: 50,
        manualMinutes: 15,
        wasteWeight: 0,
        discount: 0,
        packagingCost: 10,
        electricityPricePerKwh: 3,
        printerPowerKw: 0.25,
        assetsHourlyDepreciation: 12,
        maintenanceCost: 1500,
        maintenanceEveryHours: 1000,
        failurePercent: 10,
        accessoriesCost: 0,
        shippingCost: 0,
        taxPercent: 0,
        minimumOrderPrice: 0,
        roundingStep: 5
    },
    printers: [
        {
            id: makeId(),
            name: "BAMBU LAB A1",
            rate: 6.5,
            legacyCombinedRate: false,
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
            kgPrice: 800
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

    attachSafeButtonHandlers();

    loadSettingsIntoUI();
    renderPrinters();
    renderMaterials();
    renderMachineSelect();

    if (!document.querySelector(".order-material-row")) {
        addOrderMaterialRow();
    }

    restoreCurrentDraft();
    attachDraftAutoSave();

    calculate();
    saveCurrentDraft();
    loadSales();
}

function attachSafeButtonHandlers() {
    const printerSaveBtn = document.getElementById("printerSaveBtn");
    if (printerSaveBtn) printerSaveBtn.onclick = savePrinter;

    const materialSaveBtn = document.getElementById("materialSaveBtn");
    if (materialSaveBtn) materialSaveBtn.onclick = saveMaterial;
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
        const raw = localStorage.getItem(STORAGE_KEY)
            || localStorage.getItem("bambu_manager_v2")
            || localStorage.getItem("bambu_manager_v1");
        if (!raw) return structuredCloneSafe(defaultState);

        const saved = JSON.parse(raw);
        const settings = saved?.settings;
        if (settings?.electricityPricePerKwh == null && settings?.electricityCostPerHour != null) {
            const power = defaultState.settings.printerPowerKw;
            settings.electricityPricePerKwh = num(settings.electricityCostPerHour) / power;
        }
        const migrated = mergeDeep(structuredCloneSafe(defaultState), saved);
        delete migrated.extras;
        return migrated;
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

    state.settings.roundingStep = pricingNumber(state.settings.roundingStep, defaultState.settings.roundingStep);

    if (!Array.isArray(state.printers)) state.printers = [];
    if (!Array.isArray(state.materials)) state.materials = [];
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
        legacyCombinedRate: p.legacyCombinedRate !== false,
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

    state.sales = state.sales.map((s) => ({
        id: s.id || makeId(),
        date: s.date || new Date().toISOString(),
        status: normalizeStatus(s.status || "عرض سعر"),
        notes: s.notes || "",
        hoursApplied: !!s.hoursApplied,
        ...s,
        status: normalizeStatus(s.status || "عرض سعر")
    }));
}

function normalizeStatus(status) {
    if (status === "تم البيع") return "تم التسليم";
    return status || "عرض سعر";
}

function normalizeNumericText(value) {
    return String(value ?? "")
        .trim()
        .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
        .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
        .replace(/[٫,]/g, ".")
        .replace(/٬/g, "");
}

function num(value) {
    const n = parseFloat(normalizeNumericText(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

function pricingNumber(value, fallback = 0) {
    const text = normalizeNumericText(value);
    return text === "" ? fallback : MOO3DPricing.toNonNegativeNumber(text, fallback);
}

function money(value) {
    return Number(Number(value || 0).toFixed(2)).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatNumber(value) {
    const rounded = Math.round(num(value) * 100) / 100;
    return rounded.toLocaleString("en-US");
}

function oneDecimal(value) {
    return (Math.round(num(value) * 10) / 10).toLocaleString("en-US");
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
/* CURRENT DRAFT AUTO SAVE */
/* ========================= */

function collectCurrentDraft() {
    const materialRows = Array.from(document.querySelectorAll(".order-material-row")).map((row) => ({
        materialId: row.querySelector(".order-material-select")?.value || "",
        weight: row.querySelector(".order-material-weight")?.value || ""
    }));

    return {
        clientName: getValue("clientName"),
        modelName: getValue("modelName"),
        orderStatus: getValue("orderStatus"),
        orderNotes: getValue("orderNotes"),
        pieceQuantity: getValue("pieceQuantity"),
        printHours: getValue("printHours"),
        printMinutes: getValue("printMinutes"),
        machineRate: getValue("machineRate"),
        wasteWeight: getValue("wasteWeight"),
        manualMinutes: getValue("manualMinutes"),
        profitPercent: getValue("profitPercent"),
        discount: getValue("discount"),
        manualRate: getValue("manualRate"),
        packagingCost: getValue("packagingCost"),
        accessoriesCost: getValue("accessoriesCost"),
        electricityPricePerKwh: getValue("electricityPricePerKwh"),
        printerPowerKw: getValue("printerPowerKw"),
        failurePercent: getValue("failurePercent"),
        shippingCost: getValue("shippingCost"),
        taxPercent: getValue("taxPercent"),
        minimumOrderPrice: getValue("minimumOrderPrice"),
        roundingStep: getValue("roundingStep"),
        machineSelect: getValue("machineSelect"),
        materialRows
    };
}

function saveCurrentDraft() {
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(collectCurrentDraft()));
    } catch (e) {
        console.log("Draft save failed", e);
    }
}

function restoreCurrentDraft() {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;

        const draft = JSON.parse(raw);

        setValue("clientName", draft.clientName || "");
        setValue("modelName", draft.modelName || "");
        setValue("orderStatus", draft.orderStatus || "عرض سعر");
        setValue("orderNotes", draft.orderNotes || "");
        setValue("pieceQuantity", draft.pieceQuantity || "1");
        setValue("printHours", draft.printHours ?? "");
        setValue("printMinutes", draft.printMinutes ?? "");
        setValue("wasteWeight", draft.wasteWeight ?? "");
        setValue("manualMinutes", draft.manualMinutes ?? "");
        setValue("discount", draft.discount ?? "");

        const settings = state.settings;
        const legacyPower = defaultState.settings.printerPowerKw;
        const hasLegacyElectricity = draft.electricityCostPerHour != null && draft.electricityCostPerHour !== "";
        const electricityPrice = hasLegacyElectricity
            ? num(draft.electricityCostPerHour) / legacyPower
            : settings.electricityPricePerKwh;
        setValue("electricityPricePerKwh", draft.electricityPricePerKwh ?? electricityPrice);
        setValue("printerPowerKw", draft.printerPowerKw ?? (hasLegacyElectricity ? legacyPower : settings.printerPowerKw));
        for (const key of ["profitPercent", "manualRate", "packagingCost", "accessoriesCost", "failurePercent",
        "shippingCost", "taxPercent", "minimumOrderPrice", "roundingStep"]) {
            setValue(key, draft[key] ?? settings[key]);
        }

        const machineSelect = document.getElementById("machineSelect");
        if (machineSelect && state.printers.some((p) => p.id === draft.machineSelect)) {
            machineSelect.value = draft.machineSelect;
            setValue("machineRate", draft.machineRate ?? selectedPrinter().rate);
        }

        const container = document.getElementById("orderMaterials");
        if (container && Array.isArray(draft.materialRows) && draft.materialRows.length > 0) {
            container.innerHTML = "";
            draft.materialRows.forEach((row) => {
                addOrderMaterialRow(row.materialId || "", row.weight || "");
            });
        }

    } catch (e) {
        console.log("Draft restore failed", e);
    }
}

function clearCurrentDraft() {
    try {
        localStorage.removeItem(DRAFT_KEY);
    } catch (e) {
        console.log("Draft clear failed", e);
    }
}

function attachDraftAutoSave() {
    document.addEventListener("input", saveCurrentDraft);
    document.addEventListener("change", saveCurrentDraft);
    window.addEventListener("beforeunload", saveCurrentDraft);
}

/* ========================= */
/* NAVIGATION */
/* ========================= */

function showPage(page) {
    saveCurrentDraft();

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

const calculatorSettingKeys = [
    "profitPercent", "manualRate", "manualMinutes", "wasteWeight", "discount",
    "packagingCost", "accessoriesCost", "electricityPricePerKwh", "printerPowerKw",
    "failurePercent", "shippingCost", "taxPercent", "minimumOrderPrice", "roundingStep"
];
const settingsOnlyKeys = ["assetsHourlyDepreciation", "maintenanceCost", "maintenanceEveryHours"];

function settingsInputId(key) {
    return "set" + key[0].toUpperCase() + key.slice(1);
}

function loadSettingsIntoUI() {
    for (const key of calculatorSettingKeys) {
        setValue(key, state.settings[key]);
    }
    for (const key of [...calculatorSettingKeys, ...settingsOnlyKeys]) {
        setValue(settingsInputId(key), state.settings[key]);
    }
}

function saveGeneralFromCalculator() {
    for (const key of calculatorSettingKeys) {
        state.settings[key] = pricingNumber(getValue(key), key === "manualMinutes" ? 0 : state.settings[key]);
    }
    saveState();
    loadSettingsIntoUI();
    calculate();
    saveCurrentDraft();
    toast("تم حفظ القيم الحالية كأساسي");
}

function saveGeneralSettings() {
    for (const key of [...calculatorSettingKeys, ...settingsOnlyKeys]) {
        state.settings[key] = pricingNumber(getValue(settingsInputId(key)), defaultState.settings[key]);
    }
    saveState();
    loadSettingsIntoUI();
    calculate();
    saveCurrentDraft();
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
    calculate();
}

function updateMaintenanceUI() {
    const printer = selectedPrinter();
    if (!printer) return;

    const printHours = getPrintHours();
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
                        ${p.legacyCombinedRate ? "سعر الساعة الشامل" : "تشغيل فقط"}: ${money(getMachineRate(p, p.rate))} جنيه/ساعة<br>
                        الصيانة: ${oneDecimal(p.currentHours)} / ${oneDecimal(p.maintenanceLimit)} ساعة
                    </div>
                </div>
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
    const rate = pricingNumber(getValue("printerRate"));
    const legacyCombinedRate = getValue("printerRateMode") === "combined";
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
            p.legacyCombinedRate = legacyCombinedRate;
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
            legacyCombinedRate,
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
    setValue("printerRateMode", p.legacyCombinedRate ? "combined" : "operating");
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
    setValue("printerRateMode", "operating");
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
            <select class="order-material-select" onchange="calculate(); saveCurrentDraft();"></select>
        </div>

        <div class="field">
            <label>الوزن بالجرام</label>
            <input class="order-material-weight" type="text" inputmode="decimal" placeholder="مثال: 120" value="${escapeAttr(weight)}" oninput="calculate(); saveCurrentDraft();">
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
    saveCurrentDraft();
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
    const weights = new Map();

    for (const row of document.querySelectorAll(".order-material-row")) {
        const materialId = row.querySelector(".order-material-select")?.value;
        const weight = pricingNumber(row.querySelector(".order-material-weight")?.value);
        if (materialId && weight > 0) {
            weights.set(materialId, (weights.get(materialId) ?? 0) + weight);
        }
    }

    const materials = [];
    for (const [materialId, weight] of weights) {
        const material = state.materials.find((m) => m.id === materialId);
        if (!material) continue;
        const gramPrice = material.kgPrice / 1000;
        materials.push({
            materialId,
            materialName: materialLabel(material),
            weight: Number(weight.toFixed(2)),
            gramPrice: Number(gramPrice.toFixed(6)),
            cost: Number((weight * gramPrice).toFixed(2))
        });
    }
    return materials;
}

/* ========================= */
/* CALCULATION */
/* ========================= */

function getPrintHours() {
    const hours = pricingNumber(getValue("printHours"));
    const minutes = pricingNumber(getValue("printMinutes"));
    return Number((hours + minutes / 60).toFixed(4));
}

function getMachineRate(printer, rate) {
    const name = String(printer?.name || "").toLowerCase();
    const isDefaultBambu = name.includes("bambu lab a1") || name.includes("bambu a1");
    if (!printer?.legacyCombinedRate && isDefaultBambu) {
        const legacyRate = [0, 12, 20, 33.5].some((value) => Math.abs(rate - value) < 0.0001);
        if (legacyRate) return 6.5;
    }
    return rate;
}

function calculate() {
    const printer = selectedPrinter();
    const legacyCombinedRate = printer?.legacyCombinedRate === true;
    const settings = state.settings;
    const settingValue = (key) => pricingNumber(getValue(key), settings[key]);

    const quantity = MOO3DPricing.toPositiveInteger(normalizeNumericText(getValue("pieceQuantity")), 1);
    const printHours = getPrintHours();
    const machineRate = getMachineRate(printer, pricingNumber(getValue("machineRate"), printer?.rate ?? 0));
    const wasteWeight = settingValue("wasteWeight");
    const manualMinutes = pricingNumber(getValue("manualMinutes"));

    const profitPercent = settingValue("profitPercent");
    const manualRate = settingValue("manualRate");
    const electricityPricePerKwh = settingValue("electricityPricePerKwh");
    const printerPowerKw = settingValue("printerPowerKw");
    const failurePercent = settingValue("failurePercent");
    const taxPercent = settingValue("taxPercent");

    const orderMaterials = getOrderMaterials();

    // نفس الديسك توب: أوزان الخامات المدخلة هي إجمالي استهلاك الأوردر كله، وليست للقطعة الواحدة.
    const materialWeight = orderMaterials.reduce((sum, item) => sum + item.weight, 0);
    const materialCost = orderMaterials.reduce((sum, item) => sum + item.cost, 0);

    const weightedGramPrice = materialWeight > 0 ? materialCost / materialWeight : 0;
    const wasteCost = wasteWeight * weightedGramPrice;

    const defaultSettings = defaultState.settings;
    const maintenanceCost = settings.maintenanceCost || defaultSettings.maintenanceCost;
    const maintenanceEveryHours = settings.maintenanceEveryHours || defaultSettings.maintenanceEveryHours;
    const machineRunCost = printHours * machineRate;
    const assetDepreciationCost = legacyCombinedRate ? 0 : printHours * settings.assetsHourlyDepreciation;
    const maintenanceShareCost = legacyCombinedRate ? 0 : printHours * (maintenanceCost / maintenanceEveryHours);
    const depreciationCost = machineRunCost + assetDepreciationCost + maintenanceShareCost;
    const electricityCost = printHours * electricityPricePerKwh * printerPowerKw;
    const laborCost = (manualMinutes / 60) * manualRate;

    const pricing = calculateMoo3dPricing({
        quantity,
        materialCost,
        wasteCost,
        depreciationCost,
        electricityCost,
        laborCost,
        packagingCost: settingValue("packagingCost"),
        accessoriesCost: settingValue("accessoriesCost"),
        shippingCost: settingValue("shippingCost"),
        failurePercent,
        taxPercent,
        profitMargin: profitPercent,
        discountValue: settingValue("discount"),
        minimumOrderPrice: settingValue("minimumOrderPrice"),
        roundingStep: settingValue("roundingStep")
    });

    lastCalc = {
        clientName: getValue("clientName").trim(),
        modelName: getValue("modelName").trim(),
        status: getValue("orderStatus") || "عرض سعر",
        notes: getValue("orderNotes").trim(),

        printerId: printer ? printer.id : "",
        printerName: printer ? printer.name : "",

        quantity: pricing.quantity,
        unitFinalPrice: pricing.unitFinalPrice,
        unitTotalCost: pricing.unitTotalCost,
        unitProfit: pricing.unitProfit,

        printHours,
        machineRate,
        legacyCombinedRate,
        machineRunCost,
        assetDepreciationCost,
        maintenanceShareCost,
        machineCost: pricing.depreciationCost,
        depreciationCost: pricing.depreciationCost,

        materialWeight,
        wasteWeight,
        weightedGramPrice,
        materialCost: pricing.materialCost,
        wasteCost: pricing.wasteCost,

        manualMinutes,
        manualRate,
        manualCost: pricing.laborCost,
        laborCost: pricing.laborCost,

        packagingCost: pricing.packagingCost,
        electricityCostPerHour: electricityPricePerKwh * printerPowerKw,
        electricityPricePerKwh,
        printerPowerKw,
        electricityCost: pricing.electricityCost,

        unitAccessoriesCost: pricing.unitAccessoriesCost,
        accessoriesCost: pricing.accessoriesCost,
        shippingCost: pricing.shippingCost,
        directAddOnsCost: pricing.directAddOnsCost,

        failurePercent,
        riskCost: pricing.riskCost,

        taxPercent,
        taxCost: pricing.taxCost,

        profitPercent,
        profitMargin: profitPercent,
        discount: pricing.safeDiscountValue,
        discountValue: pricing.safeDiscountValue,

        productionSubtotal: pricing.productionSubtotal,
        productionCostAfterRisk: pricing.productionCostAfterRisk,
        sellBeforeAddOns: pricing.sellBeforeAddOns,
        priceBeforeDiscount: pricing.priceBeforeDiscount,
        priceAfterDiscount: pricing.priceAfterDiscount,
        minimumOrderPrice: pricing.minimumOrderPrice,
        roundedAdjustment: pricing.roundedAdjustment,
        minimumNoLossPrice: pricing.minimumNoLossPrice,

        totalCost: pricing.totalCost,
        finalPrice: pricing.finalPrice,
        netProfit: pricing.profit,
        profit: pricing.profit,

        orderMaterials
    };

    setText("machineRateLabel", legacyCombinedRate ? "تكلفة الماكينة الشاملة / ساعة" : "تشغيل الطابعة فقط / ساعة");
    setText("machineRateHint", legacyCombinedRate
        ? "سعر شامل من إعدادات الماكينة القديمة. تقدر تغيّره للتسعير المفصّل من إدارة الماكينات."
        : "إهلاك الأصول ونصيب الصيانة بيتحسبوا من إعدادات التسعير.");
    setText("totalCost", money(lastCalc.totalCost));
    setText("finalPrice", money(lastCalc.finalPrice));
    setText("netProfit", money(lastCalc.netProfit));
    setText("unitFinalPrice", money(lastCalc.unitFinalPrice));

    renderPriceBreakdown(lastCalc);
    updateMaintenanceUI();

    return lastCalc;
}

function renderPriceBreakdown(calc) {
    const box = document.getElementById("priceBreakdown");
    if (!box) return;

    const machineBreakdown = calc.legacyCombinedRate
        ? `<div><span>الماكينة بالسعر الشامل</span><strong>${money(calc.depreciationCost)} ج</strong></div>`
        : `<div><span>تشغيل الطابعة فقط</span><strong>${money(calc.machineRunCost)} ج</strong></div>
           <div><span>إهلاك الأصول</span><strong>${money(calc.assetDepreciationCost)} ج</strong></div>
           <div><span>نصيب الصيانة</span><strong>${money(calc.maintenanceShareCost)} ج</strong></div>`;

    box.innerHTML = `
        <div><span>عدد القطع</span><strong>${formatNumber(calc.quantity)} قطعة</strong></div>
        <div><span>سعر القطعة</span><strong>${money(calc.unitFinalPrice)} ج</strong></div>
        <div><span>الخامات</span><strong>${money(calc.materialCost)} ج</strong></div>
        <div><span>الهالك</span><strong>${money(calc.wasteCost)} ج</strong></div>
        ${machineBreakdown}
        <div><span>الكهرباء</span><strong>${money(calc.electricityCost)} ج</strong></div>
        <div><span>الشغل اليدوي</span><strong>${money(calc.laborCost)} ج</strong></div>
        <div><span>التغليف</span><strong>${money(calc.packagingCost)} ج</strong></div>
        <div><span>إكسسوارات</span><strong>${money(calc.accessoriesCost)} ج</strong></div>
        <div><span>الشحن</span><strong>${money(calc.shippingCost)} ج</strong></div>
        <div><span>مخاطرة / فشل</span><strong>${money(calc.riskCost)} ج</strong></div>
        <div><span>ضريبة</span><strong>${money(calc.taxCost)} ج</strong></div>
        <div><span>قبل الخصم</span><strong>${money(calc.priceBeforeDiscount)} ج</strong></div>
        <div><span>الخصم</span><strong>${money(calc.discount)} ج</strong></div>
        <div><span>الحد الأدنى</span><strong>${money(calc.minimumOrderPrice)} ج</strong></div>
        <div><span>فرق التقريب</span><strong>${money(calc.roundedAdjustment)} ج</strong></div>
    `;
}

/* ========================= */
/* ORDERS */
/* ========================= */

function applyPrinterHoursForSale(sale) {
    if (!sale || sale.hoursApplied) return;
    if (sale.status === "ملغي") return;

    const printer = state.printers.find((p) => p.id === sale.printerId);
    if (!printer) return;

    printer.currentHours = num(printer.currentHours) + num(sale.printHours);
    sale.hoursApplied = true;
}

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

    if (calc.finalPrice < calc.minimumNoLossPrice) {
        toast("سعر البيع أقل من التكلفة والمصاريف المباشرة");
        return;
    }

    const sale = {
        id: makeId(),
        date: new Date().toISOString(),
        hoursApplied: false,
        ...calc
    };

    state.sales.unshift(sale);
    applyPrinterHoursForSale(sale);

    saveState();
    loadSales();
    renderPrinters();
    renderMachineSelect();

    toast("تم حفظ الطلب وحساب ساعات الماكينة");
    clearOrderAfterSale();
}

function clearOrderAfterSale() {
    clearCurrentDraft();

    setValue("clientName", "");
    setValue("modelName", "");
    setValue("orderNotes", "");
    setValue("pieceQuantity", "1");
    setValue("printHours", "");
    setValue("printMinutes", "");
    loadSettingsIntoUI();

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
            : date.toLocaleString("en-GB", { hour12: false });

        return `
            <div class="item-card">
                <div class="item-head">
                    <div>
                        <div class="item-title">${escapeHtml(sale.modelName || "طلب بدون اسم")}</div>
                        <div class="item-sub">
                            العميل: ${escapeHtml(sale.clientName || "غير محدد")}<br>
                            الماكينة: ${escapeHtml(sale.printerName || "-")}<br>
                            التاريخ: ${escapeHtml(dateText)}<br>
                            عدد القطع: ${formatNumber(sale.quantity || 1)} / سعر القطعة: ${money(sale.unitFinalPrice || sale.finalPrice)} ج<br>
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

    sale.status = normalizeStatus(sale.status);

    const statuses = ["عرض سعر", "مؤكد", "قيد الطباعة", "جاهز", "تم التسليم", "ملغي"];
    const currentIndex = statuses.indexOf(sale.status);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % statuses.length : 0;

    sale.status = statuses[nextIndex];
    applyPrinterHoursForSale(sale);

    saveState();
    renderPrinters();
    renderMachineSelect();
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
/* REPORTS */
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

    setText("statOrdersCount", count.toLocaleString("en-US"));
    setText("statSales", `${money(salesTotal)} جنيه`);
    setText("statProfit", `${money(profitTotal)} جنيه`);
    setText("statHours", `${oneDecimal(hoursTotal)} س`);
    setText("statWeight", `${formatNumber(weightTotalGram / 1000)} كجم`);
    setText("statAvgProfit", `${money(avgProfit)} جنيه`);
    setText("statProfitPerHour", `${money(profitPerHour)} جنيه`);

    const topStatus = getTopStatus();
    setText("statTopStatus", topStatus);

    const topStatusEl = document.getElementById("statTopStatus");
    if (topStatusEl && topStatus !== "-") {
        topStatusEl.style.cursor = "pointer";
        topStatusEl.onclick = function () {
            openOrdersWithStatus(topStatus);
        };
    }
}

function openOrdersWithStatus(status) {
    setValue("ordersStatusFilter", status);
    showPage("orders");
    loadSales();
}

function getTopStatus() {
    if (!state.sales.length) return "-";

    const counts = {};

    state.sales.forEach((s) => {
        const status = normalizeStatus(s.status || "عرض سعر");
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
    const totalDirectAddOns = activeSales.reduce((sum, s) => sum + num(s.accessoriesCost) + num(s.shippingCost), 0);
    const totalRevenue = activeSales.reduce((sum, s) => sum + num(s.finalPrice), 0);
    const totalProfit = activeSales.reduce((sum, s) => sum + num(s.netProfit), 0);

    box.innerHTML = `
        <div class="report-row">
            <span>إجمالي الطلبات</span>
            <strong>${totalOrders.toLocaleString("en-US")}</strong>
        </div>
        <div class="report-row" onclick="openOrdersWithStatus('تم التسليم')">
            <span>تم التسليم</span>
            <strong>${delivered.toLocaleString("en-US")}</strong>
        </div>
        <div class="report-row">
            <span>طلبات تحت التنفيذ</span>
            <strong>${pending.toLocaleString("en-US")}</strong>
        </div>
        <div class="report-row" onclick="openOrdersWithStatus('عرض سعر')">
            <span>عروض سعر</span>
            <strong>${quotes.toLocaleString("en-US")}</strong>
        </div>
        <div class="report-row">
            <span>إجمالي التكلفة</span>
            <strong>${money(totalCost)} جنيه</strong>
        </div>
        <div class="report-row">
            <span>إكسسوارات وشحن</span>
            <strong>${money(totalDirectAddOns)} جنيه</strong>
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
/* INVOICE / WHATSAPP / PRINT */
/* ========================= */

function getSaleForAction(id) {
    if (id) return state.sales.find((s) => s.id === id) || null;
    return calculate();
}

function buildInvoice(sale) {
    const lines = [
        "أهلاً بيك في MS Studio 3D 👋",
        "",
        `اسم العميل: ${sale.clientName || "-"}`,
        `اسم المنتج: ${sale.modelName || "-"}`,
        `عدد القطع: ${formatNumber(sale.quantity || 1)}`
    ];

    if (num(sale.quantity || 1) > 1) {
        lines.push(`سعر القطعة: ${money(sale.unitFinalPrice || 0)} جنيه`);
    }

    if (num(sale.discount) > 0) {
        lines.push(`الخصم: ${money(sale.discount)} جنيه`);
    }

    lines.push("");
    lines.push(`السعر النهائي: ${money(sale.finalPrice)} جنيه`);

    return lines.join("\n");
}

function buildPrintableInvoiceHtml(sale) {
    return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <style>
        @page {
            size: A4;
            margin: 18mm;
        }

        body {
            font-family: Arial, sans-serif;
            direction: rtl;
            color: #111;
            background: #fff;
            margin: 0;
            padding: 0;
        }

        .invoice {
            max-width: 680px;
            margin: 0 auto;
            border: 1px solid #ddd;
            padding: 28px;
            border-radius: 14px;
        }

        .welcome {
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 24px;
        }

        .row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding: 12px 0;
            border-bottom: 1px solid #eee;
            font-size: 17px;
        }

        .row strong {
            min-width: 120px;
        }

        .price {
            margin-top: 24px;
            text-align: center;
            font-size: 32px;
            font-weight: bold;
        }
    </style>
</head>

<body>
    <div class="invoice">
        <div class="welcome">أهلاً بيك في MS Studio 3D 👋</div>

        <div class="row">
            <strong>اسم العميل</strong>
            <span>${escapeHtml(sale.clientName || "-")}</span>
        </div>

        <div class="row">
            <strong>اسم المنتج</strong>
            <span>${escapeHtml(sale.modelName || "-")}</span>
        </div>

        <div class="row">
            <strong>عدد القطع</strong>
            <span>${formatNumber(sale.quantity || 1)}</span>
        </div>

        ${num(sale.quantity || 1) > 1
            ? `<div class="row">
                <strong>سعر القطعة</strong>
                <span>${money(sale.unitFinalPrice || 0)} جنيه</span>
               </div>`
            : ""}

        ${
            num(sale.discount) > 0
                ? `<div class="row">
                    <strong>الخصم</strong>
                    <span>${money(sale.discount)} جنيه</span>
                   </div>`
                : ""
        }

        <div class="price">السعر النهائي: ${money(sale.finalPrice)} جنيه</div>
    </div>
</body>
</html>
    `;
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

    saveCurrentDraft();

    try {
        if (window.Android && typeof window.Android.openWhatsApp === "function") {
            window.Android.openWhatsApp(text);
            return;
        }
    } catch (e) {
        console.log(e);
    }

    const url = "whatsapp://send?text=" + encodeURIComponent(text);
    window.location.href = url;
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

    saveCurrentDraft();

    const html = buildPrintableInvoiceHtml(sale);

    try {
        if (window.Android && typeof window.Android.printHtml === "function") {
            window.Android.printHtml(html);
            toast("تم فتح الطباعة / PDF");
            return;
        }

        if (window.Android && typeof window.Android.printInvoice === "function") {
            window.Android.printInvoice(html);
            toast("تم فتح الطباعة / PDF");
            return;
        }

        if (window.Android && typeof window.Android.printPage === "function") {
            window.Android.printPage(html);
            toast("تم فتح الطباعة / PDF");
            return;
        }
    } catch (e) {
        console.log(e);
    }

    toast("الطباعة تحتاج نسخة Android المحدثة");
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
        "quantity",
        "unit_final_price",
        "print_hours",
        "material_weight_g",
        "waste_weight_g",
        "material_cost",
        "waste_cost",
        "machine_cost",
        "electricity_cost",
        "manual_cost",
        "packaging_cost",
        "accessories_cost",
        "shipping_cost",
        "risk_cost",
        "tax_cost",
        "price_before_discount",
        "discount",
        "minimum_order_price",
        "rounding_adjustment",
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
        s.quantity || 1,
        round2(s.unitFinalPrice),
        s.printHours,
        s.materialWeight,
        s.wasteWeight,
        round2(s.materialCost),
        round2(s.wasteCost),
        round2(s.machineCost),
        round2(s.electricityCost),
        round2(s.manualCost || s.laborCost),
        round2(s.packagingCost),
        round2(s.accessoriesCost),
        round2(s.shippingCost),
        round2(s.riskCost),
        round2(s.taxCost),
        round2(s.priceBeforeDiscount),
        round2(s.discount || s.discountValue),
        round2(s.minimumOrderPrice),
        round2(s.roundedAdjustment),
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
