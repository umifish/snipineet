/**
 * 重新实现一个类似 mitt 的事件发射器，支持在注册时控制是否允许重复。
 */
import type { Emitter, EventType, Handler, WildcardHandler } from 'mitt';

// 定义一个增强版的 Emitter 接口，on 方法增加了一个可选参数
interface EnhancedEmitter<Events extends Record<EventType, unknown>> extends Emitter<Events> {
  on<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>, allowMultiple?: boolean): void;
}

/**
 * 这是一个工厂函数，用于创建一个具有增强 on 方法的事件发射器实例。
 * @returns 具有增强 on 方法的 Emitter 实例。
 */
export function createEnhancedEmitter<Events extends Record<EventType, unknown>>(): EnhancedEmitter<Events> {
  const all = new Map<EventType, Handler<any>[]>();

  return {
    // 增强的 on 方法
    on<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>, allowMultiple: boolean = true): void {
      const handlers = all.get(type);

      if (handlers) {
        // 如果不允许重复，则先检查处理器是否已存在
        if (!allowMultiple && handlers.includes(handler as Handler<Events[Key]>)) {
          // 如果已存在，则不进行任何操作
          console.warn(`处理器已注册，因为 allowMultiple 为 false，跳过注册.`);
          return;
        }
        // 如果允许重复或者处理器不存在，则添加
        handlers.push(handler as Handler<Events[Key]>);
      } else {
        // 如果是新的事件类型，则创建数组并添加处理器
        all.set(type, [handler as Handler<Events[Key]>]);
      }
    },

    // off 方法与 mitt 原始实现相同
    off<Key extends keyof Events>(type: Key, handler?: Handler<Events[Key]>) {
      const handlers = all.get(type);
      if (handlers) {
        if (handler) {
          handlers.splice(handlers.indexOf(handler) >>> 0, 1);
        } else {
          all.set(type, []);
        }
      }
    },

    // emit 方法与 mitt 原始实现相同
    emit<Key extends keyof Events>(type: Key, evt: Events[Key]) {
      let handlers = all.get(type);
      if (handlers) {
        (handlers as Handler<Events[Key]>[])
          .slice()
          .map((handler) => handler(evt));
      }
      handlers = all.get('*');
      if (handlers) {
        (handlers as WildcardHandler<Events>[])
          .slice()
          .map((handler) => handler(type, evt));
      }
    },

    // all 属性与 mitt 原始实现相同
    all,
  };
}


// --- 示例用法 ---
// 创建一个增强版的 emitter 实例
type MyEvents = {
  log: string;
  count: number;
};

const myEmitter = createEnhancedEmitter<MyEvents>();

console.log('--- 注册处理器，并测试不允许重复的情况 ---');
const myHandler1 = (message: string) => console.log('处理器 1 触发:', message);
const myHandler2 = (message: string) => console.log('处理器 2 触发:', message);

// 第一次注册处理器 1，默认 allowMultiple 为 true
myEmitter.on('log', myHandler1);
console.log('第一次注册 myHandler1...');

// 第二次注册处理器 1，明确指定 allowMultiple 为 false
// 此时处理器不会被再次添加
myEmitter.on('log', myHandler1, false);
console.log('第二次注册 myHandler1，但指定不允许重复...');

// 注册处理器 2，确保其能被添加
myEmitter.on('log', myHandler2);
console.log('注册 myHandler2...');

// 触发事件
console.log('\n--- 触发 "log" 事件 ---');
myEmitter.emit('log', '测试数据');
// 预期输出:
// 处理器 1 触发: 测试数据
// 处理器 2 触发: 测试数据
// myHandler1 只被添加了一次，所以只会触发一次。

console.log('\n--- 注册处理器，并测试允许重复的情况 ---');
const myHandler3 = (num: number) => console.log('处理器 3 触发:', num);

// 两次注册 myHandler3，因为默认 allowMultiple 为 true，所以都会被添加
myEmitter.on('count', myHandler3);
myEmitter.on('count', myHandler3);
console.log('两次注册 myHandler3...');

// 触发事件
console.log('\n--- 触发 "count" 事件 ---');
myEmitter.emit('count', 99);
// 预期输出:
// 处理器 3 触发: 99
// 处理器 3 触发: 99
// myHandler3 被添加了两次，所以触发了两次。
