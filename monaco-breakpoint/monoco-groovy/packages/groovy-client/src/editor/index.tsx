import { useRef, useEffect, useState } from 'react';
import { MonacoEditorLanguageClientWrapper, type WrapperConfig } from 'monaco-editor-wrapper';
import Editor, { loader, useMonaco } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import * as Monaco from 'monaco-editor';
import { groovyConfig } from '../config/config';
import { groovyConfiguration, groovyLanguageDefinition } from '../monarch/groovy-monarch';
import './index.css';

const defaultCode = `
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

function GroovyEditor() {
  const wrapperRef = useRef<MonacoEditorLanguageClientWrapper | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [editorText, setEditorText] = useState(defaultCode);

  self.MonacoEnvironment = {
    getWorker: function (_moduleId, label) {
      if (label === 'json') {
        return new JsonWorker();
      }

      if (label === 'css' || label === 'scss' || label === 'less') {
        return new CssWorker();
      }

      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new HtmlWorker();
      }

      if (label === 'typescript' || label === 'javascript') {
        return new TsWorker();
      }

      return new EditorWorker();
    },
  };

  loader.config({ monaco: Monaco });

  // --- LSP Initialization ---
  const monaco = useMonaco();

  useEffect(() => {
    if (monaco && !wrapperRef.current) {
      const wrapper = new MonacoEditorLanguageClientWrapper();

      wrapperRef.current = wrapper;

      // const languageId = 'groovy';
      // const lspUrl = `ws://localhost:${groovyConfig.port}${groovyConfig.path}`;

      // // language client config
      // const languageClientConfig = {
      //   languageId: languageId,
      //   name: 'Groovy Language Client',
      //   options: {
      //     $type: 'WebSocket',
      //     url: lspUrl,
      //     startOptions: {
      //       onCall: (message: any) => console.log('LSP sending:', message),
      //       reportStatus: true,
      //     },
      //     stopOptions: {
      //       onCall: (message: any) => console.log('LSP stopping:', message),
      //       reportStatus: true,
      //     },
      //   },
      // };

      // const startConfig: any = {
      //   languageClientConfigs: languageClientConfig,
      // };
      // const startConfig: WrapperConfig = {
      //   $type: 'extended',
      //   languageClientConfigs: {
      //     configs: {
      //       groovy: {
      //         clientOptions: {
      //           documentSelector: ['groovy'],
      //         },
      //         connection: {
      //           options: {
      //             $type: 'WebSocketUrl',
      //             url: `ws://localhost:${groovyConfig.port}${groovyConfig.path}`,
      //           },
      //         },
      //       },
      //     },
      //   },
      // };

      // Start the Wrapper
      // wrapper
      //   .initAndStart(startConfig)
      //   .then(() => console.log('Monaco Editor Wrapper started successfully.'))
      //   .catch((error) => console.error('Error starting Monaco Editor Wrapper:', error));
    }

    return () => {
      wrapperRef.current?.dispose();
      wrapperRef.current = null;
      console.log('Monaco Editor Wrapper disposed.');
    };
  }, [monaco]);

  // --- DAP Connection and Logic ---
  // DAP: https://microsoft.github.io/debug-adapter-protocol/
  // CDP: https://chromedevtools.github.io/devtools-protocol/
  const connectDap = () => {};

  const handleEditorBeforeDidMount = (monaco: typeof Monaco) => {
    monaco.languages.register({ id: 'groovy' });
    monaco.languages.setMonarchTokensProvider('groovy', groovyLanguageDefinition);
    monaco.languages.setLanguageConfiguration('groovy', groovyConfiguration);
  };

  const handleEditorDidMount = (editor: Monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof Monaco) => {
    console.log('Editor mounted');
    editorRef.current = editor;

    // define breakpoint decoration options
    const breakpointOption: Monaco.editor.IModelDecorationOptions = {
      isWholeLine: true,
      linesDecorationsClassName: 'breakpoint',
      linesDecorationsTooltip: '点击添加断点',
    };
    const activeBreakpointOption: Monaco.editor.IModelDecorationOptions = {
      isWholeLine: true,
      linesDecorationsClassName: 'breakpoint-active',
      linesDecorationsTooltip: '点击移除断点',
    };

    // initialize decorations
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [
      {
        range: new Monaco.Range(1, 1, 9999, 1),
        options: breakpointOption,
      },
    ];
    const activeDecorations: Monaco.editor.IModelDeltaDecoration[] = [];

    // create decoration collections
    const breakpointCollections = editor.createDecorationsCollection(decorations);
    const activeBreakpointCollections = editor.createDecorationsCollection(activeDecorations);

    // Add action to set/remove breakpoint on glyph margin click
    editor.onMouseDown((e) => {
      if (e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const model = editor.getModel();

        if (!model) {
          return;
        }

        const lineNumber = e.target.position!.lineNumber;
        const newActiveDecorations: Monaco.editor.IModelDeltaDecoration[] = [];

        if (e.event.target.classList.contains('breakpoint')) {
          // activeBreakpointCollections
          //   .getRanges()
          //   // remove duplicates
          //   .filter((item, index) => activeBreakpointCollections.getRanges().indexOf(item) === index)
          //   .forEach((erange) => {
          //     newActiveDecorations.push({
          //       range: erange,
          //       options: activeBreakpointOption,
          //     });
          //   });
          // newActiveDecorations.push({
          //   range: new Monaco.Range(lineNum, 1, lineNum, 1),
          //   options: activeBreakpointOption,
          // });
          // activeBreakpointCollections.set(newActiveDecorations);
        }

        // if (e.event.target.classList.contains('breakpoint-active')) {
        //   activeBreakpointCollections
        //     .getRanges()
        //     // Remove duplicates
        //     .filter((item, index) => activeBreakpointCollections.getRanges().indexOf(item) === index)
        //     .forEach((erange) => {
        //       if (erange.startLineNumber !== lineNum) {
        //         newActiveDecorations.push({
        //           range: erange,
        //           options: activeBreakpointOption,
        //         });
        //       }
        //     });

        //   activeBreakpointCollections.set(newActiveDecorations);
        // }
      }
    });

    // Update decorations when content changes
    editor.onDidChangeModelContent(() => {
      breakpointCollections.set(decorations);
      // activeBreakpointCollections.set(decorations);
    });
  };

  return (
    <div className="editor-container">
      <div className="controls">
        <button>Start/Restart Debugging</button>
        <button>Step Over</button>
      </div>
      <div className="editor">
        <Editor
          height="100%"
          theme="vs-dark"
          language="groovy"
          value={editorText}
          beforeMount={handleEditorBeforeDidMount}
          onMount={handleEditorDidMount}
          onChange={(value) => setEditorText(value ?? '')}
          options={{ glyphMargin: true }}
        />
      </div>
    </div>
  );
}

export default GroovyEditor;
