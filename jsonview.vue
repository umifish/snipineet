<template>
  <div class="json-viewer" :style="{ 'padding-left': level * 20 + 'px' }">
    <template v-if="isContainer">
      <div
        :class="['json-node', isObject(data) ? 'object-node' : 'array-node']"
      >
        <span class="key-label" v-once>{{ label }}:</span>
        <span @click="toggle" class="toggle-icon">
          [{{ isCollapsed ? "+" : "-" }}]
        </span>

        <span :class="['value-type', dataType + '-type']" v-once>
          {{
            isCollapsed
              ? isObject(data)
                ? `{...} (${Object.keys(data).length})`
                : `[...] (${data.length})`
              : isObject(data)
              ? "{"
              : "["
          }}
        </span>

        <div v-if="!isCollapsed">
          <JsonViewer
            v-for="(value, key) in data"
            :key="key"
            :data="value"
            :label="key"
            :level="level + 1"
          />
          <span :class="['value-type', dataType + '-type']" v-once>
            {{ isObject(data) ? "}" : "]" }}
          </span>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="json-node primitive-node">
        <span class="key-label" v-once>{{ label }}:</span>
        <span :class="['value-content', `type-${dataType}`]" v-once>
          {{ formatPrimitive(data) }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

// 1. 定义组件属性 (Props)
const props = defineProps({
  // 要显示的数据 (可以是对象、数组或基本类型)
  data: {
    type: [Object, Array, String, Number, Boolean, null],
    required: true,
  },
  // 当前数据的键名
  label: {
    type: [String, Number],
    default: "root",
  },
  // 当前的嵌套级别 (用于缩进)
  level: {
    type: Number,
    default: 0,
  },
});

// 2. 状态管理
// 默认展开根节点 (level === 0)，其他节点默认折叠
const isCollapsed = ref(props.level !== 0);

// 3. 辅助函数 & Computed 属性
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

// 4. 格式化基本类型的值
const formatPrimitive = (val) => {
  if (typeof val === "string") return `"${val}"`;
  if (val === null) return "null";
  return String(val);
};

// 5. 交互方法
const toggle = () => {
  // 只有容器节点可以折叠/展开
  if (isContainer.value) {
    isCollapsed.value = !isCollapsed.value;
  }
};
</script>

<style scoped>
.json-viewer {
  /* 基础字体和间距 */
  font-family: Consolas, monospace;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  /* 核心：通过 prop level 动态计算的 padding-left 来实现缩进 */
}

.json-node {
  cursor: default;
  /* 容器节点的样式 */
}

.key-label {
  color: #a31515; /* 红色 */
  font-weight: bold;
  margin-right: 5px;
}

.toggle-icon {
  margin-right: 5px;
  cursor: pointer;
  user-select: none; /* 防止双击选中 */
  color: #808080;
}

.value-content {
  font-weight: normal;
}

/* 值类型颜色 */
.type-string {
  color: #008000;
} /* 绿色 */
.type-number {
  color: #09885a;
} /* 青色 */
.type-boolean {
  color: #0000ff;
} /* 蓝色 */
.type-null {
  color: #808080;
} /* 灰色 */

/* 节点类型标记 */
.value-type {
  color: #808080;
  font-weight: normal;
}
</style>
