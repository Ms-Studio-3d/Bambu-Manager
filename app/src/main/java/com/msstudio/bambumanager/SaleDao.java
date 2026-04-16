package com.msstudio.bambumanager;

import androidx.room.Dao;
import androidx.room.Delete;
import androidx.room.Insert;
import androidx.room.Query;

import java.util.List;

@Dao
public interface SaleDao {

    @Query("SELECT * FROM sales ORDER BY id DESC")
    List<SaleEntity> getAllSales();

    @Insert
    void insert(SaleEntity sale);

    @Query("DELETE FROM sales WHERE id = :saleId")
    void deleteById(long saleId);

    @Query("DELETE FROM sales")
    void deleteAll();
}
