package com.goowatch.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.ScrollView;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.Context;
import android.net.wifi.WifiManager;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONArray;
import org.json.JSONObject;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.RendererDiscoverer;
import org.videolan.libvlc.RendererItem;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import java.util.Locale;

/**
 * GooWatch's one and only phone player (libVLC engine): plays practically every file, hardware decoding
 * with automatic software fallback, gestures, audio / subtitle track picker, online subtitle search
 * (and automatic subtitles), speed, aspect ratio, next / previous.
 */
public class VlcPlayerActivity extends AppCompatActivity {

    private LibVLC libVlc;
    private MediaPlayer mp;
    private SurfaceView surface;
    private LinearLayout topBar, bottomBar;
    private TextView titleView, timeView, durView, playBtn, hud, audioBtn, hwBtn, speedBtn, aspectBtn, prevBtn, nextBtn;
    private LinearLayout centerBar, panelBox;
    private FrameLayout panelHolder;
    private int panelSeason = 0;
    private int requestIdx = -1;
    private final ArrayList<String> thumbs = new ArrayList<>();
    private final ArrayList<String> overviews = new ArrayList<>();
    private final ArrayList<String> releases = new ArrayList<>();
    private final ArrayList<String> epTitles = new ArrayList<>();
    private final ArrayList<Boolean> lazy = new ArrayList<>();
    private final LruCache<String, Bitmap> imgCache = new LruCache<>(60);
    private SeekBar seek;
    private AudioManager audio;
    private final Handler ui = new Handler(Looper.getMainLooper());

    // queue
    private final ArrayList<String> urls = new ArrayList<>();
    private final ArrayList<String> titles = new ArrayList<>();
    private final ArrayList<String> queries = new ArrayList<>();
    private final ArrayList<Integer> years = new ArrayList<>();
    private final ArrayList<Integer> seasons = new ArrayList<>();
    private final ArrayList<Integer> episodes = new ArrayList<>();
    private final ArrayList<List<String>> extSubs = new ArrayList<>();
    private final ArrayList<String> referers = new ArrayList<>();
    private final ArrayList<String> agents = new ArrayList<>();
    private int index = 0;
    private long pendingStart = 0L;

    // state
    private boolean finishedOnce = false;
    private boolean userSeeking = false;
    private boolean hardware = true;
    private boolean canQuality = false;
    private boolean surfaceReady = false;
    private boolean started = false;
    private boolean playingSeen = false;
    private boolean triedSoftware = false;
    private boolean autoSubs = true;
    private boolean autoSubsDone = false;
    private String subLang = "eng";
    private String errorText = null;
    private long lastDuration = 0L;
    private long lastTime = 0L;
    private int aspectMode = 0;
    private final String[] ASPECT = {"Fit", "16:9", "4:3", "Fill"};
    private int speedIdx = 1;
    private final float[] SPEEDS = {0.75f, 1f, 1.25f, 1.5f, 2f};

