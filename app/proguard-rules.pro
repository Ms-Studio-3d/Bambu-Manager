# Keep JavaScript bridge methods used by WebView.
# Methods annotated with @JavascriptInterface are called from index.html at runtime.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep the main activity and its inner bridge class names stable.
-keep class com.msstudio.bambumanager.MainActivity { *; }
-keep class com.msstudio.bambumanager.MainActivity$AndroidBridge { *; }

# Keep AndroidX WebKit classes.
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**

# Keep app resources and generated BuildConfig safe.
-keep class com.msstudio.bambumanager.BuildConfig { *; }
