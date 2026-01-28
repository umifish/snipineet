npm install @babel/parser @babel/traverse @vue/compiler-sfc magic-string glob fs-extra

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const MagicString = require('magic-string');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { parse: parseSFC } = require('@vue/compiler-sfc');

// --- 配置区 ---
const CONFIG = {
  entry: 'src/**/*.{vue,js,ts}', 
  output: './src/locales/zh-CN.json',
  srcPath: path.resolve(__dirname, 'src'),
};

const CHINESE_REGEXP = /[\u4e00-\u9fa5]/;
let locales = {};

/**
 * 生成语义化 Key: a文件夹.b文件.c标题(中文前四位)
 */
function generateKey(filePath, text) {
  const relativePath = path.relative(CONFIG.srcPath, filePath);
  const pathPrefix = relativePath
    .replace(/\.(vue|js|ts)$/, '')
    .replace(/[\\/]/g, '.');
  
  // 提取中文前4位作为“标题”描述，过滤非字母数字字符
  const description = text
    .replace(/[^\u4e00-\u9fa5]/g, '')
    .slice(0, 4);
    
  return `${pathPrefix}.${description}`;
}

/**
 * 处理 JS/TS 代码逻辑 (Script)
 */
function processScript(code, s, filePath, offset = 0) {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'decorators-legacy'],
  });

  let hasI18nUsage = false;

  traverse(ast, {
    // 1. 处理普通字符串
    StringLiteral(pathNode) {
      const { value, start, end } = pathNode.node;
      if (CHINESE_REGEXP.test(value) && !pathNode.parentPath.isImportDeclaration()) {
        const key = generateKey(filePath, value);
        locales[key] = value;
        s.overwrite(start + offset, end + offset, `t('${key}')`);
        hasI18nUsage = true;
      }
    },
    // 2. 处理模板字符串 (带参数) `你好 ${name}`
    TemplateLiteral(pathNode) {
      const { quasis, expressions, start, end } = pathNode.node;
      const rawFull = quasis.map(q => q.value.raw).join('{arg}');
      if (CHINESE_REGEXP.test(rawFull)) {
        let i18nFormat = '';
        const params = [];
        quasis.forEach((q, i) => {
          i18nFormat += q.value.raw;
          if (i < expressions.length) {
            const argName = `arg${i}`;
            i18nFormat += `{${argName}}`;
            params.push(`${argName}: ${s.slice(expressions[i].start + offset, expressions[i].end + offset)}`);
          }
        });
        const key = generateKey(filePath, i18nFormat);
        locales[key] = i18nFormat;
        s.overwrite(start + offset, end + offset, `t('${key}', { ${params.join(', ')} })`);
        hasI18nUsage = true;
      }
    }
  });

  return hasI18nUsage;
}

/**
 * 处理 Vue Template
 */
function processTemplate(templateContent, s, filePath, offset = 0) {
  // 1. 匹配标签间的文本: <div>中文</div>
  const textRegex = />([^<]*?[\u4e00-\u9fa5][^>]*?)</g;
  templateContent.replace(textRegex, (match, text, index) => {
    const trimmed = text.trim();
    if (trimmed) {
      const key = generateKey(filePath, trimmed);
      locales[key] = trimmed;
      const start = index + 1 + offset;
      s.overwrite(start, start + text.length, ` {{ $t('${key}') }} `);
    }
  });

  // 2. 匹配常见属性: placeholder, title, label
  const attrRegex = /\s(placeholder|title|label)="([^"]*?[\u4e00-\u9fa5][^"]*?)"/g;
  templateContent.replace(attrRegex, (match, attrName, attrValue, index) => {
    const key = generateKey(filePath, attrValue);
    locales[key] = attrValue;
    const start = index + offset;
    s.overwrite(start, start + match.length, ` :${attrName}="$t('${key}')"`);
  });
}

/**
 * 自动注入 useI18n
 */
function injectI18nImport(code, s, offset) {
  if (code.includes('useI18n')) return;
  // 在 <script setup> 的起始位置注入
  const injection = `\nimport { useI18n } from 'vue-i18n';\nconst { t } = useI18n();\n`;
  s.appendLeft(offset, injection);
}

async function run() {
  const files = glob.sync(CONFIG.entry);
  
  for (const file of files) {
    const absolutePath = path.resolve(file);
    const content = fs.readFileSync(absolutePath, 'utf8');
    const s = new MagicString(content);

    if (file.endsWith('.vue')) {
      const { descriptor } = parseSFC(content);
      
      // 处理模板
      if (descriptor.template) {
        processTemplate(descriptor.template.content, s, absolutePath, descriptor.template.loc.start.offset);
      }
      
      // 处理脚本
      const script = descriptor.scriptSetup || descriptor.script;
      if (script) {
        const hasUsage = processScript(script.content, s, absolutePath, script.loc.start.offset);
        if (hasUsage && descriptor.scriptSetup) {
          injectI18nImport(script.content, s, script.loc.start.offset);
        }
      }
    } else {
      processScript(content, s, absolutePath, 0);
    }

    fs.writeFileSync(absolutePath, s.toString());
  }

  // 写入语言文件
  fs.outputJsonSync(CONFIG.output, locales, { spaces: 2 });
  console.log(`🚀 提取与替换完成！语言包已生成至: ${CONFIG.output}`);
}

run();
