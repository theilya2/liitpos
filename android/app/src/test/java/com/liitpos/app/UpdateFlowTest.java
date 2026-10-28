package com.liitpos.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.net.UnknownHostException;
import org.junit.Test;

public class UpdateFlowTest {
    @Test
    public void everyInstallerStatusHasAHebrewMessage() {
        int[] codes = {-1, 0, 1, 2, 3, 4, 5, 6, 7, 99};
        for (int code : codes) {
            String message = UpdateFlow.messageForStatus(code);
            assertFalse(message.isEmpty());
            assertTrue(message + " for " + code, hasHebrew(message));
        }
    }

    @Test
    public void failureMessagesNameTheCause() {
        assertEquals(UpdateFlow.INSTALL_BLOCKED, UpdateFlow.messageForStatus(UpdateFlow.STATUS_FAILURE_BLOCKED));
        assertEquals(UpdateFlow.INSTALL_ABORTED, UpdateFlow.messageForStatus(UpdateFlow.STATUS_FAILURE_ABORTED));
        assertEquals(UpdateFlow.UNSIGNED, UpdateFlow.messageForStatus(UpdateFlow.STATUS_FAILURE_INVALID));
        assertEquals(UpdateFlow.INSTALL_STORAGE, UpdateFlow.messageForStatus(UpdateFlow.STATUS_FAILURE_STORAGE));
        assertEquals(UpdateFlow.INSTALLED, UpdateFlow.messageForStatus(UpdateFlow.STATUS_SUCCESS));
        assertTrue(hasHebrew(UpdateFlow.httpFailed(404)));
        assertTrue(UpdateFlow.httpFailed(404).contains("404"));
        assertEquals(UpdateFlow.NETWORK, UpdateFlow.forTransport(new UnknownHostException("example.test")));
        assertEquals(UpdateFlow.DOWNLOAD_FAILED, UpdateFlow.forTransport(new IllegalStateException("x")));
    }

    @Test
    public void percentStaysInRange() {
        assertEquals(-1, UpdateFlow.percent(10, -1));
        assertEquals(0, UpdateFlow.percent(0, 200));
        assertEquals(40, UpdateFlow.percent(80, 200));
        assertEquals(99, UpdateFlow.percent(199, 200));
        assertEquals(100, UpdateFlow.percent(200, 200));
    }

    @Test
    public void redirectsStayOnHttps() {
        assertEquals("https://github.com/apk", UpdateFlow.nextHttps("https://github.com/releases/latest", "/apk"));
        assertEquals(
                "https://objects.githubusercontent.com/apk",
                UpdateFlow.nextHttps("https://github.com/a", "https://objects.githubusercontent.com/apk"));
        assertNull(UpdateFlow.nextHttps("https://github.com/a", "http://evil.example/apk"));
        assertNull(UpdateFlow.nextHttps("https://github.com/a", null));
        assertTrue(UpdateFlow.allowedDownloadUrl("https://github.com/theilya2/Liitpos/releases/download/v1.0.1023/liitpos-release.apk"));
        assertFalse(UpdateFlow.allowedDownloadUrl("http://evil.example/app.apk"));
        assertFalse(UpdateFlow.allowedDownloadUrl("http://localhost.evil.example/app.apk"));
        assertTrue(UpdateFlow.allowedDownloadUrl("http://127.0.0.1:8080/app.apk"));
    }

    private static boolean hasHebrew(String message) {
        return message.codePoints().anyMatch((point) -> point >= 0x0590 && point <= 0x05FF);
    }
}
