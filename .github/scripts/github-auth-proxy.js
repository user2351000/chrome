const crypto = require("node:crypto");
const http = require("node:http");

const PORT = 8080;
const DESKTOP_PORT = 3000;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const LOGIN_TTL_MS = 15 * 60 * 1000;
const sessions = new Map();
const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
const allowedUserId = process.env.GITHUB_ALLOWED_USER_ID;

if (!clientId || !allowedUserId || !/^\d+$/.test(allowedUserId)) {
  throw new Error("Set GITHUB_OAUTH_CLIENT_ID and a numeric GITHUB_ALLOWED_USER_ID.");
}

function getSessionId(req) {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [name, ...value] = cookie.trim().split("=");
    if (name === "github_auth_session") return value.join("=");
  }
  return null;
}

function createSession() {
  if (sessions.size >= 20) {
    for (const [id, session] of sessions) {
      if (session.expiresAt <= Date.now()) sessions.delete(id);
    }
    if (sessions.size >= 20) throw new Error("Too many active login sessions.");
  }
  const id = crypto.randomBytes(32).toString("base64url");
  const session = {
    expiresAt: Date.now() + LOGIN_TTL_MS,
    status: "starting",
  };
  sessions.set(id, session);
  startDeviceFlow(session).catch((error) => {
    session.status = "error";
    session.message = error.message;
    delete session.deviceCode;
    delete session.userCode;
  });
  return { id, session };
}

async function startDeviceFlow(session) {
  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "github-actions-desktop",
    },
    body: new URLSearchParams({ client_id: clientId, scope: "read:user" }),
  });
  if (!response.ok) {
    throw new Error(`GitHub device authorization returned HTTP ${response.status}.`);
  }
  const data = await response.json();
  if (!data.device_code || !data.user_code || !data.interval || !data.expires_in) {
    throw new Error("GitHub returned an incomplete device authorization response.");
  }

  session.deviceCode = data.device_code;
  session.userCode = data.user_code;
  session.status = "pending";
  pollDeviceFlow(session, data.interval, data.expires_in).catch((error) => {
    session.status = "error";
    session.message = error.message;
    delete session.deviceCode;
    delete session.userCode;
  });
}

async function pollDeviceFlow(session, interval, expiresIn) {
  const deadline = Date.now() + expiresIn * 1000;
  let delay = interval * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "github-actions-desktop",
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: session.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    if (!response.ok) {
      throw new Error(`GitHub token exchange returned HTTP ${response.status}.`);
    }
    const data = await response.json();
    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      delay += 5000;
      continue;
    }
    if (data.error === "expired_token" || data.error === "access_denied") {
      session.status = "denied";
      session.message =
        data.error === "expired_token"
          ? "The login code expired. Reload to try again."
          : "GitHub login was denied.";
      delete session.deviceCode;
      delete session.userCode;
      return;
    }
    if (data.error) throw new Error(`GitHub authorization failed: ${data.error}.`);
    if (!data.access_token) throw new Error("GitHub did not return an access token.");

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${data.access_token}`,
        "User-Agent": "github-actions-desktop",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!userResponse.ok) {
      throw new Error(`Could not verify the GitHub account (HTTP ${userResponse.status}).`);
    }
    const user = await userResponse.json();
    session.status = String(user.id) === allowedUserId ? "authorized" : "denied";
    if (session.status === "authorized") {
      session.expiresAt = Date.now() + SESSION_TTL_MS;
    }
    session.message =
      session.status === "authorized"
        ? ""
        : "This desktop is available only to the GitHub account that started this workflow.";
    delete session.deviceCode;
    delete session.userCode;
    return;
  }
  session.status = "denied";
  session.message = "The login code expired. Reload to try again.";
  delete session.deviceCode;
  delete session.userCode;
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function loginPage(res) {
  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Sign in with GitHub</title>
<main><h1>Sign in with GitHub</h1><p id="status">Preparing a sign-in code...</p>
<p id="code" hidden><strong></strong></p><p id="link" hidden><a href="https://github.com/login/device" rel="noreferrer">Open GitHub device login</a></p>
<script>
async function check() {
  const response = await fetch("/auth/status", { cache: "no-store" });
  const data = await response.json();
  if (data.status === "authorized") { location.replace("/"); return; }
  if (data.status === "pending") {
    document.querySelector("#status").textContent = "Enter this code on GitHub to continue:";
    document.querySelector("#code strong").textContent = data.userCode;
    document.querySelector("#code").hidden = false;
    document.querySelector("#link").hidden = false;
  } else if (data.status === "denied" || data.status === "error") {
    document.querySelector("#status").textContent = data.message;
    return;
  }
  setTimeout(check, 2000);
}
check().catch(() => { document.querySelector("#status").textContent = "Could not check sign-in status. Reload to retry."; });
</script></main></html>`);
}

function proxyRequest(req, res) {
  const headers = { ...req.headers };
  delete headers.cookie;
  const proxy = http.request(
    {
      host: "127.0.0.1",
      port: DESKTOP_PORT,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstream) => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    },
  );
  proxy.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Desktop service is unavailable.");
  });
  req.pipe(proxy);
}

function proxyUpgrade(req, clientSocket, head) {
  const headers = { ...req.headers };
  delete headers.cookie;
  const proxy = http.request({
    host: "127.0.0.1",
    port: DESKTOP_PORT,
    method: req.method,
    path: req.url,
    headers,
  });
  proxy.on("upgrade", (response, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 ${response.statusCode} ${response.statusMessage}`];
    for (const [name, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) {
        for (const entry of value) lines.push(`${name}: ${entry}`);
      } else {
        lines.push(`${name}: ${value}`);
      }
    }
    clientSocket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upstreamHead.length) clientSocket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });
  proxy.on("response", (response) => {
    const lines = [`HTTP/1.1 ${response.statusCode} ${response.statusMessage}`];
    for (const [name, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) {
        for (const entry of value) lines.push(`${name}: ${entry}`);
      } else {
        lines.push(`${name}: ${value}`);
      }
    }
    clientSocket.write(`${lines.join("\r\n")}\r\n\r\n`);
    response.pipe(clientSocket);
  });
  proxy.on("error", () => clientSocket.destroy());
  proxy.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Cache-Control": "no-store" });
    res.end("ok");
    return;
  }
  let sessionId = getSessionId(req);
  let session = sessionId ? sessions.get(sessionId) : null;
  if (session && session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    session = null;
  }

  if (url.pathname === "/auth/login") {
    if (session?.status === "denied" || session?.status === "error") {
      sessions.delete(sessionId);
      session = null;
    }
    if (!session) {
      try {
        ({ id: sessionId, session } = createSession());
      } catch (error) {
        sendJson(res, 503, { status: "error", message: error.message });
        return;
      }
    }
    res.setHeader(
      "Set-Cookie",
      `github_auth_session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
    );
    loginPage(res);
    return;
  }

  if (url.pathname === "/auth/status") {
    if (!session) {
      sendJson(res, 401, { status: "error", message: "Login session expired. Reload to try again." });
      return;
    }
    sendJson(res, 200, {
      status: session.status,
      userCode: session.userCode,
      message: session.message,
    });
    return;
  }

  if (session?.status !== "authorized") {
    res.writeHead(302, { Location: "/auth/login", "Cache-Control": "no-store" });
    res.end();
    return;
  }
  proxyRequest(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const sessionId = getSessionId(req);
  const session = sessionId ? sessions.get(sessionId) : null;
  if (!session || session.status !== "authorized" || session.expiresAt <= Date.now()) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  proxyUpgrade(req, socket, head);
});

server.listen(PORT, "0.0.0.0");
