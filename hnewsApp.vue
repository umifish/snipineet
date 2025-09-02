<template>
  <div id="app">
    <header>
      <h1>高性能 SplitPane 组件示例</h1>
    </header>
    <main>
      <SplitPane :initial-split="25" :dock-size="60">
        <template #one>
          <div class="content">
            <h2>面板一</h2>
            <p>此面板已通过 CSS `will-change` 属性进行性能优化。</p>
            <p>
              在您拖动时，浏览器会预期到 `width` 或 `height` 的变化，并可能使用
              GPU 加速来处理，从而获得更流畅的体验。
            </p>
          </div>
        </template>

        <template #two>
          <div class="content">
            <h2>面板二</h2>
            <p>插槽内容已被 `v-memo` 指令包裹。</p>
            <p>
              这意味着如果插槽内的组件很复杂，只要 `isVertical` 状态不变，Vue
              将跳过对这些内容的重新渲染，从而在拖动时减少不必要的计算开销。
            </p>
          </div>
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
/* 样式与之前的示例相同，此处省略以保持简洁 */
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
}
main {
  flex-grow: 1;
  height: 0;
}
.content {
  padding: 1.5rem;
}
</style>
