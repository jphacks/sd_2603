import assert from "node:assert/strict";
import test from "node:test";
import { extractVideoUrl } from "./video.ts";

test("uses top-level media shortcut and latest available recording", () => {
  const media = url => ({ video_mixed: { data: { download_url: url } } });
  assert.equal(extractVideoUrl({ media_shortcuts: media("https://example.com/direct.mp4") }), "https://example.com/direct.mp4");
  assert.equal(extractVideoUrl({ recordings: [
    { media_shortcuts: media("https://example.com/old.mp4") },
    { media_shortcuts: media("https://example.com/new.mp4") },
    { media_shortcuts: null },
  ] }), "https://example.com/new.mp4");
});

test("pending recordings and output_media webpages are not playable video", () => {
  assert.equal(extractVideoUrl({ recordings: [{ media_shortcuts: null }] }), null);
  assert.equal(extractVideoUrl({ output_media: { camera: { config: { url: "https://example.com/page" } } } }), null);
});

test("rejects non-HTTPS URLs and malformed responses", () => {
  assert.throws(() => extractVideoUrl({ media_shortcuts: { video_mixed: { data: { download_url: "javascript:alert(1)" } } } }));
  assert.throws(() => extractVideoUrl({ recordings: "invalid" }));
});
