<template>
  <div
    class="split-pane-container"
    :class="{
      'is-vertical': isVertical,
      'is-dragging': isDragging,
      'is-docked': isDocked,
    }"
    ref="container"
  >
    <div class="pane pane-one" :style="paneOneStyle">
      <slot name="one"></slot>
    </div>

    <div
      class="resizer"
      :class="isVertical ? 'resizer-h' : 'resizer-v'"
      @mousedown.prevent="onMouseDown"
    ></div>

    <div class="pane pane-two">
      <slot name="two"></slot>
    </div>

    <div
      v-if="isDragging"
      class="drag-overlay"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
    ></div>
  </div>
</template>

<script>
import { ref, onMounted, computed } from "vue";

export default {
  name: "SplitPane",
  props: {
    // 设置方向 (true: 纵向, false: 横向)
    vertical: { type: Boolean, default: false },
    // 初始分割位置 (百分比)
    initialSplit: { type: Number, default: 30 },
    // 触发自动停靠的阈值 (像素)
    dockSize: { type: Number, default: 50 },
  },
  setup(props) {
    const container = ref(null);
    const isDragging = ref(false);
    const isVertical = ref(props.vertical);
    const split = ref(0); // 实际分割位置 (像素)

    const startPos = ref(0);
    const startSplit = ref(0);

    // 根据split值计算是否已停靠
    const isDocked = computed(() => split.value <= 0);

    // 组件挂载后，将百分比转换为像素值
    onMounted(() => {
      if (container.value) {
        const containerSize = isVertical.value
          ? container.value.clientHeight
          : container.value.clientWidth;
        split.value = containerSize * (props.initialSplit / 100);
      }
    });

    // 面板一的样式
    const paneOneStyle = computed(() => {
      const styleName = isVertical.value ? "height" : "width";
      return { [styleName]: `${split.value}px` };
    });

    // 在调整器上按下鼠标
    const onMouseDown = (event) => {
      isDragging.value = true;
      startPos.value = isVertical.value ? event.clientY : event.clientX;
      startSplit.value = split.value;
    };

    // 拖动逻辑，由遮罩层处理
    const onMouseMove = (event) => {
      if (!isDragging.value) return;

      requestAnimationFrame(() => {
        const currentPos = isVertical.value ? event.clientY : event.clientX;
        const diff = currentPos - startPos.value;
        let newSplit = startSplit.value + diff;

        // 核心停靠逻辑：如果新尺寸小于停靠阈值，则直接设置为0
        if (newSplit < props.dockSize) {
          newSplit = 0;
        }

        const containerSize = isVertical.value
          ? container.value.clientHeight
          : container.value.clientWidth;
        // 限制拖动范围，防止另一个面板过小
        const maxSplit = containerSize - props.dockSize;

        split.value = Math.max(0, Math.min(maxSplit, newSplit));
      });
    };

    // 鼠标抬起，结束拖动
    const onMouseUp = () => {
      isDragging.value = false;
    };

    return {
      container,
      isDragging,
      isVertical,
      isDocked,
      paneOneStyle,
      onMouseDown,
      onMouseMove,
      onMouseUp,
    };
  },
};
</script>

<style scoped>
.split-pane-container {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.split-pane-container.is-vertical {
  flex-direction: column;
}
.split-pane-container.is-dragging .pane {
  pointer-events: none;
  user-select: none;
}
.pane {
  overflow: auto;
  flex-shrink: 0;
}
.pane-one {
  background-color: #f0f0f0;
}
.pane-two {
  flex-grow: 1;
  background-color: #e0e0e0;
  width: 100%;
  height: 100%;
}
.resizer {
  background-color: #ccc;
  flex-shrink: 0;
  z-index: 10;
  transition: background-color 0.2s ease;
}
.resizer:hover {
  background-color: #007acc;
}
.resizer-v {
  cursor: ew-resize;
  width: 5px;
  height: 100%;
}
.resizer-h {
  cursor: ns-resize;
  width: 100%;
  height: 5px;
}

/* 当面板停靠时，高亮显示调整器，提示用户可以将其拖出 */
.is-docked .resizer {
  background-color: #007acc;
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  background: transparent;
  cursor: ew-resize;
}
.is-vertical .drag-overlay {
  cursor: ns-resize;
}
</style>
