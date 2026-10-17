package com.kja5046.studyplanner;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** 위젯 안 할 일 목록 */
public class TaskListService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static class Factory implements RemoteViewsService.RemoteViewsFactory {
        private static final int INK = 0xFF45413E;
        private static final int MUTED = 0xFF97908A;
        private static final int PINK = 0xFFEC8C8C;
        private static final int CHECK_OFF = 0xFFE8E2DC;

        private final Context context;
        private final List<JSONObject> items = new ArrayList<>();
        private String date = "";

        Factory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            items.clear();
            date = Store.today();
            JSONObject d = Store.day(Store.summary(context), date);
            if (d == null) return;
            JSONArray tasks = d.optJSONArray("tasks");
            if (tasks == null) return;
            for (int k = 0; k < tasks.length(); k++) {
                JSONObject t = tasks.optJSONObject(k);
                if (t != null) items.add(t);
            }
        }

        @Override
        public void onDestroy() {
            items.clear();
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_item);
            if (position < 0 || position >= items.size()) return v;
            JSONObject t = items.get(position);

            // 구분(시간대·과목)은 바뀔 때만 보여준다
            String label = t.optString("s", "");
            String prev = "";
            for (int k = position - 1; k >= 0; k--) {
                String s = items.get(k).optString("s", "");
                if (!s.isEmpty()) { prev = s; break; }
            }
            v.setTextViewText(R.id.i_s, label.equals(prev) ? "" : label);
            v.setTextViewText(R.id.i_t, t.optString("t", ""));

            boolean done = t.optBoolean("d", false);
            v.setTextColor(R.id.i_t, done ? MUTED : INK);
            v.setTextColor(R.id.i_check, done ? PINK : CHECK_OFF);

            Intent fill = new Intent();
            fill.putExtra(PlannerWidget.EXTRA_DATE, date);
            fill.putExtra(PlannerWidget.EXTRA_INDEX, t.optInt("i", -1));
            v.setOnClickFillInIntent(R.id.i_root, fill);
            return v;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
