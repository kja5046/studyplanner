package com.kja5046.studyplanner;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.LocalDate;

/** 웹 플래너가 보내준 요약(오늘 할 일 등)과, 위젯에서 체크한 내용(대기열)을 보관한다. */
final class Store {
    private static final String PREFS = "planner";
    private static final String KEY_SUMMARY = "summary";
    private static final String KEY_PENDING = "pending";

    private Store() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String today() {
        return LocalDate.now().toString(); // yyyy-MM-dd
    }

    static synchronized JSONObject summary(Context c) {
        try {
            return new JSONObject(prefs(c).getString(KEY_SUMMARY, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    static synchronized void saveSummary(Context c, String json) {
        prefs(c).edit().putString(KEY_SUMMARY, json).apply();
    }

    static JSONObject day(JSONObject summary, String date) {
        JSONObject days = summary.optJSONObject("days");
        return days == null ? null : days.optJSONObject(date);
    }

    /** 위젯에서 할 일을 눌렀을 때: 화면용 요약을 바로 바꾸고, 앱이 열리면 반영할 대기열에 넣는다. */
    static synchronized void toggle(Context c, String date, int index) {
        if (date == null || index < 0) return;
        try {
            JSONObject s = summary(c);
            JSONObject d = day(s, date);
            if (d == null) return;
            JSONArray tasks = d.optJSONArray("tasks");
            if (tasks == null) return;
            boolean newValue = false;
            boolean found = false;
            for (int k = 0; k < tasks.length(); k++) {
                JSONObject t = tasks.optJSONObject(k);
                if (t != null && t.optInt("i", -1) == index) {
                    newValue = !t.optBoolean("d", false);
                    t.put("d", newValue);
                    found = true;
                    break;
                }
            }
            if (!found) return;
            int done = 0;
            for (int k = 0; k < tasks.length(); k++) {
                JSONObject t = tasks.optJSONObject(k);
                if (t != null && t.optBoolean("d", false)) done++;
            }
            d.put("done", done);
            prefs(c).edit().putString(KEY_SUMMARY, s.toString()).apply();

            JSONArray pending = new JSONArray(prefs(c).getString(KEY_PENDING, "[]"));
            JSONArray next = new JSONArray();
            for (int k = 0; k < pending.length(); k++) {
                JSONObject p = pending.optJSONObject(k);
                if (p == null) continue;
                if (date.equals(p.optString("date")) && p.optInt("i", -1) == index) continue;
                next.put(p);
            }
            JSONObject item = new JSONObject();
            item.put("date", date);
            item.put("i", index);
            item.put("d", newValue);
            next.put(item);
            prefs(c).edit().putString(KEY_PENDING, next.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    // ---- 구글 드라이브 동기화 파일 ----
    private static final String KEY_SYNC_URI = "syncUri";
    private static final String KEY_SYNC_NAME = "syncName";

    static void setSync(Context c, String uri, String name) {
        prefs(c).edit().putString(KEY_SYNC_URI, uri).putString(KEY_SYNC_NAME, name).apply();
    }

    static String syncUri(Context c) {
        return prefs(c).getString(KEY_SYNC_URI, "");
    }

    static String syncName(Context c) {
        return prefs(c).getString(KEY_SYNC_NAME, "");
    }

    static void clearSync(Context c) {
        prefs(c).edit().remove(KEY_SYNC_URI).remove(KEY_SYNC_NAME).apply();
    }

    static synchronized String takePending(Context c) {
        String p = prefs(c).getString(KEY_PENDING, "[]");
        prefs(c).edit().remove(KEY_PENDING).apply();
        return p;
    }
}
