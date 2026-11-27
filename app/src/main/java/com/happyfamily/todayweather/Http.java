package com.happyfamily.todayweather;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/** 위젯용 단순 HTTP GET(재시도 포함) */
final class Http {
    private Http() {}

    static String get(String url, Map<String, String> headers, int tries) throws Exception {
        Exception last = null;
        for (int i = 0; i < tries; i++) {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(12000);
                c.setRequestProperty("Accept", "application/json");
                if (headers != null) for (Map.Entry<String, String> e : headers.entrySet()) c.setRequestProperty(e.getKey(), e.getValue());
                int code = c.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
                InputStream in = c.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[16384]; int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                in.close();
                String s = bo.toString("UTF-8");
                if (s.trim().isEmpty()) throw new Exception("empty");
                return s;
            } catch (Exception e) {
                last = e;
                try { Thread.sleep(700L * (i + 1)); } catch (InterruptedException ignored) {}
            } finally { if (c != null) c.disconnect(); }
        }
        throw last;
    }

    static Object json(String url, Map<String, String> headers, int tries) throws Exception {
        return new JSONTokener(get(url, headers, tries)).nextValue();
    }

    static JSONObject obj(String url, Map<String, String> headers, int tries) throws Exception {
        return (JSONObject) json(url, headers, tries);
    }
}
