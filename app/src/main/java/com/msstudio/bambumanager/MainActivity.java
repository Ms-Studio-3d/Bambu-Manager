package com.msstudio.bambumanager;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final String APP_URL = "file:///android_asset/index.html";

    private static final String PREFS_NAME = "bambu_prefs";
    private static final String KEY_MAINTENANCE = "bambu_maint";
    private static final String KEY_DEFAULT_RATE = "def_rate";
    private static final String KEY_DEFAULT_FILAMENTS = "def_fils";
    private static final String KEY_APP_SETTINGS = "app_settings_v2";

    private WebView webView;
    private AppDatabase database;
    private SharedPreferences preferences;

    private final ExecutorService dbExecutor = Executors.newSingleThreadExecutor();

    public class AndroidBridge {
        @JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> {
                if (webView == null) {
                    return;
                }

                PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (printManager == null) {
                    return;
                }

                String jobName = getString(R.string.app_name) + " Invoice";
                PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(jobName);

                printManager.print(
                        jobName,
                        printAdapter,
                        new PrintAttributes.Builder().build()
                );
            });
        }

        @JavascriptInterface
        public String getAppSettings() {
            return preferences.getString(KEY_APP_SETTINGS, "");
        }

        @JavascriptInterface
        public void setAppSettings(String json) {
            preferences.edit()
                    .putString(KEY_APP_SETTINGS, json == null ? "" : json)
                    .apply();
        }

        @JavascriptInterface
        public String getMaintenanceHours() {
            return String.valueOf(preferences.getFloat(KEY_MAINTENANCE, 0f));
        }

        @JavascriptInterface
        public void setMaintenanceHours(String value) {
            float parsedValue = safeFloat(value);
            preferences.edit().putFloat(KEY_MAINTENANCE, parsedValue).apply();
        }

        @JavascriptInterface
        public String getDefaultRate() {
            return preferences.getString(KEY_DEFAULT_RATE, null);
        }

        @JavascriptInterface
        public void setDefaultRate(String value) {
            preferences.edit()
                    .putString(KEY_DEFAULT_RATE, value == null ? "0" : value)
                    .apply();
        }

        @JavascriptInterface
        public String getDefaultFilaments() {
            return preferences.getString(KEY_DEFAULT_FILAMENTS, "[]");
        }

        @JavascriptInterface
        public void setDefaultFilaments(String json) {
            preferences.edit()
                    .putString(KEY_DEFAULT_FILAMENTS, json == null ? "[]" : json)
                    .apply();
        }

        @JavascriptInterface
        public void saveSale(String saleJson) {
            dbExecutor.execute(() -> {
                try {
                    JSONObject obj = new JSONObject(saleJson);

                    SaleEntity sale = new SaleEntity(
                            obj.optLong("id", System.currentTimeMillis()),
                            obj.optString("date", ""),
                            obj.optString("client", "عميل"),
                            obj.optString("model", "مجسم"),
                            obj.optDouble("sale", obj.optDouble("finalPrice", 0)),
                            obj.optDouble("profit", obj.optDouble("netProfit", 0)),
                            obj.optDouble("hours", 0),
                            obj.optDouble("weight", 0),
                            obj.optDouble("waste", 0),

                            obj.optString("printerName", ""),
                            obj.optDouble("machineRate", 0),
                            obj.optDouble("machineCost", 0),
                            obj.optString("materialsJson", "[]"),
                            obj.optDouble("materialCost", 0),
                            obj.optDouble("averageGramCost", 0),
                            obj.optDouble("wasteCost", 0),
                            obj.optDouble("manualMinutes", 0),
                            obj.optDouble("manualRate", 0),
                            obj.optDouble("manualCost", 0),
                            obj.optDouble("packagingCost", 0),
                            obj.optDouble("totalCost", 0),
                            obj.optDouble("profitPercent", 0),
                            obj.optDouble("priceBeforeDiscount", 0),
                            obj.optDouble("discount", 0),
                            obj.optDouble("priceAfterDiscount", 0),
                            obj.optDouble("finalPrice", obj.optDouble("sale", 0)),
                            obj.optDouble("netProfit", obj.optDouble("profit", 0))
                    );

                    database.saleDao().insert(sale);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public String getSales() {
            try {
                List<SaleEntity> sales = database.saleDao().getAllSales();
                JSONArray array = new JSONArray();

                for (SaleEntity sale : sales) {
                    JSONObject obj = new JSONObject();

                    obj.put("id", sale.id);
                    obj.put("date", sale.date);
                    obj.put("client", sale.client);
                    obj.put("model", sale.model);
                    obj.put("sale", sale.sale);
                    obj.put("profit", sale.profit);
                    obj.put("hours", sale.hours);
                    obj.put("weight", sale.weight);
                    obj.put("waste", sale.waste);

                    obj.put("printerName", sale.printerName);
                    obj.put("machineRate", sale.machineRate);
                    obj.put("machineCost", sale.machineCost);
                    obj.put("materialsJson", sale.materialsJson);
                    obj.put("materialCost", sale.materialCost);
                    obj.put("averageGramCost", sale.averageGramCost);
                    obj.put("wasteCost", sale.wasteCost);
                    obj.put("manualMinutes", sale.manualMinutes);
                    obj.put("manualRate", sale.manualRate);
                    obj.put("manualCost", sale.manualCost);
                    obj.put("packagingCost", sale.packagingCost);
                    obj.put("totalCost", sale.totalCost);
                    obj.put("profitPercent", sale.profitPercent);
                    obj.put("priceBeforeDiscount", sale.priceBeforeDiscount);
                    obj.put("discount", sale.discount);
                    obj.put("priceAfterDiscount", sale.priceAfterDiscount);
                    obj.put("finalPrice", sale.finalPrice);
                    obj.put("netProfit", sale.netProfit);

                    array.put(obj);
                }

                return array.toString();
            } catch (Exception e) {
                return "[]";
            }
        }

        @JavascriptInterface
        public void deleteSale(String saleId) {
            dbExecutor.execute(() -> {
                try {
                    long id = Long.parseLong(saleId);
                    database.saleDao().deleteById(id);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void clearAllSales() {
            dbExecutor.execute(() -> {
                try {
                    database.saleDao().deleteAll();
                } catch (Exception ignored) {
                }
            });
        }

        private float safeFloat(String value) {
            try {
                return Float.parseFloat(value);
            } catch (Exception e) {
                return 0f;
            }
        }
    }

    @SuppressLint({"SetJavaScriptEnabled"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        database = AppDatabase.getInstance(this);

        webView = findViewById(R.id.webView);
        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(APP_URL);
        }

        setupBackHandler();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(createWebViewClient());

        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);
        webView.setScrollBarStyle(WebView.SCROLLBARS_INSIDE_OVERLAY);

        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN) {
            settings.setAllowFileAccessFromFileURLs(false);
            settings.setAllowUniversalAccessFromFileURLs(false);
        }

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
    }

    private WebViewClient createWebViewClient() {
        return new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    return false;
                }

                return handleUrl(request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }
        };
    }

    private boolean handleUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            return true;
        }

        if (isLocalAppUrl(url)) {
            return false;
        }

        if (isWhatsAppUrl(url)) {
            return openExternalUrl(url);
        }

        if (url.startsWith("tel:")
                || url.startsWith("mailto:")
                || url.startsWith("intent:")
                || url.startsWith("market:")
                || url.startsWith("https://")
                || url.startsWith("http://")) {
            return openExternalUrl(url);
        }

        return false;
    }

    private boolean isLocalAppUrl(String url) {
        return url.startsWith("file:///android_asset/")
                || url.startsWith("about:blank")
                || url.startsWith("data:")
                || url.startsWith("blob:");
    }

    private boolean isWhatsAppUrl(String url) {
        return url.startsWith("https://api.whatsapp.com/")
                || url.startsWith("https://wa.me/")
                || url.startsWith("whatsapp://");
    }

    private boolean openExternalUrl(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return true;
        } catch (Exception e) {
            return true;
        }
    }

    private void setupBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }

        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();

        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }

        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.removeJavascriptInterface("Android");
            webView.destroy();
            webView = null;
        }

        dbExecutor.shutdown();

        super.onDestroy();
    }
}
