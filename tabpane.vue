<template>
  <div style="padding: 20px; border: 1px dashed #409eff">
    <h4>用户资料面板 (子组件 A)</h4>
    <p>ID: **{{ userId }}**</p>
    <p>默认角色: {{ defaultRole }}</p>

    <el-button type="primary" size="small" @click="notifyParent">
      模拟数据加载完成 (更新 Tab 数量)
    </el-button>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from "vue";
import { ElButton } from "element-plus";

const props = defineProps({
  userId: Number,
  defaultRole: String,
});

const emit = defineEmits(["data-updated"]);

const notifyParent = () => {
  // 模拟数据加载完成后，通知父组件将 Tab Header 数量清零
  emit("data-updated", { newCount: 0 });
};
</script>
