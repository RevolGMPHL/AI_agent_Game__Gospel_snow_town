#!/usr/bin/env node
/**
 * 福音雪镇 - 模块语法 & 作用域检查
 * 
 * 用途：快速检测所有 JS 模块中的常见错误
 * 运行：node testcode/check-syntax.js
 * 
 * 检查项：
 * 1. Node.js 语法检查（node -c）
 * 2. IIFE mixin 文件中的裸方法定义（缺少 proto. 前缀）
 * 3. IIFE 中使用了 class 语法（static get/set）
 * 4. 跨 IIFE 引用未导出的变量
 * 5. typeof 检查 IIFE 内部类名（应改用 GST.XXX 检查）
 * 6. 裸全局类名直接使用（如 AIModeLogger.xxx，应改为 GST.AIModeLogger.xxx）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

// 需要语法检查的目录
const CHECK_DIRS = [SRC_DIR, DATA_DIR];

// IIFE mixin 文件列表（使用 proto = GST.XXX.prototype 模式的文件）
const MIXIN_FILES = [
    'src/npc/npc-ai.js',
    'src/npc/npc-attributes.js',
    'src/npc/npc-renderer.js',
    'src/npc/npc-schedule.js',
    'src/npc/action-effects.js',
    'src/npc/specialty.js',
    'src/ui/hud.js',
    'src/core/renderer.js',
    'src/core/input.js',
];

// 需要通过 GST 命名空间访问的变量（定义在某个 IIFE 中但被其他 IIFE 引用）
const IIFE_PRIVATE_VARS = [
    'LLM_SOURCE',
    'EXTERNAL_API_URL',
    'EXTERNAL_API_KEY',
    'EXTERNAL_MODEL',
    'API_KEY',
    'API_URL',
    'USE_OLLAMA_NATIVE',
    'AI_MODEL',
];

// ============ 工具函数 ============
let totalErrors = 0;
let totalWarnings = 0;
let totalChecks = 0;

function logError(file, line, msg) {
    console.error(`  ❌ ${file}:${line} — ${msg}`);
    totalErrors++;
}

function logWarn(file, line, msg) {
    console.warn(`  ⚠️  ${file}:${line} — ${msg}`);
    totalWarnings++;
}

function logPass(msg) {
    console.log(`  ✅ ${msg}`);
}

// ============ 检查 1: Node.js 语法检查 ============
function checkSyntax() {
    console.log('\n🔍 [检查 1] Node.js 语法检查 (node -c)');
    const jsFiles = [];

    for (const dir of CHECK_DIRS) {
        if (!fs.existsSync(dir)) continue;
        collectJsFiles(dir, jsFiles);
    }

    let passed = 0;
    let failed = 0;

    for (const file of jsFiles) {
        totalChecks++;
        const relPath = path.relative(PROJECT_ROOT, file);
        try {
            execSync(`node -c "${file}" 2>&1`, { encoding: 'utf-8' });
            passed++;
        } catch (err) {
            failed++;
            const output = err.stdout || err.stderr || err.message;
            // 提取行号
            const lineMatch = output.match(/:(\d+)/);
            const line = lineMatch ? lineMatch[1] : '?';
            const msgMatch = output.match(/SyntaxError: (.+)/);
            const msg = msgMatch ? msgMatch[1] : output.trim().split('\n')[0];
            logError(relPath, line, `语法错误: ${msg}`);
        }
    }

    console.log(`   → ${passed} 通过, ${failed} 失败 (共 ${jsFiles.length} 个文件)`);
}

// ============ 检查 2: Mixin 文件中的裸方法定义 ============
function checkMixinMethods() {
    console.log('\n🔍 [检查 2] Mixin 文件中的裸方法定义（缺少 proto. 前缀）');

    // 匹配可能的裸方法定义：
    // - async methodName(args) {
    // - methodName(args) {
    // 但排除：
    // - proto.methodName = function
    // - function methodName(
    // - if/for/while/switch 等语句
    // - const/let/var 声明
    const BARE_METHOD_REGEX = /^(\s+)(async\s+)?([a-z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{/;
    const EXCLUDE_KEYWORDS = ['function', 'if', 'for', 'while', 'switch', 'catch', 'return', 'const', 'let', 'var', 'else', 'try'];

    for (const relFile of MIXIN_FILES) {
        const file = path.join(PROJECT_ROOT, relFile);
        if (!fs.existsSync(file)) {
            logWarn(relFile, 0, '文件不存在');
            continue;
        }

        totalChecks++;
        const lines = fs.readFileSync(file, 'utf-8').split('\n');
        let found = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(BARE_METHOD_REGEX);
            if (!match) continue;

            const methodName = match[3];
            // 排除普通函数调用和控制语句
            if (EXCLUDE_KEYWORDS.includes(methodName)) continue;
            // 排除已经有 proto. 或 function 前缀的
            if (line.includes('proto.') || line.includes('function ')) continue;
            // 排除 forEach/map 等回调
            if (line.includes('=>') || line.includes('function(')) continue;

            logError(relFile, i + 1, `裸方法定义 "${methodName}()" — 应改为 "proto.${methodName} = function()"`);
            found = true;
        }

        if (!found) {
            logPass(`${relFile} — 所有方法定义格式正确`);
        }
    }
}

// ============ 检查 3: IIFE 中的 class 语法（static get/set） ============
function checkStaticInIIFE() {
    console.log('\n🔍 [检查 3] IIFE 文件中的 static get/set（不能在 IIFE mixin 中使用）');

    const STATIC_REGEX = /^\s+static\s+(get|set)\s+/;

    for (const relFile of MIXIN_FILES) {
        const file = path.join(PROJECT_ROOT, relFile);
        if (!fs.existsSync(file)) continue;

        totalChecks++;
        const lines = fs.readFileSync(file, 'utf-8').split('\n');
        let found = false;

        for (let i = 0; i < lines.length; i++) {
            if (STATIC_REGEX.test(lines[i])) {
                logError(relFile, i + 1, `static get/set 不能在 IIFE mixin 中使用，应改为构造函数上的静态属性`);
                found = true;
            }
        }

        if (!found) {
            logPass(`${relFile} — 无 static 语法问题`);
        }
    }
}

// ============ 检查 4: 跨 IIFE 引用私有变量 ============
function checkCrossIIFERefs() {
    console.log('\n🔍 [检查 4] 跨 IIFE 引用未导出变量');

    // 找到定义这些变量的文件
    const varDefinedIn = {};
    const allJsFiles = [];
    collectJsFiles(SRC_DIR, allJsFiles);

    // 先扫描变量定义位置
    for (const file of allJsFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const varName of IIFE_PRIVATE_VARS) {
            // 匹配 let/const/var 声明
            const defRegex = new RegExp(`\\b(let|const|var)\\s+${varName}\\b`);
            if (defRegex.test(content)) {
                varDefinedIn[varName] = path.relative(PROJECT_ROOT, file);
            }
        }
    }

    // 再扫描其他文件中的引用
    for (const file of allJsFiles) {
        const relPath = path.relative(PROJECT_ROOT, file);
        const lines = fs.readFileSync(file, 'utf-8').split('\n');

        for (const varName of IIFE_PRIVATE_VARS) {
            const definedFile = varDefinedIn[varName];
            if (!definedFile || relPath === definedFile) continue;

            totalChecks++;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // 跳过注释行
                if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
                // 跳过字符串中的引用（localStorage key 等）
                if (line.includes(`'${varName}'`) || line.includes(`"${varName}"`)) continue;

                // 检查裸引用（不以 GST.LLM. 或 LLM. 等前缀开头）
                const bareRef = new RegExp(`(?<!\\.)\\b${varName}\\b(?!\\s*[:=]\\s*(function|async|\\())`);
                if (bareRef.test(line)) {
                    // 排除在赋值语句左侧的声明
                    const declRegex = new RegExp(`\\b(let|const|var)\\s+${varName}\\b`);
                    if (declRegex.test(line)) continue;

                    logError(relPath, i + 1, `跨IIFE引用 "${varName}"（定义在 ${definedFile}）— 应通过 GST.LLM 访问`);
                }
            }
        }
    }
}

// ============ 检查 5: typeof 检查 IIFE 内部类名 ============
function checkTypeofIIFEClasses() {
    console.log('\n🔍 [检查 5] typeof 检查 IIFE 内部类名（应改用 GST.XXX）');

    // 只挂载到 GST 但未挂载到 window 的类名列表
    // 这些类在其他 IIFE 中用 typeof 检查永远返回 'undefined'
    const GST_ONLY_CLASSES = [
        'WeatherSystem', 'ResourceSystem', 'FurnaceSystem',
        'DeathSystem', 'TaskSystem', 'EventSystem',
        'ReincarnationSystem', 'AIModeLogger', 'DialogueManager',
    ];

    const allJsFiles = [];
    collectJsFiles(SRC_DIR, allJsFiles);

    // 先找出每个类定义在哪个文件中
    const classDefinedIn = {};
    for (const file of allJsFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const cls of GST_ONLY_CLASSES) {
            const defRegex = new RegExp(`class\\s+${cls}\\b`);
            if (defRegex.test(content)) {
                classDefinedIn[cls] = path.relative(PROJECT_ROOT, file);
            }
        }
    }

    // 扫描其他文件中的 typeof XXX !== 'undefined' 模式
    for (const file of allJsFiles) {
        const relPath = path.relative(PROJECT_ROOT, file);
        const lines = fs.readFileSync(file, 'utf-8').split('\n');

        for (const cls of GST_ONLY_CLASSES) {
            const definedFile = classDefinedIn[cls];
            if (!definedFile || relPath === definedFile) continue;

            totalChecks++;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
                
                // 匹配 typeof ClassName !== 'undefined'
                const typeofRegex = new RegExp(`typeof\\s+${cls}\\s*!==\\s*['"]undefined['"]`);
                if (typeofRegex.test(line)) {
                    logError(relPath, i + 1, `typeof ${cls} 检查无效（${cls}在IIFE中不可见）— 应改为 GST.${cls}`);
                }
            }
        }
    }
}

// ============ 检查 6: 裸全局类名直接使用（非 typeof，而是直接引用如 AIModeLogger.xxx） ============
function checkBareClassRefs() {
    console.log('\n🔍 [检查 6] 裸全局类名直接使用（应通过 GST.XXX 访问）');

    const GST_ONLY_CLASSES = [
        'WeatherSystem', 'ResourceSystem', 'FurnaceSystem',
        'DeathSystem', 'TaskSystem', 'EventSystem',
        'ReincarnationSystem', 'AIModeLogger', 'DialogueManager',
    ];

    const allJsFiles = [];
    collectJsFiles(SRC_DIR, allJsFiles);

    // 先找出每个类定义在哪个文件中
    const classDefinedIn = {};
    for (const file of allJsFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const cls of GST_ONLY_CLASSES) {
            const defRegex = new RegExp(`class\\s+${cls}\\b`);
            if (defRegex.test(content)) {
                classDefinedIn[cls] = path.relative(PROJECT_ROOT, file);
            }
        }
    }

    for (const file of allJsFiles) {
        const relPath = path.relative(PROJECT_ROOT, file);
        const lines = fs.readFileSync(file, 'utf-8').split('\n');

        for (const cls of GST_ONLY_CLASSES) {
            const definedFile = classDefinedIn[cls];
            if (!definedFile || relPath === definedFile) continue;

            totalChecks++;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
                // 跳过字符串和注释中的引用
                if (line.includes(`'${cls}'`) || line.includes(`"${cls}"`)) continue;

                // 匹配裸类名引用：ClassName.xxx 或 new ClassName(
                // 排除 GST.ClassName 和 typeof ClassName
                const bareUseRegex = new RegExp(`(?<!GST\\.)(?<!\\w)${cls}\\b\\.`);
                if (bareUseRegex.test(line)) {
                    // 排除 typeof 检查（已由检查5覆盖）
                    if (/typeof/.test(line)) continue;
                    // 排除 console.log 中的字符串
                    if (/console\.\w+\s*\(/.test(line) && line.includes(`[${cls}]`)) continue;

                    logError(relPath, i + 1, `裸引用 ${cls}.xxx（${cls}定义在 ${definedFile} 的 IIFE 中）— 应改为 GST.${cls}.xxx`);
                }
            }
        }
    }
}

// ============ 辅助：递归收集 JS 文件 ============
function collectJsFiles(dir, result) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectJsFiles(fullPath, result);
        } else if (entry.name.endsWith('.js')) {
            result.push(fullPath);
        }
    }
}

// ============ 主入口 ============
function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     福音雪镇 — 模块语法 & 作用域检查工具        ║');
    console.log('╚══════════════════════════════════════════════════╝');

    checkSyntax();
    checkMixinMethods();
    checkStaticInIIFE();
    checkCrossIIFERefs();
    checkTypeofIIFEClasses();
    checkBareClassRefs();

    console.log('\n' + '═'.repeat(50));
    console.log(`总计: ${totalChecks} 项检查`);
    console.log(`  ✅ 通过: ${totalChecks - totalErrors - totalWarnings}`);
    if (totalWarnings > 0) console.log(`  ⚠️  警告: ${totalWarnings}`);
    if (totalErrors > 0) {
        console.log(`  ❌ 错误: ${totalErrors}`);
        console.log('\n💡 提示: 请修复以上错误后再启动游戏');
        process.exit(1);
    } else {
        console.log('\n🎉 所有检查通过！');
        process.exit(0);
    }
}

main();
