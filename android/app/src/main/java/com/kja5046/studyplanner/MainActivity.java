package com.kja5046.studyplanner;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
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

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.io.OutputStream;

/** 웹 플래너를 앱 안에서 띄우고, 위젯과 기록을 주고받는다. */
public class MainActivity extends Activity {
    /** 플래너 주소. GitHub Pages 주소가 바뀌면 여기만 고치면 된다. */
    static final String PLANNER_URL = "https://kja5046.github.io/studyplanner/index.html";
    static final String EXTRA_ROUTE = "route";
    private static final int REQ_FILE = 11;
    private static final int REQ_SYNC_CREATE = 12;
    private static final int REQ_SYNC_OPEN = 13;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 디버그 빌드에서는 PC Chrome의 chrome://inspect 로 앱 속 페이지를 검사할 수 있게 한다
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
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
        if (requestCode == REQ_SYNC_CREATE || requestCode == REQ_SYNC_OPEN) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri uri = data.getData();
                int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                try {
                    getContentResolver().takePersistableUriPermission(uri,
                            flags != 0 ? flags : (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION));
                } catch (SecurityException ignored) {
                }
                Store.setSync(this, uri.toString(), displayName(uri));
                String mode = requestCode == REQ_SYNC_CREATE ? "create" : "open";
                web.evaluateJavascript("window.__androidSyncReady && window.__androidSyncReady('" + mode + "');", null);
            }
            return;
        }
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
        // 위젯에서 체크한 내용을 플래너에 반영하고, 드라이브의 최신 기록을 가져온다
        web.evaluateJavascript("window.__androidResume && window.__androidResume();", null);
        readSyncAsync();
    }

    @Override
    protected void onPause() {
        // 저장하고 드라이브에 올린다 (web.onPause()는 부르지 않아야 업로드가 끝까지 실행된다)
        web.evaluateJavascript("window.__androidFlush && window.__androidFlush(); window.__androidSyncOut && window.__androidSyncOut();", null);
        super.onPause();
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null) return n;
            }
        } catch (Exception ignored) {
        }
        return "planner-sync.json";
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
    }

    /** 드라이브의 동기화 파일을 읽어서 웹 플래너에 넘긴다 */
    private void readSyncAsync() {
        final String s = Store.syncUri(this);
        if (s.isEmpty()) return;
        io.execute(() -> {
            try (InputStream in = getContentResolver().openInputStream(Uri.parse(s))) {
                if (in == null) throw new IOException("open failed");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                final String text = new String(out.toByteArray(), StandardCharsets.UTF_8);
                runOnUiThread(() -> web.evaluateJavascript(
                        "window.__androidSyncIn && window.__androidSyncIn(" + JSONObject.quote(text) + ");", null));
            } catch (SecurityException e) {
                toast("동기화 파일 권한이 없어요. 설정에서 다시 연결해 주세요");
            } catch (Exception e) {
                toast("동기화 파일을 읽지 못했어요. 인터넷 연결을 확인해 주세요");
            }
        });
    }

    private void writeSync(String json) {
        final String s = Store.syncUri(this);
        if (s.isEmpty()) return;
        io.execute(() -> {
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            Uri uri = Uri.parse(s);
            try {
                OutputStream os;
                try {
                    os = getContentResolver().openOutputStream(uri, "wt");
                } catch (Exception e) {
                    os = getContentResolver().openOutputStream(uri, "w");
                }
                if (os == null) throw new IOException("open failed");
                try (OutputStream o = os) {
                    o.write(bytes);
                }
            } catch (Exception e) {
                toast("드라이브에 저장하지 못했어요");
            }
        });
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
        public String syncInfo() {
            return Store.syncName(MainActivity.this);
        }

        @JavascriptInterface
        public void syncCreate() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, "planner-sync.json");
                try {
                    startActivityForResult(i, REQ_SYNC_CREATE);
                } catch (ActivityNotFoundException e) {
                    toast("파일 선택 창을 열 수 없어요");
                }
            });
        }

        @JavascriptInterface
        public void syncOpen() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(i, REQ_SYNC_OPEN);
                } catch (ActivityNotFoundException e) {
                    toast("파일 선택 창을 열 수 없어요");
                }
            });
        }

        @JavascriptInterface
        public void syncReadAsync() {
            readSyncAsync();
        }

        @JavascriptInterface
        public void syncWrite(String json) {
            writeSync(json);
        }

        @JavascriptInterface
        public void syncClear() {
            String s = Store.syncUri(MainActivity.this);
            if (!s.isEmpty()) {
                try {
                    getContentResolver().releasePersistableUriPermission(Uri.parse(s),
                            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } catch (Exception ignored) {
                }
            }
            Store.clearSync(MainActivity.this);
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
