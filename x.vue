<template>
  <div class="split-pane" ref="container">
    <div
      class="left-pane"
      :style="{ width: `${leftWidth.value}px` }"
    >
      <slot name="left"></slot>
    </div>

    <div
      class="resizer"
      @mousedown="onMouseDown"
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
    // 响应式变量
    const leftWidth = ref(300); // 默认左侧宽度
    const isDragging = ref(false); // 是否在拖拽
    const startX = ref(0); // 鼠标初始位置
    const startWidth = ref(0); // 初始左侧宽度
    const rafId = ref(null); // requestAnimationFrame ID
    const container = ref(null); // 用于监听容器大小变化的引用

    // 更新左侧分栏宽度的函数
    const updateLeftWidth = () => {
      if (container.value) {
        const containerWidth = container.value.clientWidth;
        const newWidth = containerWidth * 0.3; // 左侧占窗口的 30%
        leftWidth.value = Math.max(100, Math.min(800, newWidth)); // 最小100px，最大800px
      }
    };

    // 使用 ResizeObserver 来监听容器尺寸变化
    const resizeObserver = ref(null);

    const setupResizeObserver = () => {
      resizeObserver.value = new ResizeObserver(() => {
        updateLeftWidth();
      });
      if (container.value) {
        resizeObserver.value.observe(container.value); // 观察容器的大小变化
      }
    };

    // 拖拽相关
    const onMouseDown = (event) => {
      isDragging.value = true;
      startX.value = event.clientX;
      startWidth.value = leftWidth.value;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (event) => {
      if (isDragging.value && !rafId.value) {
        rafId.value = requestAnimationFrame(() => {
          const diff = event.clientX - startX.value;
          let newWidth = startWidth.value + diff;

          // 最小宽度 100px，最大宽度 800px
          newWidth = Math.max(100, Math.min(800, newWidth));

          leftWidth.value = newWidth;
          rafId.value = null; // 清除当前帧ID
        });
      }
    };

    const onMouseUp = () => {
      isDragging.value = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafId.value) {
        cancelAnimationFrame(rafId.value);
        rafId.value = null;
      }
    };

    // 在组件挂载时设置 ResizeObserver
    onMounted(() => {
      updateLeftWidth(); // 初始化左侧宽度
      setupResizeObserver(); // 设置 ResizeObserver
    });

    // 在组件卸载时移除 ResizeObserver
    onBeforeUnmount(() => {
      if (resizeObserver.value && container.value) {
        resizeObserver.value.unobserve(container.value); // 停止观察容器
      }
    });

    return {
      leftWidth,
      onMouseDown,
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
