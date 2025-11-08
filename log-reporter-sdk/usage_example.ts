/**
 * usage_example.ts
 * 演示如何在主应用和微前端/Iframe 场景中正确使用 LogReporterSDK。
 */

// 导入 SDK 核心功能和类型
import LogReporterSDK, {
  LogBuilder,
  LogReporter,
  getTopMountedReporterInstance,
  destroyLogReporterInstance,
} from "log-reporter-sdk";

// =================================================================
// 场景 1：主应用（Host Application）初始化
// =================================================================

console.log("--- 场景 1: 主应用初始化 ---");

// 主应用初始化时，通常会配置所有全局信息，并设置 mountToTop: true
// 确保实例挂载到 window.LogReporterSDK，供子应用获取
const hostReporter = LogReporterSDK(
  {
    context: {
      userId: "HOST_USER_8888",
      env: "production",
    },
    options: {
      interval: 10000, // 每 10 秒上报一次
      ntpUrl: "https://your-api.com/ntp/time",
      disabled: false,
    },
  },
  true
); // **设置为 true，将实例挂载到 window[GLOBAL_KEY]**

hostReporter.info("主应用启动成功。", { loadTime: 350 });

// 动态更新上下文
hostReporter.setContext("themeMode", "dark");

console.log(`主应用实例已创建，并挂载到 window['LogReporterSDK']。`);

// =================================================================
// 场景 2：使用 LogBuilder 构造复杂日志
// =================================================================

console.log("\n--- 场景 2: 使用 LogBuilder 链式构造 ---");

// 1. 使用静态工厂方法创建 LogBuilder 实例
const checkoutLog = LogBuilder.info("checkout_flow")

  // 2. 设置核心 Payload
  .setPayload({
    step: 3,
    itemCount: 2,
    totalAmount: 129.99,
  })

  // 3. 设置场景信息
  .setScene({
    source: "component-button",
    component: "CheckoutWidget",
    eventType: "NEXT_STEP",
  })

  // 4. 设置临时上下文（本次日志的 userId 将覆盖全局的 HOST_USER_8888）
  .setContext({
    userId: "ORDER_TEMP_123",
    promotionCode: "SAVE10",
  });

// 5. 上报 LogBuilder 实例 (立即发送)
hostReporter.reportObject(checkoutLog, true);

// =================================================================
// 场景 3：微前端/Iframe 子应用获取和使用单例
// =================================================================

console.log("\n--- 场景 3: 子应用集成 (模拟 Iframe 或 Micro-Frontend) ---");

function initSubApplication() {
  // **核心逻辑：使用 getLogReporterInstance 函数**
  // 此函数会：
  // 1. 尝试通过 getTopMountedReporterInstance() 获取主应用挂载的实例。
  // 2. 如果获取成功，返回主应用实例。
  // 3. 如果获取失败，创建或返回本地单例。
  const subAppReporter = LogReporterSDK({
    // 传入的配置只在创建本地单例时生效，如果获取到父级实例，配置会被忽略。
    context: { subAppId: "local-fallback-app" },
  });

  if (subAppReporter === hostReporter) {
    console.log("子应用：成功获取并共享主应用的 LogReporter 实例。");
  } else {
    console.warn("子应用：未获取到主应用实例，正在使用本地单例。");
  }

  // 子应用上报日志
  subAppReporter.info("子应用初始化完成。", {
    subApp: "UserProfile",
    version: "1.2.0",
  });

  // 子应用上报错误
  subAppReporter.error("子应用数据绑定失败。", { component: "ProfileForm" });

  // 此时，所有日志（主应用和子应用）都进入了同一个队列，由 hostReporter 的定时器统一管理和上报。
}

// 模拟子应用启动
initSubApplication();

// =================================================================
// 场景 4：手动触发和销毁
// =================================================================

setTimeout(() => {
  console.log("\n--- 场景 4: 手动触发和销毁 ---");
  hostReporter.forceFlush(); // 强制发送队列中所有日志

  // 销毁 SDK
  // destroyLogReporterInstance();
  // console.log("SDK 实例已销毁，计时器和队列已清空。");
}, 15000); // 15 秒后执行
