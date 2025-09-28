npm install -D vite-plugin-svg-icons

---

## 3. 全局注册与使用

### 3.1 引入和全局注册

需要在入口文件 (`main.js/ts`) 中引入插件生成的注册文件，并注册组件。

```javascript
// src/main.js 或 src/main.ts
import { createApp } from "vue";
import App from "./App.vue";

// 引入 SVG 插件生成的注册文件，它负责将 SVG Sprite 注入 DOM
import "virtual:svg-icons-register";

// 引入 SvgIcon 组件
import SvgIcon from "./components/SvgIcon.vue";

const app = createApp(App);

// 全局注册组件，名称为 'SvgIcon'
app.component("SvgIcon", SvgIcon);

app.mount("#app");
```

npm install -D vite-svg-loader
