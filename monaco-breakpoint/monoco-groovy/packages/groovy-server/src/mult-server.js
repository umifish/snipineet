import express from "express";
import { WebSocketServer } from "ws";
import { URL } from "url";
import http from "http";
import { spawn } from "child_process";
import path from "path";

const app = express();
const server = http.createServer(app);
const port = 3001;

// 托管前端静态文件
const __dirname = path.resolve(path.dirname(""));
app.use(express.static(path.join(__dirname, "..", "groovy-client", "dist")));

// 启动 WebSocket 服务器
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request, pathname);
  });
});

wss.on("connection", (ws, request, pathname) => {
  console.log(`WebSocket connection established for ${pathname}`);

  let childProcess;

  if (pathname === "/groovy-lsp") {
    // 启动 Groovy Language Server 进程
    const lspJarPath = path.join(
      __dirname,
      "bin",
      "groovy-language-server-all.jar"
    );
    console.log(`Starting Groovy Language Server from: ${lspJarPath}`);
    childProcess = spawn("java", ["-jar", lspJarPath]);
  } else if (pathname === "/groovy-dap") {
    // 启动 Groovy Debug Adapter 进程
    // 注意：这里的命令是示例，你需要根据你的 Debug Adapter 的实际启动方式来修改
    const dapJarPath = path.join(__dirname, "bin", "groovy-debug-adapter.jar"); // 替换为你的 DAP jar
    console.log(`Starting Groovy Debug Adapter from: ${dapJarPath}`);
    childProcess = spawn("java", ["-jar", dapJarPath]);
  } else {
    console.log(`Unknown WebSocket path: ${pathname}`);
    ws.close();
    return;
  }

  if (!childProcess.stdin || !childProcess.stdout || !childProcess.stderr) {
    console.error("Failed to get stdio streams from child process.");
    ws.close();
    return;
  }

  // 监听子进程的错误输出
  childProcess.stderr.on("data", (data) => {
    console.error(`[${pathname} STDERR]: ${data}`);
  });

  // 数据流转发: WebSocket <--> Child Process Stdio
  ws.on("message", (message) => {
    // VSCode WS JSON RPC 添加了额外的头信息，我们需要去掉
    const msgStr = message.toString();
    const contentIndex = msgStr.indexOf("\r\n\r\n");
    if (contentIndex !== -1) {
      const jsonStr = msgStr.substring(contentIndex + 4);
      // console.log(`[Browser -> ${pathname}]: ${jsonStr}`);
      childProcess.stdin.write(
        `Content-Length: ${Buffer.byteLength(
          jsonStr,
          "utf-8"
        )}\r\n\r\n${jsonStr}`
      );
    }
  });

  childProcess.stdout.on("data", (data) => {
    // console.log(`[${pathname} -> Browser]: ${data.toString()}`);
    ws.send(data.toString());
  });

  // 清理
  ws.on("close", () => {
    console.log(
      `WebSocket connection for ${pathname} closed. Killing child process.`
    );
    childProcess.kill();
  });

  childProcess.on("exit", (code) => {
    console.log(`Child process for ${pathname} exited with code ${code}`);
    if (ws.readyState === ws.OPEN) {
      ws.close();
    }
  });
});

server.listen(port, () => {
  console.log(`Server is listening on http://localhost:${port}`);
});
