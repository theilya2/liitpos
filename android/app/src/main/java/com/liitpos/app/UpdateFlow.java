package com.liitpos.app;

import java.net.ConnectException;
import java.net.MalformedURLException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;

/** Pure decisions for the in-app updater. No Android framework types, so unit tests can run it. */
public final class UpdateFlow {
    public static final String NETWORK = "אין חיבור. בדקו את הרשת ונסו שוב.";
    public static final String DOWNLOAD_FAILED = "ההורדה נכשלה. נסו שוב.";
    public static final String BAD_URL = "כתובת העדכון לא תקינה.";
    public static final String INSECURE_REDIRECT = "ההפניה של ההורדה לא מאובטחת.";
    public static final String TOO_MANY_REDIRECTS = "ההורדה נכשלה אחרי יותר מדי הפניות.";
    public static final String CORRUPT = "קובץ העדכון פגום.";
    public static final String WRONG_PACKAGE = "הקובץ אינו עדכון של קופהקל.";
    public static final String UNSIGNED = "קובץ העדכון לא חתום.";
    public static final String SIGNATURE_MISMATCH = "חבילת העדכון לא חתומה כמו האפליקציה הזו.";
    public static final String NOT_NEWER = "הגרסה בקובץ אינה חדשה יותר מהמותקנת.";
    public static final String PERMISSION = "צריך לאשר התקנה ממקור לא ידוע. אחרי האישור ההורדה ממשיכה לבד.";
    public static final String PERMISSION_DENIED = "האישור להתקנה לא ניתן. אי אפשר לעדכן בלי זה.";
    public static final String PERMISSION_SCREEN = "לא הצלחנו לפתוח את מסך האישור להתקנה.";
    public static final String NO_INSTALLER = "אין מתקין חבילות במכשיר.";
    public static final String INSTALL_BLOCKED = "המערכת חסמה את ההתקנה.";
    public static final String INSTALL_ABORTED = "ההתקנה בוטלה.";
    public static final String INSTALL_CONFLICT = "העדכון מתנגש עם האפליקציה המותקנת.";
    public static final String INSTALL_INCOMPATIBLE = "העדכון לא מתאים למכשיר הזה.";
    public static final String INSTALL_STORAGE = "אין מספיק מקום להתקנה.";
    public static final String INSTALL_FAILED = "ההתקנה נכשלה.";
    public static final String ALREADY = "ההורדה כבר מתבצעת.";
    public static final String DOWNLOADING = "מורידים…";
    public static final String INSTALLING = "מתקינים…";
    public static final String INSTALLED = "העדכון הותקן.";
    public static final String GENERIC = "העדכון נכשל. נסו שוב.";

    static final int STATUS_PENDING_USER_ACTION = -1;
    static final int STATUS_SUCCESS = 0;
    static final int STATUS_FAILURE = 1;
    static final int STATUS_FAILURE_BLOCKED = 2;
    static final int STATUS_FAILURE_ABORTED = 3;
    static final int STATUS_FAILURE_INVALID = 4;
    static final int STATUS_FAILURE_CONFLICT = 5;
    static final int STATUS_FAILURE_STORAGE = 6;
    static final int STATUS_FAILURE_INCOMPATIBLE = 7;

    private UpdateFlow() {}

    public static String downloading(int percent) {
        return "מורידים " + percent + "%";
    }

    public static String httpFailed(int status) {
        if (status > 0) return "ההורדה נכשלה (קוד " + status + "). נסו שוב.";
        return DOWNLOAD_FAILED;
    }

    /** @return 0–99 while reading, 100 when finished, -1 when the length is unknown */
    public static int percent(long read, long total) {
        if (total <= 0) return -1;
        if (read <= 0) return 0;
        if (read >= total) return 100;
        return (int) Math.min(99, (read * 100L) / total);
    }

    public static String messageForStatus(int status) {
        switch (status) {
            case STATUS_PENDING_USER_ACTION:
                return INSTALLING;
            case STATUS_SUCCESS:
                return INSTALLED;
            case STATUS_FAILURE_BLOCKED:
                return INSTALL_BLOCKED;
            case STATUS_FAILURE_ABORTED:
                return INSTALL_ABORTED;
            case STATUS_FAILURE_INVALID:
                return UNSIGNED;
            case STATUS_FAILURE_CONFLICT:
                return INSTALL_CONFLICT;
            case STATUS_FAILURE_STORAGE:
                return INSTALL_STORAGE;
            case STATUS_FAILURE_INCOMPATIBLE:
                return INSTALL_INCOMPATIBLE;
            case STATUS_FAILURE:
            default:
                return INSTALL_FAILED;
        }
    }

    public static boolean allowedDownloadUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            URL parsed = new URL(url);
            if (parsed.getUserInfo() != null) return false;
            if ("https".equalsIgnoreCase(parsed.getProtocol())) return true;
            if (!"http".equalsIgnoreCase(parsed.getProtocol())) return false;
            String host = parsed.getHost();
            return "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host);
        } catch (MalformedURLException error) {
            return false;
        }
    }

    /** Follow one redirect. Returns null when the target is missing or not https. */
    public static String nextHttps(String current, String location) {
        if (current == null || location == null || location.isEmpty()) return null;
        try {
            URL next = new URL(new URL(current), location);
            if (!"https".equalsIgnoreCase(next.getProtocol())) return null;
            if (next.getUserInfo() != null) return null;
            return next.toString();
        } catch (MalformedURLException error) {
            return null;
        }
    }

    public static String forTransport(Throwable error) {
        Throwable cursor = error;
        while (cursor != null) {
            if (cursor instanceof UnknownHostException
                    || cursor instanceof SocketTimeoutException
                    || cursor instanceof ConnectException
                    || cursor instanceof NoRouteToHostException) {
                return NETWORK;
            }
            if (cursor instanceof MalformedURLException) return BAD_URL;
            cursor = cursor.getCause();
        }
        return DOWNLOAD_FAILED;
    }
}
