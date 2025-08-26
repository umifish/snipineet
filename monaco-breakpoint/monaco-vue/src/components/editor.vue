<template>
  <div class="monaco" id="monaco" ref="monacoRef"></div>
</template>

<script setup>
import * as monaco from "monaco-editor";
import { onMounted, shallowRef, ref, onBeforeUnmount, watch } from "vue";

const props = defineProps({
  code: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    default: "xml",
  },
  line: {
    type: Number,
    default: 0,
  },
});

const monacoRef = shallowRef(null);
let editor = null;
let decorations = []; // 存储装饰的ID

const highlightLine = () => {
  const lineNumber = Number(props.line);
  if (lineNumber === 0) {
    decorations = editor.deltaDecorations(decorations, []);
    return;
  }
  decorations = editor.deltaDecorations(decorations, [
    {
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className: "highlight-line",
      },
    },
  ]);
};

const setLanguage = () => {
  if (!editor) {
    return;
  }
  const model = editor.getModel();
  if (!model) {
    return;
  }
  monaco.editor.setModelLanguage(model, props.language);
};

const setPosition = () => {
  if (!editor) {
    return;
  }
  editor.revealLineInCenter(Number(props.line));
};
const init = () => {
  editor = monaco.editor.create(monacoRef.value, {
    value: props.code,
    language: props.language,
    theme: "vs-dark",
    automaticLayout: true, // 自动调整大小
    lineHeight: 24,
    tabSize: 2,
    minimap: {
      // 关闭小地图
      enabled: false,
    },
    readOnly: true,
    domReadOnly: true,
  });
};

const assignmentCode = () => {
  if (!editor) {
    return;
  }
  editor.setValue(props.code);
  if (props.code) {
    setLanguage();
    setPosition();
    highlightLine();
  }
};

watch(() => props.code, assignmentCode, { immediate: true, deep: true });

onMounted(() => {
  init();
});

onBeforeUnmount(() => {
  if (editor) {
    editor.dispose();
    editor = null;
  }
});
</script>

<style scoped lang="scss">
.monaco {
  width: 100%;
  height: 100%;
}
</style>

<style>
#monaco .highlight-line {
  background-color: rgba(140, 143, 255, 0.7) !important; /* 设置高亮背景颜色 */
}
</style>
