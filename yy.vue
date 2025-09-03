<template>
  <div
    class="split-pane-container"
    :class="{
      'is-vertical': isVertical,
      'is-dragging': isDragging,
      'is-docked': isDocked
    }"
    ref="container"
  >
    <div class="pane pane-one" :style="paneOneStyle">
      <div v-memo="[isVertical]"><slot name="one"></slot></div>
    </div>
    <div class="resizer" :class="isVertical ? 'resizer-h' : 'resizer-v'" @mousedown.prevent="onMouseDown">
      <button class="dock-toggle-button" @click.stop="toggleDock" :title="isDocked ? '取消停靠' : '停靠'">
        <svg v-if="!isDocked" class="dock-icon" viewBox="0 0 24 24">
          <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m-2 13h-2v-2h2v2m0-4h-2V9h2v2m0-4h-2V5h2v2m4 13h2v-2h-2v2m0-4h2v-2h-2v2m0-4h2V9h-2v2m0-4h2V5h-2v2Z"/>
        </svg>
        <svg v-else class="dock-icon" viewBox="0 0 24 24">
           <path d="M5 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2m2 13h2v-2H7v2m0-4h2V9H7v2m0-4h2V5H7v2m12 13h-2v-2h2v2m0-4h-2v-2h2v2m0-4h-2V9h2v2m0-4h-2V5h2v2Z"/>
        </svg>
      </button>
      <div class="resizer-icon"></div>
    </div>
    <div class="pane pane-two">
      <div v-memo="[isVertical]"><slot name="two"></slot></div>
    </div>
    <div v-if="isDragging" class="drag-overlay" @mousemove="onMouseMove" @mouseup="onMouseUp"></div>
  </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue';

export default {
  name: 'SplitPane',
  props: {
    vertical: { type: Boolean, default: false },
    initialSplit: { type: Number, default: 30 },
    dockSize: { type: Number, default: 50 }
  },
  setup(props) {
    const container = ref(null);
    const isDragging = ref(false);
    const isVertical = ref(props.vertical);
    const split = ref(0);
    const startPos = ref(0);
    const startSplit = ref(0);
    const preDockSplit = ref(0);
    const isDocked = computed(() => split.value <= 0);

    onMounted(() => {
      if (container.value) {
        const containerSize = isVertical.value ? container.value.clientHeight : container.value.clientWidth;
        split.value = containerSize * (props.initialSplit / 100);
      }
    });

    const paneOneStyle = computed(() => {
      const styleName = isVertical.value ? 'height' : 'width';
      return { [styleName]: `${split.value}px`, 'will-change': styleName };
    });

    const onMouseDown = (event) => {
      isDragging.value = true;
      startPos.value = isVertical.value ? event.clientY : event.clientX;
      startSplit.value = split.value;
    };

    const onMouseMove = (event) => {
      if (!isDragging.value) return;
      requestAnimationFrame(() => {
        const currentPos = isVertical.value ? event.clientY : event.clientX;
        const diff = currentPos - startPos.value;
        let newSplit = startSplit.value + diff;
        if (newSplit < props.dockSize) {
          if (split.value > 0) preDockSplit.value = split.value;
          newSplit = 0;
        }
        if (container.value) {
          const containerSize = isVertical.value ? container.value.clientHeight : container.value.clientWidth;
          const maxSplit = containerSize - props.dockSize;
          split.value = Math.max(0, Math.min(maxSplit, newSplit));
        }
      });
    };

    const onMouseUp = () => { isDragging.value = false; };

    const toggleDock = () => {
      if (isDocked.value) {
        if (preDockSplit.value > 0) {
          split.value = preDockSplit.value;
        } else if (container.value) {
          const containerSize = isVertical.value ? container.value.clientHeight : container.value.clientWidth;
          split.value = containerSize * (props.initialSplit / 100);
        }
      } else {
        preDockSplit.value = split.value;
        split.value = 0;
      }
    };

    return {
      container, isDragging, isVertical, isDocked, paneOneStyle, onMouseDown, onMouseMove, onMouseUp, toggleDock
    };
  },
};
</script>


<style scoped>
/* ...大部分样式不变... */
.split-pane-container { display: flex; width: 100%; height: 100%; position: relative; overflow: hidden; }
.split-pane-container.is-vertical { flex-direction: column; }
.split-pane-container.is-dragging { user-select: none; }
.split-pane-container.is-dragging .pane { pointer-events: none; }
.pane { overflow: auto; flex-shrink: 0; will-change: width, height; }
.pane-one { background-color: #f0f0f0; }
.pane-two { flex-grow: 1; background-color: #e0e0e0; width: 100%; height: 100%; }
.resizer {
  background-color: #ccc; flex-shrink: 0; z-index: 10; transition: background-color 0.2s ease;
  display: flex; align-items: center; justify-content: space-around; /* 调整对齐方式 */
}
.resizer:hover { background-color: #007acc; }
.resizer-v { cursor: ew-resize; width: 10px; flex-direction: column; } /* 加宽以容纳按钮 */
.resizer-h { cursor: ns-resize; height: 10px; flex-direction: row; }
.is-docked .resizer { background-color: #007acc; }
.resizer-icon {
  width: 3px; height: 3px; border-radius: 50%; background-color: rgba(0, 0, 0, 0.4);
  transition: background-color 0.2s ease; position: relative;
}
.resizer-icon::before, .resizer-icon::after {
  content: ''; display: block; position: absolute; width: 3px; height: 3px;
  border-radius: 50%; background-color: rgba(0, 0, 0, 0.4); transition: background-color 0.2s ease;
}
.resizer-v .resizer-icon::before { top: -5px; left: 0; }
.resizer-v .resizer-icon::after { top: 5px; left: 0; }
.resizer-h .resizer-icon::before { left: -5px; top: 0; }
.resizer-h .resizer-icon::after { left: 5px; top: 0; }
.resizer:hover .resizer-icon, .resizer:hover .resizer-icon::before, .resizer:hover .resizer-icon::after { background-color: white; }

/* --- 新增：停靠按钮和图标的样式 --- */
.dock-toggle-button {
  background: none;
  border: none;
  padding: 2px;
  margin: 2px 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}
.dock-toggle-button:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
.dock-icon {
  width: 16px;
  height: 16px;
  fill: rgba(0, 0, 0, 0.6);
}
.resizer:hover .dock-icon, .is-docked .dock-icon {
  fill: white;
}
/* 纵向布局时，旋转图标 */
.resizer-h .dock-icon {
  transform: rotate(90deg);
}

.drag-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; background: transparent; }
.is-vertical .drag-overlay { cursor: ns-resize; }
.drag-overlay { cursor: ew-resize; }
</style>