package com.msstudio.bambumanager;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
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

public class MainActivity extends AppCompatActivity {

    private static final String APP_URL = "file:///android_asset/index.html";

    private WebView webView;

    public class AndroidBridge {
        @JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> {
                if (webView == null) return;

                PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (printManager == null) return;

                String jobName = getString(R.string.app_name) + " Invoice";
                PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(jobName);

                printManager.print(
                        jobName,
                        printAdapter,
                        new PrintAttributes.Builder().build()
                );
            });
        }
    }

    @SuppressLint({"SetJavaScriptEnabled"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

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

                return handleUrl(view, request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(view, url);
            }
        };
    }

    private boolean handleUrl(WebView view, String url) {
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

        return true;
    }

    private boolean isLocalAppUrl(String url) {
        return url.startsWith("file:///android_asset/")
                || url.startsWith("about:blank")
                || url.startsWith("data:");
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
        super.onDestroy();
    }
}
