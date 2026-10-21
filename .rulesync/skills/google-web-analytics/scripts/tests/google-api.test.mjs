import assert from "node:assert/strict";
import test from "node:test";
import { assertAllowedUrl } from "../google-api.mjs";

test("GA4 と Search Console の API の URL を許可する", () => {
    for (const url of [
        "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport",
        "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
        "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        "https://www.googleapis.com/webmasters/v3/sites",
    ]) {
        assert.equal(assertAllowedUrl(url).href, url);
    }
});

test("許可リスト外の URL を拒否する", () => {
    for (const url of [
        "http://analyticsdata.googleapis.com/v1beta/properties/123:runReport",
        "https://storage.googleapis.com/b/o",
        "https://analyticsdata.googleapis.com.example.com/v1beta",
        "https://www.googleapis.com/drive/v3/files",
        "https://www.googleapis.com/webmasters/../drive/v3/files",
        "https://www.googleapis.com/webmasters/%2e%2e/drive/v3/files",
        "https://user@analyticsdata.googleapis.com/v1beta",
        "https://analyticsdata.googleapis.com:8443/v1beta",
        "not a url",
    ]) {
        assert.throws(() => assertAllowedUrl(url), /not allowed|Invalid URL/, url);
    }
});
