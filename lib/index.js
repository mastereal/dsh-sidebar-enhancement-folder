// sidebar-enhancement-folder — Host half
// Single route: reveal an absolute path in the OS file manager.
//   GET /sidebar-enhancement-folder/reveal?path=<absolute>
import { existsSync, statSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { spawn } from "node:child_process";

export const name = "sidebar-enhancement-folder";

function trusted(req) {
  const host = String(req.headers.host || "");
  return host.startsWith("127.0.0.1:") || host.startsWith("localhost:");
}

function json(res, obj, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

/** Resolve a session's working directory from the host sessions service. */
function sessionCwd(ctx, sessionId) {
  try {
    const s = ctx && ctx.sessions && ctx.sessions.get(sessionId);
    const cwd = s && s.header && s.header.cwd;
    if (typeof cwd === "string" && cwd.length > 0) return cwd;
  } catch (e) {}
  return "";
}

/**
* Normalize a path that may arrive as a file:// URI, a posix-style path or a
* raw Windows path (any slash direction) into a plain Windows path.
*/
function normalizePath(p) {
  let s = String(p || "").trim();
  if (!s) return "";
  if (s.startsWith("file://")) {
    s = s.slice("file://".length);
    if (s.startsWith("/")) s = s.slice(1); // file:///D:/x -> D:/x
  }
  const q = s.search(/[?#]/);
  if (q >= 0) s = s.slice(0, q);
  return s.replace(/\//g, "\\");
}

function reveal(ctx, rawPath, sessionId, res) {
  if (process.platform !== "win32") return json(res, { ok: false, reason: "unsupported platform" });
  const p = normalizePath(rawPath);
  if (!p) return json(res, { ok: false, reason: "invalid path", path: rawPath });
  let abs;
  if (isAbsolute(p)) {
    abs = resolve(p);
  } else {
    const cwd = sessionCwd(ctx, sessionId);
    if (!cwd) return json(res, { ok: false, reason: "relative path and no session cwd", path: rawPath });
    abs = resolve(cwd, p);
  }
  let open = abs;
  let select = true;
  try {
    if (statSync(open).isDirectory()) select = false;
  } catch {
    // missing file: walk up to the nearest EXISTING directory so the user at
    // least lands near the file (never a bogus path that explorer ignores)
    open = dirname(open);
    select = false;
    let guard = 0;
    while (guard++ < 64) {
      try {
        if (statSync(open).isDirectory()) break;
      } catch {}
      const up = dirname(open);
      if (up === open) { open = ""; break; }
      open = up;
    }
    if (!open) {
      // nothing exists up to the drive root: fall back to the session cwd
      const cwd = sessionCwd(ctx, sessionId);
      if (cwd) open = cwd;
      else return json(res, { ok: false, reason: "not found: " + abs });
    }
  }
  try {
    // explorer.exe argument handling (verified 2026-08-18 with real window
    // titles): for SELECTING a file the canonical form is
    //   explorer.exe /select,"C:\path with spaces\file"
    // which requires windowsVerbatimArguments:true (the default Node quoting
    // would escape the inner quotes to \" and explorer would fail). For
    // OPENING a folder the bare path must go through Node's DEFAULT quoting
    // (CommandLineToArgvW strips the outer quotes); a manually quoted or
    // verbatim path makes explorer fall back to the Documents folder.
    const arg = select ? `/select,"${open}"` : open;
    const child = spawn("explorer.exe", [arg], {
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: !!select,
    });
    child.unref();
    console.log(`[sidebar-enhancement-folder] reveal ${select ? "select" : "open"} ${open}`);
    return json(res, { ok: true, target: open });
  } catch (e) {
    return json(res, { ok: false, reason: String((e && e.message) || e) });
  }
}

export function apply(ctx) {
  const webServer = ctx.get("webServer");
  if (!webServer) return;
  return webServer.register({
    kind: "prefix",
    path: "/sidebar-enhancement-folder",
    handler: (req, res) => {
      if (!trusted(req)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        if (url.pathname !== "/sidebar-enhancement-folder/reveal") {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        reveal(ctx, url.searchParams.get("path") || "", url.searchParams.get("sessionId") || "", res);
      } catch (e) {
        json(res, { ok: false, reason: String((e && e.message) || e) }, 500);
      }
    },
  });
}

// Node's internal ESM loader returns the DEFAULT export only; 'webServer' is a
// hard dependency so apply runs only after the web server service exists.
export const inject = ["webServer"];
export default { name, apply, inject };
