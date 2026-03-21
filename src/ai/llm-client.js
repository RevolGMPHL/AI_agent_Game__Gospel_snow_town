/**
 * 福音镇 - LLM API 客户端
 * callLLM / GST.parseLLMJSON / 模型配置
 * 挂载到 GST.LLM
 */
(function() {
    'use strict';
    const GST = window.GST;

// ============ LLM API 配置 ============
// LLM 来源: 'local'(本地Ollama) 或 'external'(外部API)
let LLM_SOURCE = 'local';
// --- Ollama 本地模式（免费，需先运行 ollama serve）---
let API_KEY = '';  // Ollama 不需要 API Key
let API_URL = '/ollama/v1/chat/completions';  // Ollama OpenAI 兼容接口（云端GLM-4用）
const OLLAMA_NATIVE_URL = '/ollama/api/chat';    // Ollama 原生接口（本地模型用，支持关闭think）
let USE_OLLAMA_NATIVE = true;  // 使用Ollama原生接口（解决Qwen3思考模式导致content为空的问题）
let AI_MODEL = 'qwen3.5:4b';  // 本地模型默认使用 Qwen3.5-4B（启动界面可切换）
// --- 外部API配置（由开始界面动态设置） ---
let EXTERNAL_API_URL = '';   // 外部API地址
let EXTERNAL_API_KEY = '';   // 外部API Key
let EXTERNAL_MODEL = '';     // 外部模型名称

// 【全局API状态跟踪】
const LLM_STATUS = {
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    lastError: null,
    lastErrorTime: null,
    consecutiveFails: 0,  // 连续失败次数
    lastSuccessTime: null,
    isDown: false,         // API是否疑似宕机
};

// 【LLM请求串行化队列】Ollama 本地推理同一时间只能处理一个请求
// 多个NPC同时想聊天时，排队依次处理，避免并发导致超时失败
let _llmQueuePromise = Promise.resolve();

async function callLLM(systemPrompt, userPrompt, maxTokens = 500) {
    // 将请求排入队列，确保串行执行
    const result = await new Promise((resolve) => {
        _llmQueuePromise = _llmQueuePromise.then(async () => {
            const r = await _callLLMInternal(systemPrompt, userPrompt, maxTokens);
            resolve(r);
        }).catch((err) => {
            console.error('[LLM Queue] 队列异常:', err);
            resolve(null);
        });
    });
    return result;
}

/**
 * 直接调用LLM（绕过串行队列）
 * 供讨论系统等高优先级场景使用——游戏暂停时NPC AI不再产生新请求，
 * 但已排入队列的请求会堵塞讨论系统。用这个函数可以立即发送请求。
 */
async function callLLMDirect(systemPrompt, userPrompt, maxTokens = 500) {
    return await _callLLMInternal(systemPrompt, userPrompt, maxTokens);
}

async function _callLLMInternal(systemPrompt, userPrompt, maxTokens = 500) {
    // 【保护】如果连续失败超过10次，暂停60秒避免无意义请求
    if (LLM_STATUS.consecutiveFails >= 10) {
        const elapsed = Date.now() - (LLM_STATUS.lastErrorTime || 0);
        if (elapsed < 60000) {
            console.warn(`[LLM] API连续失败${LLM_STATUS.consecutiveFails}次，暂停中(剩余${Math.round((60000 - elapsed) / 1000)}秒)`);
            LLM_STATUS.isDown = true;
            return null;
        }
        // 超过60秒，重置计数器，允许重试
        console.log('[LLM] 暂停结束，重新尝试API调用...');
        LLM_STATUS.consecutiveFails = 0;
        LLM_STATUS.isDown = false;
    }

    const MAX_RETRIES = 2; // 最多重试2次（共3次调用）
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        LLM_STATUS.totalCalls++;
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

            // 外部API模式：通过服务器代理转发，附带目标API信息
            if (LLM_SOURCE === 'external') {
                headers['X-External-API-URL'] = EXTERNAL_API_URL;
                headers['X-External-API-Key'] = EXTERNAL_API_KEY;
            }

            // 根据模式选择不同的URL和请求体
            let requestUrl, requestBody;
            if (USE_OLLAMA_NATIVE) {
                // Ollama 原生接口：支持 think:false 关闭思考模式
                requestUrl = OLLAMA_NATIVE_URL;
                requestBody = JSON.stringify({
                    model: AI_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    think: false,
                    stream: false,
                    options: {
                        num_predict: maxTokens,
                        temperature: 0.85
                    }
                });
            } else {
                // OpenAI 兼容接口（GLM-4等云端模型）
                requestUrl = API_URL;
                requestBody = JSON.stringify({
                    model: AI_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: maxTokens,
                    temperature: 0.85
                });
            }

            // 【关键修复】添加90秒超时（14B模型推理较慢，且Ollama串行处理请求需要排队等待）
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);
            let resp;
            try {
                resp = await fetch(requestUrl, {
                    method: 'POST',
                    headers,
                    body: requestBody,
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeoutId);
            }

            // 检查HTTP状态码
            if (!resp.ok) {
                const errorText = await resp.text().catch(() => '无法读取响应体');
                const errMsg = `HTTP ${resp.status} ${resp.statusText}: ${errorText.substring(0, 200)}`;
                console.error(`[LLM] API HTTP错误(第${attempt + 1}次): ${errMsg}`);
                LLM_STATUS.lastError = errMsg;
                LLM_STATUS.lastErrorTime = Date.now();
                LLM_STATUS.failedCalls++;
                LLM_STATUS.consecutiveFails++;
                // 429 Too Many Requests → 等待后重试
                if (resp.status === 429 && attempt < MAX_RETRIES) {
                    const waitMs = (attempt + 1) * 2000;
                    console.warn(`[LLM] 速率限制，等待${waitMs}ms后重试...`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }
                // 其他错误也重试
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                return null;
            }

            const data = await resp.json();

            // 统一提取content：兼容Ollama原生格式和OpenAI格式
            let content = null;
            if (USE_OLLAMA_NATIVE && data.message) {
                // Ollama 原生格式: { message: { role, content } }
                content = data.message.content;
            } else if (data.choices && data.choices[0] && data.choices[0].message) {
                // OpenAI 兼容格式: { choices: [{ message: { content } }] }
                content = data.choices[0].message.content;
                // 【Qwen3兼容】如果content为空但reasoning有内容，记录warning
                if ((!content || !content.trim()) && data.choices[0].message.reasoning) {
                    console.warn(`[LLM] content为空但reasoning有内容(第${attempt + 1}次)，建议开启USE_OLLAMA_NATIVE模式`);
                }
            }

            if (content && content.trim()) {
                // 【Qwen3兼容】清理 <think>...</think> 思考标签，只保留实际回复
                content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                if (!content) {
                    console.warn(`[LLM] 清理think标签后content为空(第${attempt + 1}次)`);
                    // 继续重试
                } else {
                    LLM_STATUS.successCalls++;
                    LLM_STATUS.consecutiveFails = 0;
                    LLM_STATUS.lastSuccessTime = Date.now();
                    LLM_STATUS.isDown = false;
                    return content;
                }
            }

            if (data.error) {
                // API返回了错误对象
                const errMsg = `API Error: ${data.error.message || data.error.code || JSON.stringify(data.error).substring(0, 200)}`;
                console.error(`[LLM] ${errMsg}`);
                LLM_STATUS.lastError = errMsg;
                LLM_STATUS.lastErrorTime = Date.now();
                LLM_STATUS.failedCalls++;
                LLM_STATUS.consecutiveFails++;
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1500));
                    continue;
                }
                return null;
            } else {
                console.warn(`[LLM] API返回异常格式(第${attempt + 1}次):`, JSON.stringify(data).substring(0, 300));
            }

            LLM_STATUS.failedCalls++;
            LLM_STATUS.consecutiveFails++;
            LLM_STATUS.lastError = '返回格式异常或content为空';
            LLM_STATUS.lastErrorTime = Date.now();

            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            return null;

        } catch (err) {
            LLM_STATUS.failedCalls++;
            LLM_STATUS.consecutiveFails++;
            LLM_STATUS.lastError = err.message || String(err);
            LLM_STATUS.lastErrorTime = Date.now();
            console.error(`[LLM] 调用异常(第${attempt + 1}次):`, err);
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            return null;
        }
    }
    return null;
}

