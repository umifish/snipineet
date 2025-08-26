// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { spawn } = require("child_process");

const app = express();
app.use(express.static(__dirname + "/public")); // 假设你的前端文件在 public 目录
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Client connected.");

  // 启动 Groovy Language Server
  // 你需要提前下载好它的 jar 文件
  const groovyLs = spawn("java", [
    "-jar",
    "/path/to/groovy-language-server.jar", // <-- 修改为你的路径
  ]);

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

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
