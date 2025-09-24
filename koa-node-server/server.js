// server.js (更新后的代码)

import Koa from "koa";
import websockify from "koa-websocket";
import schedule from "node-schedule";

// 存储所有活跃的 WebSocket 连接
const clients = new Set();
let clientCounter = 0; // 用于给客户端分配 ID

// 使用 websockify 包装 Koa 实例以启用 WebSocket 支持
const app = websockify(new Koa());

/**
 * 广播消息给所有连接的客户端
 * @param {object} data - 包含 type 和 message 的数据对象
 */
function broadcast(data) {
  const payload = JSON.stringify(data);

  console.log(`广播消息: ${payload}`);

  clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    } else {
      clients.delete(client); // 清理已关闭的连接
    }
  });
}

// WebSocket 中间件
app.ws.use(async (ctx) => {
  const ws = ctx.websocket;
  const clientId = ++clientCounter; // 分配一个唯一的 ID
  ws.clientId = clientId; // 将 ID 附加到连接对象上

  console.log(`新的 WebSocket 连接已建立，ID: ${clientId}`);
  clients.add(ws);

  // 广播新用户上线通知
  broadcast({
    type: "USER_JOINED",
    message: `用户 ${clientId} 已建立连接。`,
    clientId: clientId,
  });

  // --- 核心：处理客户端发送的消息 ---
  ws.on("message", (message) => {
    const messageText = message.toString();
    console.log(`收到用户 ${clientId} 消息: ${messageText}`);

    // 将收到的消息广播给所有用户（包括发送者自己）
    broadcast({
      type: "CHAT_MESSAGE",
      message: messageText,
      senderId: clientId,
      timestamp: new Date().toLocaleTimeString(),
    });
  });
  // ------------------------------------

  // 连接关闭时
  ws.on("close", () => {
    console.log(`WebSocket 连接已关闭，ID: ${clientId}`);
    clients.delete(ws);
    // 广播用户离线通知
    broadcast({
      type: "USER_LEFT",
      message: `用户 ${clientId} 离开了聊天室。`,
      clientId: clientId,
    });
  });

  // 错误处理
  ws.on("error", (err) => {
    console.error(`WebSocket 错误 (ID: ${clientId}):`, err);
    clients.delete(ws);
  });
});

// 2. 定时任务配置 (保持不变，但使用新的广播函数)
// 任务 1: 每 10 秒发送一次通知
schedule.scheduleJob("*/10 * * * * *", function () {
  const message = "这是来自定时任务的通知：请注意服务器时间!";
  console.log(`[定时任务运行] - ${new Date().toLocaleTimeString()}`);
  // 使用统一的广播函数，并指定 type 为 SCHEDULED_TASK
  broadcast({
    type: "SCHEDULED_TASK",
    message: message,
    timestamp: new Date().toISOString(),
  });
});

console.log("定时任务已启动。");

// 3. 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Koa server running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
