package com.kja5046.studyplanner;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 위젯에서 여는 "오늘의 공부 시간표" 팝업.
 * 홈 화면 위에 작은 창으로 떠서 10분 칸에 과목색을 바로 칠한다.
 * (위젯 할 일 목록의 ✓ 누름도 이 화면을 거쳐 처리하고 바로 닫는다.)
 */
public class TimetableActivity extends Activity {
    static final String EXTRA_OP = "op";
    static final String OP_TOGGLE = "toggle";
    static final String OP_TIMETABLE = "timetable";

    private static final int INK = 0xFF45413E;
    private static final int MUTED = 0xFF97908A;
    private static final int PINK = 0xFFEC8C8C;
    private static final int LINE = 0xFF4D4845;
    private static final int LINE_SOFT = 0xFFDCD7D1;
    private static final int LINE_FAINT = 0xFFECE8E3;
    private static final int PAPER = 0xFFFFFEFC;
    private static final String[] DOW = {"월", "화", "수", "목", "금", "토", "일"};

    private String date;
    private int startHour = 5;
    private int[] slots = new int[144];
    private int[] colors = new int[0];
    private String[] names = new String[0];
    private int brush = 0;
    private final Map<Integer, Integer> changes = new LinkedHashMap<>();

    private TextView totalView;
    private LinearLayout brushRow;
    private GridView grid;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent in = getIntent();

        // 할 일 ✓ : 체크만 바꾸고 바로 닫는다
        if (OP_TOGGLE.equals(in.getStringExtra(EXTRA_OP))) {
            Store.toggle(this, in.getStringExtra(PlannerWidget.EXTRA_DATE), in.getIntExtra(PlannerWidget.EXTRA_INDEX, -1));
            PlannerWidget.refreshAll(this);
            finish();
            overridePendingTransition(0, 0);
            return;
        }

        JSONObject s = Store.summary(this);
        JSONArray subj = s.optJSONArray("subjects");
        if (subj == null || subj.length() == 0) {
            // 예전 버전의 플래너 기록이라 과목 정보가 없다 → 앱을 한 번 열어서 받아 온다
            Toast.makeText(this, "앱을 한 번 열면 위젯에서 바로 시간을 칠할 수 있어요", Toast.LENGTH_SHORT).show();
            startActivity(new Intent(this, MainActivity.class)
                    .putExtra(MainActivity.EXTRA_ROUTE, "#/daily/" + Store.today())
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            finish();
            return;
        }

        startHour = s.optInt("startHour", 5);
        // 시간표는 05시 ~ 다음날 04시라서, 새벽에는 전날 시간표에 칠한다
        LocalDate day = LocalDate.now();
        if (LocalTime.now().getHour() < startHour) day = day.minusDays(1);
        date = day.toString();

        colors = new int[subj.length()];
        names = new String[subj.length()];
        for (int k = 0; k < subj.length(); k++) {
            JSONObject o = subj.optJSONObject(k);
            names[k] = o == null ? "" : o.optString("name", "");
            colors[k] = parseColor(o == null ? "" : o.optString("color", ""));
        }
        java.util.Arrays.fill(slots, -1);
        JSONObject d = Store.day(s, date);
        JSONArray arr = d == null ? null : d.optJSONArray("slots");
        if (arr != null) for (int k = 0; k < 144 && k < arr.length(); k++) slots[k] = arr.optInt(k, -1);
        brush = Math.max(0, Math.min(colors.length - 1, Store.brush(this)));

        setContentView(buildUi(day));
    }

