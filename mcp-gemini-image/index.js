import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function sanitizeFilename(filename, outputDir) {
  const raw = String(filename ?? "");
  if (!raw || raw.includes("..")) {
    return null;
  }
  const base = path.basename(raw);
  if (!base || !/^[a-zA-Z0-9._-]+$/.test(base)) {
    return null;
  }
  const resolvedOutputDir = path.resolve(outputDir);
  const filePath = path.resolve(path.join(resolvedOutputDir, base));
  if (filePath !== resolvedOutputDir && !filePath.startsWith(resolvedOutputDir + path.sep)) {
    return null;
  }
  return filePath;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY が設定されていません");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  const outputDir = path.join(process.env.OUTPUT_DIR || "generated-images");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const server = new McpServer({
    name: "gemini-image",
    version: "1.0.0",
  });

  server.tool(
    "generate_image",
    "Gemini Imagen を使って画像を生成します",
    {
      prompt: z.string().describe("画像生成プロンプト（英語推奨）"),
      filename: z.string().optional().describe("保存ファイル名（省略時は自動生成）"),
    },
    async ({ prompt, filename }) => {
      try {
        const response = await ai.models.generateImages({
          model: "imagen-4.0-generate-001",
          prompt,
          config: { numberOfImages: 1 },
        });

        const imageData = response.generatedImages?.[0]?.image?.imageBytes;
        if (!imageData) {
          return { content: [{ type: "text", text: "画像生成に失敗しました" }] };
        }

        const defaultName = `image_${Date.now()}.png`;
        const filePath = filename
          ? sanitizeFilename(filename, outputDir)
          : sanitizeFilename(defaultName, outputDir);
        if (!filePath) {
          return { content: [{ type: "text", text: "不正なファイル名です" }] };
        }
        fs.writeFileSync(filePath, Buffer.from(imageData, "base64"));

        return {
          content: [
            {
              type: "text",
              text: `画像を生成しました: ${filePath}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `エラー: ${err.message}` }],
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
