import mitt, { Emitter, EventType, Handler } from 'mitt';

/**
 * 定义一个增强版的 Emitter 接口。
 * 它继承了原始的 Emitter，并重写了 on 方法的签名，增加了一个可选的 allowMultiple 参数。
 */
interface EmitterWithEnhancedOn<Events extends Record<EventType, unknown>> extends Emitter<Events> {
  on<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>, allowMultiple?: boolean): void;
}

/**
 * 这是一个工厂函数，用于增强一个现有的 mitt 实例。
 * 它会修改实例的 `on` 方法，使其支持控制重复注册。
 *
 * @param emitter 传入一个标准的 mitt 实例。
 * @returns 返回被增强后的同一个 mitt 实例。
 */
function enhanceMitt<Events extends Record<EventType, unknown>>(emitter: Emitter<Events>): EmitterWithEnhancedOn<Events> {
  // 将传入的 mitt 实例类型断言为我们增强后的类型，
  // 这样 TypeScript 就能识别新增的参数。
  const enhancedEmitter = emitter as EmitterWithEnhancedOn<Events>;

  // 保存原始的 on 方法，以便在需要时调用。
  const originalOn = enhancedEmitter.on;

  // 覆盖 mitt 实例上的 on 方法，实现新的逻辑。
  enhancedEmitter.on = function <Key extends keyof Events>(
    type: Key,
    handler: Handler<Events[Key]>,
    allowMultiple: boolean = true
  ): void {
    // 如果设置了不允许重复注册
    if (!allowMultiple) {
      // 访问 mitt 内部的 all Map，检查处理器是否已经存在。
      const handlers = enhancedEmitter.all.get(type);
      if (handlers && handlers.includes(handler)) {
        console.warn(`处理器已注册，因为 allowMultiple 为 false，跳过注册.`);
        return;
      }
    }

    // 如果 allowMultiple 为 true，或者处理器不存在，则调用原始的 on 方法进行注册。
    // 这样就保留了 mitt 原始的注册逻辑。
    originalOn(type, handler);
  };

  return enhancedEmitter;
}

// --- 示例用法 ---

// 1. 创建一个标准的 mitt 实例
type MyEvents = {
  log: string;
  count: number;
};
const myEmitter = mitt<MyEvents>();

// 2. 使用 enhanceMitt 函数增强这个实例
const enhancedEmitter = enhanceMitt(myEmitter);


console.log('--- 注册处理器，并测试不允许重复的情况 ---');
const myHandler1 = (message: string) => console.log('处理器 1 触发:', message);
const myHandler2 = (message: string) => console.log('处理器 2 触发:', message);

// 第一次注册处理器 1，默认 allowMultiple 为 true
enhancedEmitter.on('log', myHandler1);
console.log('第一次注册 myHandler1...');

// 第二次注册处理器 1，明确指定 allowMultiple 为 false
// 此时处理器不会被再次添加
enhancedEmitter.on('log', myHandler1, false);
console.log('第二次注册 myHandler1，但指定不允许重复...');

// 注册处理器 2，确保其能被添加
enhancedEmitter.on('log', myHandler2);
console.log('注册 myHandler2...');

// 触发事件
console.log('\n--- 触发 "log" 事件 ---');
enhancedEmitter.emit('log', '测试数据');
// 预期输出:
// 处理器 1 触发: 测试数据
// 处理器 2 触发: 测试数据
// myHandler1 只被添加了一次，所以只会触发一次。

console.log('\n--- 注册处理器，并测试允许重复的情况 ---');
const myHandler3 = (num: number) => console.log('处理器 3 触发:', num);

// 两次注册 myHandler3，因为默认 allowMultiple 为 true，所以都会被添加
enhancedEmitter.on('count', myHandler3);
enhancedEmitter.on('count', myHandler3);
console.log('两次注册 myHandler3...');

// 触发事件
console.log('\n--- 触发 "count" 事件 ---');
enhancedEmitter.emit('count', 99);
// 预期输出:
// 处理器 3 触发: 99
// 处理器 3 触发: 99
// myHandler3 被添加了两次，所以触发了两次。
