package com.kja5046.studyplanner;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;

/** 웹 플래너를 앱 안에서 띄우고, 위젯과 기록을 주고받는다. */
public class MainActivity extends Activity {
    /** 플래너 주소. GitHub Pages 주소가 바뀌면 여기만 고치면 된다. */
    static final String PLANNER_URL = "https://kja5046.github.io/studyplanner/index.html";
    static final String EXTRA_ROUTE = "route";
    private static final int REQ_FILE = 11;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setTextZoom(100);
        ws.setBuiltInZoomControls(true);
        ws.setDisplayZoomControls(false);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (Uri.parse(PLANNER_URL).getHost().equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            String route = getIntent().getStringExtra(EXTRA_ROUTE);
            web.loadUrl(PLANNER_URL + (route == null ? "" : route));
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String route = intent.getStringExtra(EXTRA_ROUTE);
        if (route != null && web != null) {
            web.evaluateJavascript("location.hash = " + JSONObject.quote(route) + ";", null);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        // 위젯에서 체크한 내용을 플래너에 반영
        web.evaluateJavascript("window.__androidResume && window.__androidResume();", null);
    }

    @Override
    protected void onPause() {
        web.evaluateJavascript("window.__androidFlush && window.__androidFlush();", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** 웹 페이지에서 window.AndroidBridge 로 부르는 함수들 */
    private class Bridge {
        @JavascriptInterface
        public void update(String json) {
            Store.saveSummary(MainActivity.this, json);
            PlannerWidget.refreshAll(MainActivity.this);
        }

        @JavascriptInterface
        public String takePending() {
            return Store.takePending(MainActivity.this);
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            String message;
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                boolean image = mime != null && mime.startsWith("image/");
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH,
                        image ? Environment.DIRECTORY_PICTURES + "/StudyPlanner" : Environment.DIRECTORY_DOWNLOADS);
                Uri collection = image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                ContentResolver cr = getContentResolver();
                Uri uri = cr.insert(collection, cv);
                if (uri == null) throw new IOException("insert failed");
                try (OutputStream os = cr.openOutputStream(uri)) {
                    if (os == null) throw new IOException("open failed");
                    os.write(bytes);
                }
                message = image ? "사진(Pictures/StudyPlanner)에 저장했어요" : "다운로드 폴더에 저장했어요";
            } catch (Exception e) {
                message = "저장하지 못했어요";
            }
            final String m = message;
            runOnUiThread(() -> Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show());
        }
    }
}
