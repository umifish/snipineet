import mitt, { Emitter, Handler } from 'mitt';

// 定义一个新接口，扩展 Emitter 类型并添加 once 方法。
// 这提供了类型安全，确保一旦事件被触发，once 方法绑定的处理器会被移除。
export interface EmitterWithOnce<Events extends Record<keyof Events, unknown>> extends Emitter<Events> {
  /**
   * 注册一个只执行一次的事件处理器。
   *
   * @param type 事件类型
   * @param handler 事件触发时调用的回调函数
   */
  once<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>): void;
}

/**
 * 创建一个带有 once 方法的 Emitter 实例。
 * * @returns 扩展后的 Emitter 实例
 */
export function createEmitterWithOnce<Events extends Record<keyof Events, unknown>>(): EmitterWithOnce<Events> {
  // 创建一个标准的 mitt 实例
  const emitter = mitt<Events>() as EmitterWithOnce<Events>;

  // 实现 once 方法
  emitter.once = function <Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>) {
    // 创建一个包裹原始处理器的函数
    const onceHandler: Handler<Events[Key]> = (event) => {
      // 执行原始的处理器
      handler(event);
      // 关键步骤：在处理器执行后立即将其移除
      emitter.off(type, onceHandler as Handler<Events[Key]>);
    };
    // 将这个包裹函数绑定到事件上
    emitter.on(type, onceHandler as Handler<Events[Key]>);
  };

  return emitter;
}

// --- 示例用法 ---
// 定义事件类型
type MyEvents = {
  click: { x: number; y: number };
  load: string;
};

// 创建一个扩展后的 emitter 实例
const myEmitter = createEmitterWithOnce<MyEvents>();

console.log('--- 第一次触发 click 事件 ---');
myEmitter.once('click', (data) => {
  console.log('once 处理器触发:', data);
});

myEmitter.on('click', (data) => {
  console.log('on 处理器触发:', data);
});

// 触发第一次 click 事件
myEmitter.emit('click', { x: 10, y: 20 });
// 预期输出:
// once 处理器触发: { x: 10, y: 20 }
// on 处理器触发: { x: 10, y: 20 }

console.log('\n--- 第二次触发 click 事件 ---');
// 再次触发相同的事件
myEmitter.emit('click', { x: 30, y: 40 });
// 预期输出:
// on 处理器触发: { x: 30, y: 40 }
// 注意：once 处理器已经自动移除，所以不会再次触发
