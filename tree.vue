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
              v-model="sourceFilterText"
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
              :filter-node-method="filterSourceNode"
              @check="handleSourceTreeCheck"
            />
          </div>
        </el-col>

        <el-col :span="12">
          <div class="list-container">
            <h4 class="list-title">
              已选数据 ({{ selectedItemsFlat.length }})
            </h4>
            <el-input
              v-model="selectedFilterText"
              placeholder="筛选已选数据"
              class="filter-input"
              clearable
            />
            <el-scrollbar class="virtual-list-wrapper">
              <el-virtual-list
                :data="filteredSelectedItems"
                :item-size="36"
                style="height: 100%"
              >
                <template #default="{ item }">
                  <div class="selected-item">
                    <span class="item-label">{{ item[treeProps.label] }}</span>
                    <el-icon class="remove-icon" @click="removeItem(item)">
                      <Close />
                    </el-icon>
                  </div>
                </template>
              </el-virtual-list>
            </el-scrollbar>
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
import { ref, watch, nextTick, computed } from 'vue';
import { Close } from '@element-plus/icons-vue';

// --- Props and Emits (与之前版本相同) ---
const props = defineProps({
  visible: { type: Boolean, required: true },
  title: { type: String, default: '数据勾选' },
  sourceData: { type: Array, default: null },
  initialSelectedData: { type: Array, default: null }, // 依然接收树形结构，组件内部会处理
  treeProps: { type: Object, default: () => ({ label: 'label', children: 'children' }) },
  loadSourceApi: { type: Function, default: null },
  loadSelectedApi: { type: Function, default: null },
  onConfirm: { type: Function, required: true },
});
const emit = defineEmits(['update:visible']);


// --- 内部状态 ---
const loading = ref(false);
const confirmLoading = ref(false);
const sourceTreeRef = ref(null);

const sourceDataState = ref([]);
const sourceFilterText = ref('');
const selectedFilterText = ref(''); // [新增] 右侧列表的筛选文本

// [变更] selectedDataState 变为 selectedItemsFlat，存储扁平化后的已选节点数组
const selectedItemsFlat = ref([]);

// --- 核心逻辑 ---

// [新增] 计算属性，用于前端筛选右侧列表
const filteredSelectedItems = computed(() => {
  const filter = selectedFilterText.value.trim().toLowerCase();
  if (!filter) {
    return selectedItemsFlat.value;
  }
  return selectedItemsFlat.value.filter(item =>
    item[props.treeProps.label].toLowerCase().includes(filter)
  );
});

/**
 * @description [新增] 移除右侧列表中的一项
 * @param {object} itemToRemove - 要移除的节点对象
 */
const removeItem = (itemToRemove) => {
  // 1. 从右侧扁平列表中移除
  selectedItemsFlat.value = selectedItemsFlat.value.filter(item => item.id !== itemToRemove.id);
  // 2. 同步更新左侧树的勾选状态
  if (sourceTreeRef.value) {
    sourceTreeRef.value.setChecked(itemToRemove.id, false, false); // 第二个参数false表示不递归
  }
};

/**
 * @description [逻辑变更] 当左侧树的勾选状态变化时
 */
const handleSourceTreeCheck = () => {
  if (!sourceTreeRef.value) return;
  // getCheckedNodes(false, false) 只返回被勾选的节点，不包含半选状态的父节点
  // 这正是扁平化列表所需要的数据
  selectedItemsFlat.value = sourceTreeRef.value.getCheckedNodes(false, false);
};

// [新增] 辅助函数：将树形结构扁平化
const flattenTree = (treeData) => {
  const flatList = [];
  const traverse = (nodes) => {
    if (!nodes || nodes.length === 0) return;
    for (const node of nodes) {
      flatList.push(node);
      if (node[props.treeProps.children]) {
        traverse(node[props.treeProps.children]);
      }
    }
  };
  traverse(treeData);
  return flatList;
};

// [逻辑变更] 初始化数据
const initializeData = async () => {
  loading.value = true;
  try {
    // 加载源数据 (逻辑不变)
    sourceDataState.value = props.sourceData || (await props.loadSourceApi?.()) || [];
    
    // 加载已选数据并扁平化
    const selectedTreeData = props.initialSelectedData || (await props.loadSelectedApi?.()) || [];
    selectedItemsFlat.value = flattenTree(selectedTreeData);

    await nextTick();
    syncCheckState();
  } catch (error) {
    console.error('Failed to load tree data:', error);
  } finally {
    loading.value = false;
  }
};

// [逻辑变更] 同步勾选状态
const syncCheckState = () => {
    if (!sourceTreeRef.value) return;
    // 从扁平列表中提取 ID
    const selectedIds = selectedItemsFlat.value.map(item => item.id);
    sourceTreeRef.value.setCheckedKeys(selectedIds, false);
};

// [逻辑变更] 确认按钮点击事件
const handleConfirm = async () => {
  const selectedIds = selectedItemsFlat.value.map(item => item.id);
  const selectedNodes = selectedItemsFlat.value; // 直接使用扁平列表

  confirmLoading.value = true;
  try {
    await props.onConfirm(selectedIds, selectedNodes);
    emit('update:visible', false);
  } catch (error) {
    console.error('Error during confirm action:', error);
  } finally {
    confirmLoading.value = false;
  }
};

// --- 其他函数 (基本不变) ---
const handleCancel = () => { emit('update:visible', false); };
const filterSourceNode = (value, data) => !value || data[props.treeProps.label].includes(value);

watch(sourceFilterText, (val) => { sourceTreeRef.value.filter(val); });
watch(() => props.visible, (newVal) => {
  if (newVal) {
    initializeData();
  } else {
    // 清理状态
    sourceDataState.value = [];
    selectedItemsFlat.value = [];
    sourceFilterText.value = '';
    selectedFilterText.value = '';
  }
});
</script>

<style scoped>
.dialog-content { min-height: 60vh; }
.tree-container, .list-container {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 15px;
  height: 60vh;
  display: flex;
  flex-direction: column;
}
.tree-title, .list-title {
  margin: 0 0 10px;
  font-size: 16px;
}
.filter-input { margin-bottom: 10px; }
.el-tree { flex-grow: 1; overflow-y: auto; }
.el-tree::-webkit-scrollbar { width: 6px; height: 6px; }
.el-tree::-webkit-scrollbar-thumb { background-color: #ddd; border-radius: 3px; }

/* [新增] 虚拟列表样式 */
.virtual-list-wrapper {
  flex-grow: 1;
}
.selected-item {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
}
.item-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
}
.remove-icon {
  cursor: pointer;
  color: #909399;
  margin-left: 10px;
  flex-shrink: 0;
}
.remove-icon:hover {
  color: #f56c6c;
}
</style>