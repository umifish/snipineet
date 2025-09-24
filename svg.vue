<template>
  <div class="icon-demo-container">
    <h1>动态着色 SVG 图标</h1>

    <component
      :is="HomeIcon"
      class="colorable-svg"
      :style="{
        width: size,
        height: size,
        color: dynamicColor,
      }"
    />

    <p>当前颜色: **{{ dynamicColor }}**</p>
    <button @click="toggleColor">切换颜色</button>
  </div>
</template>

<script setup>
import { ref } from "vue";

// 关键步骤：直接导入 SVG 文件。
// 假设您的构建工具（如 Vite + vite-svg-loader）已配置，
// HomeIcon 现在是一个 Vue 组件对象。
import HomeIcon from "./assets/icons/home.svg";

const dynamicColor = ref("#1976D2"); // 初始颜色：深蓝色
const size = ref("60px"); // 图标尺寸

const toggleColor = () => {
  dynamicColor.value = dynamicColor.value === "#1976D2" ? "#E91E63" : "#1976D2";
};
</script>

<style scoped>
/* 容器样式 */
.icon-demo-container {
  padding: 20px;
  text-align: center;
  font-family: sans-serif;
}

button {
  margin-top: 20px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
}

/* ---------------------------------------------------- */
/* 核心着色 CSS：作用于 <component> 渲染出的 <svg> 元素 */
/* ---------------------------------------------------- */

/* 1. 作用于 SVG 根元素 */
.colorable-svg {
  /* 确保 SVG 自身能从父级继承 color */
  fill: currentColor;
  stroke: currentColor;
  transition: color 0.3s; /* 添加过渡效果让颜色变化更平滑 */
}

/* 2. 作用于 SVG 内部的图形元素 */
/* 使用 :deep() 或 ::v-deep 穿透组件样式作用于 SVG 内部的 <path>、<circle> 等 */
.colorable-svg :deep(path),
.colorable-svg :deep(circle),
.colorable-svg :deep(rect) {
  /* 强制让内部图形元素继承父级的颜色 (即 .colorable-svg 上的 color 样式) */
  /* 使用 !important 确保覆盖 SVG 文件内部可能自带的 fill 属性 */
  fill: currentColor !important;
  stroke: currentColor;
}
</style>
