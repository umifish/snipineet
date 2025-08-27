import { useState, useRef } from "react";
import { loader } from "@monaco-editor/react";
import {
  groovyConfiguration,
  groovyLanguageDefinition,
} from "../monarch/groovy-monarch.ts";
import * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
import * as monaco from "monaco-editor";
import Editor from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import {
  MonacoLanguageClient,
  CloseAction,
  ErrorAction,
} from "monaco-languageclient";
import {
  type IWebSocket,
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from "vscode-ws-jsonrpc";
import ReconnectingWebSocket from "reconnecting-websocket";
import "./App.css";

// DAP: https://microsoft.github.io/debug-adapter-protocol/
// CDP: https://chromedevtools.github.io/devtools-protocol/
function App() {
  loader.config({ monaco });

  self.MonacoEnvironment = {
    getWorker: function (_moduleId, label) {
      if (label === "json") {
        return new JsonWorker();
      }
      if (label === "css" || label === "scss" || label === "less") {
        return new CssWorker();
      }
      if (label === "html" || label === "handlebars" || label === "razor") {
        return new HtmlWorker();
      }
      if (label === "typescript" || label === "javascript") {
        return new TsWorker();
      }
      return new EditorWorker();
    },
  };

  monaco.languages.register({ id: "groovy" });
  monaco.languages.setMonarchTokensProvider("groovy", groovyLanguageDefinition);
  monaco.languages.setLanguageConfiguration("groovy", groovyConfiguration);

  const url = "ws://localhost:8888";
  const monacoWebSocket = new ReconnectingWebSocket(url);

  monacoWebSocket.onopen = () => {
    const socket: IWebSocket = {
      send: (content: string) => monacoWebSocket.send(content),
      onMessage: (cb) =>
        (monacoWebSocket.onmessage = (event) => cb(event.data)),
      onError: (cb) => (monacoWebSocket.onerror = (event) => cb(event)),
      onClose: (cb) =>
        (monacoWebSocket.onclose = (event) => cb(event.code, event.reason)),
      dispose: () => monacoWebSocket.close(),
    };

    const reader = new WebSocketMessageReader(socket);
    const writer = new WebSocketMessageWriter(socket);

    const languageClient = new MonacoLanguageClient({
      name: "Groovy Language Client",
      clientOptions: {
        documentSelector: ["groovy"],
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

  const value = `
    class Person {
        String name
        int age

        def greet() {
            // GString (interpolated string)
            def message = "Hello, my name is \${name} and I am \${age} years old."
            println message
        }
    }

    def p = new Person(name: 'Alice', age: 30)
    p.greet()
  `;
  const [code, setCode] = useState(value);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor>(null);

  const bpOption = {
    isWholeLine: true,
    linesDecorationsClassName: "breakpoints",
    linesDecorationsTooltip: "点击添加断点",
  };

  const activeBpOption = {
    isWholeLine: true,
    linesDecorationsClassName: "breakpoints-active",
    linesDecorationsTooltip: "点击移除断点",
  };

  function handleEditorDidMount(editor: Monaco.editor.IStandaloneCodeEditor) {
    const activeCollections: Monaco.editor.IModelDeltaDecoration[] = [];
    const collections: Monaco.editor.IModelDeltaDecoration[] = [
      {
        range: new Monaco.Range(1, 1, 9999, 1),
        options: bpOption,
      },
    ];

    const bpc = editor.createDecorationsCollection(collections);
    const activeBpc = editor.createDecorationsCollection(activeCollections);

    editorRef.current = editor;

    editor.onMouseDown((e) => {
      if (e.event.target.classList.contains("breakpoints")) {
        const lineNum = parseInt(
          e.event.target.nextElementSibling?.innerHTML as string
        );
        const acc: Monaco.editor.IModelDeltaDecoration[] = [];
        activeBpc
          .getRanges()
          .filter(
            (item, index) => activeBpc.getRanges().indexOf(item) === index
          ) // 去重
          .forEach((erange) => {
            acc.push({
              range: erange,
              options: activeBpOption,
            });
          });
        acc.push({
          range: new Monaco.Range(lineNum, 1, lineNum, 1),
          options: activeBpOption,
        });
        activeBpc.set(acc);
      }

      if (e.event.target.classList.contains("breakpoints-active")) {
        const lineNum = parseInt(
          e.event.target.nextElementSibling?.innerHTML as string
        );
        const acc: Monaco.editor.IModelDeltaDecoration[] = [];
        activeBpc
          .getRanges()
          .filter(
            (item, index) => activeBpc.getRanges().indexOf(item) === index
          )
          .forEach((erange) => {
            if (erange.startLineNumber !== lineNum)
              acc.push({
                range: erange,
                options: activeBpOption,
              });
          });
        activeBpc.set(acc);
      }
    });

    // 内容变动时更新装饰器
    editor.onDidChangeModelContent(() => {
      bpc.set(collections);
    });
  }

  return (
    <>
      <div style={{ width: "100vw", height: "100vh" }}>
        <Editor
          onChange={(value) => {
            setCode(value!);
          }}
          theme="vs-dark"
          value={code}
          language="groovy"
          onMount={handleEditorDidMount}
          options={{ glyphMargin: true, folding: false }}
        />
      </div>
    </>
  );
}

export default App;
