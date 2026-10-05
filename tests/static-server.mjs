// A plain file server for subdirectory deployment checks; never used by the app.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("dist"),
  prefix = "/mako/";
const types = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};
createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  if (!pathname.startsWith(prefix)) {
    response.writeHead(404).end();
    return;
  }
  const filename = resolve(
    root,
    decodeURIComponent(pathname.slice(prefix.length)) || "index.html",
  );
  if (!filename.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(filename);
    response
      .writeHead(200, {
        "Content-Type": types[extname(filename)] || "application/octet-stream",
      })
      .end(data);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4184, "127.0.0.1");
