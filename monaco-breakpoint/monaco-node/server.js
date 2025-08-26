/*
 * --- 2. server.js ---
 * 这是调试适配器服务的核心实现。
 * 将此代码保存为 `server.js`。
 *
 * **运行前请确保:**
 * 1. 你已经安装了 Node.js 和 npm。
 * 2. 你已经安装了 Java 和 Groovy，并且 `groovy` 命令在你的系统路径中可用。
 * 3. 运行 `npm install` 安装了上述依赖。
 */

/* server.js */
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
let messageCounter = 1;

// 监听 WebSocket 连接
wss.on("connection", (ws) => {
  console.log("[Server] Client connected.");

  let groovyProcess = null;
  let breakpoints = new Map(); // file -> [lines]

  // 模拟 JDWP 客户端
  // 在真实世界中，这里会是一个与 Java 调试器通信的库
  const jdwpClient = {
    attach: (port) => console.log(`[JDWP-SIM] Attaching to port ${port}...`),
    setBreakpoint: (filePath, line) =>
      console.log(`[JDWP-SIM] Setting breakpoint at ${filePath}:${line}`),
    resume: () => {
      console.log("[JDWP-SIM] Resuming execution.");
      // 模拟程序执行结束
      setTimeout(() => {
        sendToClient({ type: "event", event: "terminated" });
        if (groovyProcess) groovyProcess.kill();
      }, 2000); // 假设程序运行 2 秒
    },
    disconnect: () => console.log("[JDWP-SIM] Disconnecting."),
  };

  // 处理从客户端收到的消息
  ws.on("message", (message) => {
    const request = JSON.parse(message);
    console.log("[Server] Received:", request);
    handleDAPRequest(request);
  });

  ws.on("close", () => {
    console.log("[Server] Client disconnected.");
    if (groovyProcess) {
      groovyProcess.kill();
    }
    jdwpClient.disconnect();
  });

  // 发送消息给客户端
  function sendToClient(payload) {
    payload.seq = messageCounter++;
    const responseStr = JSON.stringify(payload);
    console.log("[Server] Sending:", responseStr);
    ws.send(responseStr);
  }

  // 处理 DAP 请求
  function handleDAPRequest(request) {
    switch (request.command) {
      case "initialize":
        sendToClient({
          type: "response",
          request_seq: request.seq,
          success: true,
          command: request.command,
          body: {
            supportsConfigurationDoneRequest: true,
            supportsSetVariable: true,
          },
        });
        break;

      case "launch":
        const code = request.arguments.code;
        const tempFilePath = path.join(__dirname, `${uuidv4()}.groovy`);
        fs.writeFileSync(tempFilePath, code);

        // 使用 JDWP 启动 Groovy 进程
        // -agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:0
        // suspend=y: 启动后立即暂停，等待调试器连接
        // address=*:0: 在一个随机可用端口上监听
        groovyProcess = spawn("groovy", [
          `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:0`,
          tempFilePath,
        ]);

        groovyProcess.stderr.on("data", (data) => {
          const output = data.toString();
          console.error(`[Groovy stderr] ${output}`);
          // 从 stderr 中解析 JDWP 监听的端口
          const match = output.match(
            /Listening for transport dt_socket at address: (\d+)/
          );
          if (match && match[1]) {
            const port = parseInt(match[1], 10);
            console.log(
              `[Server] Groovy script is listening for debugger on port ${port}`
            );
            jdwpClient.attach(port);
            sendToClient({
              type: "response",
              request_seq: request.seq,
              success: true,
              command: request.command,
            });
          }
        });

        groovyProcess.on("close", (code) => {
          console.log(`[Server] Groovy process exited with code ${code}`);
          fs.unlinkSync(tempFilePath); // 清理临时文件
        });
        break;

      case "setBreakpoints":
        const source = request.arguments.source;
        const lines = request.arguments.breakpoints.map((bp) => bp.line);
        breakpoints.set(source.path, lines);

        lines.forEach((line) => {
          jdwpClient.setBreakpoint(source.path, line);
        });

        sendToClient({
          type: "response",
          request_seq: request.seq,
          success: true,
          command: request.command,
          body: {
            breakpoints: lines.map((line) => ({ verified: true, line })),
          },
        });
        break;

      case "configurationDone":
        console.log("[Server] Configuration done. Resuming Groovy script.");
        jdwpClient.resume();
        sendToClient({
          type: "response",
          request_seq: request.seq,
          success: true,
          command: request.command,
        });
        break;

      case "disconnect":
        if (groovyProcess) groovyProcess.kill();
        jdwpClient.disconnect();
        sendToClient({
          type: "response",
          request_seq: request.seq,
          success: true,
          command: request.command,
        });
        break;

      default:
        console.warn(`[Server] Unhandled command: ${request.command}`);
        break;
    }
  }
});

server.listen(PORT, () => {
  console.log(`[Server] Debug adapter listening on http://localhost:${PORT}`);
});
