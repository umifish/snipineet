import { WebSocketServer } from "ws";
import { Server } from "node:http";
import express from "express";
import {
  getLocalDirectory,
  type LanguageServerRunConfig,
  upgradeWsServer,
} from "./server-common.ts";

/** LSP server runner */
export const runLanguageServer = (
  languageServerRunConfig: LanguageServerRunConfig
) => {
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception: ", err.toString());

    if (err.stack !== undefined) {
      console.error(err.stack);
    }
  });

  // create the express application
  const app = express();

  // server the static content, i.e. index.html
  const dir = getLocalDirectory(import.meta.url);
  console.log(`Serving static content from ${dir}`);

  app.use(express.static(dir));

  // start the http server
  const httpServer: Server = app.listen(languageServerRunConfig.serverPort);
  const wss = new WebSocketServer(languageServerRunConfig.wsServerOptions);

  // create the web socket
  upgradeWsServer(languageServerRunConfig, {
    server: httpServer,
    wss,
  });
};
