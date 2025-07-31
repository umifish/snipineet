import mitt, { Emitter, Handler } from 'mitt';

// 1. 定义事件类型，用于类型安全
type MyEvents = {
  foo: string;
  bar: number;
};

// 2. 扩展 Emitter 类型，添加 once 方法签名
interface EmitterWithOnce<Events extends Record<keyof Events, unknown>> extends Emitter<Events> {
  once<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>): void;
}

// 3. 创建一个标准的 mitt 实例，并使用类型断言
// 这样 TypeScript 就可以识别我们稍后会添加的 once 方法
const myEmitter = mitt<MyEvents>() as EmitterWithOnce<MyEvents>;

// 4. 直接在 myEmitter 实例上添加 once 方法
myEmitter.once = function <Key extends keyof MyEvents>(type: Key, handler: Handler<MyEvents[Key]>) {
  // 创建一个一次性调用的包装函数
  const onceHandler: Handler<MyEvents[Key]> = (event) => {
    // 调用原始的事件处理器
    handler(event);
    // 关键步骤：在调用后，立即移除这个一次性的处理器
    myEmitter.off(type, onceHandler as Handler<MyEvents[Key]>);
  };
  // 将包装函数绑定到事件上
  myEmitter.on(type, onceHandler as Handler<MyEvents[Key]>);
};

// --- 示例用法 ---
console.log('--- 第一次触发 foo 事件 ---');
myEmitter.once('foo', (data) => {
  console.log('once 处理器触发:', data);
});

myEmitter.on('foo', (data) => {
  console.log('on 处理器触发:', data);
});

myEmitter.emit('foo', '第一次数据');

console.log('\n--- 第二次触发 foo 事件 ---');
myEmitter.emit('foo', '第二次数据');

console.log('\n--- 触发 bar 事件 ---');
myEmitter.once('bar', (data) => {
  console.log('once 处理器 for bar 触发:', data);
});
myEmitter.emit('bar', 123);
myEmitter.emit('bar', 456);
