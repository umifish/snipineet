<template>
  <div id="app">
    <header>
      <h1>带自动停靠功能的 SplitPane 示例</h1>
    </header>
    <main>
      <SplitPane :initial-split="25" :dock-size="60">
        <template #one>
          <div class="content">
            <h2>父面板 1</h2>
            <p>这是一个横向分割面板。尝试将中间的调整器一直向左拖动。</p>
            <p>
              当左侧面板宽度小于
              <strong>60px</strong> 时，它会自动停靠在左侧边缘。
            </p>
          </div>
        </template>

        <template #two>
          <SplitPane :vertical="true" :initial-split="40" :dock-size="70">
            <template #one>
              <div class="content nested-pane-1">
                <h2>嵌套面板 1 (顶部)</h2>
                <p>这是一个纵向分割面板。尝试将调整器一直向上拖动。</p>
                <p>
                  当顶部面板高度小于
                  <strong>70px</strong> 时，它会自动停靠在顶部边缘。
                </p>
              </div>
            </template>
            <template #two>
              <div class="content nested-pane-2">
                <h2>嵌套面板 2 (底部)</h2>
                <p>每个 SplitPane 实例的停靠行为都是独立的。</p>
              </div>
            </template>
          </SplitPane>
        </template>
      </SplitPane>
    </main>
  </div>
</template>

<script>
import SplitPane from "./components/SplitPane.vue";

export default {
  name: "App",
  components: {
    SplitPane,
  },
};
</script>

<style>
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
}
#app {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
header {
  padding: 1rem 1.5rem;
  background-color: #2c3e50;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
main {
  flex-grow: 1;
  height: 0;
}
.content {
  padding: 1.5rem;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}
.nested-pane-1 {
  background-color: #e0f2f1;
}
.nested-pane-2 {
  background-color: #fff3e0;
}
</style>
