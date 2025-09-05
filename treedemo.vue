<template>
  <div class="parent-container">
    <h2>最终版组件使用示例</h2>
    <el-button type="danger" @click="openDialog">打开数据选择对话框</el-button>
    <div class="result-display">
      <p>当前保存的权限ID: {{ savedPermissionIds.join(", ") || "暂无" }}</p>
    </div>

    <TreeSelectionDialog
      v-if="dialogVisible"
      v-model:visible="dialogVisible"
      title="为角色'管理员'分配权限"
      :load-source-api="fetchSourcePermissions"
      :load-selected-api="fetchSelectedPermissions"
      :on-confirm="handleSavePermissions"
    />
  </div>
</template>

<script setup>
import { ref } from "vue";
import { ElMessage } from "element-plus";
import TreeSelectionDialog from "./components/TreeSelectionDialog.vue"; // 确保路径正确

const dialogVisible = ref(false);

// 存储最终保存到后端的数据
const savedPermissionIds = ref(["user_delete"]);

// --- 模拟 API ---
const fetchSourcePermissions = () =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve([
          {
            id: "user_manage",
            label: "用户管理",
            children: [
              { id: "user_add", label: "新增用户" },
              { id: "user_delete", label: "删除用户" },
            ],
          },
          {
            id: "role_manage",
            label: "角色管理",
            children: [{ id: "role_assign", label: "分配角色" }],
          },
        ]),
      500
    )
  );

const fetchSelectedPermissions = () =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve([
          {
            id: "user_manage",
            label: "用户管理",
            children: [{ id: "user_delete", label: "删除用户" }],
          },
        ]),
      300
    )
  );

/**
 * [关键] 保存权限的函数
 * @param {Array} ids - 最终选中的节点ID
 * @param {Array} nodes - 最终选中的节点完整对象
 * @returns {Promise} - 必须返回一个 Promise
 */
const handleSavePermissions = (ids, nodes) => {
  console.log("准备提交的数据:", { ids, nodes });

  // 返回一个 Promise 来模拟 API 调用
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // 模拟50%的概率失败
      if (Math.random() > 0.5) {
        console.log("API: 保存成功!");
        savedPermissionIds.value = ids; // 更新父组件的数据
        ElMessage.success("权限保存成功！");
        resolve(); // 调用 resolve() 表示成功, 对话框会关闭
      } else {
        console.error("API: 保存失败!");
        ElMessage.error("网络错误，保存失败，请重试！");
        reject(new Error("Failed to save")); // 调用 reject() 表示失败, 对话框不会关闭
      }
    }, 1500); // 模拟1.5秒的保存延迟
  });
};

const openDialog = () => {
  dialogVisible.value = true;
};
</script>

<style scoped>
/* 样式与之前版本相同 */
.parent-container {
  padding: 20px;
}
.result-display {
  margin-top: 15px;
  padding: 10px;
  background-color: #f5f7fa;
  border-radius: 4px;
}
</style>
