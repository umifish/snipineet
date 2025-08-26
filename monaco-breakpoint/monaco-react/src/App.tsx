import Editor from "@monaco-editor/react";
import * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
import "./App.css";
import { useState } from "react";

// DAP: https://microsoft.github.io/debug-adapter-protocol/
// CDP: https://chromedevtools.github.io/devtools-protocol/
function App() {
  const [code, setCode] = useState("# some code here...");

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

    editor.onMouseDown((e) => {
      // 加断点
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
      // 删断点
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
      <div style={{ width: "80vw", height: "80vh" }}>
        <Editor
          onChange={(value) => {
            setCode(value!);
          }}
          theme="vs-dark"
          value={code}
          language="javascript"
          onMount={handleEditorDidMount}
          options={{ glyphMargin: true, folding: false }}
        />
      </div>
    </>
  );
}

export default App;
