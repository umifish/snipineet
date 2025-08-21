import mitt, { Emitter, EventType, Handler } from 'mitt';

interface EnhancedEmitter<Events extends Record<EventType, unknown>> extends Emitter<Events> {
  ons<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>, isReplace?: boolean): void;
  once<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>): void;
}

function enhancedEmitter<Events extends Record<EventType, unknown>>(emitter: Emitter<Events>): EnhancedEmitter<Events> {
  const enhancedEmitter = emitter as EnhancedEmitter<Events>;

  const originalOn = emitter.on;

  emitter.ons = function <Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>, isReplace?: boolean) {

  };

  emitter.once = function <Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>) {
    const onceHandler: Handler<Events[Key]> = (event) => {
      handler(event);
      emitter.off(type, onceHandler as Handler<Events[Key]>);
    };

    emitter.on(type, onceHandler as Handler<Events[Key]>);
  };

  return enhancedEmitter;
}
