<template>
  <div class="app-container">
    <section>
      <h3>1. 编辑器区域 (CM6 演示)</h3>
      <div ref="editorNode" class="editor-container"></div>
      
      <button @click="handleExport" class="export-btn">
        生成静态快照 (无 querySelector)
      </button>
    </section>

    <hr />

    <section>
      <h3>2. 静态快照预览 (使用 h 函数渲染)</h3>
      <div class="preview-area">
        <CMSnapshot v-if="currentSnapshot" :snapshot="currentSnapshot" />
        <p v-else>尚未生成快照</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, shallowRef } from 'vue';
import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

import { captureCMState } from './cm-adapter';
import CMSnapshot from './CMSnapshot';

const editorNode = ref(null);
const currentSnapshot = ref(null);
// 注意：CM 实例建议用 shallowRef 存储，避免 Vue 对其进行深层响应式处理，提高性能
const view = shallowRef(null);

onMounted(() => {
  // 初始化 CM6
  view.value = new EditorView({
    doc: "function helloWorld() {\n  console.log('Hello from CodeMirror!');\n}\n\n// 这是一个静态快照演示",
    extensions: [
      basicSetup, 
      javascript(),
      oneDark // 加入一个主题测试样式兼容
    ],
    parent: editorNode.value
  });
});

const handleExport = () => {
  // 直接通过 view.value 实例提取，无需操作 DOM 查找
  const data = captureCMState(view.value);
  if (data) {
    currentSnapshot.value = data;
    console.log("快照已提取:", data);
  }
};
</script>

<style scoped>
.app-container { max-width: 800px; margin: 0 auto; padding: 20px; }
.editor-container { margin-bottom: 15px; }
.export-btn {
  padding: 10px 20px;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 20px;
}
.export-btn:hover { background: #33a06f; }
.preview-area { background: #fafafa; padding: 10px; border-radius: 8px; }
</style>
