package com.msstudio.bambumanager;

import android.content.Context;

public final class AppDatabase {

    private static volatile AppDatabase INSTANCE;

    private final SaleDao saleDao;

    private AppDatabase(Context context) {
        this.saleDao = new SaleDao();
    }

    public static AppDatabase getInstance(Context context) {
        if (INSTANCE == null) {
            synchronized (AppDatabase.class) {
                if (INSTANCE == null) {
                    INSTANCE = new AppDatabase(context.getApplicationContext());
                }
            }
        }

        return INSTANCE;
    }

    public SaleDao saleDao() {
        return saleDao;
    }
}
