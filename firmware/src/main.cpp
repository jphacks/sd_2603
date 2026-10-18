// M5StickS3 companion for the meeting facilitator.
// Polls GET /api/device/{session}, shows the state, plays a cue on interventions,
// and sends button events. See ../docs/m5stick.md for the API.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <M5Unified.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "config.h"

static const uint32_t POLL_MS = 2000;
static const uint32_t STALE_MS = 7000;  // no successful poll for this long => disconnected
static const uint32_t HTTP_TIMEOUT_MS = 3000;

struct DeviceState {
  bool valid = false;
  String state = "unknown";  // silence | wait | intervene | unknown
  String view = "idle";      // idle | off_agenda | stalled
  String face = "watching";  // watching | nudge | redirect
  String title;
  String agenda;
  int scores[3] = {-1, -1, -1};  // drift, stall, tangent; -1 = not available
  int cooldownSec = 0;
  bool muted = false;
  String cueId;
  long cueSeq = 0;
};

static DeviceState current;
static long lastCueSeq = -1;  // -1 until the first poll, so a stale cue is not replayed on boot
static uint32_t lastOkAt = 0;
static uint32_t lastPollAt = 0;
static bool showScores = false;
static bool dirty = true;
static String toast;
static uint32_t toastUntil = 0;
// When AIDA starts speaking, the face appears first and the notice lines follow.
static const uint32_t NOTICE_DELAY_MS = 200;
static uint32_t noticeAt = 0;

static String url(const char *suffix) {
  return String(SERVER_BASE) + "/api/device/" + SESSION_ID + suffix;
}

static bool request(const String &target, const char *method, const char *body, String &out) {
  HTTPClient http;
  WiFiClientSecure secure;
  WiFiClient plain;
  bool ok;
  if (target.startsWith("https://")) {
    secure.setInsecure();  // demo only: pin or load a CA for real use
    ok = http.begin(secure, target);
  } else {
    ok = http.begin(plain, target);
  }
  if (!ok) return false;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  if (body) http.addHeader("Content-Type", "application/json");
  int code = body ? http.sendRequest(method, (uint8_t *)body, strlen(body)) : http.GET();
  if (code > 0) out = http.getString();
  http.end();
  return code >= 200 && code < 300;
}

static void showToast(const String &text) {
  toast = text;
  toastUntil = millis() + 1500;
  dirty = true;
}

static void playCue(const String &id) {
  // Placeholder tones. Replace with short WAV clips in flash and use
  // M5.Speaker.playWav(...) once the recordings exist.
  if (id == "summarize") {
    M5.Speaker.tone(660, 120);
    delay(160);
    M5.Speaker.tone(880, 200);
  } else {
    M5.Speaker.tone(880, 120);
    delay(160);
    M5.Speaker.tone(660, 200);
  }
}

static void poll() {
  String body;
  if (!request(url(""), "GET", nullptr, body)) return;
  JsonDocument doc;
  if (deserializeJson(doc, body) || (doc["v"] | 0) != 1) return;

  DeviceState next;
  next.valid = true;
  next.state = doc["state"] | "unknown";
  next.view = doc["view"] | "idle";
  next.face = doc["face"] | "watching";
  next.title = doc["title"] | "";
  next.agenda = doc["agendaShort"] | "";
  if (!doc["scores"].isNull()) {
    next.scores[0] = doc["scores"]["drift"] | -1;
    next.scores[1] = doc["scores"]["stall"] | -1;
    next.scores[2] = doc["scores"]["tangent"] | -1;
  }
  next.cooldownSec = doc["cooldownSec"] | 0;
  next.muted = doc["muted"] | false;
  if (!doc["cue"].isNull()) {
    next.cueId = doc["cue"]["id"] | "";
    next.cueSeq = doc["cue"]["seq"] | 0;
  }
  lastOkAt = millis();

  if (lastCueSeq < 0) lastCueSeq = next.cueSeq;
  if (next.cueSeq > lastCueSeq) {
    lastCueSeq = next.cueSeq;
    playCue(next.cueId);
  }
  if (next.face != current.face && next.face != "watching") noticeAt = millis() + NOTICE_DELAY_MS;
  current = next;
  dirty = true;
}

