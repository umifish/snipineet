<template>
  <div
    class="json-viewer-container"
    :style="{ 'padding-left': level * 16 + 'px' }"
  >
    <template v-if="level === 0 && !isContainer">
      <div class="json-node primitive-root-value">
        <span :class="['value-content', `type-${dataType}`]">
          {{ formatPrimitive(data) }}
        </span>
      </div>
    </template>

    <template v-else>
      <div
        :class="[
          'json-node',
          isContainer
            ? isObject(data)
              ? 'object-node'
              : 'array-node'
            : 'primitive-node',
        ]"
      >
        <span class="key-label"
          >{{ label }}<template v-if="!isContainer">:</template></span
        >

        <template v-if="isContainer">
          <span @click="toggle" class="toggle-icon">
            <svg v-if="isCollapsed" class="icon closed" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <svg v-else class="icon open" viewBox="0 0 24 24">
              <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
            </svg>
          </span>

          <span :class="['container-symbol', dataType + '-type']">
            {{
              isCollapsed
                ? isObject(data)
                  ? `{...}`
                  : `[...]`
                : isObject(data)
                ? "{"
                : "["
            }}
          </span>
        </template>

        <div v-if="isContainer ? !isCollapsed : true" class="nested-content">
          <template v-if="isContainer">
            <JsonViewer
              v-for="(value, key) in data"
              :key="key"
              :data="value"
              :label="key"
              :level="level + 1"
            />
            <span :class="['container-symbol', dataType + '-type']">
              {{ isObject(data) ? "}" : "]" }}
            </span>
          </template>

          <template v-else>
            <span :class="['value-content', `type-${dataType}`]">
              {{ formatPrimitive(data) }}
            </span>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import JsonViewer from "./JsonViewer.vue";

const props = defineProps({
  data: {
    type: [Object, Array, String, Number, Boolean, null],
    required: true,
  },
  // 根节点传入的 label 默认为 'root'，但在 level 0 且非容器时不会使用
  label: {
    type: [String, Number],
    default: "root",
  },
  level: {
    type: Number,
    default: 0,
  },
});

// 状态管理
const isCollapsed = ref(props.level !== 0);

// 辅助函数 & Computed 属性
const isObject = (val) =>
  val !== null && typeof val === "object" && !Array.isArray(val);
const isArray = (val) => Array.isArray(val);
const isContainer = computed(() => isObject(props.data) || isArray(props.data));

const dataType = computed(() => {
  if (isObject(props.data)) return "object";
  if (isArray(props.data)) return "array";
  if (props.data === null) return "null";
  return typeof props.data; // string, number, boolean
});

// 格式化基本类型的值
const formatPrimitive = (val) => {
  if (typeof val === "string") return `"${val}"`;
  if (val === null) return "null";
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val);
};

// 交互方法
const toggle = () => {
  if (isContainer.value) {
    isCollapsed.value = !isCollapsed.value;
  }
};
</script>

<style scoped>
/* 样式保持不变，确保了美观和规范性 */
.json-viewer-container {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
    monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #333;
}

.json-node {
  display: flex;
  align-items: flex-start;
  cursor: default;
  padding: 2px 0;
  white-space: pre-wrap;
}

/* 根级基本类型值，不需要额外的缩进或边框，样式应该在最顶层 */
.primitive-root-value {
  padding-left: 16px; /* 保持与根容器内边距一致 */
}

/* 键名颜色 (所有节点) */
.key-label {
  color: #a31515;
  font-weight: 600;
  margin-right: 8px;
  flex-shrink: 0;
}

/* 冒号处理：在 template 中通过 <template v-if="!isContainer">:</template> 实现 */

/* 折叠图标 */
.toggle-icon {
  width: 14px;
  height: 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: 6px;
  cursor: pointer;
  user-select: none;
  color: #888;
  flex-shrink: 0;
}
.toggle-icon:hover {
  color: #000;
}
.toggle-icon .icon {
  fill: currentColor;
  width: 100%;
  height: 100%;
}
.icon.closed {
  transform: rotate(0deg);
}
.icon.open {
  transform: rotate(90deg) translateY(-2px);
}

/* 容器符号 ([], {}) 的颜色 */
.container-symbol {
  color: #666;
  font-weight: 400;
  margin-left: 4px;
  flex-shrink: 0;
}

.nested-content {
  margin-left: 0;
  display: block;
  width: 100%;
}

.value-content {
  font-weight: normal;
  word-break: break-all;
}

/* JSON 规范数据类型颜色定义 */
.type-string {
  color: #008000;
}
.type-number {
  color: #09885a;
}
.type-boolean {
  color: #0000ff;
}
.type-null {
  color: #a500a5;
}

/* 容器美化样式 */
.json-viewer-container:not([style*="padding-left: 0px"]) {
  border-left: 1px dotted #ddd;
  margin-left: 8px;
  padding-left: 8px !important;
}
.json-viewer-container[style*="padding-left: 0px"] {
  background-color: #ffffff;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 10px 0 10px 0 !important;
  margin-bottom: 20px;
}
.json-viewer-container[style*="padding-left: 0px"] .json-node {
  padding-left: 16px;
}
</style>
