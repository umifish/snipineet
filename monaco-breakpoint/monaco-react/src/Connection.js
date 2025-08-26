import * as monaco from "monaco-editor";
import {
  MonacoLanguageClient,
  CloseAction,
  ErrorAction,
} from "monaco-languageclient";
import {
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from "vscode-ws-jsonrpc";
import ReconnectingWebSocket from "reconnecting-websocket";

// 注册 Groovy 语言（语法高亮部分依然需要）
// ... (参考第一部分的代码)

// 1. 创建 WebSocket 连接
const url = "ws://localhost:3000"; // 后端 WebSocket 地址
const webSocket = new ReconnectingWebSocket(url);

// 2. 使用 monaco-languageclient 启动客户端
webSocket.onopen = () => {
  const socket = {
    send: (content) => webSocket.send(content),
    onmessage: (cb) => (webSocket.onmessage = (event) => cb(event.data)),
    onerror: (cb) => (webSocket.onerror = (event) => cb(event)),
    onclose: (cb) => (webSocket.onclose = (event) => cb(event)),
    dispose: () => webSocket.close(),
  };
  const reader = new WebSocketMessageReader(socket);
  const writer = new WebSocketMessageWriter(socket);

  const languageClient = new MonacoLanguageClient({
    name: "Groovy Language Client",
    clientOptions: {
      documentSelector: ["groovy"], // 指定作用于 groovy 语言
      errorHandler: {
        error: () => ({ action: ErrorAction.Continue }),
        closed: () => ({ action: CloseAction.DoNotRestart }),
      },
    },
    connectionProvider: {
      get: (errorHandler, closeHandler) => {
        return Promise.resolve({ reader, writer });
      },
    },
  });

  languageClient.start();
};

// 创建 Monaco Editor 实例
const editor = monaco.editor.create(document.getElementById("container"), {
  model: monaco.editor.createModel(
    "",
    "groovy",
    monaco.Uri.parse("inmemory://model/groovy_script.groovy")
  ),
  language: "groovy",
  glyphMargin: true,
  lightbulb: {
    enabled: true,
  },
});
