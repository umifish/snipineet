<template>
  <SplitPane>
    <template #left>
      <div>左侧内容</div>
    </template>
    <template #right>
      <div>右侧内容</div>
    </template>
  </SplitPane>
</template>

<script>
import SplitPane from './components/SplitPane.vue';

export default {
  components: {
    SplitPane,
  },
};
</script>