static void sendEvent(const char *type, const char *label) {
  String body = String("{\"type\":\"") + type + "\",\"deviceId\":\"m5-01\"}";
  String response;
  bool ok = request(url("/event"), "POST", body.c_str(), response);
  if (!ok) {
    showToast("送信失敗");
    return;
  }
  JsonDocument doc;
  bool accepted = !deserializeJson(doc, response) && (doc["accepted"] | false);
  showToast(accepted ? label : "受け付けず");
}

// AIDA's faces, in the coordinates of docs/brand/aida-face-*.svg: the frame
// occupies 0..314 x 0..309 and the notice lines reach above and to the right.
// Keep these shapes in sync with lib/brand/faces.ts.
static const uint16_t INK = TFT_BLACK;
static const uint16_t PAPER = TFT_WHITE;
static const float FACE_SCALE = 0.3f;
static const int CAPTION_Y = 110;

struct FacePen {
  float x, y, s;
  uint16_t ink;
};

static int32_t px(float v) { return (int32_t)lroundf(v); }

static void faceLine(const FacePen &p, float x0, float y0, float x1, float y1, float width) {
  M5.Display.drawWideLine(px(p.x + x0 * p.s), px(p.y + y0 * p.s), px(p.x + x1 * p.s), px(p.y + y1 * p.s),
                          width * p.s / 2, p.ink);
}

static void drawNotice(const FacePen &p) {
  faceLine(p, 317, 5.5, 345.1, -22.4, 20);
  faceLine(p, 336.7, 39.4, 371.7, 26, 20);
}

static void drawFace(const String &face, float x, float y, float s, uint16_t ink, bool notice = true) {
  auto &d = M5.Display;
  FacePen p{x, y, s, ink};
  // Frame: outer edge 314x309 with radius 74, stroke 22.
  d.fillSmoothRoundRect(px(x), px(y), px(314 * s), px(309 * s), px(74 * s), ink);
  d.fillSmoothRoundRect(px(x + 22 * s), px(y + 22 * s), px(270 * s), px(265 * s), px(52 * s), PAPER);
  if (face == "nudge") {
    faceLine(p, 92.6, 116, 92.6, 145.5, 24);
    faceLine(p, 219.5, 116, 219.5, 145.5, 24);
    d.fillSmoothCircle(px(x + 156.5 * s), px(y + 209 * s), px(33 * s), ink);
    d.fillSmoothCircle(px(x + 156.5 * s), px(y + 209 * s), px(17 * s), PAPER);
    if (notice) drawNotice(p);
  } else if (face == "redirect") {
    faceLine(p, 68.7, 108, 112.5, 133, 16.3);
    faceLine(p, 112.5, 133, 68.8, 158.7, 16.3);
    faceLine(p, 244.7, 108.2, 199.5, 133, 16.3);
    faceLine(p, 199.5, 133, 243.7, 158.7, 16.3);
    faceLine(p, 142.5, 177.5, 119, 202, 17.5);
    faceLine(p, 119, 202, 142.5, 227.5, 17.5);
    faceLine(p, 119, 202, 180, 202, 17.5);
    // Rounded corner of the arrow: a quarter circle around (180, 215.5).
    float px = 180, py = 202;
    for (int i = 1; i <= 6; i++) {
      float a = -PI / 2 + (PI / 2) * i / 6;
      float nx = 180 + 13.5f * cosf(a), ny = 215.5f + 13.5f * sinf(a);
      faceLine(p, px, py, nx, ny, 17.5);
      px = nx;
      py = ny;
    }
    faceLine(p, 193.5, 215.5, 193.5, 238.5, 17.5);
    if (notice) drawNotice(p);
  } else {
    faceLine(p, 65.8, 141, 119.8, 141, 22);
    faceLine(p, 191.7, 141, 246.9, 141, 22);
  }
}

