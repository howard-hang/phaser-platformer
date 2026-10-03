package com.fangkuai.paoku;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

/**
 * 方块跑酷的原生壳。
 * WebView 铺满物理屏幕，包括挖孔和刘海。安全区只交给网页里的 HUD。
 */
public class MainActivity extends BridgeActivity {

    private static final int SKY = Color.parseColor("#c026d3");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // BridgeActivity 会在 super 里 setContentView。挖孔模式必须先写上，
        // 否则横屏会被系统按默认策略在左右留出对称空白。
        applyCutoutMode();
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // 关掉系统给状态栏、导航栏加的半透明底，否则沉浸式全屏还会剩一条灰边。
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        paintWindow();
        extendIntoCutout();
        hideSystemBars();
        publishDebugApkFlag();
    }

    @Override
    public void onResume() {
        super.onResume();
        extendIntoCutout();
        hideSystemBars();
        lockWebView();
        publishDebugApkFlag();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            extendIntoCutout();
            hideSystemBars();
        }
    }

    /**
     * API 30 起用 always，长边挖孔也能铺满。
     * 更早的系统没有 always，退回 shortEdges，横屏的左右短边仍然可以画进挖孔。
     */
    private int cutoutMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        }
        return WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }

    private void applyCutoutMode() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return;
        Window window = getWindow();
        WindowManager.LayoutParams attrs = window.getAttributes();
        attrs.layoutInDisplayCutoutMode = cutoutMode();
        window.setAttributes(attrs);
    }

    /**
     * 边缘到边缘，并且清掉 DecorView / WebView 上的安全区内缩。
     * Capacitor 的 SystemBars 在旧版 WebView 上会按挖孔和系统栏给窗口加 padding，
     * 横屏就会左右各空一条。这里改成不缩窗口，只把尺寸写成 CSS 变量给 HUD 用。
     */
    private void extendIntoCutout() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        applyCutoutMode();
        View decor = window.getDecorView();
        decor.setBackgroundColor(SKY);
        clearPaddingTree(decor);
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            clearPaddingTree(view);
            publishSafeArea(insets);
            return insets;
        });
        ViewCompat.requestApplyInsets(decor);
    }

    /** 沉浸式全屏：藏起状态栏和导航栏。从边缘滑出后会自动再藏回去。 */
    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decor);
        if (controller == null) return;
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
    }

    private void paintWindow() {
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(SKY));
        getWindow().getDecorView().setBackgroundColor(SKY);
    }

    /** 关掉回弹和滚动条，并保证 WebView 本身没有安全区 padding。 */
    private void lockWebView() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        View webView = getBridge().getWebView();
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setBackgroundColor(SKY);
        webView.setFitsSystemWindows(false);
        webView.setPadding(0, 0, 0, 0);
        ViewGroup.LayoutParams params = webView.getLayoutParams();
        if (params != null) {
            params.width = ViewGroup.LayoutParams.MATCH_PARENT;
            params.height = ViewGroup.LayoutParams.MATCH_PARENT;
            webView.setLayoutParams(params);
        }
    }

    private void clearPaddingTree(View view) {
        view.setPadding(0, 0, 0, 0);
        if (!(view instanceof ViewGroup)) return;
        ViewGroup group = (ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i += 1) {
            View child = group.getChildAt(i);
            child.setPadding(0, 0, 0, 0);
            if (child instanceof ViewGroup) clearPaddingTree(child);
        }
    }

    /**
     * 调试包把标记写成 true，网页因此强制用测试激励广告。
     * 正式包不可调试，标记是 false，再配合构建变量才会请求真实广告位。
     */
    private void publishDebugApkFlag() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        boolean debug = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        String script = "window.__FANGKUAI_DEBUG_APK__=" + debug + ";";
        getBridge().getWebView().evaluateJavascript(script, null);
    }

    /** 挖孔尺寸写成 CSS 变量。网页 HUD 读取，画布不因此缩小。 */
    private void publishSafeArea(WindowInsetsCompat insets) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        // 系统栏藏起来之后不要再按它的高度把 HUD 往里推，只避开挖孔和边缘手势。
        boolean barsVisible = insets.isVisible(WindowInsetsCompat.Type.systemBars());
        int types = WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.systemGestures();
        if (barsVisible) types |= WindowInsetsCompat.Type.systemBars();
        Insets cut = insets.getInsets(types);
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;
        int top = Math.round(cut.top / density);
        int right = Math.round(cut.right / density);
        int bottom = Math.round(cut.bottom / density);
        int left = Math.round(cut.left / density);
        String script = String.format(
            Locale.US,
            "document.documentElement.style.setProperty('--safe-area-inset-top','%dpx');"
                + "document.documentElement.style.setProperty('--safe-area-inset-right','%dpx');"
                + "document.documentElement.style.setProperty('--safe-area-inset-bottom','%dpx');"
                + "document.documentElement.style.setProperty('--safe-area-inset-left','%dpx');",
            top,
            right,
            bottom,
            left
        );
        getBridge().getWebView().evaluateJavascript(script, null);
    }
}
