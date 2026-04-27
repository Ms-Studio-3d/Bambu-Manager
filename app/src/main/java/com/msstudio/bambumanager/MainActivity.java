package com.msstudio.bambumanager;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
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
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "BambuManager";
    private static final String APP_URL = "file:///android_asset/index.html";

    private WebView webView;

    public class AndroidBridge {

        @JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> {
                try {
                    if (webView == null) {
                        showToast("الطباعة غير متاحة الآن");
                        Log.e(TAG, "printPage failed: webView is null");
                        return;
                    }

                    PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
                    if (printManager == null) {
                        showToast("خدمة الطباعة غير متاحة على الجهاز");
                        Log.e(TAG, "printPage failed: PrintManager is null");
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
                    Log.e(TAG, "printPage failed", e);
                    showToast("حدث خطأ أثناء الطباعة");
                }
            });
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> MainActivity.this.showToast(message));
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
            setContentView(R.layout.activity_main);

            webView = findViewById(R.id.webView);
            if (webView == null) {
                Log.e(TAG, "WebView not found in activity_main.xml");
                showToast("خطأ في تحميل واجهة التطبيق");
                finish();
                return;
            }

            configureWebView();

            webView.addJavascriptInterface(new AndroidBridge(), "Android");

            if (savedInstanceState != null) {
                webView.restoreState(savedInstanceState);
            } else {
                webView.loadUrl(APP_URL);
            }

            configureBackButton();

        } catch (Exception e) {
            Log.e(TAG, "onCreate failed", e);
            showToast("حدث خطأ أثناء تشغيل التطبيق");
            finish();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setLoadsImagesAutomatically(true);

        /*
         * Offline-first hardening:
         * - The app loads local assets only.
         * - Network images are blocked.
         * - External URLs are blocked in shouldOverrideUrlLoading.
         * - No INTERNET permission exists in AndroidManifest.xml.
         */
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

        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);

        webView.setWebChromeClient(new WebChromeClient() {
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

        webView.setWebViewClient(new WebViewClient() {

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
                showToast("التطبيق يعمل أوفلاين، تم منع فتح رابط خارجي");
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
                        null
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
                showToast("حدث خطأ أثناء تحميل واجهة التطبيق");
            }

            @Override
            public void onSafeBrowsingHit(
                    WebView view,
                    WebResourceRequest request,
                    int threatType,
                    SafeBrowsingResponse callback
            ) {
                Log.e(TAG, "Safe browsing blocked threat type: " + threatType);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && callback != null) {
                    callback.backToSafety(true);
                }

                showToast("تم منع محتوى غير آمن");
            }
        });
    }

    private boolean isAllowedLocalUrl(String url) {
        if (url == null) {
            return false;
        }

        return url.startsWith("file:///android_asset/")
                || url.startsWith("about:blank")
                || url.startsWith("data:");
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

    private void showToast(String message) {
        String safeMessage = message == null || message.trim().isEmpty()
                ? "حدث خطأ غير معروف"
                : message;

        Toast.makeText(this, safeMessage, Toast.LENGTH_SHORT).show();
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