    private View buildUi(LocalDate day) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0x66000000);
        root.setOnClickListener(v -> finish()); // 바깥을 누르면 닫기

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackgroundResource(R.drawable.widget_bg);
        card.setPadding(dp(14), dp(14), dp(14), dp(12));
        card.setClickable(true); // 카드 안을 눌러도 닫히지 않게
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(
                Math.min(getResources().getDisplayMetrics().widthPixels - dp(32), dp(440)),
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        root.addView(card, cp);

        // 머리: 날짜 · 합계 · 완료
        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text(String.format(Locale.KOREA, "%02d / %02d  %s", day.getMonthValue(), day.getDayOfMonth(),
                DOW[day.getDayOfWeek().getValue() - 1]), 17, INK);
        title.setBackgroundResource(R.drawable.banner_bg);
        title.setPadding(dp(12), dp(3), dp(14), dp(3));
        head.addView(title);
        TextView label = text("  공부 ", 13, MUTED);
        head.addView(label);
        totalView = text("", 17, PINK);
        head.addView(totalView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView done = text("완료", 15, INK);
        done.setPadding(dp(14), dp(6), dp(14), dp(6));
        done.setBackground(round(Color.WHITE, LINE));
        done.setOnClickListener(v -> finish());
        head.addView(done);
        card.addView(head);

        // 칠할 과목
        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        brushRow = new LinearLayout(this);
        brushRow.setGravity(Gravity.CENTER_VERTICAL);
        hs.addView(brushRow);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hp.topMargin = dp(10);
        hp.bottomMargin = dp(8);
        card.addView(hs, hp);

        TextView hint = text("칸을 눌러 칠하고, 같은 과목 칸을 다시 누르면 지워져요", 11, MUTED);
        card.addView(hint);

        // 시간표 (화면에 다 안 들어가면 왼쪽 시각 줄을 끌어서 넘기기)
        grid = new GridView(this);
        ScrollView sv = new ScrollView(this);
        sv.setVerticalScrollBarEnabled(false);
        sv.addView(grid);
        int max = (int) (getResources().getDisplayMetrics().heightPixels * 0.6f);
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                Math.min(grid.fullHeight(), max));
        gp.topMargin = dp(6);
        card.addView(sv, gp);
        sv.post(() -> {
            int row = currentRow();
            if (row >= 0) sv.scrollTo(0, Math.max(0, (row - 3) * grid.rowH));
        });

        refresh();
        card.setAlpha(0f);
        card.setScaleX(0.96f);
        card.setScaleY(0.96f);
        card.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(140).start();
        return root;
    }

    /** 합계 · 과목별 시간 다시 그리기 */
    private void refresh() {
        int total = 0;
        int[] per = new int[colors.length];
        for (int v : slots) if (v >= 0) { total += 10; if (v < per.length) per[v] += 10; }
        totalView.setText(String.format(Locale.KOREA, "%dH %02dM", total / 60, total % 60));

        brushRow.removeAllViews();
        for (int k = 0; k < colors.length; k++) {
            final int idx = k;
            LinearLayout chip = new LinearLayout(this);
            chip.setGravity(Gravity.CENTER_VERTICAL);
            chip.setPadding(dp(6), dp(4), dp(10), dp(4));
            if (k == brush) chip.setBackground(round(Color.WHITE, LINE));
            View dot = new View(this);
            GradientDrawable g = new GradientDrawable();
            g.setShape(GradientDrawable.OVAL);
            g.setColor(colors[k]);
            dot.setBackground(g);
            chip.addView(dot, new LinearLayout.LayoutParams(dp(12), dp(12)));
            TextView n = text(" " + names[k], 15, INK);
            chip.addView(n);
            if (per[k] > 0) chip.addView(text(" " + fmt(per[k]), 13, MUTED));
            chip.setOnClickListener(v -> { brush = idx; Store.setBrush(this, idx); refresh(); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = dp(4);
            brushRow.addView(chip, lp);
        }
    }

    private void save() {
        if (changes.isEmpty()) return;
        Store.paintSlots(this, date, new LinkedHashMap<>(changes));
        changes.clear();
        PlannerWidget.refreshAll(this);
    }

    @Override
    protected void onPause() {
        save();
        super.onPause();
    }

    @Override
    public void finish() {
        save();
        super.finish();
        overridePendingTransition(0, android.R.anim.fade_out);
    }

    private int currentRow() {
        // 지금 칠하는 날이 곧 '현재 시간표의 날'이라 현재 시각 줄을 바로 계산한다
        int h = LocalTime.now().getHour();
        return ((h - startHour) % 24 + 24) % 24;
    }

    // ------------------------------------------------------------ 칠하기 칸
    private class GridView extends View {
        final int rowH = dp(26);
        final int labelW = dp(30);
        final Paint fill = new Paint();
        final Paint line = new Paint();
        final Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        Boolean erasing = null;

        GridView(Context c) {
            super(c);
            line.setStrokeWidth(Math.max(1, dp(1) / 1.5f));
            txt.setTextSize(sp(12));
            txt.setTypeface(Typeface.DEFAULT);
        }

        int fullHeight() {
            return rowH * 24 + dp(2);
        }

        @Override
        protected void onMeasure(int w, int h) {
            setMeasuredDimension(MeasureSpec.getSize(w), fullHeight());
        }

        @Override
        protected void onDraw(Canvas c) {
            int w = getWidth();
            float cellW = (w - labelW) / 6f;
            int now = currentRow();
            for (int r = 0; r < 24; r++) {
                int top = r * rowH;
                for (int k = 0; k < 6; k++) {
                    int v = slots[r * 6 + k];
                    if (v >= 0) {
                        fill.setColor(v < colors.length ? colors[v] : 0xFFDDDDDD);
                        c.drawRect(labelW + k * cellW, top, labelW + (k + 1) * cellW, top + rowH, fill);
                    }
                }
                txt.setColor(r == now ? PINK : MUTED);
                txt.setFakeBoldText(r == now);
                c.drawText(String.format(Locale.KOREA, "%02d", (startHour + r) % 24), dp(4), top + rowH - dp(8), txt);
                line.setColor(LINE_SOFT);
                c.drawLine(0, top + rowH, w, top + rowH, line);
                for (int k = 1; k < 6; k++) {
                    line.setColor(LINE_FAINT);
                    c.drawLine(labelW + k * cellW, top, labelW + k * cellW, top + rowH, line);
                }
            }
            line.setColor(LINE_SOFT);
            c.drawLine(labelW, 0, labelW, rowH * 24, line);
            line.setColor(LINE);
            c.drawLine(0, 0, w, 0, line);
        }

        private int hit(float x, float y) {
            if (x < labelW || x >= getWidth() || y < 0 || y >= rowH * 24) return -1;
            int col = Math.min(5, (int) ((x - labelW) / ((getWidth() - labelW) / 6f)));
            return (int) (y / rowH) * 6 + col;
        }

        private void apply(int i) {
            if (i < 0) return;
            int v = Boolean.TRUE.equals(erasing) ? -1 : brush;
            if (slots[i] != v) {
                slots[i] = v;
                changes.put(i, v);
                invalidate();
            }
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: {
                    int i = hit(e.getX(), e.getY());
                    if (i < 0) return false; // 시각 줄은 화면 넘기기에 맡긴다
                    getParent().requestDisallowInterceptTouchEvent(true);
                    erasing = slots[i] == brush;
                    apply(i);
                    return true;
                }
                case MotionEvent.ACTION_MOVE:
                    if (erasing != null) apply(hit(e.getX(), e.getY()));
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    erasing = null;
                    refresh();
                    save();
                    return true;
            }
            return true;
        }
    }

    // ------------------------------------------------------------ 도우미
    private TextView text(String s, int sizeSp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        t.setTextColor(color);
        return t;
    }

    private GradientDrawable round(int bg, int stroke) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(bg);
        g.setStroke(dp(1), stroke);
        g.setCornerRadius(dp(999));
        return g;
    }

    private static int parseColor(String s) {
        try {
            if (s.length() == 4 && s.startsWith("#")) // #abc → #aabbcc
                s = "#" + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
            return Color.parseColor(s);
        } catch (Exception e) {
            return 0xFFDDDDDD;
        }
    }

    private static String fmt(int m) {
        int h = m / 60, r = m % 60;
        return h > 0 ? (r > 0 ? h + "시간 " + r + "분" : h + "시간") : r + "분";
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private float sp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, getResources().getDisplayMetrics());
    }
}
