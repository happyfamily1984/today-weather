package com.happyfamily.todayweather;

import android.Manifest;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationManager;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.Locale;

/** 위젯 그리기와 갱신 예약 */
final class WidgetUpdater {
    private WidgetUpdater() {}

    static final String PREFS = "widget";
    static final String ACTION_REFRESH = "com.happyfamily.todayweather.WIDGET_REFRESH";
    static final int JOB_ID = 7001;
    static final long STALE_MS = 25 * 60_000L;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    // ---------- 예약 ----------
    static void schedule(Context c, boolean force) {
        if (!force) {
            long at = prefs(c).getLong("snapAt", 0);
            if (System.currentTimeMillis() - at < STALE_MS) return;
        }
        if (!hasWidgets(c)) return;
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, WidgetJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setOverrideDeadline(force ? 2_000 : 60_000)
                .build();
        try { js.schedule(job); } catch (Exception ignored) {}
    }

    static void retryLater(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        JobInfo job = new JobInfo.Builder(JOB_ID + 1, new ComponentName(c, WidgetJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(10 * 60_000L)
                .setOverrideDeadline(20 * 60_000L)
                .build();
        try { js.schedule(job); } catch (Exception ignored) {}
    }

    static boolean hasWidgets(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        return m.getAppWidgetIds(new ComponentName(c, WeatherWidget.class)).length > 0
                || m.getAppWidgetIds(new ComponentName(c, CompareWidget.class)).length > 0;
    }

    static void savePlace(Context c, String json) {
        try {
            JSONObject n = new JSONObject(json);
            String old = prefs(c).getString("place", null);
            boolean moved = true;
            if (old != null) {
                JSONObject o = new JSONObject(old);
                moved = WidgetData.dist(o.getDouble("lat"), o.getDouble("lon"), n.getDouble("lat"), n.getDouble("lon")) > 0.5;
            }
            prefs(c).edit().putString("place", json).apply();
            if (moved) prefs(c).edit().remove("snap").putLong("snapAt", 0).apply();
            updateAll(c);
            schedule(c, moved);
        } catch (Exception ignored) {}
    }

    /** 작업 스레드에서 호출 */
    static void refreshNow(Context c) {
        try {
            String ps = prefs(c).getString("place", null);
            JSONObject place = ps != null ? new JSONObject(ps) : new JSONObject("{\"lat\":37.5636,\"lon\":126.9834,\"name\":\"서울 중구\",\"sub\":\"\",\"gps\":false}");
            if (place.optBoolean("gps") && (c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    || c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED)) {
                Location best = null;
                try {
                    LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
                    for (String p : lm.getProviders(true)) {
                        @SuppressWarnings("MissingPermission") Location l = lm.getLastKnownLocation(p);
                        if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
                    }
                } catch (SecurityException ignored) {}
                if (best != null && WidgetData.dist(place.getDouble("lat"), place.getDouble("lon"), best.getLatitude(), best.getLongitude()) > 1) {
                    place.put("lat", best.getLatitude()); place.put("lon", best.getLongitude());
                    try {
                        @SuppressWarnings("deprecation")
                        List<Address> a = new Geocoder(c, Locale.KOREA).getFromLocation(best.getLatitude(), best.getLongitude(), 1);
                        if (a != null && !a.isEmpty()) {
                            String[] nm = shortName(a.get(0));
                            place.put("name", nm[0]); place.put("sub", nm[1]);
                        }
                    } catch (Exception ignored) {}
                    prefs(c).edit().putString("place", place.toString()).apply();
                }
            }
            JSONObject snap = WidgetData.build(place.getDouble("lat"), place.getDouble("lon"), true);
            snap.put("name", place.optString("name")); snap.put("sub", place.optString("sub")); snap.put("gps", place.optBoolean("gps"));
            // 기상청이 실패해 대체 출처로 채웠으면 10분 뒤 다시 시도
            long at = snap.optBoolean("kmaOk", true) ? System.currentTimeMillis() : System.currentTimeMillis() - STALE_MS + 10 * 60_000L;
            prefs(c).edit().putString("snap", snap.toString()).putLong("snapAt", at).apply();
            if (!snap.optBoolean("kmaOk", true)) retryLater(c);
        } catch (Exception e) {
            prefs(c).edit().putLong("failAt", System.currentTimeMillis()).apply();
            retryLater(c);
        }
        updateAll(c);
    }

    static String[] shortName(Address a) {
        String line = a.getMaxAddressLineIndex() >= 0 ? a.getAddressLine(0) : "";
        line = line.replaceFirst("^대한민국\\s*", "");
        String[] t = line.split("\\s+");
        StringBuilder name = new StringBuilder(); String sub = "";
        if (t.length > 0) {
            name.append(t[0].replace("특별시", "").replace("광역시", "").replace("특별자치시", "").replace("특별자치도", "")
                    .replace("경기도", "경기").replace("충청북도", "충북").replace("충청남도", "충남").replace("전라북도", "전북").replace("전라남도", "전남")
                    .replace("경상북도", "경북").replace("경상남도", "경남").replace("강원도", "강원").replace("제주도", "제주"));
            int i = 1;
            while (i < t.length && t[i].matches(".*(시|군|구)$") && i < 3) { name.append(' ').append(t[i]); i++; }
            for (; i < t.length; i++) if (t[i].matches(".*(동|읍|면|가|리)$")) { sub = t[i]; break; }
        }
        return new String[]{name.toString().trim(), sub};
    }

    // ---------- 그리기 ----------
    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, WeatherWidget.class))) render(c, m, id, false);
        for (int id : m.getAppWidgetIds(new ComponentName(c, CompareWidget.class))) render(c, m, id, true);
    }

    static int icon(int code, boolean night) {
        if (code <= 1) return night ? R.drawable.wx_clear_night : R.drawable.wx_clear;
        if (code == 2) return night ? R.drawable.wx_partly_night : R.drawable.wx_partly;
        if (code == 3 || code == 45 || code == 48) return R.drawable.wx_cloud;
        if (code >= 95) return R.drawable.wx_storm;
        if ((code >= 71 && code <= 77) || code == 85 || code == 86) return R.drawable.wx_snow;
        if (code >= 66 && code <= 69) return R.drawable.wx_sleet;
        if (code >= 51 && code <= 57) return R.drawable.wx_drizzle;
        return R.drawable.wx_rain;
    }

    static String text(int c) {
        if (c == 0) return "맑음"; if (c == 1) return "대체로 맑음"; if (c == 2) return "구름많음"; if (c == 3) return "흐림";
        if (c == 45 || c == 48) return "안개"; if (c >= 51 && c <= 57) return "이슬비"; if (c >= 61 && c <= 65) return "비";
        if (c >= 66 && c <= 69) return "비/눈"; if (c >= 71 && c <= 77) return "눈"; if (c >= 80 && c <= 82) return "소나기";
        if (c == 85 || c == 86) return "눈 소나기"; if (c >= 95) return "뇌우"; return "흐림";
    }

    static String deg(double v) { return Math.round(v) + "°"; }
    static boolean night(String k) { int h = Integer.parseInt(k.substring(8, 10)); return h < 6 || h >= 19; }
    static boolean nightNow() { int h = Integer.parseInt(WidgetData.fmt(System.currentTimeMillis(), "HH")); return h < 6 || h >= 19; }

    static Bitmap bar(double lo, double hi, double mn, double mx) {
        int w = 240, h = 16;
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0x1A10233F);
        cv.drawRoundRect(new RectF(0, 0, w, h), h / 2f, h / 2f, p);
        double sp = Math.max(1, hi - lo);
        float x0 = (float) ((mn - lo) / sp * w), x1 = (float) ((mx - lo) / sp * w);
        if (x1 - x0 < h) x1 = Math.min(w, x0 + h);
        p.setShader(new LinearGradient(x0, 0, x1, 0, 0xFF4EA3EF, 0xFFF59A23, Shader.TileMode.CLAMP));
        cv.drawRoundRect(new RectF(x0, 0, x1, h), h / 2f, h / 2f, p);
        return b;
    }

    static void render(Context c, AppWidgetManager m, int id, boolean compare) {
        Bundle opt = m.getAppWidgetOptions(id);
        int w = opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int h = opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (w == 0) w = compare ? 320 : 320;
        if (h == 0) h = 170;
        String snapS = prefs(c).getString("snap", null);
        RemoteViews rv;
        PendingIntent open = PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (snapS == null) {
            rv = new RemoteViews(c.getPackageName(), R.layout.w_loading);
            rv.setTextViewText(R.id.msg, prefs(c).getLong("failAt", 0) > 0 ? "날씨를 불러오지 못했어요\n눌러서 앱 열기" : "날씨를 불러오는 중…");
            rv.setOnClickPendingIntent(R.id.root, open);
            m.updateAppWidget(id, rv);
            schedule(c, false);
            return;
        }
        try {
            JSONObject s = new JSONObject(snapS);
            JSONObject cur = s.getJSONObject("cur"), td = s.getJSONObject("today");
            JSONArray hs = s.getJSONArray("hours"), ds = s.getJSONArray("days"), cmp = s.getJSONArray("cmp");
            String ps = prefs(c).getString("place", null);
            JSONObject pl = ps != null ? new JSONObject(ps) : s;
            String loc = pl.optString("name") + (pl.optString("sub").isEmpty() ? "" : " " + pl.optString("sub"));
            int locIc = pl.optBoolean("gps") ? R.drawable.ic_w_nav : R.drawable.ic_w_pin;
            int wc = cur.optInt("wc", 3);
            boolean nt = nightNow();
            String tp = deg(cur.getDouble("tp"));
            String hilo = deg(td.optDouble("mx", cur.getDouble("tp"))) + " / " + deg(td.optDouble("mn", cur.getDouble("tp")));
            String pop = td.has("pop") ? td.getInt("pop") + "%" : (td.has("pr") ? td.getDouble("pr") + "㎜" : "");
            String upd = WidgetData.fmt(s.getLong("at"), "H:mm") + " " + s.optString("src") + " 기준";
            if (compare) {
                if (w < 250) {
                    rv = new RemoteViews(c.getPackageName(), R.layout.c_2x2);
                    rv.setTextViewText(R.id.ktitle, "오늘 최고 / 최저");
                    int[] kn = {R.id.kn0, R.id.kn1, R.id.kn2, R.id.kn3}, kv = {R.id.kv0, R.id.kv1, R.id.kv2, R.id.kv3};
                    // 2×2 는 기상청·유럽·미국·일본 (노르웨이는 오늘 남은 시간만 있어 최고기온이 낮게 보여 제외)
                    int[] pick = {0, 2, 3, 4};
                    int shown = 0;
                    for (int i : pick) {
                        if (i >= cmp.length()) continue;
                        JSONObject x = cmp.getJSONObject(i);
                        rv.setTextViewText(kn[shown], x.getString("n"));
                        rv.setTextViewText(kv[shown], x.has("mx") ? deg(x.getDouble("mx")) + " / " + deg(x.getDouble("mn")) : "–");
                        shown++;
                    }
                    rv.setTextViewText(R.id.kfoot, "출처 " + shown + "곳 비교");
                } else {
                    rv = new RemoteViews(c.getPackageName(), h >= 220 ? R.layout.c_4x4 : R.layout.c_4x2);
                    rv.setImageViewResource(R.id.ic, icon(wc, nt));
                    rv.setTextViewText(R.id.tp, tp);
                    rv.setTextViewText(R.id.cond, text(wc) + " · " + hilo);
                    int[] cd = {R.id.cd0, R.id.cd1, R.id.cd2, R.id.cd3, R.id.cd4}, cn = {R.id.cn0, R.id.cn1, R.id.cn2, R.id.cn3, R.id.cn4},
                            ci = {R.id.ci0, R.id.ci1, R.id.ci2, R.id.ci3, R.id.ci4}, cc = {R.id.cc0, R.id.cc1, R.id.cc2, R.id.cc3, R.id.cc4},
                            cx = {R.id.cx0, R.id.cx1, R.id.cx2, R.id.cx3, R.id.cx4}, cm = {R.id.cm0, R.id.cm1, R.id.cm2, R.id.cm3, R.id.cm4},
                            cr = {R.id.cr0, R.id.cr1, R.id.cr2, R.id.cr3, R.id.cr4};
                    for (int i = 0; i < 5; i++) {
                        JSONObject x = i < cmp.length() ? cmp.getJSONObject(i) : new JSONObject();
                        rv.setTextColor(cd[i], x.optInt("color", 0xFF1E6FE6));
                        rv.setTextViewText(cn[i], x.optString("n"));
                        if (x.has("tp")) {
                            rv.setImageViewResource(ci[i], icon(x.optInt("wc", 3), nt));
                            rv.setViewVisibility(ci[i], View.VISIBLE);
                            rv.setTextViewText(cc[i], deg(x.getDouble("tp")));
                            rv.setTextViewText(cx[i], x.has("mx") ? deg(x.getDouble("mx")) : "–");
                            rv.setTextViewText(cm[i], x.has("mn") ? deg(x.getDouble("mn")) : "–");
                            rv.setTextViewText(cr[i], x.optString("rain", "–"));
                        } else {
                            rv.setViewVisibility(ci[i], View.INVISIBLE);
                            rv.setTextViewText(cc[i], ""); rv.setTextViewText(cx[i], ""); rv.setTextViewText(cm[i], "");
                            rv.setTextViewText(cr[i], "자료 없음");
                        }
                    }
                }
                rv.setTextViewText(R.id.loc, loc);
                rv.setImageViewResource(R.id.locIcon, locIc);
            } else if (w < 110 && h < 110) {
                rv = new RemoteViews(c.getPackageName(), R.layout.w_1x1);
                rv.setImageViewResource(R.id.ic, icon(wc, nt));
                rv.setTextViewText(R.id.tp, tp);
            } else if (w < 250) {
                if (h < 110) {
                    rv = new RemoteViews(c.getPackageName(), R.layout.w_2x1);
                    rv.setTextViewText(R.id.hilo, hilo);
                } else {
                    rv = new RemoteViews(c.getPackageName(), R.layout.w_2x2);
                    rv.setTextViewText(R.id.loc, loc);
                    rv.setImageViewResource(R.id.locIcon, locIc);
                    rv.setTextViewText(R.id.cond, text(wc));
                    rv.setTextViewText(R.id.hilo, "최고 " + deg(td.optDouble("mx", 0)) + " · 최저 " + deg(td.optDouble("mn", 0)));
                    rv.setTextViewText(R.id.pop, td.has("pop") ? "강수확률 " + td.getInt("pop") + "%" : (pop.isEmpty() ? "" : "강수량 " + pop));
                }
                rv.setImageViewResource(R.id.ic, icon(wc, nt));
                rv.setTextViewText(R.id.tp, tp);
            } else if (h < 110) {
                rv = new RemoteViews(c.getPackageName(), R.layout.w_4x1);
                rv.setImageViewResource(R.id.ic, icon(wc, nt));
                rv.setTextViewText(R.id.tp, tp);
                rv.setTextViewText(R.id.loc, loc);
                rv.setImageViewResource(R.id.locIcon, locIc);
                rv.setTextViewText(R.id.sum, text(wc) + " · " + hilo + (pop.isEmpty() ? "" : " · ☂ " + pop));
            } else {
                boolean big = h >= 260;
                rv = new RemoteViews(c.getPackageName(), big ? R.layout.w_4x4 : R.layout.w_4x2);
                rv.setImageViewResource(R.id.ic, icon(wc, nt));
                rv.setTextViewText(R.id.tp, tp);
                rv.setTextViewText(R.id.loc, loc);
                rv.setImageViewResource(R.id.locIcon, locIc);
                rv.setTextViewText(R.id.upd, upd);
                int[] ht = {R.id.ht0, R.id.ht1, R.id.ht2, R.id.ht3, R.id.ht4, R.id.ht5}, hi = {R.id.hi0, R.id.hi1, R.id.hi2, R.id.hi3, R.id.hi4, R.id.hi5},
                        hv = {R.id.hv0, R.id.hv1, R.id.hv2, R.id.hv3, R.id.hv4, R.id.hv5}, hp = {R.id.hp0, R.id.hp1, R.id.hp2, R.id.hp3, R.id.hp4, R.id.hp5};
                int step = big ? 2 : 1;
                String tmr = WidgetData.addDays(WidgetData.dayKey(System.currentTimeMillis()), 1) + "00";
                for (int i = 0; i < 6; i++) {
                    int idx = i * step;
                    if (idx >= hs.length()) { rv.setViewVisibility(hi[i], View.INVISIBLE); rv.setTextViewText(ht[i], ""); rv.setTextViewText(hv[i], ""); rv.setTextViewText(hp[i], ""); continue; }
                    JSONObject x = hs.getJSONObject(idx);
                    String k = x.getString("k");
                    boolean mid = k.equals(tmr);
                    rv.setTextViewText(ht[i], i == 0 ? "지금" : mid ? "내일" : Integer.parseInt(k.substring(8)) + "시");
                    rv.setTextColor(ht[i], mid ? 0xFF1E6FE6 : 0xFF5D6E86);
                    rv.setImageViewResource(hi[i], icon(x.optInt("wc", 3), night(k)));
                    rv.setTextViewText(hv[i], deg(x.getDouble("tp")));
                    rv.setTextViewText(hp[i], x.has("pop") ? (x.getInt("pop") > 0 ? x.getInt("pop") + "%" : "") : (x.optDouble("pr", 0) >= 0.1 ? x.getDouble("pr") + "㎜" : ""));
                }
                if (big) {
                    rv.setTextViewText(R.id.sum, text(wc) + " · 최고 " + deg(td.optDouble("mx", 0)) + " · 최저 " + deg(td.optDouble("mn", 0)));
                    rv.setTextViewText(R.id.sum2, (cur.has("fl") ? "체감 " + deg(cur.getDouble("fl")) : "") + (cur.has("rh") ? " · 습도 " + Math.round(cur.getDouble("rh")) + "%" : ""));
                    int[] dl = {R.id.dl0, R.id.dl1, R.id.dl2, R.id.dl3, R.id.dl4}, di = {R.id.di0, R.id.di1, R.id.di2, R.id.di3, R.id.di4},
                            dp = {R.id.dp0, R.id.dp1, R.id.dp2, R.id.dp3, R.id.dp4}, dn = {R.id.dn0, R.id.dn1, R.id.dn2, R.id.dn3, R.id.dn4},
                            db = {R.id.db0, R.id.db1, R.id.db2, R.id.db3, R.id.db4}, dx = {R.id.dx0, R.id.dx1, R.id.dx2, R.id.dx3, R.id.dx4};
                    double lo = 99, hi2 = -99;
                    int n = Math.min(5, ds.length());
                    for (int i = 0; i < n; i++) { lo = Math.min(lo, ds.getJSONObject(i).getDouble("mn")); hi2 = Math.max(hi2, ds.getJSONObject(i).getDouble("mx")); }
                    String DOW = "일월화수목금토";
                    for (int i = 0; i < 5; i++) {
                        if (i >= n) { rv.setTextViewText(dl[i], ""); rv.setViewVisibility(di[i], View.INVISIBLE); rv.setTextViewText(dp[i], ""); rv.setTextViewText(dn[i], ""); rv.setViewVisibility(db[i], View.INVISIBLE); rv.setTextViewText(dx[i], ""); continue; }
                        JSONObject d = ds.getJSONObject(i);
                        rv.setTextViewText(dl[i], i == 0 ? "오늘" : String.valueOf(DOW.charAt(WidgetData.dow(d.getString("d")))));
                        rv.setImageViewResource(di[i], icon(d.optInt("wc", 3), false));
                        rv.setTextViewText(dp[i], d.has("pop") ? (d.getInt("pop") > 0 ? d.getInt("pop") + "%" : "") : (d.optDouble("pr", 0) >= 0.1 ? d.getDouble("pr") + "㎜" : ""));
                        rv.setTextViewText(dn[i], deg(d.getDouble("mn")));
                        rv.setImageViewBitmap(db[i], bar(lo, hi2, d.getDouble("mn"), d.getDouble("mx")));
                        rv.setTextViewText(dx[i], deg(d.getDouble("mx")));
                    }
                    rv.setTextViewText(R.id.upd, upd + " · 탭하면 앱 열기");
                    Intent ri = new Intent(c, WeatherWidget.class).setAction(ACTION_REFRESH);
                    rv.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(c, 1, ri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
                } else {
                    rv.setTextViewText(R.id.sum, text(wc) + " · " + hilo + (pop.isEmpty() ? "" : " · " + pop));
                }
            }
            rv.setOnClickPendingIntent(R.id.root, open);
            m.updateAppWidget(id, rv);
        } catch (Exception e) {
            RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.w_loading);
            r.setTextViewText(R.id.msg, "날씨를 표시하지 못했어요");
            r.setOnClickPendingIntent(R.id.root, open);
            m.updateAppWidget(id, r);
        }
        schedule(c, false);
    }
}
