"use strict";

/*
    Fixes layer for:
    1. Invoice PDF printing as invoice HTML, not app screenshot.
    2. WhatsApp opens directly with invoice text.
    3. Draft order fields are auto-saved and restored if user leaves/back before saving.
*/

const DRAFT_KEY = "bambu_manager_current_draft_v1";

document.addEventListener("DOMContentLoaded", function () {
    restoreCurrentDraft();
    attachDraftAutoSave();
});

/* ========================= */
/* DRAFT AUTO SAVE */
/* ========================= */

function collectCurrentDraft() {
    const materialRows = Array.from(document.querySelectorAll(".order-material-row")).map((row) => {
        return {
            materialId: row.querySelector(".order-material-select")?.value || "",
            weight: row.querySelector(".order-material-weight")?.value || ""
        };
    });

    return {
        clientName: getValue("clientName"),
        modelName: getValue("modelName"),
        orderStatus: getValue("orderStatus"),
        orderNotes: getValue("orderNotes"),
        printHours: getValue("printHours"),
        machineRate: getValue("machineRate"),
        wasteWeight: getValue("wasteWeight"),
        manualMinutes: getValue("manualMinutes"),
        profitPercent: getValue("profitPercent"),
        discount: getValue("discount"),
        manualRate: getValue("manualRate"),
        packagingCost: getValue("packagingCost"),
        electricityCostPerHour: getValue("electricityCostPerHour"),
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
        const draft = collectCurrentDraft();
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
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
        setValue("printHours", draft.printHours || "");
        setValue("machineRate", draft.machineRate || "");
        setValue("wasteWeight", draft.wasteWeight || "");
        setValue("manualMinutes", draft.manualMinutes || "");
        setValue("profitPercent", draft.profitPercent || "");
        setValue("discount", draft.discount || "");
        setValue("manualRate", draft.manualRate || "");
        setValue("packagingCost", draft.packagingCost || "");
        setValue("electricityCostPerHour", draft.electricityCostPerHour || "");
        setValue("failurePercent", draft.failurePercent || "");
        setValue("shippingCost", draft.shippingCost || "");
        setValue("taxPercent", draft.taxPercent || "");
        setValue("minimumOrderPrice", draft.minimumOrderPrice || "");
        setValue("roundingStep", draft.roundingStep || 5);

        const machineSelect = document.getElementById("machineSelect");
        if (machineSelect && draft.machineSelect) {
            machineSelect.value = draft.machineSelect;
        }

        const container = document.getElementById("orderMaterials");
        if (container && Array.isArray(draft.materialRows) && draft.materialRows.length > 0) {
            container.innerHTML = "";

            draft.materialRows.forEach((row) => {
                addOrderMaterialRow(row.materialId || "", row.weight || "");
            });
        }

        calculate();
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
    document.addEventListener("input", function () {
        saveCurrentDraft();
    });

    document.addEventListener("change", function () {
        saveCurrentDraft();
    });

    window.addEventListener("beforeunload", function () {
        saveCurrentDraft();
    });
}

/* ========================= */
/* OVERRIDE CLEAR AFTER SALE */
/* ========================= */

function clearOrderAfterSale() {
    clearCurrentDraft();

    setValue("clientName", "");
    setValue("modelName", "");
    setValue("orderNotes", "");
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

/* ========================= */
/* CLEAN INVOICE */
/* ========================= */

function buildInvoice(sale) {
    const lines = [
        "أهلاً بيك في MS Studio 3D 👋",
        "",
        `اسم العميل: ${sale.clientName || "-"}`,
        `اسم المنتج: ${sale.modelName || "-"}`
    ];

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

/* ========================= */
/* PRINT PDF FIX */
/* ========================= */

function printInvoice(id) {
    const sale = getSaleForAction(id);

    if (!sale) {
        toast("لا توجد فاتورة للطباعة");
        return;
    }

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
    } catch (e) {
        console.log(e);
    }

    toast("الطباعة تحتاج نسخة Android المحدثة");
}

/* ========================= */
/* WHATSAPP FIX */
/* ========================= */

function sendWhatsApp() {
    const sale = calculate();
    const text = buildInvoice(sale);

    try {
        if (window.Android && typeof window.Android.openWhatsApp === "function") {
            window.Android.openWhatsApp(text);
            return;
        }
    } catch (e) {
        console.log(e);
    }

    const url = "https://wa.me/?text=" + encodeURIComponent(text);
    window.location.href = url;
}
