type OutputOptions = { region: string; apiKey: string; botId: string; cameraUrl: string };

export async function startCameraOutput(options: OutputOptions, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://${options.region}.recall.ai/api/v1/bot/${options.botId}/output_media/`, {
    method: "POST",
    headers: { Authorization: `Token ${options.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ camera: { kind: "webpage", config: { url: options.cameraUrl } } }),
    signal: AbortSignal.timeout(15000),
  });
  // Do not surface the upstream body, which may include workspace or access details.
  return response.status;
}
