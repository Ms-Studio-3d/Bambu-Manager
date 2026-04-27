package com.msstudio.bambumanager;

import android.annotation.SuppressLint;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.SafeBrowsingResponse;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "BambuManager";

    private static final String APP_URL = "file:///android_asset/index.html";

    private static final String PREFS_NAME = "bambu_manager_prefs";
    private static final String KEY_APP_SETTINGS = "app_settings_json";
    private static final String KEY_SALES = "sales_json";
    private static final String KEY_MAINTENANCE_HOURS = "maintenance_hours";

    private WebView webView;
    private SharedPreferences prefs;

    public class AndroidBridge {

        @JavascriptInterface
        public String getAppSettings() {
            try {
                return prefs.getString(KEY_APP_SETTINGS, "");
            } catch (Exception e) {
                Log.e(TAG, "getAppSettings failed", e);
                return "";
            }
        }

        @JavascriptInterface
        public void setAppSettings(String settingsJson) {
            try {
                if (settingsJson == null) {
                    Log.w(TAG, "setAppSettings ignored null settingsJson");
                    return;
                }

                new JSONObject(settingsJson);

                prefs.edit()
                        .putString(KEY_APP_SETTINGS, settingsJson)
                        .apply();

            } catch (Exception e) {
                Log.e(TAG, "setAppSettings failed", e);
                showToastOnUi("حدث خطأ أثناء حفظ الإعدادات");
            }
        }

        @JavascriptInterface
        public String getSales() {
            try {
                return prefs.getString(KEY_SALES, "[]");
            } catch (Exception e) {
                Log.e(TAG, "getSales failed", e);
                return "[]";
            }
        }

        @JavascriptInterface
        public void saveSale(String saleJson) {
            try {
                if (saleJson == null || saleJson.trim().isEmpty()) {
                    Log.w(TAG, "saveSale ignored empty saleJson");
                    showToastOnUi("بيانات البيعة غير صالحة");
                    return;
                }

                JSONObject sale = new JSONObject(saleJson);

                String rawSales = prefs.getString(KEY_SALES, "[]");
                JSONArray oldSales;

                try {
                    oldSales = new JSONArray(rawSales == null || rawSales.trim().isEmpty() ? "[]" : rawSales);
                } catch (Exception e) {
                    Log.e(TAG, "Existing sales JSON is corrupted, resetting sales list", e);
                    oldSales = new JSONArray();
                }

                JSONArray newSales = new JSONArray();
                newSales.put(sale);

                for (int i = 0; i < oldSales.length(); i++) {
                    newSales.put(oldSales.get(i));
                }

                prefs.edit()
                        .putString(KEY_SALES, newSales.toString())
                        .apply();

            } catch (Exception e) {
                Log.e(TAG, "saveSale failed", e);
                showToastOnUi("حدث خطأ أثناء حفظ البيعة");
            }
        }

        @JavascriptInterface
        public void deleteSale(String saleId) {
            try {
                if (saleId == null || saleId.trim().isEmpty()) {
                    Log.w(TAG, "deleteSale ignored empty saleId");
                    return;
                }

                String rawSales = prefs.getString(KEY_SALES, "[]");
                JSONArray oldSales;

                try {
                    oldSales = new JSONArray(rawSales == null || rawSales.trim().isEmpty() ? "[]" : rawSales);
                } catch (Exception e) {
                    Log.e(TAG, "Existing sales JSON is corrupted, resetting sales list", e);
                    oldSales = new JSONArray();
                }

                JSONArray newSales = new JSONArray();

                for (int i = 0; i < oldSales.length(); i++) {
                    JSONObject sale = oldSales.optJSONObject(i);

                    if (sale == null) {
                        continue;
                    }

                    String id = String.valueOf(sale.opt("id"));

                    if (!saleId.equals(id)) {
                        newSales.put(sale);
                    }
                }

                prefs.edit()
                        .putString(KEY_SALES, newSales.toString())
                        .apply();

            } catch (Exception e) {
                Log.e(TAG, "deleteSale failed", e);
                showToastOnUi("تعذر حذف البيعة");
            }
        }

        @JavascriptInterface
        public void clearAllSales() {
            try {
                prefs.edit()
                        .putString(KEY_SALES, "[]")
                        .apply();

            } catch (Exception e) {
                Log.e(TAG, "clearAllSales failed", e);
                showToastOnUi("تعذر مسح السجل");
            }
        }

        @JavascriptInterface
        public void setMaintenanceHours(String hours) {
            try {
                String safeHours = hours == null ? "0" : hours;

                prefs.edit()
                        .putString(KEY_MAINTENANCE_HOURS, safeHours)
                        .apply();

            } catch (Exception e) {
                Log.e(TAG, "setMaintenanceHours failed", e);
            }
        }

        @JavascriptInterface
        public String getMaintenanceHours() {
            try {
                return prefs.getString(KEY_MAINTENANCE_HOURS, "0");
            } catch (Exception e) {
                Log.e(TAG, "getMaintenanceHours failed", e);
                return "0";
            }
        }

        @JavascriptInterface
        public void exportCSV(String csvContent, String fileName) {
            try {
                if (csvContent == null || csvContent.trim().isEmpty()) {
                    showToastOnUi("لا توجد بيانات للتصدير");
                    return;
                }

                String safeFileName = makeSafeCsvFileName(fileName);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    saveCsvToDownloadsAndroid10Plus(csvContent, safeFileName);
                } else {
                    saveCsvToAppDocuments(csvContent, safeFileName);
                }

            } catch (Exception e) {
                Log.e(TAG, "exportCSV failed", e);
                showToastOnUi("تعذر حفظ ملف CSV");
            }
        }

        @JavascriptInterface
        public void printPage() {
            printCurrentWebView();
        }

        @JavascriptInterface
        public void printPage(String html) {
            if (html == null || html.trim().isEmpty()) {
                printCurrentWebView();
                return;
            }

            printHtmlInSeparateWebView(html);
        }

        @JavascriptInterface
        public void showToast(String message) {
            showToastOnUi(message);
        }

        @JavascriptInterface
        public void logError(String message) {
            Log.e(TAG, message == null ? "Unknown JavaScript error" : message);
        }

        @JavascriptInterface
        public void logInfo(String message) {
            Log.i(TAG, message == null ? "JavaScript info" : message);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            setContentView(R.layout.activity_main);

            webView = findViewById(R.id.webView);
            if (webView == null) {
                Log.e(TAG, "WebView not found in activity_main.xml");
                showToastOnUi("خطأ في تحميل واجهة التطبيق");
                finish();
                return;
            }

            configureWebView(webView);
            webView.addJavascriptInterface(new AndroidBridge(), "Android");

            if (savedInstanceState != null) {
                webView.restoreState(savedInstanceState);
            } else {
                webView.loadUrl(APP_URL);
            }

            configureBackButton();

        } catch (Exception e) {
            Log.e(TAG, "onCreate failed", e);
            showToastOnUi("حدث خطأ أثناء تشغيل التطبيق");
            finish();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView targetWebView) {
        WebSettings settings = targetWebView.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setLoadsImagesAutomatically(true);

        settings.setBlockNetworkImage(true);

        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);

        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);

        settings.setMediaPlaybackRequiresUserGesture(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        targetWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        targetWebView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);

        targetWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                if (consoleMessage != null) {
                    String message = consoleMessage.message();
                    int lineNumber = consoleMessage.lineNumber();
                    String sourceId = consoleMessage.sourceId();

                    switch (consoleMessage.messageLevel()) {
                        case ERROR:
                            Log.e(TAG, "JS error: " + message + " at " + sourceId + ":" + lineNumber);
                            break;
                        case WARNING:
                            Log.w(TAG, "JS warning: " + message + " at " + sourceId + ":" + lineNumber);
                            break;
                        default:
                            Log.d(TAG, "JS console: " + message + " at " + sourceId + ":" + lineNumber);
                            break;
                    }
                }

                return true;
            }
        });

        targetWebView.setWebViewClient(new WebViewClient() {

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                Log.i(TAG, "Page loading started: " + url);
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "Page loading finished: " + url);
                super.onPageFinished(view, url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    return true;
                }

                String url = request.getUrl().toString();

                if (isAllowedLocalUrl(url)) {
                    return false;
                }

                Log.w(TAG, "Blocked external navigation: " + url);
                showToastOnUi("التطبيق يعمل أوفلاين، تم منع فتح رابط خارجي");
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (isAllowedLocalUrl(url)) {
                    return false;
                }

                Log.w(TAG, "Blocked external navigation: " + url);
                showToastOnUi("التطبيق يعمل أوفلاين، تم منع فتح رابط خارجي");
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    return super.shouldInterceptRequest(view, request);
                }

                Uri uri = request.getUrl();
                String url = uri.toString();

                if (isAllowedLocalUrl(url)) {
                    return super.shouldInterceptRequest(view, request);
                }

                Log.w(TAG, "Blocked external resource: " + url);

                return new WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        new ByteArrayInputStream(new byte[0])
                );
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                if (isAllowedLocalUrl(url)) {
                    return super.shouldInterceptRequest(view, url);
                }

                Log.w(TAG, "Blocked external resource: " + url);

                return new WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        new ByteArrayInputStream(new byte[0])
                );
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);

                if (request == null || !request.isForMainFrame()) {
                    return;
                }

                String failingUrl = request.getUrl() == null ? "unknown" : request.getUrl().toString();
                String description = "unknown";

                if (error != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    description = String.valueOf(error.getDescription());
                }

                Log.e(TAG, "Main frame load error: " + description + " URL: " + failingUrl);
                showToastOnUi("حدث خطأ أثناء تحميل واجهة التطبيق");
            }

            @Override
            public void onSafeBrowsingHit(
                    WebView view,
                    WebResourceRequest request,
                    int threatType,
                    SafeBrowsingResponse callback
            ) {
                Log.e(TAG, "Safe browsing blocked threat type: " + threatType);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1 && callback != null) {
                    callback.backToSafety(true);
                }

                showToastOnUi("تم منع محتوى غير آمن");
            }
        });
    }

    private boolean isAllowedLocalUrl(String url) {
        if (url == null) {
            return false;
        }

        return url.startsWith("file:///android_asset/")
                || url.startsWith("about:blank")
                || url.startsWith("data:")
                || url.startsWith("blob:");
    }

    private void configureBackButton() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                try {
                    if (webView != null && webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        finish();
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Back press failed", e);
                    finish();
                }
            }
        });
    }

    private void printCurrentWebView() {
        runOnUiThread(() -> {
            try {
                if (webView == null) {
                    showToastOnUi("الطباعة غير متاحة الآن");
                    Log.e(TAG, "printCurrentWebView failed: webView is null");
                    return;
                }

                PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (printManager == null) {
                    showToastOnUi("خدمة الطباعة غير متاحة على الجهاز");
                    Log.e(TAG, "printCurrentWebView failed: PrintManager is null");
                    return;
                }

                String jobName = getString(R.string.app_name) + " Invoice";
                PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(jobName);

                PrintAttributes printAttributes = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build();

                printManager.print(jobName, printAdapter, printAttributes);

            } catch (Exception e) {
                Log.e(TAG, "printCurrentWebView failed", e);
                showToastOnUi("حدث خطأ أثناء الطباعة");
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void printHtmlInSeparateWebView(String html) {
        runOnUiThread(() -> {
            try {
                WebView printWebView = new WebView(MainActivity.this);
                configurePrintOnlyWebView(printWebView);

                printWebView.setWebViewClient(new WebViewClient() {
                    private boolean printed = false;

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);

                        if (printed) {
                            return;
                        }

                        printed = true;

                        view.postDelayed(() -> {
                            try {
                                PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
                                if (printManager == null) {
                                    showToastOnUi("خدمة الطباعة غير متاحة على الجهاز");
                                    destroyPrintWebView(view);
                                    return;
                                }

                                String jobName = getString(R.string.app_name) + " Invoice";
                                PrintDocumentAdapter printAdapter = view.createPrintDocumentAdapter(jobName);

                                PrintAttributes printAttributes = new PrintAttributes.Builder()
                                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                        .build();

                                printManager.print(jobName, printAdapter, printAttributes);

                                view.postDelayed(() -> destroyPrintWebView(view), 3000);

                            } catch (Exception e) {
                                Log.e(TAG, "printHtmlInSeparateWebView print failed", e);
                                showToastOnUi("حدث خطأ أثناء الطباعة");
                                destroyPrintWebView(view);
                            }
                        }, 350);
                    }
                });

                printWebView.loadDataWithBaseURL(
                        "file:///android_asset/",
                        html,
                        "text/html",
                        "UTF-8",
                        null
                );

            } catch (Exception e) {
                Log.e(TAG, "printHtmlInSeparateWebView failed", e);
                showToastOnUi("حدث خطأ أثناء تجهيز الفاتورة للطباعة");
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configurePrintOnlyWebView(WebView printWebView) {
        WebSettings settings = printWebView.getSettings();

        settings.setJavaScriptEnabled(false);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setLoadsImagesAutomatically(true);

        settings.setBlockNetworkImage(true);

        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);

        settings.setUseWideViewPort(false);
        settings.setLoadWithOverviewMode(false);

        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
    }

    private void destroyPrintWebView(WebView view) {
        try {
            if (view != null) {
                view.stopLoading();
                view.clearHistory();
                view.destroy();
            }
        } catch (Exception e) {
            Log.e(TAG, "destroyPrintWebView failed", e);
        }
    }

    private String makeSafeCsvFileName(String fileName) {
        String safeName = fileName == null || fileName.trim().isEmpty()
                ? "bambu-sales.csv"
                : fileName.trim();

        safeName = safeName
                .replace("\\", "_")
                .replace("/", "_")
                .replace(":", "_")
                .replace("*", "_")
                .replace("?", "_")
                .replace("\"", "_")
                .replace("<", "_")
                .replace(">", "_")
                .replace("|", "_");

        if (!safeName.toLowerCase().endsWith(".csv")) {
            safeName = safeName + ".csv";
        }

        return safeName;
    }

    private void saveCsvToDownloadsAndroid10Plus(String csvContent, String fileName) throws Exception {
        ContentResolver resolver = getContentResolver();

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, "text/csv");
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Bambu Manager");
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);

        if (uri == null) {
            throw new IllegalStateException("Failed to create CSV file in Downloads");
        }

        try (OutputStream outputStream = resolver.openOutputStream(uri)) {
            if (outputStream == null) {
                throw new IllegalStateException("Failed to open CSV output stream");
            }

            outputStream.write(csvContent.getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
        }

        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, values, null, null);

        showToastOnUi("تم حفظ CSV في Downloads / Bambu Manager");
        Log.i(TAG, "CSV saved to Downloads: " + fileName);
    }

    private void saveCsvToAppDocuments(String csvContent, String fileName) throws Exception {
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);

        if (dir == null) {
            dir = getFilesDir();
        }

        File bambuDir = new File(dir, "Bambu Manager");

        if (!bambuDir.exists() && !bambuDir.mkdirs()) {
            throw new IllegalStateException("Failed to create documents directory");
        }

        File file = new File(bambuDir, fileName);

        try (FileOutputStream outputStream = new FileOutputStream(file)) {
            outputStream.write(csvContent.getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
        }

        showToastOnUi("تم حفظ CSV داخل ملفات التطبيق");
        Log.i(TAG, "CSV saved to: " + file.getAbsolutePath());
    }

    private void showToastOnUi(String message) {
        runOnUiThread(() -> {
            String safeMessage = message == null || message.trim().isEmpty()
                    ? "حدث خطأ غير معروف"
                    : message;

            Toast.makeText(MainActivity.this, safeMessage, Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        try {
            if (webView != null) {
                webView.saveState(outState);
            }
        } catch (Exception e) {
            Log.e(TAG, "Saving WebView state failed", e);
        }

        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        try {
            if (webView != null) {
                webView.removeJavascriptInterface("Android");
                webView.stopLoading();
                webView.clearHistory();
                webView.destroy();
                webView = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Destroying WebView failed", e);
        }

        super.onDestroy();
    }
}
