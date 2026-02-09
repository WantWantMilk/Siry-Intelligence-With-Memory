// siry-core.js - Siry聊天室核心逻辑
// 包含完整的上下文记忆和API交互功能

// ==================== 配置区域 ====================
const SIRY_CONFIG = {
    API_KEY: 'sk-xzxelritwcuswjbfgwqtcdqsemtlnluceaurjscdkyezjpik', // 你的API密钥
    MODEL: 'THUDM/GLM-4-9B-0414',                                   // 你的模型名称
    API_URL: 'https://api.siliconflow.cn/v1/chat/completions',
    SYSTEM_PROMPT: `你是一个名叫Siry（小锐）的AI助手，名字含义是"Silly Harmony"。你兼具幽默感和敏锐的洞察力，像一个小丑一样有趣，但回答问题总是清晰、直接、明快。请全程使用中文与我的朋友进行轻松、友好的对话。`,
    MAX_HISTORY: 20 // 最大记忆轮次（10问10答）
};

// ==================== 记忆系统 ====================
class ConversationMemory {
    constructor() {
        // 从本地存储加载历史，或初始化新对话
        const saved = localStorage.getItem('siry_conversation');
        if (saved) {
            this.history = JSON.parse(saved);
            console.log('已加载历史对话:', this.history.length, '条消息');
        } else {
            this.history = [
                { role: "system", content: SIRY_CONFIG.SYSTEM_PROMPT }
            ];
        }
    }

    // 添加用户消息
    addUserMessage(content) {
        this.history.push({ role: "user", content: content });
        this.save();
    }

    // 添加AI回复
    addAssistantMessage(content) {
        this.history.push({ role: "assistant", content: content });
        this.save();
        this.trimHistory(); // 添加后检查长度
    }

    // 获取完整历史（用于API调用）
    getHistory() {
        return [...this.history]; // 返回副本
    }

    // 保存到本地存储
    save() {
        try {
            localStorage.setItem('siry_conversation', JSON.stringify(this.history));
        } catch (e) {
            console.warn('保存对话历史失败:', e);
        }
    }

    // 清理过长的历史（保留系统消息）
    trimHistory() {
        if (this.history.length > SIRY_CONFIG.MAX_HISTORY * 2) { // 乘以2因为包含问答对
            // 始终保留系统消息
            const systemMsg = this.history[0];
            // 保留最近的历史（最新的对话）
            const recent = this.history.slice(-SIRY_CONFIG.MAX_HISTORY * 2);
            this.history = [systemMsg, ...recent];
            this.save();
        }
    }

    // 清空历史（但保留系统提示）
    clear() {
        this.history = [
            { role: "system", content: SIRY_CONFIG.SYSTEM_PROMPT }
        ];
        this.save();
    }

    // 获取最近N条消息用于显示
    getRecentMessages(count = 10) {
        return this.history.slice(-count).filter(msg => msg.role !== 'system');
    }
}

// ==================== 全局实例 ====================
const memory = new ConversationMemory();

// ==================== API通信 ====================
async function sendToSiry(userMessage, onReply) {
    // 1. 将用户消息加入记忆
    memory.addUserMessage(userMessage);

    try {
        // 2. 准备API请求
        const response = await fetch(SIRY_CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SIRY_CONFIG.API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: SIRY_CONFIG.MODEL,
                messages: memory.getHistory(), // 发送完整历史！
                stream: false,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`API错误: ${response.status}`);
        }

        const data = await response.json();
        const aiReply = data.choices[0]?.message?.content || '抱歉，我好像没理解你的意思。';

        // 3. 将AI回复加入记忆
        memory.addAssistantMessage(aiReply);

        // 4. 回调函数处理回复
        if (onReply) onReply(aiReply);

        return aiReply;

    } catch (error) {
        console.error('聊天失败:', error);
        const errorMsg = '网络连接有点问题，请稍后再试。';
        memory.addAssistantMessage(errorMsg); // 连错误也记录，保持上下文连续
        if (onReply) onReply(errorMsg);
        return errorMsg;
    }
}

// ==================== 界面助手函数 ====================
// 这些函数会被HTML文件调用

// 初始化聊天显示
function initChatDisplay(containerId, inputId, buttonId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 显示历史消息
    const recent = memory.getRecentMessages(5);
    recent.forEach(msg => {
        const div = document.createElement('div');
        div.className = msg.role === 'user' ? 'message user-message' : 'message bot-message';
        div.innerHTML = `
            <div class="message-sender">${msg.role === 'user' ? '你' : 'Siry'}</div>
            <div class="message-content">${msg.content}</div>
        `;
        container.appendChild(div);
    });

    // 设置发送按钮事件
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);

    if (input && button) {
        const sendFunc = () => {
            const text = input.value.trim();
            if (!text) return;
            
            // 显示用户消息
            const container = document.getElementById(containerId);
            const userDiv = document.createElement('div');
            userDiv.className = 'message user-message';
            userDiv.innerHTML = `
                <div class="message-sender">你</div>
                <div class="message-content">${text}</div>
            `;
            container.appendChild(userDiv);
            
            // 显示思考中
            const thinkingDiv = document.createElement('div');
            thinkingDiv.className = 'message bot-message';
            thinkingDiv.id = 'thinking-msg';
            thinkingDiv.innerHTML = `
                <div class="message-sender">Siry</div>
                <div class="message-content"><em>正在思考...</em></div>
            `;
            container.appendChild(thinkingDiv);
            
            input.value = '';
            container.scrollTop = container.scrollHeight;

            // 发送到AI
            sendToSiry(text, (reply) => {
                // 替换"思考中"为实际回复
                thinkingDiv.innerHTML = `
                    <div class="message-sender">Siry</div>
                    <div class="message-content">${reply}</div>
                `;
                container.scrollTop = container.scrollHeight;
            });
        };

        button.onclick = sendFunc;
        input.onkeypress = (e) => {
            if (e.key === 'Enter') sendFunc();
        };
    }
}

// 清空对话历史
function clearChatHistory() {
    if (confirm('确定要清空对话历史吗？这会清除所有记忆，但不会删除你的账户设置。')) {
        memory.clear();
        location.reload(); // 重新加载页面以刷新显示
    }
}

// 导出给HTML使用（兼容不同环境）
if (typeof window !== 'undefined') {
    window.SiryCore = {
        sendToSiry,
        initChatDisplay,
        clearChatHistory,
        memory,
        config: SIRY_CONFIG
    };
}