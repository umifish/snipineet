<template>
    <div class="split-pane" ref="container">
      <div
        class="left-pane"
        :style="{ width: `${leftWidth.value}px` }"
      >
        <slot name="left"></slot>
      </div>
  
      <!-- 使用 v-resizable 指令控制拖拽 -->
      <div
        class="resizer"
        v-resizable="{ minWidth: 100, maxWidth: 800, onResize }"
      ></div>
  
      <div class="right-pane">
        <slot name="right"></slot>
      </div>
    </div>
  </template>
  
  <script>
  import { ref, onMounted, onBeforeUnmount } from 'vue';
  
  export default {
    setup() {
      const leftWidth = ref(300); // 默认左侧宽度
      const container = ref(null); // 用来监听容器的引用
  
      // 更新左侧分栏宽度
      const updateLeftWidth = () => {
        if (container.value) {
          const containerWidth = container.value.clientWidth;
          const newWidth = containerWidth * 0.3; // 左侧分栏占窗口的 30%
          leftWidth.value = Math.max(100, Math.min(800, newWidth)); // 最小100px，最大800px
        }
      };
  
      // 监听窗口大小变化的 ResizeObserver
      const resizeObserver = ref(null);
  
      const setupResizeObserver = () => {
        resizeObserver.value = new ResizeObserver(() => {
          updateLeftWidth();
        });
        if (container.value) {
          resizeObserver.value.observe(container.value); // 观察容器的大小变化
        }
      };
  
      // 拖拽时更新左侧分栏宽度
      const onResize = (newWidth) => {
        leftWidth.value = newWidth;
      };
  
      // 在组件挂载时初始化
      onMounted(() => {
        updateLeftWidth(); // 初始化左侧分栏的宽度
        setupResizeObserver(); // 设置 ResizeObserver 监听容器变化
      });
  
      // 在组件卸载时清理
      onBeforeUnmount(() => {
        if (resizeObserver.value && container.value) {
          resizeObserver.value.unobserve(container.value); // 停止观察容器
        }
      });
  
      return {
        leftWidth,
        onResize,
        container,
      };
    },
  };
  </script>
  
  <style scoped>
  .split-pane {
    display: flex;
    width: 100%;
    height: 100%;
  }
  
  .left-pane {
    background-color: lightgray;
    overflow: auto;
  }
  
  .right-pane {
    background-color: lightblue;
    flex-grow: 1;
    overflow: auto;
  }
  
  .resizer {
    background-color: #333;
    cursor: ew-resize;
    width: 5px;
    height: 100%;
  }
  </style>
  