    // gestures
    private int gesture = 0; // 0 none, 1 brightness, 2 volume, 3 seek
    private float brightnessNow = 0.5f;
    private int volumeStart = 0;
    private long seekBase = 0, seekTarget = 0;
    private boolean longPress = false;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (mp != null) {
                long len = mp.getLength();
                long t = mp.getTime();
                if (len > 0) lastDuration = len;
                if (t >= 0) lastTime = t;
                if (!userSeeking && lastDuration > 0) {
                    seek.setMax((int) (lastDuration / 1000));
                    seek.setProgress((int) (lastTime / 1000));
                }
                timeView.setText(fmt(lastTime));
                durView.setText(fmt(lastDuration));
                playBtn.setText(mp.isPlaying() ? "❚❚" : "▶");
            }
            ui.postDelayed(this, 500);
        }
    };
    // screen lock (touches are ignored until Unlock is pressed) and casting (Chromecast / DLNA TVs on the same Wi-Fi)
    private boolean locked = false;
    private TextView unlockBtn;
    private final Runnable hideUnlock = () -> { if (unlockBtn != null) unlockBtn.setVisibility(View.GONE); };
    private final ArrayList<RendererDiscoverer> discoverers = new ArrayList<>();
    private final ArrayList<RendererItem> renderers = new ArrayList<>();
    private RendererItem castTo = null;
    private WifiManager.MulticastLock mcLock;
    private final Runnable hideBars = () -> setBars(false);
    private final Runnable hudOff = () -> hud.setVisibility(View.GONE);

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(w, false);
        hideSystemBars();
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        try {
            Intent in = getIntent();
            JSONArray items = new JSONArray(in.getStringExtra("items"));
            for (int i = 0; i < items.length(); i++) {
                JSONObject o = items.getJSONObject(i);
                urls.add(o.getString("url"));
                titles.add(o.optString("title", ""));
                queries.add(o.optString("query", o.optString("title", "")));
                years.add(o.optInt("year", 0));
                seasons.add(o.optInt("season", 0));
                episodes.add(o.optInt("episode", 0));
                List<String> subs = new ArrayList<>();
                JSONArray sa = o.optJSONArray("subtitles");
                if (sa != null) for (int s = 0; s < sa.length() && s < 12; s++) subs.add(sa.getJSONObject(s).getString("url"));
                extSubs.add(subs);
                thumbs.add(o.optString("thumb", ""));
                overviews.add(o.optString("overview", ""));
                releases.add(o.optString("released", ""));
                epTitles.add(o.optString("epTitle", ""));
                lazy.add(o.optBoolean("lazy", false));
                referers.add(o.optString("referer", ""));
                agents.add(o.optString("userAgent", ""));
            }
            index = Math.max(0, Math.min(in.getIntExtra("index", 0), urls.size() - 1));
            pendingStart = Math.max(0L, in.getLongExtra("position", 0L));
            hardware = !in.getBooleanExtra("software", false);
            canQuality = in.getBooleanExtra("quality", false);
            autoSubs = in.getBooleanExtra("autoSubs", true);
            String sl = in.getStringExtra("subLang");
            if (sl != null && !sl.isEmpty()) subLang = sl;
        } catch (Exception e) {
            finish();
            return;
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        surface = new SurfaceView(this);
        root.addView(surface, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // ---- top bar: back, title, rotate, videos
        topBar = new LinearLayout(this);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xDD000000, 0}));
        topBar.setPadding(dp(20), dp(14), dp(20), dp(30));
        TextView close = plain("\u2039", 36f);
        close.setPadding(dp(6), 0, dp(16), dp(6));
        close.setOnClickListener(v -> finish());
        topBar.addView(close);
        titleView = plain("", 19f);
        titleView.setTypeface(titleView.getTypeface(), android.graphics.Typeface.BOLD);
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        topBar.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView rotate = plain("\u27F3   Rotate Screen", 15f);
        rotate.setOnClickListener(v -> rotateScreen());
        topBar.addView(rotate, gap());
        TextView videosBtn = plain("\u25A4   Videos", 15f);
        videosBtn.setOnClickListener(v -> showEpisodes());
        topBar.addView(videosBtn, gap());
        TextView lockTop = plain("\uD83D\uDD12   Lock", 15f);
        lockTop.setOnClickListener(v -> setLocked(true));
        topBar.addView(lockTop, gap());
        TextView castTop = plain("\uD83D\uDCFA   Cast", 15f);
        castTop.setOnClickListener(v -> castMenu());
        topBar.addView(castTop, gap());
        root.addView(topBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        // ---- centre controls
        centerBar = new LinearLayout(this);
        centerBar.setGravity(Gravity.CENTER);
        prevBtn = plain("\u23EE", 30f);
        prevBtn.setOnClickListener(v -> go(index - 1));
        centerBar.addView(prevBtn, ctl(64));
        TextView back10 = plain("\u21BA 10", 20f);
        back10.setOnClickListener(v -> skip(-10000));
        centerBar.addView(back10, ctl(72));
        playBtn = plain("\u275A\u275A", 40f);
        playBtn.setOnClickListener(v -> toggle());
        centerBar.addView(playBtn, ctl(96));
        TextView fwd10 = plain("10 \u21BB", 20f);
        fwd10.setOnClickListener(v -> skip(10000));
        centerBar.addView(fwd10, ctl(72));
        nextBtn = plain("\u23ED", 30f);
        nextBtn.setOnClickListener(v -> go(index + 1));
        centerBar.addView(nextBtn, ctl(64));
        root.addView(centerBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        // ---- bottom: seek bar + actions
        bottomBar = new LinearLayout(this);
        bottomBar.setOrientation(LinearLayout.VERTICAL);
        bottomBar.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xE6000000, 0}));
        bottomBar.setPadding(dp(22), dp(34), dp(22), dp(12));
        LinearLayout seekRow = new LinearLayout(this);
        seekRow.setGravity(Gravity.CENTER_VERTICAL);
        timeView = plain("00:00", 14f);
        timeView.setPadding(0, 0, dp(8), 0);
        seekRow.addView(timeView);
        seek = new SeekBar(this);
        seek.setProgressTintList(ColorStateList.valueOf(0xFFFBBF24));
        seek.setThumbTintList(ColorStateList.valueOf(0xFFFBBF24));
        seek.setSecondaryProgressTintList(ColorStateList.valueOf(0x66FFFFFF));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                if (fromUser) timeView.setText(fmt(p * 1000L));
            }
            @Override public void onStartTrackingTouch(SeekBar s) { userSeeking = true; ui.removeCallbacks(hideBars); }
            @Override public void onStopTrackingTouch(SeekBar s) {
                userSeeking = false;
                if (mp != null) mp.setTime(s.getProgress() * 1000L);
                ui.postDelayed(hideBars, 4000);
            }
        });
        seekRow.addView(seek, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        durView = plain("00:00", 14f);
        durView.setPadding(dp(8), 0, 0, 0);
        seekRow.addView(durView);
        bottomBar.addView(seekRow);

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        actions.setPadding(0, dp(6), 0, 0);
        TextView subBtn = action("CC", "Subtitles");
        subBtn.setOnClickListener(v -> subtitleMenu());
        actions.addView(subBtn, actionLp());
        audioBtn = action("\u266A", "Audio Tracks");
        audioBtn.setOnClickListener(v -> pickTrack(true));
        actions.addView(audioBtn, actionLp());
        speedBtn = action("\u25D4", "Playback Speed");
        speedBtn.setOnClickListener(v -> speedMenu());
        actions.addView(speedBtn, actionLp());
        TextView qualityBtn = action("\u2699", "Quality");
        qualityBtn.setOnClickListener(v -> {
            if (!canQuality) { showHud("This video has a single quality"); return; }
            requestIdx = -2; // the app shows the list of other sources, then reopens the player at this minute
            finish();
        });
        actions.addView(qualityBtn, actionLp());
        aspectBtn = action("\u2922", "Video scaling");
        aspectBtn.setOnClickListener(v -> {
            aspectMode = (aspectMode + 1) % ASPECT.length;
            applyAspect();
            showHud("Video scaling: " + ASPECT[aspectMode]);
        });
        actions.addView(aspectBtn, actionLp());
        TextView playerBtn = action("\u25A3", "Player");
        playerBtn.setOnClickListener(v -> playerMenu());
        actions.addView(playerBtn, actionLp());
        bottomBar.addView(actions);
        hwBtn = new TextView(this); // decoder label (not shown, kept for status text)
        root.addView(bottomBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        hud = new TextView(this);
        hud.setTextColor(Color.WHITE);
        hud.setTextSize(18f);
        hud.setGravity(Gravity.CENTER);
        hud.setPadding(dp(20), dp(12), dp(20), dp(12));
        GradientDrawable hb = new GradientDrawable();
        hb.setColor(0xB0000000);
        hb.setCornerRadius(dp(14));
        hud.setBackground(hb);
        hud.setVisibility(View.GONE);
        root.addView(hud, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        // ---- "Unlock" button (appears when you tap a locked screen)
        unlockBtn = plain("\uD83D\uDD13   Unlock", 16f);
        unlockBtn.setPadding(dp(18), dp(12), dp(18), dp(12));
        GradientDrawable ub = new GradientDrawable();
        ub.setColor(0xDD000000);
        ub.setCornerRadius(dp(26));
        unlockBtn.setBackground(ub);
        unlockBtn.setVisibility(View.GONE);
        unlockBtn.setOnClickListener(v -> setLocked(false));
        FrameLayout.LayoutParams ulp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER_VERTICAL | Gravity.START);
        ulp.leftMargin = dp(28);
        root.addView(unlockBtn, ulp);

        // ---- "Videos" side panel (seasons + episodes)
        panelHolder = new FrameLayout(this);
        panelHolder.setVisibility(View.GONE);
        panelHolder.setBackgroundColor(0x66000000);
        panelHolder.setOnClickListener(v -> hideEpisodes());
        panelBox = new LinearLayout(this);
        panelBox.setOrientation(LinearLayout.VERTICAL);
        panelBox.setBackgroundColor(0xF2191824);
        panelBox.setClickable(true);
        int pw = Math.min(dp(440), (int) (getResources().getDisplayMetrics().widthPixels * 0.62f));
        panelHolder.addView(panelBox, new FrameLayout.LayoutParams(pw, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.END));
        root.addView(panelHolder, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setupGestures();

        try {
            ArrayList<String> opts = new ArrayList<>();
            opts.add("--no-drop-late-frames");
            opts.add("--no-skip-frames");
            opts.add("--network-caching=3000");
            opts.add("--audio-time-stretch");
            opts.add("--freetype-rel-fontsize=" + getSharedPreferences("gw_player", MODE_PRIVATE).getInt("subRel", 16));
            libVlc = new LibVLC(this, opts);
            mp = new MediaPlayer(libVlc);
        } catch (Throwable t) {
            errorText = "Player engine failed: " + t.getMessage();
            Toast.makeText(this, errorText, Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        surface.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder h) {
                if (mp == null) return;
                mp.getVLCVout().setVideoView(surface);
                mp.getVLCVout().attachViews();
                mp.getVLCVout().setWindowSize(surface.getWidth(), surface.getHeight());
                surfaceReady = true;
                if (!started) { started = true; load(index, pendingStart); }
            }
            @Override public void surfaceChanged(SurfaceHolder h, int f, int w2, int h2) {
                if (mp != null) mp.getVLCVout().setWindowSize(w2, h2);
                applyAspect();
            }
            @Override public void surfaceDestroyed(SurfaceHolder h) {
                if (mp != null) mp.getVLCVout().detachViews();
            }
        });

        mp.setEventListener(event -> {
            switch (event.type) {
                case MediaPlayer.Event.Playing:
                    if (!playingSeen) { playingSeen = true; onFirstPlaying(); }
                    break;
                case MediaPlayer.Event.ESAdded:
                    updateAudioLabel();
                    break;
                case MediaPlayer.Event.EndReached:
                    if (index + 1 < urls.size()) go(index + 1); else finish();
                    break;
                case MediaPlayer.Event.EncounteredError:
                    onEngineError();
                    break;
                default:
                    break;
            }
        });

        ui.post(tick);
        ui.postDelayed(hideBars, 3500);
    }

    // ------------------------------------------------------------ playback

    private void load(int i, long startMs) {
        if (mp == null || i < 0 || i >= urls.size()) return;
        index = i;
        playingSeen = false;
        triedSoftware = !hardware;
        autoSubsDone = false;
        errorText = null;
        titleView.setText(titles.get(i));
        startMedia(startMs);
        // slow / silent failures: if nothing plays in 25 s, retry with software decoding
        final int mine = ++loadToken;
        ui.postDelayed(() -> {
            if (mine == loadToken && !playingSeen && !triedSoftware) {
                triedSoftware = true;
                hardware = false;
                hwBtn.setText("SW");
                showHud("Trying software decoder…");
                startMedia(lastTime > 0 ? lastTime : startMs);
            }
        }, 25000);
    }
    private int loadToken = 0;

    private void startMedia(long startMs) {
        try {
            Media m = new Media(libVlc, Uri.parse(urls.get(index)));
            m.setHWDecoderEnabled(hardware, false);
            m.addOption(":network-caching=3000");
            if (!referers.get(index).isEmpty()) m.addOption(":http-referrer=" + referers.get(index));
            if (!agents.get(index).isEmpty()) m.addOption(":http-user-agent=" + agents.get(index));
            if (startMs > 1000) m.addOption(":start-time=" + (startMs / 1000.0));
            mp.setMedia(m);
            m.release();
            mp.play();
            mp.setRate(SPEEDS[speedIdx]);
        } catch (Throwable t) {
            errorText = String.valueOf(t.getMessage());
            showHud("Cannot play: " + t.getMessage());
        }
    }

    private void reloadHere() {
        playingSeen = false;
        showHud(hardware ? "Hardware decoder" : "Software decoder");
        startMedia(Math.max(0L, lastTime));
    }

    private void onEngineError() {
        if (hardware && !triedSoftware) {
            triedSoftware = true;
            hardware = false;
            hwBtn.setText("SW");
            showHud("Trying software decoder…");
            ui.post(() -> startMedia(Math.max(0L, lastTime)));
            return;
        }
        errorText = "This file could not be played";
        setBars(true);
        showHud("Cannot play this file.\nTry “Open with” to use another app.");
    }

    private void onFirstPlaying() {
        updateAudioLabel();
        // subtitle files that sit next to the video on the server
        for (String u : extSubs.get(index)) {
            try { mp.addSlave(Media.Slave.Type.Subtitle, Uri.parse(u), false); } catch (Throwable ignored) { }
        }
        if (autoSubs && !queries.get(index).isEmpty()) {
            final int mine = loadToken;
            ui.postDelayed(() -> { if (mine == loadToken) autoSubtitle(); }, 4000);
        }
    }

    private int realTracks(MediaPlayer.TrackDescription[] l) {
        int n = 0;
        if (l != null) for (MediaPlayer.TrackDescription t : l) if (t.id >= 0) n++;
        return n;
    }

    private void updateAudioLabel() {
        if (mp == null) return;
        int n = realTracks(mp.getAudioTracks());
        audioBtn.setText(n > 1 ? "\u266A  Audio Tracks (" + n + ")" : "\u266A  Audio Tracks");
        if (n > 1 && !audioHint) { audioHint = true; showHud(n + " audio tracks – tap Audio Tracks to choose"); }
    }
    private boolean audioHint = false;

    private void toggle() {
        if (mp == null) return;
        if (mp.isPlaying()) mp.pause(); else mp.play();
    }

    private void go(int i) {
        if (i < 0 || i >= urls.size()) return;
        if (lazy.get(i)) {
            // this episode's stream is not known yet: hand back to the app, it finds a stream and reopens the player here
            requestIdx = i;
            finish();
            return;
        }
        lastTime = 0;
        audioHint = false;
        load(i, 0);
    }

    private void skip(long d) {
        if (mp == null) return;
        long t = Math.max(0L, mp.getTime() + d);
        if (lastDuration > 0) t = Math.min(t, lastDuration - 1000);
        mp.setTime(t);
        showHud((d > 0 ? "+" : "-") + Math.abs(d / 1000) + "s");
    }

    private void applyAspect() {
        if (mp == null) return;
        switch (aspectMode) {
            case 1: mp.setAspectRatio("16:9"); break;
            case 2: mp.setAspectRatio("4:3"); break;
            default: mp.setAspectRatio(null);
        }
        mp.setScale(0f);
        if (aspectMode == 3) { mp.setAspectRatio(surface.getWidth() + ":" + surface.getHeight()); }
    }

    // ------------------------------------------------------------ tracks / subtitles

    private void pickTrack(final boolean audioTracks) {
        if (mp == null) return;
        final MediaPlayer.TrackDescription[] list = audioTracks ? mp.getAudioTracks() : mp.getSpuTracks();
        if (list == null || list.length == 0 || (audioTracks && realTracks(list) == 0)) {
            Toast.makeText(this, audioTracks ? "No audio tracks" : "No subtitle tracks yet", Toast.LENGTH_SHORT).show();
            return;
        }
        final int current = audioTracks ? mp.getAudioTrack() : mp.getSpuTrack();
        String[] names = new String[list.length];
        for (int i = 0; i < list.length; i++) {
            String n = list[i].name == null ? ("Track " + i) : list[i].name;
            names[i] = n + (list[i].id == current ? "  ✓" : "");
        }
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
            .setTitle(audioTracks ? "Audio track" : "Subtitle track")
            .setItems(names, (d, which) -> {
                if (audioTracks) mp.setAudioTrack(list[which].id);
                else mp.setSpuTrack(list[which].id);
            })
            .show();
    }

    private void subtitleMenu() {
        final String[] opts = {"Choose subtitle track", "Search online (" + langName(subLang) + ")",
            "Search online – other language", "Subtitles off", "Subtitle size"};
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
            .setTitle("Subtitles")
            .setItems(opts, (d, which) -> {
                if (which == 0) pickTrack(false);
                else if (which == 1) searchSubs(subLang, false);
                else if (which == 2) {
                    final String[] names = {"English", "Bangla", "Hindi", "Arabic", "Spanish"};
                    final String[] codes = {"eng", "ben", "hin", "ara", "spa"};
                    new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
                        .setTitle("Language")
                        .setItems(names, (d2, w2) -> searchSubs(codes[w2], false))
                        .show();
                } else if (which == 3) { if (mp != null) mp.setSpuTrack(-1); }
                else subtitleSizeMenu();
            })
            .show();
    }

    private void subtitleSizeMenu() {
        final String[] names = {"Small", "Normal", "Large", "Extra large"};
        final int[] rel = {22, 16, 12, 9};
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
            .setTitle("Subtitle size")
            .setItems(names, (d, which) -> {
                getSharedPreferences("gw_player", MODE_PRIVATE).edit().putInt("subRel", rel[which]).apply();
                showHud("Applying…");
                requestIdx = -3; // reopen the video at the same minute with the new size
                finish();
            })
            .show();
    }

    private static String langName(String code) {
        switch (code) {
            case "ben": return "Bangla";
            case "hin": return "Hindi";
            case "ara": return "Arabic";
            case "spa": return "Spanish";
            default: return "English";
        }
    }

    private void autoSubtitle() {
        if (mp == null || autoSubsDone) return;
        autoSubsDone = true;
        // the file already carries subtitles (embedded or from the server): leave them alone
        if (realTracks(mp.getSpuTracks()) > 0) return;
        searchSubs(subLang, true);
    }

    private void searchSubs(final String lang, final boolean auto) {
        final int idx = index;
        final String q = queries.get(idx);
        if (q.isEmpty()) {
            if (!auto) Toast.makeText(this, "No title to search for", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!auto) Toast.makeText(this, "Searching subtitles…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                final List<SubtitleFinder.Result> res =
                    SubtitleFinder.search(q, years.get(idx), seasons.get(idx), episodes.get(idx), lang);
                runOnUiThread(() -> {
                    if (isFinishing() || idx != index) return;
                    if (res.isEmpty()) {
                        if (!auto) Toast.makeText(this, "No subtitles found for this title", Toast.LENGTH_LONG).show();
                        return;
                    }
                    if (auto) { downloadSub(res.get(0), true); return; }
                    String[] labels = new String[res.size()];
                    for (int i = 0; i < res.size(); i++) labels[i] = res.get(i).label;
                    new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
                        .setTitle(res.size() + " subtitles found")
                        .setItems(labels, (d, which) -> downloadSub(res.get(which), false))
                        .show();
                });
            } catch (final Exception e) {
                runOnUiThread(() -> { if (!auto) Toast.makeText(this, "Subtitle search failed: " + e.getMessage(), Toast.LENGTH_LONG).show(); });
            }
        }).start();
    }

    private void downloadSub(final SubtitleFinder.Result r, final boolean auto) {
        final int idx = index;
        new Thread(() -> {
            try {
                final File f = SubtitleFinder.download(this, r.link);
                runOnUiThread(() -> {
                    if (isFinishing() || mp == null || idx != index) return;
                    mp.addSlave(Media.Slave.Type.Subtitle, Uri.fromFile(f), true);
                    showHud((auto ? "Auto subtitle: " : "Subtitle: ") + r.label);
                });
            } catch (final Exception e) {
                runOnUiThread(() -> { if (!auto) Toast.makeText(this, "Download failed: " + e.getMessage(), Toast.LENGTH_LONG).show(); });
            }
        }).start();
    }

    private void openWithOtherPlayer() {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse(urls.get(index)), "video/*");
            if (mp != null) mp.pause();
            startActivity(Intent.createChooser(i, "Open with"));
        } catch (Exception e) {
            Toast.makeText(this, "No other player found", Toast.LENGTH_SHORT).show();
        }
    }

    // ------------------------------------------------------------ gestures

    private void setupGestures() {
        final GestureDetector gd = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { gesture = 0; return true; }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) {
                setBars(topBar.getVisibility() != View.VISIBLE);
                return true;
            }
            @Override public boolean onDoubleTap(MotionEvent e) {
                float x = e.getX() / Math.max(1, surface.getWidth());
                if (x < 0.35f) skip(-10000);
                else if (x > 0.65f) skip(10000);
                else toggle();
                return true;
            }
            @Override public void onLongPress(MotionEvent e) {
                if (mp == null) return;
                longPress = true;
                mp.setRate(2f);
                showHud("2x");
            }
            @Override public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy) {
                if (e1 == null || mp == null || longPress) return false;
                int w = Math.max(1, surface.getWidth()), h = Math.max(1, surface.getHeight());
                if (gesture == 0) {
                    if (Math.abs(e2.getX() - e1.getX()) > Math.abs(e2.getY() - e1.getY())) {
                        gesture = 3;
                        seekBase = Math.max(0L, mp.getTime());
                    } else if (e1.getX() < w / 2f) {
                        gesture = 1;
                        float cur = getWindow().getAttributes().screenBrightness;
                        brightnessNow = cur < 0 ? 0.5f : cur;
                    } else {
                        gesture = 2;
                        volumeStart = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
                    }
                }
                float dyTotal = e1.getY() - e2.getY();
                if (gesture == 1) {
                    float v = Math.max(0.02f, Math.min(1f, brightnessNow + dyTotal / h));
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.screenBrightness = v;
                    getWindow().setAttributes(lp);
                    showHud("☀ " + Math.round(v * 100) + "%");
                } else if (gesture == 2) {
                    int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    int v = Math.max(0, Math.min(max, volumeStart + Math.round(dyTotal / h * max * 1.2f)));
                    audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0);
                    showHud("🔊 " + Math.round(v * 100f / max) + "%");
                } else if (gesture == 3) {
                    long delta = Math.round((e2.getX() - e1.getX()) / w * 120000f);
                    seekTarget = Math.max(0L, seekBase + delta);
                    if (lastDuration > 0) seekTarget = Math.min(seekTarget, lastDuration - 1000);
                    showHud(fmt(seekTarget) + "  (" + (delta >= 0 ? "+" : "-") + Math.abs(delta / 1000) + "s)");
                }
                return true;
            }
        });
        surface.setOnTouchListener((v, e) -> {
            if (locked) {
                if (e.getActionMasked() == MotionEvent.ACTION_UP) showUnlock();
                return true;
            }
            gd.onTouchEvent(e);
            if (e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                if (gesture == 3 && mp != null) mp.setTime(seekTarget);
                if (longPress && mp != null) { mp.setRate(SPEEDS[speedIdx]); hud.setVisibility(View.GONE); }
                longPress = false;
                gesture = 0;
            }
            return true;
        });
    }

    // ------------------------------------------------------------ menus, rotate, episodes panel

    // ------------------------------------------------------------ lock

    private void setLocked(boolean on) {
        locked = on;
        ui.removeCallbacks(hideUnlock);
        unlockBtn.setVisibility(View.GONE);
        if (on) {
            hideEpisodes();
            setBars(false);
            showHud("Screen locked\nTap the screen to show Unlock");
        } else {
            setBars(true);
            showHud("Unlocked");
        }
    }

    private void showUnlock() {
        unlockBtn.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideUnlock);
        ui.postDelayed(hideUnlock, 3000);
    }

    // ------------------------------------------------------------ cast

    private void startDiscovery() {
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                mcLock = wm.createMulticastLock("goowatch-cast");
                mcLock.setReferenceCounted(false);
                mcLock.acquire();
            }
        } catch (Throwable ignored) { }
        try {
            RendererDiscoverer.Description[] list = RendererDiscoverer.list(libVlc);
            if (list == null || list.length == 0) { showHud("Cast is not available here"); return; }
            for (RendererDiscoverer.Description d : list) {
                RendererDiscoverer rd = new RendererDiscoverer(libVlc, d.name);
                rd.setEventListener(ev -> {
                    final RendererItem it = ev.getItem();
                    if (it == null) return;
                    if (ev.type == RendererDiscoverer.Event.ItemAdded) {
                        it.retain();
                        runOnUiThread(() -> renderers.add(it));
                    } else if (ev.type == RendererDiscoverer.Event.ItemDeleted) {
                        runOnUiThread(() -> renderers.remove(it));
                    }
                });
                rd.start();
                discoverers.add(rd);
            }
        } catch (Throwable t) {
            showHud("Could not search for cast devices");
        }
    }

    private void castMenu() {
        if (libVlc == null || mp == null) return;
        if (discoverers.isEmpty()) startDiscovery();
        final ArrayList<String> names = new ArrayList<>();
        names.add((castTo == null ? "\u2713 " : "") + "This phone");
        for (RendererItem r : renderers) names.add((r == castTo ? "\u2713 " : "") + r.displayName);
        String title = renderers.isEmpty() ? "Searching for TVs on your Wi-Fi\u2026" : "Cast to";
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
            .setTitle(title)
            .setItems(names.toArray(new String[0]), (d, which) -> setCast(which == 0 ? null : renderers.get(which - 1)))
            .setNegativeButton(renderers.isEmpty() ? "Search again" : "Refresh", (d, w) -> ui.postDelayed(this::castMenu, 2500))
            .show();
    }

    private void setCast(RendererItem item) {
        if (mp == null) return;
        final long t = Math.max(0L, lastTime);
        castTo = item;
        try {
            mp.stop();
            mp.setRenderer(item);
        } catch (Throwable ignored) { }
        showHud(item == null ? "Playing on this phone" : "Casting to " + item.displayName);
        playingSeen = false;
        startMedia(t);
    }

    private void stopCast() {
        try {
            for (RendererDiscoverer d : discoverers) d.stop();
            for (RendererItem r : renderers) r.release();
            if (mcLock != null && mcLock.isHeld()) mcLock.release();
        } catch (Throwable ignored) { }
        discoverers.clear();
        renderers.clear();
    }

    private void rotateScreen() {
        boolean land = getResources().getConfiguration().orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        setRequestedOrientation(land ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT : ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }

    private void speedMenu() {
        final String[] names = new String[SPEEDS.length];
        for (int i = 0; i < SPEEDS.length; i++) names[i] = SPEEDS[i] + "x" + (i == speedIdx ? "  \u2713" : "");
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
            .setTitle("Playback Speed")
            .setItems(names, (d, which) -> {
                speedIdx = which;
                if (mp != null) mp.setRate(SPEEDS[speedIdx]);
                showHud("Speed " + SPEEDS[speedIdx] + "x");
            })
            .show();
    }

    private void playerMenu() {
        final String[] opts = {
            (hardware ? "\u2713 " : "") + "Hardware decoder",
            (!hardware ? "\u2713 " : "") + "Software decoder (more compatible)",
            "Open with another app"
        };
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
            .setTitle("Player")
            .setItems(opts, (d, which) -> {
                if (which == 0 && !hardware) { hardware = true; reloadHere(); }
                else if (which == 1 && hardware) { hardware = false; reloadHere(); }
                else if (which == 2) openWithOtherPlayer();
            })
            .show();
    }

    private void showEpisodes() {
        if (urls.size() <= 1) { showHud("No other videos in this list"); return; }
        panelSeason = seasons.get(index);
        buildPanel();
        setBars(false);
        panelHolder.setVisibility(View.VISIBLE);
    }

    private void hideEpisodes() {
        if (panelHolder != null) panelHolder.setVisibility(View.GONE);
    }

    @Override
    public void onBackPressed() {
        if (locked) { showUnlock(); showHud("Screen locked"); return; }
        if (panelHolder != null && panelHolder.getVisibility() == View.VISIBLE) { hideEpisodes(); return; }
        super.onBackPressed();
    }

    private void buildPanel() {
        panelBox.removeAllViews();
        TreeSet<Integer> ss = new TreeSet<>();
        for (int s : seasons) ss.add(s);
        final boolean multi = ss.size() > 1;
        if (multi) {
            HorizontalScrollView hs = new HorizontalScrollView(this);
            hs.setHorizontalScrollBarEnabled(false);
            LinearLayout chips = new LinearLayout(this);
            chips.setPadding(dp(14), dp(14), dp(14), dp(6));
            for (final int s : ss) {
                TextView c = new TextView(this);
                c.setText(s > 0 ? "Season " + s : "Specials");
                c.setTextSize(15f);
                c.setPadding(dp(18), dp(8), dp(18), dp(8));
                boolean sel = s == panelSeason;
                c.setTextColor(sel ? Color.BLACK : 0xFFB8B8C4);
                GradientDrawable bg = new GradientDrawable();
                bg.setCornerRadius(dp(22));
                bg.setColor(sel ? 0xFFFBBF24 : 0x14FFFFFF);
                c.setBackground(bg);
                c.setOnClickListener(v -> { panelSeason = s; buildPanel(); });
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                lp.rightMargin = dp(8);
                chips.addView(c, lp);
            }
            hs.addView(chips);
            panelBox.addView(hs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        } else {
            TextView head = plain("Videos", 17f);
            head.setTypeface(head.getTypeface(), android.graphics.Typeface.BOLD);
            head.setPadding(dp(18), dp(16), dp(18), dp(6));
            panelBox.addView(head);
        }
        ScrollView sv = new ScrollView(this);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        for (int i = 0; i < urls.size(); i++) {
            if (multi && seasons.get(i) != panelSeason) continue;
            list.addView(episodeRow(i));
        }
        sv.addView(list);
        panelBox.addView(sv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
    }

    private View episodeRow(final int i) {
        LinearLayout row = new LinearLayout(this);
        row.setPadding(dp(14), dp(10), dp(14), dp(10));
        if (i == index) row.setBackgroundColor(0x26FBBF24);

        FrameLayout th = new FrameLayout(this);
        GradientDrawable thbg = new GradientDrawable();
        thbg.setColor(0xFF2A2938);
        thbg.setCornerRadius(dp(10));
        th.setBackground(thbg);
        th.setClipToOutline(true);
        ImageView iv = new ImageView(this);
        iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
        th.addView(iv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loadImage(iv, thumbs.get(i));
        TextView num = new TextView(this);
        num.setText(String.valueOf(episodes.get(i) > 0 ? episodes.get(i) : (i + 1)));
        num.setTextColor(Color.WHITE);
        num.setTextSize(14f);
        num.setGravity(Gravity.CENTER);
        num.setTypeface(num.getTypeface(), android.graphics.Typeface.BOLD);
        num.setBackgroundColor(0xCC000000);
        th.addView(num, new FrameLayout.LayoutParams(dp(30), dp(28), Gravity.TOP | Gravity.END));
        if (i == index) {
            TextView now = new TextView(this);
            now.setText("\u25B6 NOW");
            now.setTextColor(Color.BLACK);
            now.setTextSize(10f);
            now.setGravity(Gravity.CENTER);
            now.setBackgroundColor(0xFFFBBF24);
            now.setPadding(dp(6), dp(2), dp(6), dp(2));
            th.addView(now, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START));
        }
        row.addView(th, new LinearLayout.LayoutParams(dp(128), dp(74)));

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        LinearLayout head = new LinearLayout(this);
        TextView name = plain(!epTitles.get(i).isEmpty() ? epTitles.get(i) : titles.get(i), 15f);
        name.setPadding(0, 0, 0, 0);
        name.setTypeface(name.getTypeface(), android.graphics.Typeface.BOLD);
        name.setSingleLine(true);
        name.setEllipsize(android.text.TextUtils.TruncateAt.END);
        head.addView(name, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        if (!releases.get(i).isEmpty()) {
            TextView date = plain(releases.get(i), 11f);
            date.setPadding(dp(8), 0, 0, 0);
            date.setTextColor(0xFF9A9AA8);
            head.addView(date);
        }
        col.addView(head);
        if (!overviews.get(i).isEmpty()) {
            TextView ov = plain(overviews.get(i), 12f);
            ov.setPadding(0, dp(3), 0, 0);
            ov.setTextColor(0xFF9A9AA8);
            ov.setMaxLines(3);
            ov.setEllipsize(android.text.TextUtils.TruncateAt.END);
            col.addView(ov);
        }
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        clp.leftMargin = dp(12);
        row.addView(col, clp);
        row.setOnClickListener(v -> {
            hideEpisodes();
            if (i != index) go(i);
        });
        return row;
    }

    private void loadImage(final ImageView iv, final String url) {
        if (url == null || url.isEmpty()) return;
        iv.setTag(url);
        Bitmap c = imgCache.get(url);
        if (c != null) { iv.setImageBitmap(c); return; }
        new Thread(() -> {
            try {
                java.net.HttpURLConnection con = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                con.setConnectTimeout(8000);
                con.setReadTimeout(10000);
                con.setRequestProperty("User-Agent", "Mozilla/5.0 GooWatch");
                java.io.InputStream in = con.getInputStream();
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inSampleSize = 2;
                final Bitmap bmp = BitmapFactory.decodeStream(in, null, o);
                in.close();
                if (bmp == null) return;
                imgCache.put(url, bmp);
                ui.post(() -> { if (url.equals(iv.getTag())) iv.setImageBitmap(bmp); });
            } catch (Throwable ignored) { }
        }).start();
    }

    // ------------------------------------------------------------ ui helpers

    private TextView plain(String text, float sp) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setTextSize(sp);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(8), dp(4), dp(8), dp(4));
        b.setShadowLayer(6f, 0f, 1f, 0xAA000000);
        return b;
    }

    private TextView action(String glyph, String label) {
        TextView b = plain(glyph + "  " + label, 14f);
        b.setSingleLine(true);
        b.setEllipsize(android.text.TextUtils.TruncateAt.END);
        b.setPadding(dp(6), dp(12), dp(6), dp(8));
        return b;
    }

    private LinearLayout.LayoutParams actionLp() {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    }

    private LinearLayout.LayoutParams gap() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.leftMargin = dp(14);
        return p;
    }

    private LinearLayout.LayoutParams ctl(int widthDp) {
        return new LinearLayout.LayoutParams(dp(widthDp), dp(88));
    }


    private void setBars(boolean show) {
        if (locked && show) return;
        ui.removeCallbacks(hideBars);
        topBar.setVisibility(show ? View.VISIBLE : View.GONE);
        bottomBar.setVisibility(show ? View.VISIBLE : View.GONE);
        centerBar.setVisibility(show ? View.VISIBLE : View.GONE);
        if (show) ui.postDelayed(hideBars, 4000);
    }

    private void showHud(String s) {
        hud.setText(s);
        hud.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hudOff);
        ui.postDelayed(hudOff, 2200);
    }

    private TextView btn(String text) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setTextSize(15f);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(12), dp(6), dp(12), dp(6));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x66000000);
        bg.setCornerRadius(dp(18));
        b.setBackground(bg);
        return b;
    }

    private LinearLayout.LayoutParams margin() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.rightMargin = dp(8);
        return p;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private static String fmt(long ms) {
        long s = Math.max(0, ms / 1000);
        long h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, sec) : String.format(Locale.US, "%02d:%02d", m, sec);
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // ------------------------------------------------------------ lifecycle

    @Override
    public void finish() {
        if (!finishedOnce) {
            finishedOnce = true;
            Intent r = new Intent();
            r.putExtra("index", index);
            r.putExtra("position", lastTime);
            r.putExtra("duration", lastDuration);
            r.putExtra("request", requestIdx);
            if (errorText != null && lastTime < 5000) r.putExtra("error", errorText);
            setResult(RESULT_OK, r);
        }
        super.finish();
    }

    @Override protected void onStop() {
        super.onStop();
        if (mp != null && mp.isPlaying()) mp.pause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        stopCast();
        try {
            if (mp != null) { mp.stop(); mp.getVLCVout().detachViews(); mp.release(); }
            if (libVlc != null) libVlc.release();
        } catch (Throwable ignored) { }
        mp = null;
        libVlc = null;
        super.onDestroy();
    }
}
