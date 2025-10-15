<template>
  <div class="json-viewer-container" :style="{ '--level': level }">
    <template v-if="level === 0 && !isContainer">
      <div class="json-node primitive-root-value">
        <span class="toggle-placeholder"></span>
        <span class="bracket-placeholder"></span>
        <div class="json-content">
          <span :class="['value-content', `type-${dataType}`]">
            {{ formatPrimitive(data) }}
          </span>
        </div>
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
        <span class="toggle-column">
          <template v-if="isContainer">
            <span @click="toggle" class="toggle-icon">
              <svg v-if="isCollapsed" class="icon closed" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <svg v-else class="icon open" viewBox="0 0 24 24">
                <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
              </svg>
            </span>
          </template>
        </span>

        <span class="bracket-column">
          <template v-if="isContainer">
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
        </span>

        <div class="json-content">
          <template v-if="showLabel">
            <span class="key-label"
              >{{ label }}<template v-if="!isContainer">:</template></span
            >
          </template>

          <div v-if="isContainer ? !isCollapsed : true" class="nested-content">
            <template v-if="isContainer">
              <template v-for="(value, key, index) in data" :key="key">
                <JsonViewer
                  :data="value"
                  :label="key"
                  :level="level + 1"
                  :show-label="isObject(data)"
                />

                <span v-if="index < containerSize - 1" class="separator-comma"
                  >,</span
                >
              </template>

              <span
                :class="[
                  'container-symbol',
                  dataType + '-type',
                  'closing-bracket',
                ]"
              >
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
      </div>
    </template>
  </div>
</template>

<script setup>
// ... (Script setup 部分保持不变) ...
import { ref, computed } from "vue";
import JsonViewer from "./JsonViewer.vue";

const props = defineProps({
  data: {
    type: [Object, Array, String, Number, Boolean, null],
    required: true,
  },
  label: {
    type: [String, Number],
    default: "root",
  },
  level: {
    type: Number,
    default: 0,
  },
  showLabel: {
    type: Boolean,
    default: true,
  },
});

const isCollapsed = ref(props.level !== 0);

const isObject = (val) =>
  val !== null && typeof val === "object" && !Array.isArray(val);
const isArray = (val) => Array.isArray(val);
const isContainer = computed(() => isObject(props.data) || isArray(props.data));

const dataType = computed(() => {
  if (isObject(props.data)) return "object";
  if (isArray(props.data)) return "array";
  if (props.data === null) return "null";
  return typeof props.data;
});

const containerSize = computed(() => {
  if (isArray(props.data)) return props.data.length;
  if (isObject(props.data)) return Object.keys(props.data).length;
  return 0;
});

const formatPrimitive = (val) => {
  if (typeof val === "string") return `"${val}"`;
  if (val === null) return "null";
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val);
};

const toggle = () => {
  if (isContainer.value) {
    isCollapsed.value = !isCollapsed.value;
  }
};
</script>

<style scoped>
/* 定义 CSS 变量 */
.json-viewer-container {
  --arrow-width: 20px;
  --bracket-width: 12px; /* 括号列的宽度 */
  --indent-unit: 16px;

  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
    monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #333;
}

/* 核心布局：根据层级计算左边距 */
.json-viewer-container {
  padding-left: calc(var(--level) * var(--indent-unit));
}

.json-node {
  display: flex;
  align-items: flex-start;
  cursor: default;
  padding: 2px 0;
  white-space: pre-wrap;
}

/* 箭头列 */
.toggle-column,
.bracket-column,
.toggle-placeholder,
.bracket-placeholder {
  height: 1.6em; /* 确保高度与行高一致 */
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.toggle-column,
.toggle-placeholder {
  width: var(--arrow-width);
}
/* 括号列，居中对齐 */
.bracket-column,
.bracket-placeholder {
  width: var(--bracket-width);
  justify-content: center;
  align-items: center;
}

/* 内容列 */
.json-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
  /* 根节点的键和值是横向排列 */
  flex-direction: row;
}
.json-content > .nested-content {
  flex-direction: column;
}
/* 根级基本类型的值 */
.primitive-root-value .json-content {
  flex-direction: row;
}

/* 键名颜色 */
.key-label {
  color: #a31515;
  font-weight: 600;
  margin-right: 8px;
  flex-shrink: 0;
}

/* 容器符号 ([], {}) 的颜色 */
.container-symbol {
  color: #666;
  font-weight: 400;
  user-select: none;
}
/* 起始括号单独在 .bracket-column 中，无需 margin */
.bracket-column .container-symbol {
  margin: 0;
}

/* 闭合括号定位：使用负 margin 将其拉回 Bracket Column 的下方 */
.closing-bracket {
  /* 抵消 content 的 padding-left (如果有的话) 和 Key/Value 的空间 */
  /* 减去 箭头列 + 括号列 的总宽度，再加上一点偏移量 */
  margin-left: calc(-1 * (var(--arrow-width) + var(--bracket-width) + 2px));
  /* 确保闭合括号在单独的一行 */
  width: 100%;
  text-align: left;
  display: block;
  line-height: 1.6em;
  padding-left: calc(
    var(--arrow-width) + var(--bracket-width)
  ); /* 占位，使其内容靠左 */
}

/* 嵌套内容：必须使用负 margin 抵消箭头和括号列，使其对齐到父级的 content */
.nested-content {
  /* 抵消箭头列和括号列的总宽度 */
  margin-left: calc(-1 * (var(--arrow-width) + var(--bracket-width)));
  display: block;
  width: 100%;
}

/* 箭头图标 (保持不变) */
.toggle-icon {
  width: 14px;
  height: 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  user-select: none;
  color: #888;
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

/* 逗号分隔符 */
.separator-comma {
  color: #666;
  margin-left: 2px;
  user-select: none;
  line-height: 1.6;
}

/* JSON 规范数据类型颜色定义 (保持不变) */
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
/* 连接线调整：要对齐到 Bracket Column 的中心 */
.json-viewer-container:not([style*="--level: 0"]) {
  border-left: 1px dotted #ddd;
  /* 虚线对齐到 (箭头宽度 + 括号宽度) 的中心 */
  margin-left: calc((var(--arrow-width) + var(--bracket-width)) / 2);
  /* 调整 padding-left 使得内容列在视觉上对齐 */
  padding-left: calc(
    var(--indent-unit) - (var(--arrow-width) + var(--bracket-width)) / 2
  ) !important;
}
.json-viewer-container[style*="--level: 0"] {
  background-color: #ffffff;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 10px 0 10px 0 !important;
  margin-bottom: 20px;
}
.json-viewer-container[style*="--level: 0"] .json-node {
  padding-left: var(--indent-unit);
}
</style>
