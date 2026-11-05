import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { spawn } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const production = process.argv.includes("--dist");
const servedRoot = resolve(root, production ? "dist" : "site");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const source = production
      ? `dist/${path === "/" ? "index.html" : path.slice(1)}`
      : path === "/catalog.json"
        ? "data/catalog.json"
        : path === "/about.json"
          ? "config/about.json"
        : path === "/config.json"
          ? "config/site.json"
          : `site/${path === "/" ? "index.html" : path.slice(1)}`;
    const file = resolve(root, source);
    const allowedData = !production && (path === "/catalog.json" || path === "/config.json" || path === "/about.json");
    if (!allowedData && !file.startsWith(servedRoot + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const content = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": /\/assets\/covers\/\d+-[a-f0-9]{16}\.webp$/.test(path)
        ? "public, max-age=31536000, immutable" : "no-store",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
let port = 4173;
server.on("error", (error) => {
  if (production && error.code === "EADDRINUSE" && port < 4193) {
    server.listen(++port, "127.0.0.1");
    return;
  }
  console.error(error.code === "EADDRINUSE"
    ? "端口 4173 已被占用，请关闭之前的预览窗口或占用该端口的程序后重试。"
    : error.message);
  process.exitCode = 1;
});
server.on("listening", () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`${production ? "发布版预览（dist）" : "开发预览"}: ${url}`);
  console.log("保持此窗口开启；按 Ctrl+C 停止。修改网页或公开数据后，请重新启动预览。");
  if (process.argv.includes("--open")) {
    const command = process.platform === "win32" ? "powershell.exe" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["-NoProfile", "-Command", `Start-Process '${url}'`] : [url];
    const browser = spawn(command, args, { stdio: "ignore", windowsHide: true });
    browser.on("error", () => console.log(`请手动打开浏览器访问 ${url}`));
    browser.unref();
  }
});
server.listen(port, "127.0.0.1");
