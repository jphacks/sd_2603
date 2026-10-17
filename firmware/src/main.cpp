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

static uint16_t backgroundFor(const DeviceState &s, bool connected) {
  if (!connected || !s.valid) return M5.Display.color565(80, 80, 80);
  if (s.state == "intervene") return M5.Display.color565(190, 60, 50);
  if (s.state == "wait") return M5.Display.color565(200, 160, 40);
  if (s.state == "silence") return M5.Display.color565(50, 130, 90);
  return M5.Display.color565(80, 80, 80);
}

static void drawStatus(bool connected) {
  auto &d = M5.Display;
  d.setTextColor(TFT_WHITE);
  d.setFont(&fonts::lgfxJapanGothic_24);
  d.setCursor(8, 10);
  if (!connected) {
    d.print("接続待ち");
    return;
  }
  d.print(current.view == "idle" ? "見守り中" : current.title.c_str());
  d.setFont(&fonts::lgfxJapanGothic_16);
  if (current.agenda.length()) {
    d.setCursor(8, 52);
    d.print(current.agenda.c_str());
  }
  d.setCursor(8, 82);
  if (current.cooldownSec > 0) d.printf("次の介入まで %d秒", current.cooldownSec);
  if (current.muted) {
    d.setCursor(8, 108);
    d.print("寄り道OK: 介入を停止中");
  }
}

static void drawScores() {
  auto &d = M5.Display;
  static const char *labels[3] = {"脱線", "停滞", "寄り道"};
  static const uint16_t colors[3] = {0xF4B2, 0xEDEB, 0x86D7};  // roughly the web monitor colors
  const int barTop = 8, barHeight = 90, barWidth = 40, gap = 20, left = 24;
  d.setFont(&fonts::lgfxJapanGothic_16);
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
  d.fillScreen(showScores && connected ? TFT_BLACK : backgroundFor(current, connected));
  if (!connected) drawStatus(false);
  else if (showScores) drawScores();
  else drawStatus(true);
  if (toast.length() && millis() < toastUntil) {
    d.setFont(&fonts::lgfxJapanGothic_16);
    d.setTextColor(TFT_WHITE, TFT_BLACK);
    d.setCursor(8, 112);
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
