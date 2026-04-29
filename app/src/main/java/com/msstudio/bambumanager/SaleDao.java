package com.msstudio.bambumanager;

import java.util.ArrayList;
import java.util.List;

public class SaleDao {

    private final List<SaleEntity> sales = new ArrayList<>();

    public List<SaleEntity> getAllSales() {
        return new ArrayList<>(sales);
    }

    public void insertSale(SaleEntity sale) {
        if (sale == null) {
            return;
        }

        deleteSale(sale.id);
        sales.add(0, sale);
    }

    public void deleteSale(String saleId) {
        if (saleId == null) {
            return;
        }

        sales.removeIf(sale -> saleId.equals(sale.id));
    }

    public void clearSales() {
        sales.clear();
    }
}
