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

    public SaleEntity(long id,
                      @NonNull String date,
                      @NonNull String client,
                      @NonNull String model,
                      double sale,
                      double profit,
                      double hours,
                      double weight,
                      double waste) {
        this.id = id;
        this.date = date;
        this.client = client;
        this.model = model;
        this.sale = sale;
        this.profit = profit;
        this.hours = hours;
        this.weight = weight;
        this.waste = waste;
    }
}
