const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { spawn } = require("child_process");

const app = express();
app.use(express.static(__dirname + "/public"));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Client connected.");

  // 启动 Groovy Language Server
  const groovyLs = spawn("java", ["-jar", "/jar/groovy-language-server.jar"]);

  // 桥接 WebSocket 和语言服务器进程
  groovyLs.stdout.on("data", (data) => ws.send(data.toString()));
  ws.on("message", (message) => groovyLs.stdin.write(message));

  groovyLs.stderr.on("data", (data) => {
    console.error(`Groovy LS stderr: ${data}`);
  });

  ws.on("close", () => {
    console.log("Client disconnected.");
    groovyLs.kill();
  });
});

server.listen(8888, () => {
  console.log("Server is listening on port 8888");
});
