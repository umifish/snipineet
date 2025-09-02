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
      <div v-memo="[isVertical]">
        <slot name="one"></slot>
      </div>
    </div>

    <div
      class="resizer"
      :class="isVertical ? 'resizer-h' : 'resizer-v'"
      @mousedown.prevent="onMouseDown"
    ></div>

    <div class="pane pane-two">
      <div v-memo="[isVertical]">
        <slot name="two"></slot>
      </div>
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
    vertical: { type: Boolean, default: false },
    initialSplit: { type: Number, default: 30 },
    dockSize: { type: Number, default: 50 },
  },
  setup(props) {
    const container = ref(null);
    const isDragging = ref(false);
    const isVertical = ref(props.vertical);
    const split = ref(0);

    const startPos = ref(0);
    const startSplit = ref(0);

    const isDocked = computed(() => split.value <= 0);

    onMounted(() => {
      if (container.value) {
        const containerSize = isVertical.value
          ? container.value.clientHeight
          : container.value.clientWidth;
        split.value = containerSize * (props.initialSplit / 100);
      }
    });

    const paneOneStyle = computed(() => {
      const styleName = isVertical.value ? "height" : "width";
      // 添加 will-change 属性，通知浏览器该属性即将变化
      return {
        [styleName]: `${split.value}px`,
        "will-change": styleName,
      };
    });

    const onMouseDown = (event) => {
      isDragging.value = true;
      startPos.value = isVertical.value ? event.clientY : event.clientX;
      startSplit.value = split.value;
    };

    const onMouseMove = (event) => {
      if (!isDragging.value) return;

      // requestAnimationFrame 确保动画流畅，这是高性能的关键
      requestAnimationFrame(() => {
        const currentPos = isVertical.value ? event.clientY : event.clientX;
        const diff = currentPos - startPos.value;
        let newSplit = startSplit.value + diff;

        if (newSplit < props.dockSize) {
          newSplit = 0;
        }

        if (container.value) {
          const containerSize = isVertical.value
            ? container.value.clientHeight
            : container.value.clientWidth;
          const maxSplit = containerSize - props.dockSize;
          split.value = Math.max(0, Math.min(maxSplit, newSplit));
        }
      });
    };

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
.split-pane-container.is-dragging {
  /* 拖动时禁用文本选择和指针事件，提升流畅度 */
  user-select: none;
}
.split-pane-container.is-dragging .pane {
  pointer-events: none;
}
.pane {
  overflow: auto;
  flex-shrink: 0;
  /* 为面板二也添加 will-change，因为它会随面板一的变化而变化 */
  will-change: width, height;
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