function parseLLMJSON(text) {
    if (!text) return null;
    try {
        let s = text.replace(/```json|```/g, '').trim();
        const m = s.match(/\{[\s\S]*\}/);
        if (m) s = m[0];
        return JSON.parse(s);
    } catch (e) {
        // 【14B兼容】尝试修复被token截断的不完整JSON
        try {
            let s = text.replace(/```json|```/g, '').trim();
            // 提取从第一个 { 开始的内容
            const idx = s.indexOf('{');
            if (idx >= 0) {
                s = s.substring(idx);
                // 移除末尾不完整的value（可能在字符串中间被截断）
                // 先尝试补全：去掉最后一个不完整的key-value对，然后闭合
                // 策略1: 如果最后一个完整的引号对之后有未闭合的内容，截断到最后一个完整的value
                const lastCompleteComma = s.lastIndexOf('",');
                const lastCompleteQuote = s.lastIndexOf('"');
                if (lastCompleteComma > 0) {
                    // 截断到最后一个 ", 然后闭合
                    const truncated = s.substring(0, lastCompleteComma + 1) + '}';
                    const result = JSON.parse(truncated);
                    console.log('[GST.parseLLMJSON] 修复截断JSON成功(策略1-截断到最后完整值)');
                    return result;
                }
            }
        } catch (e2) {
            // 策略2: 更激进的修复——逐步去掉末尾字符直到能解析
            try {
                let s = text.replace(/```json|```/g, '').trim();
                const idx = s.indexOf('{');
                if (idx >= 0) {
                    s = s.substring(idx);
                    // 补全所有未闭合的引号和大括号
                    let fixed = s;
                    // 统计未闭合的引号
                    const quoteCount = (fixed.match(/"/g) || []).length;
                    if (quoteCount % 2 !== 0) fixed += '"';
                    // 确保以 } 结尾
                    if (!fixed.trimEnd().endsWith('}')) fixed += '}';
                    const result = JSON.parse(fixed);
                    console.log('[GST.parseLLMJSON] 修复截断JSON成功(策略2-补全引号和括号)');
                    return result;
                }
            } catch (e3) {
                // 所有修复尝试都失败了
            }
        }
        console.warn('JSON 解析失败(含修复尝试):', e.message, text?.substring(0, 200));
        return null;
    }
}




    // 导出到 GST
    GST.callLLM = callLLM;
    GST.callLLMDirect = callLLMDirect;  // 绕过队列的直接调用（讨论系统用）
    GST.parseLLMJSON = parseLLMJSON;
    GST.LLM_STATUS = LLM_STATUS;
    GST.LLM = {
        get source() { return LLM_SOURCE; },
        set source(v) { LLM_SOURCE = v; },
        get apiKey() { return API_KEY; },
        set apiKey(v) { API_KEY = v; },
        get apiUrl() { return API_URL; },
        set apiUrl(v) { API_URL = v; },
        get model() { return AI_MODEL; },
        set model(v) { AI_MODEL = v; },
        get useOllamaNative() { return USE_OLLAMA_NATIVE; },
        set useOllamaNative(v) { USE_OLLAMA_NATIVE = v; },
        get externalUrl() { return EXTERNAL_API_URL; },
        set externalUrl(v) { EXTERNAL_API_URL = v; },
        get externalKey() { return EXTERNAL_API_KEY; },
        set externalKey(v) { EXTERNAL_API_KEY = v; },
        get externalModel() { return EXTERNAL_MODEL; },
        set externalModel(v) { EXTERNAL_MODEL = v; },
        OLLAMA_NATIVE_URL: OLLAMA_NATIVE_URL,
    };
})();
