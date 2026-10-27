// Minimal local API gateway for disposable integration tests only.
// Routes /auth/v1/* to GoTrue and /rest/v1/* to PostgREST, like the Supabase gateway.
import http from "node:http";
const port = Number(process.env.GATEWAY_PORT || 55433);
const routes = [
  ["/auth/v1/", Number(process.env.AUTH_PORT || 59999)],
  ["/rest/v1/", Number(process.env.REST_PORT || 53000)],
];
http
  .createServer((req, res) => {
    const route = routes.find(([prefix]) => req.url.startsWith(prefix));
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: route[1],
        path: "/" + req.url.slice(route[0].length),
        method: req.method,
        headers: req.headers,
      },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  })
  .listen(port, "127.0.0.1");
