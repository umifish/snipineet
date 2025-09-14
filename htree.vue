<template>
  <el-tree
    ref="treeRef"
    :data="data"
    :node-key="nodeKey"
    :default-expanded-keys="computedExpandedKeys"
    :props="props"
    @node-click="handleNodeClick"
    @node-expand="handleNodeExpand"
    @node-collapse="handleNodeCollapse"
    :expand-on-click-node="false"
    class="custom-tree"
  >
    <template #default="{ node, data }">
      <span
        class="custom-tree-node"
        :class="{ 'is-highlighted': node[nodeKey] === highlightedKey }"
      >
        {{ node.label }}
      </span>
    </template>
  </el-tree>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import { ElTree } from "element-plus";

const props = defineProps({
  data: {
    type: Array,
    required: true,
  },
  nodeKey: {
    type: String,
    default: "id",
  },
  highlightedNodeKey: {
    type: [String, Number],
    default: null,
  },
  defaultExpandedKeys: {
    type: Array,
    default: () => [],
  },
  props: {
    type: Object,
    default: () => ({ label: "label" }),
  },
});

const treeRef = ref(null);
const userExpandedKeys = ref([]);
const highlightedKey = ref(props.highlightedNodeKey);

// 计算最终展开的 keys，结合了默认展开和用户记忆的展开
const computedExpandedKeys = computed(() => {
  return [
    ...new Set([...props.defaultExpandedKeys, ...userExpandedKeys.value]),
  ];
});

// 监听外部传入的高亮键，同步到内部状态
watch(
  () => props.highlightedNodeKey,
  (newVal) => {
    highlightedKey.value = newVal;
  }
);

// 监听 `defaultExpandedKeys` 初始化展开状态
watch(
  () => props.defaultExpandedKeys,
  (newVal) => {
    userExpandedKeys.value = [];
  },
  { deep: true, immediate: true }
);

// // 监听 defaultExpandedKeys 的变化，并手动展开节点
// watch(
//   () => props.defaultExpandedKeys,
//   (newKeys) => {
//     // 确保 tree 已经渲染
//     nextTick(() => {
//       if (treeRef.value) {
//         newKeys.forEach(key => {
//           const node = treeRef.value.getNode(key);
//           if (node) {
//             node.expanded = true;
//           }
//         });
//       }
//     });
//   },
//   { deep: true, immediate: true }
// );

const handleNodeClick = (data, node) => {
  // 仅在组件内部更新高亮状态，不影响外部
  highlightedKey.value = data[props.nodeKey];
};

const handleNodeExpand = (data) => {
  const key = data[props.nodeKey];
  if (!userExpandedKeys.value.includes(key)) {
    userExpandedKeys.value.push(key);
  }
};

const handleNodeCollapse = (data) => {
  const key = data[props.nodeKey];
  const index = userExpandedKeys.value.indexOf(key);
  if (index > -1) {
    userExpandedKeys.value.splice(index, 1);
  }
};
</script>

<style scoped>
.custom-tree .is-highlighted {
  color: var(--el-color-primary);
  font-weight: bold;
}
</style>
