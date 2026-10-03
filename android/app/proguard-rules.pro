# 正式包打开 R8。Capacitor 和 AdMob 靠反射、注解和 JavascriptInterface 找类，
# 只靠依赖自带的 consumer 规则不够，这里再留一层。

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,JavascriptInterface
-keepattributes SourceFile,LineNumberTable

# WebView 注入的桥。收掉之后正式包白屏，广告插件也调不到。
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor 插件。类名写在 capacitor.plugins.json 里，用反射加载。
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# 社区 AdMob 插件和 Google Mobile Ads / UMP。
-keep class com.getcapacitor.community.admob.** { *; }
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.ads.** { *; }
-keep class com.google.android.ump.** { *; }
-keep class com.google.android.gms.ads.identifier.** { *; }
-dontwarn com.google.android.gms.ads.**
-dontwarn com.google.android.ump.**

# 壳本身。隐私政策的 JavascriptInterface 在内部类上。
-keep class com.fangkuai.paoku.MainActivity { *; }
-keep class com.fangkuai.paoku.MainActivity$ExternalLinkBridge { *; }
