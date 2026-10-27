// Disposable SMTP sink for integration tests: accepts every message and writes it
// to MAIL_SINK_DIR as a .eml file. Never relays mail anywhere. Local tests only.
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
const dir = process.env.MAIL_SINK_DIR;
if (!dir) throw new Error("MAIL_SINK_DIR is required");
fs.mkdirSync(dir, { recursive: true });
let count = 0;
net
  .createServer((socket) => {
    let buffer = "";
    let inData = false;
    let message = "";
    const send = (line) => socket.write(line + "\r\n");
    send("220 local-test-sink ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            fs.writeFileSync(path.join(dir, `${Date.now()}-${++count}.eml`), message);
            message = "";
            send("250 OK stored");
          } else message += (line.startsWith("..") ? line.slice(1) : line) + "\n";
          continue;
        }
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === "EHLO" || verb === "HELO") send("250 local-test-sink");
        else if (verb === "DATA") {
          inData = true;
          send("354 End data with <CR><LF>.<CR><LF>");
        } else if (verb === "QUIT") {
          send("221 Bye");
          socket.end();
        } else send("250 OK");
      }
    });
  })
  .listen(Number(process.env.SMTP_PORT || 52525), "127.0.0.1");
