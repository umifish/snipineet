import { h, defineComponent } from 'vue';

export default defineComponent({
  name: 'CMSnapshot',
  props: {
    snapshot: {
      type: Object,
      default: () => ({ html: '', classes: '' })
    }
  },
  setup(props) {
    return () => {
      if (!props.snapshot?.html) {
        return h('div', { class: 'cm-snapshot-empty' }, '无预览数据');
      }

      return h('div', {
        // 关键点：应用原始的所有类名（如 .cm-editor, .cm-focused, .cm-theme-xxx）
        class: `cm-static-snapshot ${props.snapshot.classes}`,
        style: {
          position: 'relative',
          border: '1px solid #ddd',
          borderRadius: '4px',
          overflow: 'hidden',
          backgroundColor: 'inherit',
          // 确保用户只能看不能改
          pointerEvents: 'none', 
          userSelect: 'text',
          maxHeight: '500px',
          overflowY: 'auto'
        },
        // 注入导出的 DOM 结构
        innerHTML: props.snapshot.html,
        // 设置滚动高度以匹配导出时的视觉
        onVnodeMounted: (vnode) => {
            if (props.snapshot.scrollTop) {
                vnode.el.scrollTop = props.snapshot.scrollTop;
            }
        }
      });
    };
  }
});
