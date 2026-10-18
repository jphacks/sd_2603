type ControlHandler = (request: Request) => Promise<Response>;

export async function invokeBrowserControl(
  enabled: boolean,
  handler: ControlHandler,
  payload: unknown,
  secret: string | undefined,
) {
  // Deny by default. Enabling this mode grants UI visitors join/leave access.
  if (!enabled) return { ok: false, status: 403, data: { error: "ブラウザからの自動認証操作は無効です。" } as Record<string, unknown> };
  const response = await handler(new Request("http://localhost/api/recall/control", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret?.trim() ?? ""}` },
    body: JSON.stringify(payload),
  }));
  const data = await response.json() as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}
