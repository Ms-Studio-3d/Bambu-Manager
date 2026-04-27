const SETTINGS_VERSION = 6;

const DEFAULT_SETTINGS = {
    settingsVersion: SETTINGS_VERSION,
    selectedPrinterId: "",
    general: {
        profitPercent: 100,
        manualRate: 0,
        packagingCost: 10
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

function makeId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
}

function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2200);
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
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));

    document.getElementById("page-" + name).classList.add("active");

    const map = { calc: 0, log: 1, settings: 2 };
    document.querySelectorAll(".tab-btn")[map[name]].classList.add("active");

    if (name === "log") loadSales();
    if (name === "settings") renderSettings();
}

function loadSettings() {
    try {
        if (window.Android && Android.getAppSettings) {
            const raw = Android.getAppSettings();
            if (raw) settings = JSON.parse(raw);
            return;
        }
    } catch (e) {
        reportError("loadSettings Android", e);
    }

    try {
        const raw = localStorage.getItem("bambu_app_settings_v2");
        if (raw) settings = JSON.parse(raw);
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

    settings.printers = settings.printers.map(p => ({
        id: p.id || makeId("printer"),
        name: p.name || "BAMBU LAB A1",
        hourlyRate: num(p.hourlyRate) || 35,
        maintenanceLimit: num(p.maintenanceLimit) || 200,
        currentHours: num(p.currentHours)
    }));

    settings.materials = settings.materials.map(m => ({
        id: m.id || makeId("mat"),
        name: m.name || "خامة",
        color: m.color || "",
        brand: m.brand || "",
        kgPrice: num(m.kgPrice)
    }));

    settings.general.profitPercent =
        settings.general.profitPercent === undefined || settings.general.profitPercent === null
            ? 100
            : num(settings.general.profitPercent);

    settings.general.manualRate =
        settings.general.manualRate === undefined || settings.general.manualRate === null
            ? 0
            : num(settings.general.manualRate);

    settings.general.packagingCost =
        settings.general.packagingCost === undefined || settings.general.packagingCost === null
            ? 10
            : num(settings.general.packagingCost);

    if (!settings.selectedPrinterId || !settings.printers.some(p => p.id === settings.selectedPrinterId)) {
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

function renderMachineSelect() {
    const select = document.getElementById("machineSelect");
    select.innerHTML = "";

    settings.printers.forEach(printer => {
        const opt = document.createElement("option");
        opt.value = printer.id;
        opt.textContent = printer.name;
        select.appendChild(opt);
    });

    select.value = settings.selectedPrinterId;
}

function selectedPrinter() {
    return settings.printers.find(p => p.id === settings.selectedPrinterId) || settings.printers[0];
}

function onMachineChanged() {
    settings.selectedPrinterId = document.getElementById("machineSelect").value;

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
    setInputValue("manualRate", settings.general.manualRate);
    setInputValue("packagingCost", settings.general.packagingCost);
}

function updateMachineStatus() {
    const printer = selectedPrinter();
    if (!printer) return;

    const current = num(printer.currentHours);
    const limit = num(printer.maintenanceLimit) || 1;
    const printHours = num(document.getElementById("printHours").value);

    document.getElementById("machineHoursText").textContent =
        "الساعات المسجلة: " + fixed(current, 1) + " / " + fixed(limit, 0) + " س";

    document.getElementById("afterOrderHours").textContent =
        fixed(current + printHours, 1) + " س";

    const percent = Math.min(100, Math.max(0, (current / limit) * 100));
    document.getElementById("maintenanceProgress").style.width = percent + "%";
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
    const box = document.getElementById("orderMaterials");
    const addBtn = document.getElementById("addOrderMaterialBtn");

    if (settings.materials.length === 0) {
        box.innerHTML = `
            <div class="empty-note">
                لا توجد خامات مضافة. افتح تبويب الإعدادات وأضف الخامة أولًا.
            </div>
        `;
        box.dataset.hasRows = "0";
        addBtn.disabled = true;
        return;
    }

    addBtn.disabled = false;

    if (box.dataset.hasRows !== "1") {
        box.innerHTML = "";
        addOrderMaterialRow();
    } else {
        document.querySelectorAll(".order-material-select").forEach(sel => {
            fillMaterialSelect(sel, sel.value);
        });
    }
}

function fillMaterialSelect(select, selectedValue) {
    select.innerHTML = "";

    settings.materials.forEach(mat => {
        const opt = document.createElement("option");
        opt.value = mat.id;
        opt.textContent = materialLabel(mat);
        select.appendChild(opt);
    });

    if (selectedValue && settings.materials.some(m => m.id === selectedValue)) {
        select.value = selectedValue;
    }
}

function addOrderMaterialRow(materialId = "", weight = "") {
    if (settings.materials.length === 0) {
        toast("أضف خامة من الإعدادات أولًا");
        showPage("settings");
        return;
    }

    const box = document.getElementById("orderMaterials");

    if (box.dataset.hasRows !== "1") {
        box.innerHTML = "";
    }

    box.dataset.hasRows = "1";

    const row = document.createElement("div");
    row.className = "filament-row";
    row.dataset.rowId = "row_" + (++orderRowCounter);

    const selectWrap = document.createElement("div");
    selectWrap.className = "field";

    const select = document.createElement("select");
    select.className = "order-material-select";
    select.onchange = calculate;
    fillMaterialSelect(select, materialId || (settings.materials[0] ? settings.materials[0].id : ""));

    selectWrap.appendChild(select);

    const weightWrap = document.createElement("div");
    weightWrap.className = "field";

    const weightInput = document.createElement("input");
    weightInput.className = "order-material-weight";
    weightInput.type = "text";
    weightInput.inputMode = "decimal";
    weightInput.placeholder = "الوزن جرام";
    weightInput.value = num(weight) === 0 ? "" : String(num(weight));
    weightInput.oninput = calculate;

    weightWrap.appendChild(weightInput);

    const del = document.createElement("button");
    del.className = "danger";
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

    return rows.map(row => {
        const select = row.querySelector(".order-material-select");
        const weightInput = row.querySelector(".order-material-weight");

        const matId = select ? select.value : "";
        const mat = settings.materials.find(m => m.id === matId);
        const weight = num(weightInput ? weightInput.value : 0);
        const gramPrice = mat ? num(mat.kgPrice) / 1000 : 0;

        return {
            id: matId,
            name: mat ? mat.name : "",
            color: mat ? mat.color : "",
            brand: mat ? mat.brand : "",
            kgPrice: mat ? num(mat.kgPrice) : 0,
            gramPrice,
            weight,
            cost: weight * gramPrice
        };
    }).filter(item => item.id);
}

function hasOrderWork(printHours, materialWeight, wasteWeight, manualMinutes) {
    return printHours > 0 || materialWeight > 0 || wasteWeight > 0 || manualMinutes > 0;
}

function calculate() {
    const printHours = num(document.getElementById("printHours").value);
    const machineRate = num(document.getElementById("machineRate").value);
    const wasteWeight = num(document.getElementById("wasteWeight").value);
    const manualMinutes = num(document.getElementById("manualMinutes").value);
    const manualRate = num(document.getElementById("manualRate").value);
    const packagingInput = num(document.getElementById("packagingCost").value);
    const profitPercent = num(document.getElementById("profitPercent").value);
    const discount = num(document.getElementById("discount").value);

    const materials = getOrderMaterials();

    const materialWeight = materials.reduce((sum, m) => sum + num(m.weight), 0);
    const materialCost = materials.reduce((sum, m) => sum + num(m.cost), 0);

    let weightedGramCost = 0;

    if (materialWeight > 0) {
        weightedGramCost = materialCost / materialWeight;
    } else if (materials.length > 0) {
        weightedGramCost = num(materials[0].gramPrice);
    }

    const hasWork = hasOrderWork(printHours, materialWeight, wasteWeight, manualMinutes);

    const machineCost = printHours * machineRate;
    const wasteCost = wasteWeight * weightedGramCost;
    const manualCost = (manualMinutes / 60) * manualRate;
    const packagingCost = hasWork ? packagingInput : 0;

    const totalCost = machineCost + materialCost + wasteCost + manualCost + packagingCost;
    const beforeDiscount = totalCost * (1 + profitPercent / 100);
    const afterDiscount = hasWork ? Math.max(0, beforeDiscount - discount) : 0;
    const finalPrice = hasWork ? Math.ceil(afterDiscount / 5) * 5 : 0;
    const netProfit = finalPrice - totalCost;

    lastCalc = {
        hasWork,
        printHours,
        machineRate,
        machineCost,
        materials,
        materialWeight,
        materialCost,
        wasteWeight,
        weightedGramCost,
        wasteCost,
        manualMinutes,
        manualRate,
        manualCost,
        packagingCost,
        packagingInput,
        totalCost,
        profitPercent,
        beforeDiscount,
        discount,
        afterDiscount,
        finalPrice,
        netProfit
    };

    document.getElementById("finalPrice").textContent = money(finalPrice);
    document.getElementById("totalCost").textContent = money(totalCost);
    document.getElementById("netProfit").textContent = money(netProfit);

    updateMachineStatus();
}

function saveGeneralFromCalculator() {
    settings.general.profitPercent = num(document.getElementById("profitPercent").value);
    settings.general.manualRate = num(document.getElementById("manualRate").value);
    settings.general.packagingCost = num(document.getElementById("packagingCost").value);

    const printer = selectedPrinter();
    if (printer) {
        printer.hourlyRate = num(document.getElementById("machineRate").value);
    }

    saveSettings();
    renderAll();
    toast("تم حفظ الإعدادات كأساسي");
}

function invoiceText() {
    calculate();

    const client = document.getElementById("clientName").value.trim() || "عميل";
    const model = document.getElementById("modelName").value.trim() || "طلب طباعة 3D";
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
        lines.push("🎁 الخصم: " + currency(lastCalc.discount));
    }

    lines.push("━━━━━━━━━━━━━━");
    lines.push("💚 الإجمالي النهائي: " + currency(lastCalc.finalPrice));
    lines.push("━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("شكرًا لاختيارك لنا ✨");

    return lines.join("\n");
}

function copyText(text, okMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => toast(okMessage))
            .catch(() => fallbackCopy(text, okMessage));
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
    const client = document.getElementById("clientName").value.trim() || "عميل";
    const model = document.getElementById("modelName").value.trim() || "طلب طباعة 3D";
    const date = new Date().toLocaleDateString("en-GB");

    const discountBlock = lastCalc.discount > 0
        ? `<div class="print-discount">🎁 الخصم: ${currency(lastCalc.discount)}</div>`
        : "";

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    @page {
        size: A4;
        margin: 8mm;
    }

    html,
    body {
        margin: 0;
        padding: 0;
        width: 100%;
        background: #ffffff;
        color: #000000;
        font-family: Arial, Tahoma, sans-serif;
        overflow: visible;
    }

    * {
        box-sizing: border-box;
    }

    .print-invoice {
        width: 100%;
        max-width: 680px;
        margin: 0 auto;
        padding: 0;
        text-align: center;
        direction: rtl;
        page-break-inside: avoid;
        break-inside: avoid;
    }

    .print-box {
        border: 2px solid #19c878;
        border-radius: 18px;
        padding: 20px 16px;
        page-break-inside: avoid;
        break-inside: avoid;
    }

    h1 {
        margin: 0 0 18px;
        font-size: 26px;
        line-height: 1.35;
    }

    .print-info {
        max-width: 460px;
        margin: 0 auto;
        text-align: right;
        font-size: 17px;
        line-height: 1.9;
    }

    .print-discount {
        margin: 14px auto 0;
        font-size: 18px;
        font-weight: bold;
    }

    .line {
        margin: 16px 0 8px;
        font-size: 19px;
        line-height: 1;
    }

    .total {
        max-width: 460px;
        margin: 0 auto;
        background: #19c878;
        color: #001208;
        border-radius: 16px;
        padding: 15px;
        font-size: 24px;
        font-weight: 900;
        line-height: 1.5;
    }

    .thanks {
        margin-top: 16px;
        font-size: 19px;
        font-weight: bold;
    }
</style>
</head>
<body>
    <div class="print-invoice">
        <div class="print-box">
            <h1>✨ فاتورة طلب طباعة 3D ✨</h1>

            <div class="print-info">
                <div><strong>التاريخ:</strong> ${escapeHtml(date)}</div>
                <div><strong>العميل:</strong> ${escapeHtml(client)}</div>
                <div><strong>المجسم:</strong> ${escapeHtml(model)}</div>
            </div>

            ${discountBlock}

            <div class="line">━━━━━━━━━━━━━━</div>
            <div class="total">💚 الإجمالي النهائي: ${currency(lastCalc.finalPrice)}</div>
            <div class="line">━━━━━━━━━━━━━━</div>

            <div class="thanks">شكرًا لاختيارك لنا ✨</div>
        </div>
    </div>
</body>
</html>`;
}

function printInvoice() {
    calculate();

    if (!lastCalc.hasWork) {
        toast("أدخل بيانات الطلب أولًا");
        return;
    }

    const html = buildPrintInvoiceHtml();
    const area = document.getElementById("invoicePrintArea");

    area.innerHTML = html
        .replace(/^<!DOCTYPE html>[\s\S]*?<body>/i, "")
        .replace(/<\/body>[\s\S]*?<\/html>$/i, "");

    try {
        if (window.Android && Android.printPage) {
            try {
                Android.printPage(html);
            } catch (e1) {
                Android.printPage();
            }
        } else {
            window.print();
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

    const client = document.getElementById("clientName").value.trim() || "عميل";
    const model = document.getElementById("modelName").value.trim() || "مجسم";
    const printer = selectedPrinter();

    const sale = {
        id: Date.now(),
        date: new Date().toLocaleString("en-GB"),
        client,
        model,
        sale: lastCalc.finalPrice,
        profit: lastCalc.netProfit,
        hours: lastCalc.printHours,
        weight: lastCalc.materialWeight,
        waste: lastCalc.wasteWeight,

        printerName: printer ? printer.name : "",
        machineRate: lastCalc.machineRate,
        machineCost: lastCalc.machineCost,
        materialsJson: JSON.stringify(lastCalc.materials),
        materialCost: lastCalc.materialCost,
        averageGramCost: lastCalc.weightedGramCost,
        wasteCost: lastCalc.wasteCost,
        manualMinutes: lastCalc.manualMinutes,
        manualRate: lastCalc.manualRate,
        manualCost: lastCalc.manualCost,
        packagingCost: lastCalc.packagingCost,
        totalCost: lastCalc.totalCost,
        profitPercent: lastCalc.profitPercent,
        priceBeforeDiscount: lastCalc.beforeDiscount,
        discount: lastCalc.discount,
        priceAfterDiscount: lastCalc.afterDiscount,
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
    document.getElementById("clientName").value = "";
    document.getElementById("modelName").value = "";
    document.getElementById("printHours").value = "";
    document.getElementById("wasteWeight").value = "";
    document.getElementById("manualMinutes").value = "";
    document.getElementById("discount").value = "";

    const orderBox = document.getElementById("orderMaterials");
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
    const box = document.getElementById("salesList");
    box.innerHTML = "";

    if (!salesCache.length) {
        box.innerHTML = `<div class="empty-note">لا توجد مبيعات مسجلة.</div>`;
    } else {
        salesCache.forEach(sale => {
            const hasDiscount = num(sale.discount || 0) > 0;

            const discountHtml = hasDiscount
                ? `
                    <div class="sale-pill">
                        <small>الخصم</small>
                        <strong>${currency(sale.discount || 0)}</strong>
                    </div>
                `
                : "";

            const card = document.createElement("div");
            card.className = "sale-card";

            card.innerHTML = `
                <div class="sale-head">
                    <div>
                        <div class="sale-client">👤 ${escapeHtml(sale.client || "عميل")}</div>
                        <div class="sale-model">🧩 ${escapeHtml(sale.model || "مجسم")}</div>
                        <div class="muted" style="margin-top:5px">🕒 ${escapeHtml(sale.date || "")}</div>
                    </div>
                    <div class="sale-price">
                        ${currency(sale.sale || sale.finalPrice || 0)}
                        <div class="muted" style="font-size:12px;margin-top:3px;text-align:inherit">السعر النهائي</div>
                    </div>
                </div>

                <div class="sale-details">
                    <div class="sale-pill">
                        <small>صافي الربح</small>
                        <strong style="color:#8dffc8">${currency(sale.profit || sale.netProfit || 0)}</strong>
                    </div>
                    <div class="sale-pill">
                        <small>التكلفة</small>
                        <strong>${currency(sale.totalCost || 0)}</strong>
                    </div>
                    <div class="sale-pill">
                        <small>وقت الطباعة</small>
                        <strong>${fixed(sale.hours || 0, 1)} س</strong>
                    </div>
                    <div class="sale-pill">
                        <small>الخامة</small>
                        <strong>${fixed(sale.weight || 0, 1)} جم</strong>
                    </div>
                    <div class="sale-pill">
                        <small>الهالك</small>
                        <strong>${fixed(sale.waste || 0, 1)} جم</strong>
                    </div>
                    ${discountHtml}
                </div>

                <div class="sale-actions">
                    <button class="secondary" onclick="copySaleInvoice('${sale.id}')">نسخ الفاتورة</button>
                    <button class="danger" onclick="deleteSale('${sale.id}')">حذف البيعة</button>
                </div>
            `;

            box.appendChild(card);
        });
    }

    const totalSales = salesCache.reduce((s, x) => s + num(x.sale || x.finalPrice), 0);
    const totalProfit = salesCache.reduce((s, x) => s + num(x.profit || x.netProfit), 0);
    const totalHours = salesCache.reduce((s, x) => s + num(x.hours), 0);
    const totalWeight = salesCache.reduce((s, x) => s + num(x.weight), 0);

    document.getElementById("statSales").textContent = currency(totalSales);
    document.getElementById("statProfit").textContent = currency(totalProfit);
    document.getElementById("statHours").textContent = fixed(totalHours, 1) + " س";
    document.getElementById("statWeight").textContent = fixed(totalWeight / 1000, 2) + " كجم";
}

function copySaleInvoice(saleId) {
    const sale = salesCache.find(s => String(s.id) === String(saleId));

    if (!sale) {
        toast("لم يتم العثور على البيعة");
        return;
    }

    const lines = [
        "✨ فاتورة طلب طباعة 3D ✨",
        "",
        "التاريخ: " + String(sale.date || "").split(" ")[0],
        "العميل: " + (sale.client || "عميل"),
        "المجسم: " + (sale.model || "طلب طباعة 3D"),
        ""
    ];

    if (num(sale.discount || 0) > 0) {
        lines.push("🎁 الخصم: " + currency(sale.discount || 0));
    }

    lines.push("━━━━━━━━━━━━━━");
    lines.push("💚 الإجمالي النهائي: " + currency(sale.sale || sale.finalPrice || 0));
    lines.push("━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("شكرًا لاختيارك لنا ✨");

    copyText(lines.join("\n"), "تم نسخ فاتورة البيعة");
}

function deleteSale(id) {
    if (!confirm("حذف هذه البيعة من السجل؟")) return;

    try {
        if (window.Android && Android.deleteSale) {
            Android.deleteSale(String(id));
            salesCache = salesCache.filter(s => String(s.id) !== String(id));
        } else {
            salesCache = salesCache.filter(s => String(s.id) !== String(id));
            localStorage.setItem("bambu_sales_v2", JSON.stringify(salesCache));
        }

        renderSales();
        toast("تم حذف البيعة");
    } catch (e) {
        reportError("deleteSale", e);
        toast("تعذر حذف البيعة");
    }
}

function clearSales() {
    if (!confirm("مسح كل سجل المبيعات؟")) return;

    try {
        if (window.Android && Android.clearAllSales) {
            Android.clearAllSales();
        } else {
            localStorage.removeItem("bambu_sales_v2");
        }

        salesCache = [];
        renderSales();
        toast("تم مسح السجل");
    } catch (e) {
        reportError("clearSales", e);
        toast("تعذر مسح السجل");
    }
}

function materialSummaryForSale(sale) {
    try {
        const arr = JSON.parse(sale.materialsJson || "[]");

        if (!Array.isArray(arr) || arr.length === 0) return "";

        return arr
            .filter(m => num(m.weight) > 0)
            .map(m => {
                const parts = [m.name, m.color, m.brand].filter(Boolean).join(" - ");
                return parts + " / " + fixed(m.weight || 0, 1) + " جم";
            })
            .join(" | ");
    } catch (e) {
        reportError("materialSummaryForSale", e);
        return "";
    }
}

function exportCSV() {
    loadSales();

    if (!salesCache.length) {
        toast("لا توجد مبيعات للتصدير");
        return;
    }

    const columns = [
        ["رقم البيعة", s => s.id],
        ["التاريخ", s => s.date],
        ["اسم العميل", s => s.client],
        ["اسم المجسم", s => s.model],
        ["السعر النهائي", s => s.sale || s.finalPrice],
        ["إجمالي التكلفة", s => s.totalCost],
        ["صافي الربح", s => s.profit || s.netProfit],
        ["نسبة الربح %", s => s.profitPercent],
        ["الخصم", s => s.discount],
        ["السعر قبل الخصم", s => s.priceBeforeDiscount],
        ["السعر بعد الخصم", s => s.priceAfterDiscount],
        ["اسم الماكينة", s => s.printerName],
        ["سعر ساعة الماكينة", s => s.machineRate],
        ["وقت الطباعة بالساعات", s => s.hours],
        ["تكلفة الماكينة", s => s.machineCost],
        ["الخامات المستخدمة", s => materialSummaryForSale(s)],
        ["إجمالي وزن الخامة جم", s => s.weight],
        ["تكلفة الخامة", s => s.materialCost],
        ["وزن الهالك جم", s => s.waste],
        ["متوسط سعر الجرام", s => s.averageGramCost],
        ["تكلفة الهالك", s => s.wasteCost],
        ["دقائق الشغل اليدوي", s => s.manualMinutes],
        ["سعر ساعة الشغل اليدوي", s => s.manualRate],
        ["تكلفة الشغل اليدوي", s => s.manualCost],
        ["تكلفة التغليف", s => s.packagingCost]
    ];

    const rows = [];
    rows.push(columns.map(c => csvCell(c[0])).join(","));

    salesCache.forEach(sale => {
        rows.push(columns.map(c => csvCell(c[1](sale) == null ? "" : c[1](sale))).join(","));
    });

    const csv = "\uFEFF" + rows.join("\n");

    try {
        if (window.Android && Android.exportCSV) {
            Android.exportCSV(csv, "bambu-sales-" + new Date().toISOString().slice(0, 10) + ".csv");
            toast("تم تجهيز ملف CSV / Excel");
            return;
        }
    } catch (e) {
        reportError("exportCSV Android", e);
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    a.href = url;
    a.download = "bambu-sales-" + date + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    toast("تم تجهيز ملف CSV / Excel");
}

function csvCell(value) {
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
}

function renderSettings() {
    setInputValue("setProfitPercent", settings.general.profitPercent);
    setInputValue("setManualRate", settings.general.manualRate);
    setInputValue("setPackagingCost", settings.general.packagingCost);

    renderPrintersList();
    renderMaterialsList();
}

function saveGeneralSettings() {
    settings.general.profitPercent = num(document.getElementById("setProfitPercent").value);
    settings.general.manualRate = num(document.getElementById("setManualRate").value);
    settings.general.packagingCost = num(document.getElementById("setPackagingCost").value);

    saveSettings();
    applyDefaultsToCalculator();
    calculate();

    toast("تم حفظ الإعدادات العامة");
}

function savePrinter() {
    const name = document.getElementById("printerName").value.trim();
    const hourlyRate = num(document.getElementById("printerRate").value);
    const maintenanceLimit = num(document.getElementById("printerMaintenanceLimit").value);
    const currentHours = num(document.getElementById("printerCurrentHours").value);

    if (!name) {
        toast("اكتب اسم الماكينة");
        return;
    }

    if (editingPrinterId) {
        const printer = settings.printers.find(p => p.id === editingPrinterId);

        if (!printer) {
            toast("لم يتم العثور على الماكينة");
            cancelPrinterEdit();
            return;
        }

        printer.name = name;
        printer.hourlyRate = hourlyRate;
        printer.maintenanceLimit = maintenanceLimit || 200;
        printer.currentHours = currentHours;

        toast("تم حفظ تعديل الماكينة");
    } else {
        const newPrinter = {
            id: makeId("printer"),
            name,
            hourlyRate,
            maintenanceLimit: maintenanceLimit || 200,
            currentHours
        };

        settings.printers.push(newPrinter);
        settings.selectedPrinterId = newPrinter.id;

        toast("تمت إضافة الماكينة");
    }

    clearPrinterForm();
    saveSettings();
    renderAll();
    calculate();
}

function editPrinter(id) {
    const printer = settings.printers.find(p => p.id === id);

    if (!printer) {
        toast("لم يتم العثور على الماكينة");
        return;
    }

    editingPrinterId = id;

    document.getElementById("printerName").value = printer.name || "";
    document.getElementById("printerRate").value = printer.hourlyRate || "";
    document.getElementById("printerMaintenanceLimit").value = printer.maintenanceLimit || "";
    document.getElementById("printerCurrentHours").value = printer.currentHours || "";

    document.getElementById("printerSaveBtn").textContent = "حفظ تعديل الماكينة";
    document.getElementById("printerCancelBtn").style.display = "inline-flex";
    document.getElementById("printerEditHint").style.display = "block";

    showPage("settings");
    toast("عدّل بيانات الماكينة ثم اضغط حفظ");
}

function cancelPrinterEdit() {
    clearPrinterForm();
    toast("تم إلغاء تعديل الماكينة");
}

function clearPrinterForm() {
    editingPrinterId = "";

    document.getElementById("printerName").value = "";
    document.getElementById("printerRate").value = "";
    document.getElementById("printerMaintenanceLimit").value = "";
    document.getElementById("printerCurrentHours").value = "";

    const saveBtn = document.getElementById("printerSaveBtn");
    const cancelBtn = document.getElementById("printerCancelBtn");
    const hint = document.getElementById("printerEditHint");

    if (saveBtn) saveBtn.textContent = "إضافة ماكينة";
    if (cancelBtn) cancelBtn.style.display = "none";
    if (hint) hint.style.display = "none";
}

function deletePrinter(id) {
    if (settings.printers.length <= 1) {
        toast("لازم تترك ماكينة واحدة على الأقل");
        return;
    }

    if (!confirm("حذف هذه الماكينة؟")) return;

    settings.printers = settings.printers.filter(p => p.id !== id);

    if (settings.selectedPrinterId === id) {
        settings.selectedPrinterId = settings.printers[0].id;
    }

    if (editingPrinterId === id) {
        clearPrinterForm();
    }

    saveSettings();
    renderAll();
    calculate();

    toast("تم حذف الماكينة");
}

function choosePrinter(id) {
    settings.selectedPrinterId = id;
    saveSettings();
    renderAll();
    calculate();
    toast("تم اختيار الماكينة للحساب");
}

function renderPrintersList() {
    const box = document.getElementById("printersList");
    box.innerHTML = "";

    settings.printers.forEach(printer => {
        const item = document.createElement("div");
        item.className = "list-item";

        item.innerHTML = `
            <div>
                <div class="list-title">${escapeHtml(printer.name)} ${printer.id === settings.selectedPrinterId ? "✅" : ""}</div>
                <div class="list-sub">
                    ${currency(printer.hourlyRate)} لكل ساعة · الصيانة ${fixed(printer.currentHours, 1)} / ${fixed(printer.maintenanceLimit, 0)} س
                </div>
            </div>
            <div class="btn-row">
                <button class="secondary" onclick="choosePrinter('${printer.id}')">اختيار</button>
                <button class="warning" onclick="editPrinter('${printer.id}')">تعديل</button>
                <button class="danger" onclick="deletePrinter('${printer.id}')">حذف</button>
            </div>
        `;

        box.appendChild(item);
    });
}

function saveMaterial() {
    const name = document.getElementById("matName").value.trim();
    const color = document.getElementById("matColor").value.trim();
    const brand = document.getElementById("matBrand").value.trim();
    const kgPrice = num(document.getElementById("matKgPrice").value);

    if (!name) {
        toast("اكتب اسم أو نوع الخامة");
        return;
    }

    if (kgPrice <= 0) {
        toast("اكتب سعر الكيلو للخامة");
        return;
    }

    if (editingMaterialId) {
        const mat = settings.materials.find(m => m.id === editingMaterialId);

        if (!mat) {
            toast("لم يتم العثور على الخامة");
            cancelMaterialEdit();
            return;
        }

        mat.name = name;
        mat.color = color;
        mat.brand = brand;
        mat.kgPrice = kgPrice;

        toast("تم حفظ تعديل الخامة");
    } else {
        settings.materials.push({
            id: makeId("mat"),
            name,
            color,
            brand,
            kgPrice
        });

        toast("تمت إضافة الخامة");
    }

    clearMaterialForm();

    saveSettings();

    const orderBox = document.getElementById("orderMaterials");
    if (orderBox) orderBox.dataset.hasRows = "0";

    renderAll();
    calculate();
}

function editMaterial(id) {
    const mat = settings.materials.find(m => m.id === id);

    if (!mat) {
        toast("لم يتم العثور على الخامة");
        return;
    }

    editingMaterialId = id;

    document.getElementById("matName").value = mat.name || "";
    document.getElementById("matColor").value = mat.color || "";
    document.getElementById("matBrand").value = mat.brand || "";
    document.getElementById("matKgPrice").value = mat.kgPrice || "";

    document.getElementById("materialSaveBtn").textContent = "حفظ تعديل الخامة";
    document.getElementById("materialCancelBtn").style.display = "inline-flex";
    document.getElementById("materialEditHint").style.display = "block";

    showPage("settings");
    toast("عدّل بيانات الخامة ثم اضغط حفظ");
}

function cancelMaterialEdit() {
    clearMaterialForm();
    toast("تم إلغاء تعديل الخامة");
}

function clearMaterialForm() {
    editingMaterialId = "";

    document.getElementById("matName").value = "";
    document.getElementById("matColor").value = "";
    document.getElementById("matBrand").value = "";
    document.getElementById("matKgPrice").value = "";

    const saveBtn = document.getElementById("materialSaveBtn");
    const cancelBtn = document.getElementById("materialCancelBtn");
    const hint = document.getElementById("materialEditHint");

    if (saveBtn) saveBtn.textContent = "إضافة خامة";
    if (cancelBtn) cancelBtn.style.display = "none";
    if (hint) hint.style.display = "none";
}

function deleteMaterial(id) {
    if (!confirm("حذف هذه الخامة؟")) return;

    settings.materials = settings.materials.filter(m => m.id !== id);

    if (editingMaterialId === id) {
        clearMaterialForm();
    }

    const orderBox = document.getElementById("orderMaterials");
    if (orderBox) orderBox.dataset.hasRows = "0";

    saveSettings();
    renderAll();
    calculate();

    toast("تم حذف الخامة");
}

function useMaterial(id) {
    const orderBox = document.getElementById("orderMaterials");
    if (orderBox && orderBox.dataset.hasRows !== "1") {
        orderBox.innerHTML = "";
        orderBox.dataset.hasRows = "1";
    }

    addOrderMaterialRow(id, "");
    showPage("calc");
    toast("تمت إضافة الخامة للطلب");
}

function renderMaterialsList() {
    const box = document.getElementById("materialsList");
    box.innerHTML = "";

    if (settings.materials.length === 0) {
        box.innerHTML = `
            <div class="empty-note">
                لا توجد خامات حاليًا. أضف أول خامة بنفسك، والسعر يكون لكل كجم / 1000 جرام.
            </div>
        `;
        return;
    }

    settings.materials.forEach(mat => {
        const item = document.createElement("div");
        item.className = "list-item";

        item.innerHTML = `
            <div>
                <div class="list-title">${escapeHtml([mat.name, mat.color, mat.brand].filter(Boolean).join(" - "))}</div>
                <div class="list-sub">
                    ${currency(mat.kgPrice)} / كجم · سعر الجرام ${currencyExact(num(mat.kgPrice) / 1000)}
                </div>
            </div>
            <div class="btn-row">
                <button class="secondary" onclick="useMaterial('${mat.id}')">استخدام</button>
                <button class="warning" onclick="editMaterial('${mat.id}')">تعديل</button>
                <button class="danger" onclick="deleteMaterial('${mat.id}')">حذف</button>
            </div>
        `;

        box.appendChild(item);
    });
}
