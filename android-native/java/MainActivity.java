package com.goowatch.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** stremio:// nuvio:// goowatch:// link that opened the app (read once by the page). */
    public static String pendingLink;

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
