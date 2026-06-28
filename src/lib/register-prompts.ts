import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "relatorio_nicho_completo",
    {
      title: "Relatório de Nicho Completo",
      description:
        "Gera relatório visual completo de um nicho. IMPORTANTE: chame APENAS generate_full_niche_report (1 tool) — não chame tools individuais.",
      argsSchema: {
        niche: z.string().describe("Nicho, ex: emagrecimento"),
        country: z.string().optional().describe("País ISO, ex: BR"),
      },
    },
    async ({ niche, country }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Gere o relatório completo do nicho "${niche}" no mercado ${country ?? "BR"}.`,
              "",
              "INSTRUÇÃO OBRIGATÓRIA: use SOMENTE a tool `generate_full_niche_report` com:",
              `- niche: ${niche}`,
              `- country: ${country ?? "BR"}`,
              "",
              "NÃO chame mine_trending_products, analyze_facebook_ads, analyze_google_seo ou outras tools separadamente.",
              "Apresente o markdown visual retornado pela tool como resposta final ao usuário.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}