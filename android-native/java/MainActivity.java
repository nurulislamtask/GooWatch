package com.goowatch.app;

import android.app.Activity;
import android.content.Intent;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** stremio:// nuvio:// goowatch:// link that opened the app (read once by the page). */
    public static String pendingLink;

    /** Full screen: no status bar / navigation bar (they slide in for a moment when you swipe from the edge). */
    public static boolean immersive = true;

    public static void applyImmersive(Activity a) {
        try {
            if (a == null || a.getWindow() == null) return;
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(a.getWindow(), a.getWindow().getDecorView());
            if (c == null) return;
            if (immersive) {
                if (android.os.Build.VERSION.SDK_INT >= 28) {
                    WindowManager.LayoutParams lp = a.getWindow().getAttributes();
                    lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                    a.getWindow().setAttributes(lp);
                }
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                c.show(WindowInsetsCompat.Type.systemBars());
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyImmersive(this);
    }

    private void readLink(Intent i) {
        if (i != null && Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) {
            pendingLink = i.getDataString();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readLink(intent);
        if (pendingLink != null && getBridge() != null) {
            try { getBridge().triggerWindowJSEvent("goowatchlink"); } catch (Throwable ignored) {}
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePlayerPlugin.class);
        readLink(getIntent());
        super.onCreate(savedInstanceState);
        applyImmersive(this);

        // Back button: let the page close its top screen (details, search, tab) first; leave the app only from Home
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web == null) {
                    moveTaskToBack(true);
                    return;
                }
                web.evaluateJavascript(
                    "(function(){try{return window.__cineBack?String(window.__cineBack()):'false'}catch(e){return 'false'}})()",
                    value -> {
                        if (value == null || !value.contains("true")) moveTaskToBack(true);
                    });
            }
        });
    }
}
