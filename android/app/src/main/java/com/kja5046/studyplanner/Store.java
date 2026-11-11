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

    /**
     * 위젯 시간표 팝업에서 칠한 칸: 화면용 요약(칸·공부시간)을 바로 바꾸고, 앱이 열리면 반영할 대기열에 넣는다.
     * changes 는 칸 번호(0~143) → 과목 번호(-1 이면 지움).
     */
    static synchronized void paintSlots(Context c, String date, java.util.Map<Integer, Integer> changes) {
        if (date == null || changes == null || changes.isEmpty()) return;
        try {
            JSONObject s = summary(c);
            JSONObject days = s.optJSONObject("days");
            if (days == null) { days = new JSONObject(); s.put("days", days); }
            JSONObject d = days.optJSONObject(date);
            if (d == null) { d = new JSONObject(); d.put("tasks", new JSONArray()); days.put(date, d); }
            JSONArray old = d.optJSONArray("slots");
            JSONArray slots = new JSONArray();
            for (int k = 0; k < 144; k++) slots.put(old != null && k < old.length() ? old.optInt(k, -1) : -1);
            for (java.util.Map.Entry<Integer, Integer> e : changes.entrySet()) {
                int i = e.getKey();
                if (i >= 0 && i < 144) slots.put(i, e.getValue());
            }
            int filled = 0;
            for (int k = 0; k < 144; k++) if (slots.optInt(k, -1) >= 0) filled++;
            d.put("slots", slots);
            d.put("minutes", filled * 10);
            prefs(c).edit().putString(KEY_SUMMARY, s.toString()).apply();

            JSONArray pending = new JSONArray(prefs(c).getString(KEY_PENDING, "[]"));
            JSONArray next = new JSONArray();
            for (int k = 0; k < pending.length(); k++) {
                JSONObject p = pending.optJSONObject(k);
                if (p == null) continue;
                if ("slot".equals(p.optString("k")) && date.equals(p.optString("date"))
                        && changes.containsKey(p.optInt("idx", -1))) continue;
                next.put(p);
            }
            for (java.util.Map.Entry<Integer, Integer> e : changes.entrySet()) {
                JSONObject item = new JSONObject();
                item.put("k", "slot");
                item.put("date", date);
                item.put("idx", (int) e.getKey());
                item.put("v", (int) e.getValue());
                next.put(item);
            }
            prefs(c).edit().putString(KEY_PENDING, next.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    /** 시간표 팝업에서 마지막으로 고른 과목 */
    static int brush(Context c) {
        return prefs(c).getInt("brush", 0);
    }

    static void setBrush(Context c, int i) {
        prefs(c).edit().putInt("brush", i).apply();
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
