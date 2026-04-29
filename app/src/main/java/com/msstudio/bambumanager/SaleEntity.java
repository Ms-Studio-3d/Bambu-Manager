package com.msstudio.bambumanager;

public class SaleEntity {

    public String id;
    public String date;
    public String clientName;
    public String modelName;
    public String status;
    public String notes;

    public double finalPrice;
    public double totalCost;
    public double netProfit;

    public double printHours;
    public double materialWeight;
    public double wasteWeight;

    public SaleEntity() {
    }

    public SaleEntity(
            String id,
            String date,
            String clientName,
            String modelName,
            String status,
            String notes,
            double finalPrice,
            double totalCost,
            double netProfit,
            double printHours,
            double materialWeight,
            double wasteWeight
    ) {
        this.id = id;
        this.date = date;
        this.clientName = clientName;
        this.modelName = modelName;
        this.status = status;
        this.notes = notes;
        this.finalPrice = finalPrice;
        this.totalCost = totalCost;
        this.netProfit = netProfit;
        this.printHours = printHours;
        this.materialWeight = materialWeight;
        this.wasteWeight = wasteWeight;
    }
}
