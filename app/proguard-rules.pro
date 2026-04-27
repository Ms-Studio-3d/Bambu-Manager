# Keep JavaScript bridge methods used by WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep the bridge and main activity stable for WebView calls.
-keep class com.msstudio.bambumanager.MainActivity { *; }
-keep class com.msstudio.bambumanager.MainActivity$AndroidBridge { *; }

# Keep JSON model access safe.
-keep class org.json.** { *; }

# AndroidX WebKit.
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**
