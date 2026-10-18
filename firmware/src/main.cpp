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

// Colors follow ../DESIGN.md: ink on paper, gray only for lines and secondary text.
static const uint16_t INK = 0x0000;
static const uint16_t PAPER = 0xFFFF;
static const uint16_t SURFACE = 0xF79E;  // #F2F2F2, used while disconnected
static const uint16_t MUTED_INK = 0x632C;  // #666666
static const uint16_t DISCONNECTED_INK = 0xA514;  // #A0A0A0

enum Expression { WATCHING, NUDGE, REDIRECT };

// The expression follows what AIDA is doing, not the judge state: WAIT and SILENCE both
// stay "watching". `view` is the same value the Meet card uses.
static Expression expressionFor(const DeviceState &s) {
  if (s.view == "off_agenda") return REDIRECT;
  if (s.view == "stalled") return NUDGE;
  return s.state == "intervene" ? NUDGE : WATCHING;
}

// AIDA face mark, same shapes as docs/brand/aida-face-*.svg (viewBox 384x344, y starts at -34).
struct Face {
  int x, y;
  float scale;
  uint16_t ink, paper;
};

static int faceX(const Face &f, float vx) { return f.x + lroundf(vx * f.scale); }
static int faceY(const Face &f, float vy) { return f.y + lroundf((vy + 34) * f.scale); }

// Round-capped stroke of width `w` (viewBox units), like stroke-linecap="round".
static void faceStroke(const Face &f, float x0, float y0, float x1, float y1, float w) {
  M5.Display.drawWideLine(faceX(f, x0), faceY(f, y0), faceX(f, x1), faceY(f, y1), w * f.scale / 2, f.ink);
}

static void faceRing(const Face &f, float cx, float cy, float r, float w) {
  auto &d = M5.Display;
  d.fillCircle(faceX(f, cx), faceY(f, cy), lroundf((r + w / 2) * f.scale), f.ink);
  d.fillCircle(faceX(f, cx), faceY(f, cy), lroundf((r - w / 2) * f.scale), f.paper);
}

static void drawFace(const Face &f, Expression e) {
  auto &d = M5.Display;
  // Frame: 22-wide stroke around a 314x309 rounded square (outer radius ~74).
  d.fillRoundRect(faceX(f, 0), faceY(f, 0), lroundf(314 * f.scale), lroundf(309 * f.scale), lroundf(74 * f.scale), f.ink);
  d.fillRoundRect(faceX(f, 22), faceY(f, 22), lroundf(270 * f.scale), lroundf(265 * f.scale), lroundf(52 * f.scale), f.paper);

  if (e == WATCHING) {
    faceStroke(f, 65.8, 141, 119.8, 141, 22);
    faceStroke(f, 191.7, 141, 246.9, 141, 22);
    return;  // the signal marks are only for when AIDA speaks
  }
  if (e == NUDGE) {
    faceStroke(f, 92.6, 116, 92.6, 145.5, 24);
    faceStroke(f, 219.5, 116, 219.5, 145.5, 24);
    faceRing(f, 156.5, 209, 25, 16);
  } else {
    faceStroke(f, 68.7, 108, 112.5, 133, 16.3);
    faceStroke(f, 112.5, 133, 68.8, 158.7, 16.3);
    faceStroke(f, 244.7, 108.2, 199.5, 133, 16.3);
    faceStroke(f, 199.5, 133, 243.7, 158.7, 16.3);
    // Return arrow: head, shaft, a quarter-turn corner (approximated), then down.
    faceStroke(f, 142.5, 177.5, 119, 202, 17.5);
    faceStroke(f, 119, 202, 142.5, 227.5, 17.5);
    faceStroke(f, 119, 202, 180, 202, 17.5);
    faceStroke(f, 180, 202, 189.5, 205.95, 17.5);
    faceStroke(f, 189.5, 205.95, 193.5, 215.5, 17.5);
    faceStroke(f, 193.5, 215.5, 193.5, 238.5, 17.5);
  }
  faceStroke(f, 317, 5.5, 345.1, -22.4, 20);
  faceStroke(f, 336.7, 39.4, 371.7, 26, 20);
}

static void drawStatus(bool connected) {
  auto &d = M5.Display;
  const int textX = 156;  // right column, five 16px characters wide
  d.setFont(&fonts::lgfxJapanGothic_16);
  d.setTextColor(connected ? INK : MUTED_INK, connected ? PAPER : SURFACE);
  Face face = {6, 5, 0.36f, connected ? INK : DISCONNECTED_INK, connected ? PAPER : SURFACE};
  drawFace(face, connected ? expressionFor(current) : WATCHING);
  if (!connected) {
    d.setCursor(textX, 58);
    d.print("接続待ち");
    return;
  }
  if (current.muted) {
    d.setCursor(textX, 8);
    d.print("寄り道OK");
    d.setCursor(textX, 30);
    d.print("介入停止中");
  }
  if (current.cooldownSec > 0) {
    d.setTextColor(MUTED_INK, PAPER);
    d.setCursor(textX, 66);
    d.print("介入まで");
    d.setTextColor(INK, PAPER);
    d.setCursor(textX, 86);
    d.printf("あと%d秒", current.cooldownSec);
  }
}

static void drawScores() {
  auto &d = M5.Display;
  static const char *labels[3] = {"脱線", "停滞", "寄り道"};
  static const uint16_t colors[3] = {0xF4B2, 0xEDEB, 0x86D7};  // roughly the web monitor colors
  const int barTop = 24, barHeight = 80, barWidth = 44, gap = 28, left = 26, radius = 12;
  for (int i = 0; i < 3; i++) {
    int x = left + i * (barWidth + gap);
    d.setFont(&fonts::lgfxJapanGothic_16);
    d.setTextColor(INK, PAPER);
    d.setTextDatum(top_center);
    if (current.scores[i] >= 0) {  // missing scores are never drawn as 0
      int fill = (barHeight - 4) * current.scores[i] / 100;
      if (fill > 0) {
        d.fillRoundRect(x + 2, barTop + barHeight - 2 - fill, barWidth - 4, fill, min(radius - 2, fill / 2), colors[i]);
      }
      d.drawString(String(current.scores[i]), x + barWidth / 2, 3);
    } else {
      d.drawString("-", x + barWidth / 2, 3);
    }
    // 2px outline, and the 60 / 40 reference lines (no 40 for tangent usefulness).
    d.drawRoundRect(x, barTop, barWidth, barHeight, radius, INK);
    d.drawRoundRect(x + 1, barTop + 1, barWidth - 2, barHeight - 2, radius - 1, INK);
    for (int level : {60, 40}) {
      if (level == 40 && i == 2) continue;
      int y = barTop + barHeight - 2 - (barHeight - 4) * level / 100;
      for (int dx = 4; dx < barWidth - 6; dx += 6) d.drawFastHLine(x + dx, y, 3, INK);
    }
    d.drawString(labels[i], x + barWidth / 2, barTop + barHeight + 5);
  }
  d.setTextDatum(top_left);
}

static void render() {
  bool connected = lastOkAt != 0 && millis() - lastOkAt < STALE_MS;
  auto &d = M5.Display;
  d.fillScreen(connected ? PAPER : SURFACE);
  if (!connected) drawStatus(false);
  else if (showScores) drawScores();
  else drawStatus(true);
  if (toast.length() && millis() < toastUntil) {
    d.setFont(&fonts::lgfxJapanGothic_16);
    d.setTextColor(PAPER, INK);
    d.setCursor(150, 112);
    d.print(toast.c_str());
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
  if (dirty) render();
  delay(10);
}
