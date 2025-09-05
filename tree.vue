<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="800px"
    top="5vh"
    :before-close="handleCancel"
    destroy-on-close
  >
    <div v-loading="loading" class="dialog-content">
      <el-row :gutter="20">
        <el-col :span="12">
          <div class="tree-container">
            <h4 class="tree-title">源数据</h4>
            <el-input
              v-model="filterText"
              placeholder="输入关键字进行过滤"
              class="filter-input"
              clearable
            />
            <el-tree
              ref="sourceTreeRef"
              :data="sourceDataState"
              show-checkbox
              node-key="id"
              :props="treeProps"
              :default-expand-all="false"
              :filter-node-method="filterNode"
              @check="handleSourceTreeCheck"
            />
          </div>
        </el-col>

        <el-col :span="12">
          <div class="tree-container">
            <h4 class="tree-title">已选数据</h4>
            <el-tree
              ref="selectedTreeRef"
              :data="selectedDataState"
              node-key="id"
              :props="treeProps"
              :default-expand-all="true"
              show-checkbox
              @check="handleSelectedTreeCheck"
            />
          </div>
        </el-col>
      </el-row>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">取 消</el-button>
        <el-button
          type="primary"
          :loading="confirmLoading"
          @click="handleConfirm"
        >
          保 存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, nextTick } from "vue";

// --- 定义组件的 Props 和 Emits ---

const props = defineProps({
  // ... (visible, title, sourceData, initialSelectedData, treeProps 等 props 保持不变)
  visible: { type: Boolean, required: true },
  title: { type: String, default: "数据勾选" },
  sourceData: { type: Array, default: null },
  initialSelectedData: { type: Array, default: null },
  treeProps: {
    type: Object,
    default: () => ({ label: "label", children: "children" }),
  },

  // --- 异步加载函数 Props ---
  // loadSourceApi 和 loadSelectedApi 用于在组件内部加载数据
  loadSourceApi: { type: Function, default: null },
  loadSelectedApi: { type: Function, default: null },

  // 新增：接收一个用于保存的异步函数
  // 这个函数应该返回一个 Promise
  onConfirm: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits(["update:visible"]);

// --- 组件内部状态 ---

// [新增] 整个对话框内容区域的加载状态 (用于初始数据加载)
const loading = ref(false);
// [新增] 保存按钮的加载状态
const confirmLoading = ref(false);

const sourceTreeRef = ref(null);
const selectedTreeRef = ref(null);
const filterText = ref("");
const sourceDataState = ref([]);
const selectedDataState = ref([]);

// --- 核心逻辑 ---

/**
 * @description 初始化组件数据, 增加了 loading 状态的控制
 */
const initializeData = async () => {
  loading.value = true; // 打开加载遮罩
  try {
    // 优先使用 props 传入的静态数据
    if (props.sourceData) {
      sourceDataState.value = props.sourceData;
    }
    // 否则, 如果提供了 API 函数, 则调用它
    else if (typeof props.loadSourceApi === "function") {
      sourceDataState.value = await props.loadSourceApi();
    }

    if (props.initialSelectedData) {
      selectedDataState.value = props.initialSelectedData;
    } else if (typeof props.loadSelectedApi === "function") {
      selectedDataState.value = await props.loadSelectedApi();
    }

    await nextTick();
    syncCheckState();
  } catch (error) {
    console.error("Failed to load tree data:", error);
  } finally {
    loading.value = false; // 关闭加载遮罩
  }
};

/**
 * @description 确认按钮点击事件 - [逻辑重构]
 */
const handleConfirm = async () => {
  if (typeof props.onConfirm !== "function") {
    console.error("The onConfirm prop must be a function.");
    return;
  }

  const selectedIds = selectedTreeRef.value.getCheckedKeys(false);
  const selectedNodes = selectedTreeRef.value.getCheckedNodes(false, false);

  confirmLoading.value = true; // 开启按钮加载状态
  try {
    // 调用父组件传入的 onConfirm 函数, 并将数据传递出去
    // 使用 await 等待父组件的异步操作 (如API调用) 完成
    await props.onConfirm(selectedIds, selectedNodes);

    // 异步操作成功后, 关闭对话框
    emit("update:visible", false);
  } catch (error) {
    // 如果父组件的 onConfirm 函数抛出错误, 可以在这里捕获
    console.error("Error during confirm action:", error);
    // 此时不关闭对话框, 方便用户重试
  } finally {
    confirmLoading.value = false; // 无论成功或失败, 都关闭按钮加载状态
  }
};

// ... 其他方法 (handleCancel, handleSourceTreeCheck, handleSelectedTreeCheck, filterNode, syncCheckState, extractIdsFromTree 等) 保持不变
const handleCancel = () => {
  emit("update:visible", false);
};
const handleSourceTreeCheck = () => {
  selectedDataState.value = sourceTreeRef.value.getCheckedNodes(false, true);
  nextTick(() => {
    const ids = extractIdsFromTree(selectedDataState.value);
    selectedTreeRef.value.setCheckedKeys(ids, false);
  });
};
const handleSelectedTreeCheck = () => {
  const keys = selectedTreeRef.value.getCheckedKeys();
  sourceTreeRef.value.setCheckedKeys(keys, false);
  handleSourceTreeCheck();
};
const filterNode = (value, data) =>
  !value || data[props.treeProps.label].includes(value);
const syncCheckState = () => {
  if (!sourceTreeRef.value || !selectedTreeRef.value) return;
  const ids = extractIdsFromTree(selectedDataState.value);
  sourceTreeRef.value.setCheckedKeys(ids, false);
  selectedTreeRef.value.setCheckedKeys(ids, false);
};
const extractIdsFromTree = (treeData) => {
  const ids = [];
  const traverse = (nodes) => {
    if (!nodes || !nodes.length) return;
    for (const node of nodes) {
      ids.push(node.id);
      if (node[props.treeProps.children])
        traverse(node[props.treeProps.children]);
    }
  };
  traverse(treeData);
  return ids;
};

// --- 监听器 ---
watch(filterText, (val) => {
  sourceTreeRef.value.filter(val);
});
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      initializeData();
    } else {
      sourceDataState.value = [];
      selectedDataState.value = [];
      filterText.value = "";
    }
  }
);
</script>

<style scoped>
/* 样式与之前版本相同 */
.dialog-content {
  min-height: 60vh;
}
.tree-container {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 15px;
  height: 60vh;
  display: flex;
  flex-direction: column;
}
.tree-title {
  margin: 0 0 10px;
  font-size: 16px;
}
.filter-input {
  margin-bottom: 10px;
}
.el-tree {
  flex-grow: 1;
  overflow-y: auto;
}
.el-tree::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.el-tree::-webkit-scrollbar-thumb {
  background-color: #ddd;
  border-radius: 3px;
}
</style>
