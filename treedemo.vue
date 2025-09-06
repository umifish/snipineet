<template>
  <div class="parent-container">
    <h2>虚拟滚动列表版 - 使用示例</h2>
    <el-button type="danger" @click="openDialog">打开数据选择对话框</el-button>
    <div class="result-display">
      <p>当前保存的权限ID: {{ savedPermissionIds.join(', ') || '暂无' }}</p>
    </div>

    <TreeSelectionDialog
      v-if="dialogVisible"
      v-model:visible="dialogVisible"
      title="为角色分配权限 (虚拟列表)"
      :load-source-api="fetchSourcePermissions"
      :load-selected-api="fetchSelectedPermissions"
      :on-confirm="handleSavePermissions"
    />
  </div>
</template>

<script setup>
// setup script 中的内容与上一个版本完全相同
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import TreeSelectionDialog from './components/TreeSelectionDialog.vue';

const dialogVisible = ref(false);
const savedPermissionIds = ref(['user_delete']);

// 模拟 API (不变)
const fetchSourcePermissions = () => new Promise(resolve => setTimeout(() => resolve([
  { id: 'user_manage', label: '用户管理', children: [{ id: 'user_add', label: '新增用户' }, { id: 'user_delete', label: '删除用户' }] },
  { id: 'role_manage', label: '角色管理', children: [{ id: 'role_assign', label: '分配角色' }] },
  // ...可以增加大量数据来测试虚拟滚动
]), 500));
const fetchSelectedPermissions = () => new Promise(resolve => setTimeout(() => resolve([
  { id: 'user_manage', label: '用户管理', children: [{ id: 'user_delete', label: '删除用户' }] },
]), 300));

/**
 * [注意] onConfirm 回调函数现在接收到的 'nodes' 是一个扁平数组
 */
const handleSavePermissions = (ids, nodes) => {
  console.log('提交的扁平节点数组:', nodes);
  return new Promise((resolve) => {
    setTimeout(() => {
      savedPermissionIds.value = ids;
      ElMessage.success('权限保存成功！');
      resolve();
    }, 1000);
  });
};

const openDialog = () => { dialogVisible.value = true; };
</script>

<style scoped>
/* 样式不变 */
.parent-container { padding: 20px; }
.result-display { margin-top: 15px; padding: 10px; background-color: #f5f7fa; border-radius: 4px; }
</style>