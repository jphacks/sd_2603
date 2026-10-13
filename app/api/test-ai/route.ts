import { generateText } from "ai";


export async function GET() {
  try {
    const { text } = await generateText({
      model:
        process.env.AI_MODEL ??
        "anthropic/claude-sonnet-4.6",

      prompt:
        "あなたは会議ファシリテーターです。" +
        "会議を円滑に進めるための短い一言を" +
        "日本語で返してください。",
    });

    return Response.json({
      success: true,
      message: text,
    });
  } catch (error) {
    console.error("AI Gateway error:", error);

    return Response.json(
      {
        success: false,
        error: "AI Gatewayへの接続に失敗しました",
      },
      { status: 500 }
    );
  }
}