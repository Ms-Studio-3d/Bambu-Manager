package com.msstudio.bambumanager;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "sales")
public class SaleEntity {
    @PrimaryKey
    public long id;

    @NonNull
    public String date;

    @NonNull
    public String client;

    @NonNull
    public String model;

    public double sale;
    public double profit;
    public double hours;
    public double weight;
    public double waste;

    @NonNull
    public String printerName;

    public double machineRate;
    public double machineCost;

    @NonNull
    public String materialsJson;

    public double materialCost;
    public double averageGramCost;
    public double wasteCost;

    public double manualMinutes;
    public double manualRate;
    public double manualCost;

    public double packagingCost;
    public double totalCost;

    public double profitPercent;
    public double priceBeforeDiscount;
    public double discount;
    public double priceAfterDiscount;

    public double finalPrice;
    public double netProfit;

    public SaleEntity(
            long id,
            @NonNull String date,
            @NonNull String client,
            @NonNull String model,
            double sale,
            double profit,
            double hours,
            double weight,
            double waste,
            @NonNull String printerName,
            double machineRate,
            double machineCost,
            @NonNull String materialsJson,
            double materialCost,
            double averageGramCost,
            double wasteCost,
            double manualMinutes,
            double manualRate,
            double manualCost,
            double packagingCost,
            double totalCost,
            double profitPercent,
            double priceBeforeDiscount,
            double discount,
            double priceAfterDiscount,
            double finalPrice,
            double netProfit
    ) {
        this.id = id;
        this.date = date;
        this.client = client;
        this.model = model;
        this.sale = sale;
        this.profit = profit;
        this.hours = hours;
        this.weight = weight;
        this.waste = waste;

        this.printerName = printerName;
        this.machineRate = machineRate;
        this.machineCost = machineCost;
        this.materialsJson = materialsJson;
        this.materialCost = materialCost;
        this.averageGramCost = averageGramCost;
        this.wasteCost = wasteCost;
        this.manualMinutes = manualMinutes;
        this.manualRate = manualRate;
        this.manualCost = manualCost;
        this.packagingCost = packagingCost;
        this.totalCost = totalCost;
        this.profitPercent = profitPercent;
        this.priceBeforeDiscount = priceBeforeDiscount;
        this.discount = discount;
        this.priceAfterDiscount = priceAfterDiscount;
        this.finalPrice = finalPrice;
        this.netProfit = netProfit;
    }
}
