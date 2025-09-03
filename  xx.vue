<template>
  <div id="app">
    <header>
      <h1>带“记忆恢复”停靠功能的 SplitPane</h1>
       <button @click="handleToggleDock" class="dock-button">
        切换主面板停靠状态
      </button>
    </header>
    <main>
      <SplitPane ref="splitPaneRef" :initial-split="40" :dock-size="60">
        <template #one>
          <div class="content">
            <h2>面板一</h2>
            <p>1. 您可以将此面板拖动到一个任意宽度。</p>
            <p>2. 点击右上角的 "切换主面板停靠状态" 按钮，面板会停靠。</p>
            <p>3. 再次点击该按钮，面板会<strong>恢复到您第一步拖动到的宽度</strong>，而不是一个固定的初始值。</p>
            <p>拖拽到边缘同样会自动停靠并记录位置。</p>
          </div>
        </template>
        
        <template #two>
            <div class="content">
                <h2>面板二</h2>
                <p>这里是右侧面板内容。</p>
            </div>
        </template>
      </SplitPane>
    </main>
  </div>
</template>

<script>
import { ref } from 'vue';
import SplitPane from './components/SplitPane.vue';

export default {
  name: 'App',
  components: {
    SplitPane,
  },
  setup() {
    // 创建一个 ref 来引用 SplitPane 组件实例
    const splitPaneRef = ref(null);

    // 调用子组件暴露的 toggleDock 方法
    const handleToggleDock = () => {
      if (splitPaneRef.value) {
        splitPaneRef.value.toggleDock();
      }
    };

    return {
      splitPaneRef,
      handleToggleDock,
    };
  }
};
</script>

<style>
/* ... 其他样式与之前相同 ... */
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem; 
  background-color: #2c3e50; 
  color: white; 
  flex-shrink: 0;
}
.dock-button {
  padding: 8px 12px;
  border: 1px solid white;
  background-color: transparent;
  color: white;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s, color 0.2s;
}
.dock-button:hover {
  background-color: white;
  color: #2c3e50;
}
html, body {
  margin: 0; padding: 0; height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
#app {
  width: 100vw; height: 100vh; display: flex; flex-direction: column;
}
main {
  flex-grow: 1; height: 0; 
}
.content {
  padding: 1.5rem;
}
</style>