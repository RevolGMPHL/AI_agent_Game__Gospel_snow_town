# 模块测试方法论

> 福音雪镇项目的代码质量保障策略

## 核心理念

本项目使用**纯 IIFE（立即调用函数表达式）+ GST 命名空间**的模块化方案，不使用 ES Module / CommonJS。
这种架构下最常见的 bug 有三类：

| 类别 | 典型错误 | 根因 |
|------|---------|------|
| **语法错误** | `SyntaxError: Unexpected strict mode reserved word` | 在 IIFE mixin 中使用了 class 语法（`static get/set`） |
| **方法定义错误** | `SyntaxError: Unexpected identifier` | mixin 文件中方法定义缺少 `proto.xxx = function()` 前缀 |
| **作用域泄露** | `ReferenceError: xxx is not defined` | 跨 IIFE 引用了另一个 IIFE 内部的 `let/const` 变量 |
| **类名检查失效** | 子系统未实例化（静默失败） | `typeof XXXSystem !== 'undefined'` 检查 IIFE 内部类名永远返回 `'undefined'` |

## 测试工具

### `testcode/check-syntax.js` — 模块语法 & 作用域检查

**运行方式：**
```bash
node testcode/check-syntax.js
```

**检查项（5 项）：**

1. **Node.js 语法检查** — 对 `src/` 和 `data/` 下所有 `.js` 文件执行 `node -c` 静态语法检查
2. **裸方法定义检测** — 扫描所有 mixin 文件（`npc-ai.js`, `hud.js` 等），检测缺少 `proto.` 前缀的方法定义
3. **static 语法检测** — 检测 mixin 文件中非法使用 `static get/set`（只能在 class 体内使用）
4. **跨 IIFE 变量引用检测** — 检测其他 IIFE 中直接引用 `llm-client.js` 等文件的私有变量
5. **typeof 检查 IIFE 内部类名** — 检测 `typeof WeatherSystem` 等模式（应改用 `GST.XXXSystem` 检查）

**输出示例：**
```
╔══════════════════════════════════════════════════╗
║     福音雪镇 — 模块语法 & 作用域检查工具        ║
╚══════════════════════════════════════════════════╝

🔍 [检查 1] Node.js 语法检查 (node -c)
   → 48 通过, 0 失败 (共 48 个文件)

🔍 [检查 2] Mixin 文件中的裸方法定义（缺少 proto. 前缀）
  ✅ src/npc/npc-ai.js — 所有方法定义格式正确
  ...

🎉 所有检查通过！
```

## 编码规范速查

### Mixin 文件中的方法定义

```javascript
// ❌ 错误：裸方法定义（类语法，在 IIFE 中不合法）
async _actionDecision(game) { ... }
_checkEatingArrival(dt, game) { ... }

// ✅ 正确：通过 proto 挂载
proto._actionDecision = async function(game) { ... }
proto._checkEatingArrival = function(dt, game) { ... }
```

### 静态属性

```javascript
// ❌ 错误：static get/set 在 IIFE 中不合法
static get ACTION_TARGETS() { return {...}; }

// ✅ 正确：直接挂载到构造函数
GST.NPC.ACTION_TARGETS = { ... };
```

### 子系统实例化检查

```javascript
// ❌ 错误：typeof 检查 IIFE 内部类名（永远为 'undefined'）
this.weatherSystem = (typeof WeatherSystem !== 'undefined') ? new GST.WeatherSystem(this) : null;

// ✅ 正确：直接检查 GST 命名空间
this.weatherSystem = GST.WeatherSystem ? new GST.WeatherSystem(this) : null;
```

### 跨 IIFE 变量访问

```javascript
// ❌ 错误：直接引用另一个 IIFE 中的私有变量
if (LLM_SOURCE === 'external') { ... }
AI_MODEL = targetModel;

// ✅ 正确：通过 GST.LLM 代理访问
const LLM = GST.LLM;
if (LLM.source === 'external') { ... }
LLM.model = targetModel;
```

### IIFE 内函数导出

```javascript
// ❌ 错误：函数定义在 IIFE 中但未导出
(function() {
    function getDifficultyList() { ... }
})();  // 外部无法访问 getDifficultyList

// ✅ 正确：挂载到 GST 命名空间
(function() {
    function getDifficultyList() { ... }
    GST.getDifficultyList = getDifficultyList;
})();
```

## 工作流

```
修改代码 → node testcode/check-syntax.js → 修复报错 → 浏览器刷新验证
```

**建议**：每次修改 JS 文件后，先跑一遍检查脚本再刷浏览器，可避免 90% 的启动失败问题。
