package com.kja5046.studyplanner;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Locale;

/** 홈 화면 "오늘 플래너" 위젯 */
public class PlannerWidget extends AppWidgetProvider {
    static final String ACTION_TOGGLE = "com.kja5046.studyplanner.TOGGLE";
    static final String ACTION_REFRESH = "com.kja5046.studyplanner.REFRESH";
    static final String EXTRA_DATE = "date";
    static final String EXTRA_INDEX = "index";

    private static final String[] DOW = {"월", "화", "수", "목", "금", "토", "일"};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context, id));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.w_list);
        scheduleMidnight(context);
    }

    @Override
    public void onEnabled(Context context) {
        scheduleMidnight(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_TOGGLE.equals(action)) {
            Store.toggle(context, intent.getStringExtra(EXTRA_DATE), intent.getIntExtra(EXTRA_INDEX, -1));
            refreshAll(context);
        } else if (ACTION_REFRESH.equals(action)) {
            refreshAll(context);
        }
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PlannerWidget.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) manager.updateAppWidget(id, build(context, id));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.w_list);
        scheduleMidnight(context);
    }

    private static RemoteViews build(Context context, int widgetId) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_planner);
        LocalDate now = LocalDate.now();
        String date = now.toString();
        JSONObject s = Store.summary(context);
        JSONObject d = Store.day(s, date);

        v.setTextViewText(R.id.w_date, String.format(Locale.KOREA, "%02d / %02d  %s",
                now.getMonthValue(), now.getDayOfMonth(), DOW[now.getDayOfWeek().getValue() - 1]));

        // D-day
        String dday = "";
        String target = s.optString("ddayDate", "");
        if (!target.isEmpty()) {
            try {
                long diff = ChronoUnit.DAYS.between(now, LocalDate.parse(target));
                dday = diff > 0 ? "D-" + diff : diff == 0 ? "D-DAY" : "D+" + (-diff);
            } catch (Exception ignored) {
            }
        }
        v.setTextViewText(R.id.w_dday, dday);
        v.setTextViewText(R.id.w_dlabel, dday.isEmpty() ? "" : s.optString("ddayLabel", ""));

        // 공부시간 · 완료
        int minutes = d == null ? 0 : d.optInt("minutes", 0);
        v.setTextViewText(R.id.w_time, String.format(Locale.KOREA, "%dH %02dM", minutes / 60, minutes % 60));
        JSONArray tasks = d == null ? null : d.optJSONArray("tasks");
        int total = tasks == null ? 0 : tasks.length();
        int done = 0;
        for (int k = 0; k < total; k++) {
            JSONObject t = tasks.optJSONObject(k);
            if (t != null && t.optBoolean("d", false)) done++;
        }
        v.setTextViewText(R.id.w_done, total == 0 ? "-" : done + " / " + total);

        // 한마디 · 칭찬 도장
        String quote = d == null ? "" : d.optString("q", "");
        v.setTextViewText(R.id.w_quote, quote);
        v.setViewVisibility(R.id.w_quote, quote.isEmpty() ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.w_stamp, d != null && d.optBoolean("great", false) ? View.VISIBLE : View.GONE);

        // 할 일 목록
        Intent svc = new Intent(context, TaskListService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.w_list, svc);
        v.setEmptyView(R.id.w_list, R.id.w_empty);

        Intent toggle = new Intent(context, PlannerWidget.class).setAction(ACTION_TOGGLE);
        PendingIntent toggleTemplate = PendingIntent.getBroadcast(context, 1, toggle,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        v.setPendingIntentTemplate(R.id.w_list, toggleTemplate);

        // 머리 부분을 누르면 앱의 오늘 페이지 열기
        Intent open = new Intent(context, MainActivity.class)
                .putExtra(MainActivity.EXTRA_ROUTE, "#/daily/" + date)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(context, 2, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_head, openPi);
        v.setOnClickPendingIntent(R.id.w_quote, openPi);
        v.setOnClickPendingIntent(R.id.w_empty, openPi);
        return v;
    }

    /** 자정이 지나면 다음 날 화면으로 바꾸기 위한 알람 */
    private static void scheduleMidnight(Context context) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am == null) return;
        Intent i = new Intent(context, PlannerWidget.class).setAction(ACTION_REFRESH);
        PendingIntent pi = PendingIntent.getBroadcast(context, 3, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long next = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() + 5000;
        am.set(AlarmManager.RTC, next, pi);
    }
}
