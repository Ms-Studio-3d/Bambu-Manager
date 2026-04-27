package com.msstudio.bambumanager;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class OfflineUrlPolicyTest {

    private boolean isAllowedLocalUrl(String url) {
        if (url == null) {
            return false;
        }

        return url.startsWith("file:///android_asset/")
                || url.startsWith("about:blank")
                || url.startsWith("data:");
    }

    @Test
    public void localAssetUrl_isAllowed() {
        assertTrue(isAllowedLocalUrl("file:///android_asset/index.html"));
    }

    @Test
    public void aboutBlank_isAllowed() {
        assertTrue(isAllowedLocalUrl("about:blank"));
    }

    @Test
    public void dataUrl_isAllowed() {
        assertTrue(isAllowedLocalUrl("data:text/plain,hello"));
    }

    @Test
    public void httpsUrl_isBlocked() {
        assertFalse(isAllowedLocalUrl("https://example.com"));
    }

    @Test
    public void whatsappUrl_isBlocked() {
        assertFalse(isAllowedLocalUrl("https://wa.me/201000000000"));
        assertFalse(isAllowedLocalUrl("whatsapp://send?text=test"));
    }

    @Test
    public void nullUrl_isBlocked() {
        assertFalse(isAllowedLocalUrl(null));
    }
}
