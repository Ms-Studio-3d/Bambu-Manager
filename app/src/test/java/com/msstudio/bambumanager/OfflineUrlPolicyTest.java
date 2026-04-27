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
                || url.startsWith("data:")
                || url.startsWith("blob:");
    }

    @Test
    public void localAssetUrl_isAllowed() {
        assertTrue(isAllowedLocalUrl("file:///android_asset/index.html"));
        assertTrue(isAllowedLocalUrl("file:///android_asset/css/app.css"));
        assertTrue(isAllowedLocalUrl("file:///android_asset/js/app.js"));
    }

    @Test
    public void safeInternalUrls_areAllowed() {
        assertTrue(isAllowedLocalUrl("about:blank"));
        assertTrue(isAllowedLocalUrl("data:text/plain,hello"));
        assertTrue(isAllowedLocalUrl("blob:file:///android_asset/example"));
    }

    @Test
    public void internetUrls_areBlocked() {
        assertFalse(isAllowedLocalUrl("https://example.com"));
        assertFalse(isAllowedLocalUrl("http://example.com"));
        assertFalse(isAllowedLocalUrl("https://api.whatsapp.com/send?text=test"));
        assertFalse(isAllowedLocalUrl("whatsapp://send?text=test"));
    }

    @Test
    public void nullUrl_isBlocked() {
        assertFalse(isAllowedLocalUrl(null));
    }
}
