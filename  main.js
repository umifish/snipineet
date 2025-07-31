// main.js
import { createApp } from 'vue';
import App from './App.vue';
import vResizable from './directives/v-resizable';

const app = createApp(App);

app.directive('resizable', vResizable); // 注册自定义指令

app.mount('#app');