static void drawStatus(bool connected) {
  auto &d = M5.Display;
  const uint16_t muted = d.color565(176, 176, 176);
  // Center the frame horizontally; leave room above it for the notice lines.
  const float faceX = d.width() / 2 - 157 * FACE_SCALE;
  const float faceY = 12;
  d.setTextDatum(top_center);
  d.setFont(&fonts::lgfxJapanGothic_16);
  if (!connected) {
    drawFace("watching", faceX, faceY, FACE_SCALE, muted);
    d.setTextColor(muted, PAPER);
    d.drawString("接続待ち", d.width() / 2, CAPTION_Y);
    return;
  }
  drawFace(current.face, faceX, faceY, FACE_SCALE, INK, millis() >= noticeAt);
  d.setTextColor(INK, PAPER);
  String caption = current.view == "idle" && current.muted ? String("寄り道OK・介入停止中") : current.title;
  d.drawString(caption.c_str(), d.width() / 2, CAPTION_Y);
  if (current.cooldownSec > 0) {
    d.setTextDatum(top_left);
    d.setFont(&fonts::lgfxJapanGothic_12);
    d.setTextColor(muted, PAPER);
    d.drawString((String("あと") + current.cooldownSec + "秒").c_str(), 4, 4);
  }
}

static void drawScores() {
  auto &d = M5.Display;
  static const char *labels[3] = {"脱線", "停滞", "寄り道"};
  static const uint16_t colors[3] = {0xF4B2, 0xEDEB, 0x86D7};  // roughly the web monitor colors
  const int barTop = 8, barHeight = 90, barWidth = 40, gap = 20, left = 24;
  d.setFont(&fonts::lgfxJapanGothic_16);
  d.setTextDatum(top_left);
  for (int i = 0; i < 3; i++) {
    int x = left + i * (barWidth + gap);
    d.drawRect(x, barTop, barWidth, barHeight, TFT_WHITE);
    if (current.scores[i] >= 0) {  // missing scores are never drawn as 0
      int h = barHeight * current.scores[i] / 100;
      d.fillRect(x + 1, barTop + barHeight - h, barWidth - 2, h, colors[i]);
      d.setTextColor(TFT_WHITE);
      d.setCursor(x + 4, barTop + 36);
      d.printf("%d", current.scores[i]);
    }
    d.setTextColor(TFT_WHITE);
    d.setCursor(x, barTop + barHeight + 8);
    d.print(labels[i]);
  }
}

static void render() {
  bool connected = lastOkAt != 0 && millis() - lastOkAt < STALE_MS;
  auto &d = M5.Display;
  d.fillScreen(showScores && connected ? TFT_BLACK : PAPER);
  if (!connected) drawStatus(false);
  else if (showScores) drawScores();
  else drawStatus(true);
  if (toast.length() && millis() < toastUntil) {
    // Shown over the caption as a black band.
    d.fillRect(0, CAPTION_Y - 3, d.width(), 22, TFT_BLACK);
    d.setFont(&fonts::lgfxJapanGothic_16);
    d.setTextDatum(top_center);
    d.setTextColor(TFT_WHITE, TFT_BLACK);
    d.drawString(toast.c_str(), d.width() / 2, CAPTION_Y);
  }
  dirty = false;
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);  // landscape
  M5.Speaker.setVolume(200);
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop() {
  M5.update();

  if (M5.BtnA.wasClicked()) sendEvent("back", "戻して送信");
  if (M5.BtnA.wasHold()) sendEvent("unmute", "停止を解除");
  if (M5.BtnB.wasClicked()) sendEvent("tangent_ok", "寄り道OK");
  if (M5.BtnB.wasHold()) {
    showScores = !showScores;
    dirty = true;
  }

  if (WiFi.status() == WL_CONNECTED && millis() - lastPollAt >= POLL_MS) {
    lastPollAt = millis();
    poll();
  }

  // Redraw when data changes, a toast expires, or the connection goes stale.
  static bool wasConnected = false;
  bool connected = lastOkAt != 0 && millis() - lastOkAt < STALE_MS;
  if (connected != wasConnected) {
    wasConnected = connected;
    dirty = true;
  }
  if (toast.length() && millis() >= toastUntil) {
    toast = "";
    dirty = true;
  }
  if (noticeAt && millis() >= noticeAt) {
    noticeAt = 0;
    dirty = true;
  }
  if (dirty) render();
  delay(10);
}
