package com.happyfamily.todayweather;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int REQ_LOC = 41;
    private WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(6);
    private String pendingLocId = null;
    private boolean pageReady = false;
    private int insetTop = 0, insetBottom = 0;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#2F86EE"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.addJavascriptInterface(new Bridge(), "NativeApi");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                pushInsets();
            }
        });
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            float d = getResources().getDisplayMetrics().density;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                insetTop = Math.round(i.top / d);
                insetBottom = Math.round(i.bottom / d);
            } else {
                insetTop = Math.round(insets.getSystemWindowInsetTop() / d);
                insetBottom = Math.round(insets.getSystemWindowInsetBottom() / d);
            }
            pushInsets();
            return insets;
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::sendBack);
        }
    }

    private void pushInsets() {
        if (!pageReady) return;
        js("window.App&&App.setInsets(" + insetTop + "," + insetBottom + ")");
    }

    private void sendBack() { js("window.App?App.onBack():null"); }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() { sendBack(); }

    private void js(String code) {
        main.post(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    private void callback(String id, boolean ok, JSONObject data) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", ok);
            o.put("data", data == null ? JSONObject.NULL : data);
            js("App.nativeCb(" + JSONObject.quote(id) + "," + o + ")");
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // ---------- 위치 ----------
    private boolean hasLoc() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == REQ_LOC && pendingLocId != null) {
            String id = pendingLocId;
            pendingLocId = null;
            if (hasLoc()) fetchLocation(id);
            else {
                try {
                    JSONObject e = new JSONObject();
                    e.put("error", "denied");
                    e.put("permanent", !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION));
                    callback(id, false, e);
                } catch (Exception ignored) {}
            }
        }
    }

    @SuppressLint("MissingPermission")
    private void fetchLocation(String id) {
        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        String provider = null;
        if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) provider = LocationManager.NETWORK_PROVIDER;
        else if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) provider = LocationManager.GPS_PROVIDER;
        if (provider == null) {
            Location last = bestLast(lm);
            if (last != null) { sendLoc(id, last); return; }
            try { JSONObject e = new JSONObject(); e.put("error", "off"); callback(id, false, e); } catch (Exception ignored) {}
            return;
        }
        final boolean[] done = {false};
        final String prov = provider;
        LocationListener l = new LocationListener() {
            @Override public void onLocationChanged(Location loc) {
                if (done[0]) return; done[0] = true;
                lm.removeUpdates(this);
                sendLoc(id, loc);
            }
            @Override public void onStatusChanged(String p, int st, Bundle b) {}
            @Override public void onProviderEnabled(String p) {}
            @Override public void onProviderDisabled(String p) {}
        };
        try {
            lm.requestLocationUpdates(prov, 0, 0, l, Looper.getMainLooper());
        } catch (Exception ex) { /* fall through to timeout */ }
        main.postDelayed(() -> {
            if (done[0]) return; done[0] = true;
            lm.removeUpdates(l);
            Location last = bestLast(lm);
            if (last != null) sendLoc(id, last);
            else try { JSONObject e = new JSONObject(); e.put("error", "timeout"); callback(id, false, e); } catch (Exception ignored) {}
        }, 12000);
    }

    @SuppressLint("MissingPermission")
    private Location bestLast(LocationManager lm) {
        Location best = null;
        for (String p : lm.getProviders(true)) {
            try {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            } catch (Exception ignored) {}
        }
        return best;
    }

    private void sendLoc(String id, Location loc) {
        try {
            JSONObject o = new JSONObject();
            o.put("lat", loc.getLatitude());
            o.put("lon", loc.getLongitude());
            callback(id, true, o);
        } catch (Exception ignored) {}
    }

    private static JSONObject addrJson(Address a) throws Exception {
        JSONObject o = new JSONObject();
        o.put("admin", nz(a.getAdminArea()));
        o.put("locality", nz(a.getLocality()));
        o.put("subLocality", nz(a.getSubLocality()));
        o.put("thoroughfare", nz(a.getThoroughfare()));
        o.put("feature", nz(a.getFeatureName()));
        o.put("line", nz(a.getMaxAddressLineIndex() >= 0 ? a.getAddressLine(0) : ""));
        o.put("country", nz(a.getCountryCode()));
        o.put("lat", a.hasLatitude() ? a.getLatitude() : JSONObject.NULL);
        o.put("lon", a.hasLongitude() ? a.getLongitude() : JSONObject.NULL);
        return o;
    }

    private static String nz(String s) { return s == null ? "" : s; }

    class Bridge {
        @JavascriptInterface
        public String kmaKey() { return BuildConfig.KMA_KEY; }

        @JavascriptInterface
        public String appVersion() { return BuildConfig.VERSION_NAME; }

        @JavascriptInterface
        public void httpGet(String id, String url, String headersJson) {
            pool.execute(() -> {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(12000);
                    c.setRequestProperty("Accept", "application/json");
                    if (headersJson != null && !headersJson.isEmpty()) {
                        JSONObject h = new JSONObject(headersJson);
                        Iterator<String> it = h.keys();
                        while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.getString(k)); }
                    }
                    int code = c.getResponseCode();
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    if (in != null) {
                        byte[] buf = new byte[16384]; int n;
                        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                        in.close();
                    }
                    JSONObject o = new JSONObject();
                    o.put("status", code);
                    o.put("body", bo.toString("UTF-8"));
                    callback(id, code >= 200 && code < 300, o);
                } catch (Exception e) {
                    try { JSONObject o = new JSONObject(); o.put("status", 0); o.put("error", String.valueOf(e.getMessage())); callback(id, false, o); } catch (Exception ignored) {}
                } finally { if (c != null) c.disconnect(); }
            });
        }

        @JavascriptInterface
        public boolean hasLocationPermission() { return hasLoc(); }

        @JavascriptInterface
        public void getLocation(String id) {
            main.post(() -> {
                if (hasLoc()) fetchLocation(id);
                else {
                    pendingLocId = id;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOC);
                }
            });
        }

        @JavascriptInterface
        public void openAppSettings() {
            main.post(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void reverseGeocode(String id, double lat, double lon) {
            pool.execute(() -> {
                try {
                    if (!Geocoder.isPresent()) { callback(id, false, null); return; }
                    @SuppressWarnings("deprecation")
                    List<Address> list = new Geocoder(MainActivity.this, Locale.KOREA).getFromLocation(lat, lon, 1);
                    if (list == null || list.isEmpty()) { callback(id, false, null); return; }
                    callback(id, true, addrJson(list.get(0)));
                } catch (Exception e) { callback(id, false, null); }
            });
        }

        @JavascriptInterface
        public void geocode(String id, String query) {
            pool.execute(() -> {
                try {
                    if (!Geocoder.isPresent()) { callback(id, false, null); return; }
                    @SuppressWarnings("deprecation")
                    List<Address> list = new Geocoder(MainActivity.this, Locale.KOREA)
                            .getFromLocationName(query, 8, 33.0, 124.5, 38.7, 131.0);
                    JSONArray arr = new JSONArray();
                    if (list != null) for (Address a : list) if (a.hasLatitude()) arr.put(addrJson(a));
                    JSONObject o = new JSONObject();
                    o.put("items", arr);
                    callback(id, true, o);
                } catch (Exception e) { callback(id, false, null); }
            });
        }

        @JavascriptInterface
        public void openUrl(String url) {
            main.post(() -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {} });
        }

        @JavascriptInterface
        public void exitApp() { main.post(MainActivity.this::finishAndRemoveTask); }
    }
}
