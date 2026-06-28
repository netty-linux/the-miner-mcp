import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MINER_SYSTEM_INSTRUCTIONS } from "./miner-instructions.js";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "the_miner_mcp",
    {
      title: "THE MINER MCP — Analista de Oportunidades",
      description:
        "Instruções completas do THE MINER MCP. Use antes de qualquer pesquisa de nicho/oferta.",
      argsSchema: {},
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: MINER_SYSTEM_INSTRUCTIONS },
        },
      ],
    }),
  );

  server.registerPrompt(
    "relatorio_nicho_completo",
    {
      title: "Relatório Estratégico de Nicho",
      description:
        "Inteligência completa: Opportunity Score, Confidence Score, saturação, gaps, estratégia, ENTRAR/TESTAR/AGUARDAR/EVITAR. Use generate_full_niche_report.",
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
              MINER_SYSTEM_INSTRUCTIONS,
              "",
              "---",
              "",
              `Pesquise o nicho "${niche}" no mercado ${country ?? "BR"}.`,
              "",
              "AÇÃO OBRIGATÓRIA: chame SOMENTE `generate_full_niche_report` com:",
              `- niche: ${niche}`,
              `- country: ${country ?? "BR"}`,
              "",
              "Apresente o markdown estratégico completo como resposta final.",
              "Inclua Opportunity Score, Confidence Score e Recomendação (ENTRAR/TESTAR/AGUARDAR/EVITAR).",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}