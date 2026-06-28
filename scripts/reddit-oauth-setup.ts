/**
 * One-time Reddit OAuth setup for web apps.
 * Starts a local callback server, opens the authorize URL, and prints REDDIT_REFRESH_TOKEN.
 *
 * Prerequisites (.env):
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
 *   REDDIT_REDIRECT_URI=http://localhost:8080  (must match the app on reddit.com/prefs/apps)
 */
import { config as loadDotenv } from "dotenv";
import { createServer } from "node:http";
import { exec } from "node:child_process";

loadDotenv();

const CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDDIT_REDIRECT_URI ?? "http://localhost:8080";
const USER_AGENT =
  process.env.REDDIT_USER_AGENT ?? "TheMinerMCP:1.0.0 (by /u/Netty0x86)";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET in .env");
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

async function exchangeCode(code: string): Promise<void> {
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
  };

  if (!response.ok || !payload.refresh_token) {
    console.error("Token exchange failed:", payload);
    process.exit(1);
  }

  console.log("\nReddit OAuth OK. Add this to Railway (and .env):\n");
  console.log(`REDDIT_REFRESH_TOKEN=${payload.refresh_token}`);
  console.log("\nYou can remove REDDIT_USERNAME and REDDIT_PASSWORD from Railway.");
  console.log(`Access token expires in ${payload.expires_in ?? "?"}s (auto-refreshed by MCP).`);
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
    server.close();
    process.exit(1);
  }

  const code = reqUrl.searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Missing code");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>Reddit conectado!</h1><p>Volte ao terminal. Pode fechar esta aba.</p>");

  try {
    await exchangeCode(code);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log("Reddit OAuth setup — web app flow");
  console.log(`Redirect URI: ${REDIRECT_URI}`);
  console.log("\n1. Confirme que o app em reddit.com/prefs/apps tem esse redirect URI exato.");
  console.log("2. Abra o link abaixo, faça login e clique em Allow.\n");
  console.log(authUrl.toString());
  console.log("\nAguardando callback...\n");
  openBrowser(authUrl.toString());
});