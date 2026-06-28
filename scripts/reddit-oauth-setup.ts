/**
 * One-time Reddit OAuth setup for web apps.
 * Starts a local callback server, opens the authorize URL, and prints REDDIT_REFRESH_TOKEN.
 */
import { config as loadDotenv } from "dotenv";
import { createServer } from "node:http";
import { exec } from "node:child_process";

loadDotenv();

const CLIENT_ID = process.env.REDDIT_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET?.trim();
const REDIRECT_URI = process.env.REDDIT_REDIRECT_URI?.trim() ?? "http://localhost:8080";
const USER_AGENT =
  process.env.REDDIT_USER_AGENT?.trim() ??
  "TheMinerMCP:1.0.0 (by /u/Immediate-Turn-8269)";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Falta REDDIT_CLIENT_ID ou REDDIT_CLIENT_SECRET no .env");
  process.exit(1);
}

const redirectUrl = new URL(REDIRECT_URI);
const port = Number(redirectUrl.port || 8080);
const expectedPath = redirectUrl.pathname === "" ? "/" : redirectUrl.pathname;

const authUrl = new URL("https://www.reddit.com/api/v1/authorize");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("state", "the-miner-mcp");
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("duration", "permanent");
authUrl.searchParams.set("scope", "read");

function openBrowser(url: string): void {
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command);
}

async function verifyCredentials(): Promise<boolean> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: "credential_check",
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: body.toString(),
  });

  if (response.status === 401) {
    console.error("\nERRO: Client ID ou Secret incorretos no .env (Reddit retornou 401).\n");
    console.error("Copie de novo em https://www.reddit.com/prefs/apps:");
    console.error("  - Client ID = texto pequeno embaixo do icone azul do app");
    console.error("  - Secret     = campo 'secret' na tela de edicao");
    console.error("Cole com Ctrl+C / Ctrl+V — nao digite na mao.\n");
    return false;
  }

  return true;
}

async function exchangeCode(code: string): Promise<boolean> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: body.toString(),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
    message?: string;
  };

  if (!response.ok || !payload.refresh_token) {
    console.error("Falha ao trocar o code pelo token:", payload);
    if (response.status === 401) {
      console.error("\n401 = Client ID ou Secret errados. Atualize o .env e rode de novo.\n");
    }
    return false;
  }

  console.log("\nReddit OAuth OK! Adicione no Railway e no .env:\n");
  console.log(`REDDIT_REFRESH_TOKEN=${payload.refresh_token}`);
  console.log("\nPode remover REDDIT_USERNAME e REDDIT_PASSWORD do Railway.");
  console.log(`Access token expira em ${payload.expires_in ?? "?"}s (o MCP renova sozinho).`);
  return true;
}

function shutdown(server: ReturnType<typeof createServer>, code: number): void {
  server.close(() => process.exit(code));
}

const server = createServer(async (req, res) => {
  const reqUrl = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (reqUrl.pathname !== expectedPath) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const error = reqUrl.searchParams.get("error");
  if (error) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Reddit error: ${error}`);
    shutdown(server, 1);
    return;
  }

  const code = reqUrl.searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Missing code");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>Reddit conectado!</h1><p>Volte ao terminal. Pode fechar esta aba.</p>");

  const ok = await exchangeCode(code);
  shutdown(server, ok ? 0 : 1);
});

async function main(): Promise<void> {
  console.log("Reddit OAuth setup — web app flow");
  console.log(`Redirect URI: ${REDIRECT_URI}`);
  console.log(`Client ID: ${CLIENT_ID}`);

  const valid = await verifyCredentials();
  if (!valid) process.exit(1);

  server.listen(port, "127.0.0.1", () => {
    console.log("\nCredenciais OK. Proximo passo:");
    console.log("1. Abra o link abaixo (ou use a aba que abrir sozinha)");
    console.log("2. Faca login e clique em Allow\n");
    console.log(authUrl.toString());
    console.log("\nAguardando callback...\n");
    openBrowser(authUrl.toString());
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});