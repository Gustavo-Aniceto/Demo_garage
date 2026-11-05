// Imita a API do Supabase Storage: list (POST) e download (GET autenticado)
import http from "node:http";
const files = {
  "os/aaa/checkin/f1.jpg": Buffer.alloc(1200, 1), "os/aaa/checkin/f2.jpg": Buffer.alloc(800, 2),
  "os/aaa/checkout/f3.jpg": Buffer.alloc(500, 3), "os/bbb/checkin/f4.jpg": Buffer.alloc(300, 4),
};
for (let i = 0; i < 1105; i++) files[`os/ccc/checkin/x${String(i).padStart(4, "0")}.jpg`] = Buffer.alloc(10, 5); // força paginação (>1000)
let downloads = 0;
http.createServer((req, res) => {
  if (req.headers.authorization !== "Bearer service-key") { res.writeHead(401); return res.end(); }
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    if (req.method === "POST" && req.url === "/storage/v1/object/list/vehicle-photos") {
      const { prefix = "", limit = 100, offset = 0 } = JSON.parse(body || "{}");
      const pre = prefix ? prefix + "/" : "";
      const entries = new Map();
      for (const [k, v] of Object.entries(files)) {
        if (!k.startsWith(pre)) continue;
        const rest = k.slice(pre.length), [head, ...tail] = rest.split("/");
        entries.set(head, tail.length ? { name: head, id: null, metadata: null } : { name: head, id: "id-" + k, metadata: { size: v.length } });
      }
      const list = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit);
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(list));
    }
    const m = req.url.match(/^\/storage\/v1\/object\/(?:authenticated\/)?vehicle-photos\/(.+)$/);
    if (req.method === "GET" && m) {
      const k = decodeURIComponent(m[1].split("?")[0]);
      if (k === "os/bbb/checkin/f4.jpg" && process.env.FAIL_ONE) { res.writeHead(500, { "content-type": "application/json" }); return res.end('{"message":"falha simulada"}'); }
      if (!files[k]) { res.writeHead(404); return res.end(); }
      downloads++; res.writeHead(200, { "content-type": "image/jpeg" }); return res.end(files[k]);
    }
    if (req.url === "/_stats") { res.writeHead(200); return res.end(String(downloads)); }
    res.writeHead(404); res.end(req.method + " " + req.url);
  });
}).listen(54999, () => console.log("mock ok"));
