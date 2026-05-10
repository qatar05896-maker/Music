/**
 * ============================================================================
 * Platform 2026 - Ultra-Fast Chat Engine (Production Ready)
 * Architecture: Virtualized DOM, Frosted Glass UI, WebSockets, API Sync
 * ============================================================================
 */

const ChatConfig = {
    // إعدادات السيرفر المستقبلية
    API_BASE_URL: 'https://api.yourdomain.com/v1',
    WS_BASE_URL: window.location.protocol === 'https:' ? `wss://${window.location.host}` : `ws://${window.location.host}`,
    WS_ENDPOINT: '/ws',
    
    // إعدادات التطبيق
    MAIN_ROOM: 'global_room',
    STORAGE_KEY: 'platform_2026_chats',
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_ATTEMPTS: 10,
    VIRTUAL_LIST_LIMIT: 50,
    TYPING_TIMEOUT: 2000
};

// ==========================================
// 1. API & Database Sync (الاتصال بقاعدة البيانات)
// ==========================================
class BackendAPI {
    /**
     * فحص هل الرقم موجود في قاعدة البيانات
     */
    static async checkNumberExists(phone) {
        // [مستقبلاً] سيتم تفعيل هذا الكود للاتصال الحقيقي
        /*
        try {
            const response = await fetch(`${ChatConfig.API_BASE_URL}/users/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const data = await response.json();
            return data.exists;
        } catch (error) {
            console.error("API Error:", error);
            return false;
        }
        */
        
        // [مؤقتاً] محاكاة للسيرفر: اعتبر أي رقم أطول من 10 أرقام موجود
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(phone.length >= 10);
            }, 500); // محاكاة سرعة النت
        });
    }
}

// ==========================================
// 2. State Management (إدارة حالة الشات)
// ==========================================
class ChatEngineState {
    constructor() {
        this.currentUser = null;
        this.activeRoom = ChatConfig.MAIN_ROOM;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.typingUsers = new Set();
        
        this.contacts = [
            { id: ChatConfig.MAIN_ROOM, name: 'غرفة المحادثة العامة', type: 'group', members: 120, unread: 0, lastMessage: 'مرحباً بك في المنصة!', time: new Date().toISOString() }
        ];
        this.messages = {};
        this.loadHistory();
    }

    loadHistory() {
        try {
            const data = localStorage.getItem(ChatConfig.STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                this.messages = parsed.messages || {};
                if (parsed.contacts) {
                    parsed.contacts.forEach(c => {
                        if (!this.contacts.find(exist => exist.id === c.id)) this.contacts.push(c);
                    });
                }
            }
        } catch (e) {
            console.warn("فشل تحميل السجل المحلي");
        }
    }

    saveHistory() {
        try {
            localStorage.setItem(ChatConfig.STORAGE_KEY, JSON.stringify({
                contacts: this.contacts,
                messages: this.messages
            }));
        } catch (e) {}
    }

    addMessage(roomId, msgData) {
        if (!this.messages[roomId]) this.messages[roomId] = [];
        if (!msgData.id) msgData.id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        this.messages[roomId].push(msgData);
        this.saveHistory();
    }
}

const chatState = new ChatEngineState();

// ==========================================
// 3. UI Interaction & Menus (الثلاث نقاط والخيارات)
// ==========================================
class UIManager {
    static init() {
        this.setupHeaderDropdown();
        this.setupMessageContextMenu();
        this.setupSearch();
    }

    // إعداد قائمة الثلاث نقاط في الهيدر (فتح/قفل الفويس شات)
    static setupHeaderDropdown() {
        const headerRight = document.querySelector('.header-right-actions');
        if(!headerRight) return;

        // إضافة المنيو للـ DOM
        const dropdownHTML = `
            <div id="header-dropdown" class="glass-context-menu hidden" style="position:absolute; top:60px; left:20px; z-index:2000;">
                <div class="context-menu-item" id="menu-start-voice">
                    <i class="fa-solid fa-microphone-lines"></i> بدء محادثة صوتية
                </div>
                <div class="context-menu-item" id="menu-start-video">
                    <i class="fa-solid fa-video"></i> مكالمة فيديو
                </div>
                <div class="context-menu-divider"></div>
                <div class="context-menu-item" id="menu-clear-chat">
                    <i class="fa-solid fa-broom"></i> مسح المحادثة
                </div>
                <div class="context-menu-item danger" id="menu-block-user">
                    <i class="fa-solid fa-ban"></i> حظر المستخدم
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', dropdownHTML);

        const dropdownTrigger = document.querySelector('.dropdown-trigger');
        const dropdownMenu = document.getElementById('header-dropdown');

        dropdownTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', () => {
            dropdownMenu.classList.add('hidden');
        });

        // ربط أزرار المنيو بالوظائف
        document.getElementById('menu-start-voice').addEventListener('click', () => {
            window.startCall('audio'); // دالة من webrtc.js
        });
        document.getElementById('menu-start-video').addEventListener('click', () => {
            window.startCall('video'); // دالة من webrtc.js
        });
        document.getElementById('menu-clear-chat').addEventListener('click', () => {
            chatState.messages[chatState.activeRoom] = [];
            chatState.saveHistory();
            ChatUI.renderMessages();
        });
    }

    // إعداد الـ Context Menu للرسائل
    static setupMessageContextMenu() {
        const contextMenu = document.getElementById('message-context-menu');
        let selectedMessageId = null;

        document.addEventListener('contextmenu', (e) => {
            const bubble = e.target.closest('.bubble');
            if (bubble) {
                e.preventDefault();
                selectedMessageId = bubble.getAttribute('data-mid');
                
                contextMenu.style.top = `${e.clientY}px`;
                contextMenu.style.left = `${e.clientX}px`;
                contextMenu.classList.remove('hidden');
            }
        });

        document.addEventListener('click', () => {
            contextMenu.classList.add('hidden');
        });

        document.getElementById('menu-delete').addEventListener('click', () => {
            if (selectedMessageId) {
                const msgs = chatState.messages[chatState.activeRoom];
                chatState.messages[chatState.activeRoom] = msgs.filter(m => m.id !== selectedMessageId);
                chatState.saveHistory();
                ChatUI.renderMessages();
            }
        });
    }

    static setupSearch() {
        const searchInput = document.getElementById('global-search');
        searchInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const phone = e.target.value.replace(/\D/g, '');
                
                // 1. التأكد من الرقم في قاعدة البيانات أولاً
                const exists = await BackendAPI.checkNumberExists(phone);
                
                if (exists) {
                    ChatEngine.createNewPrivateChat(phone);
                    e.target.value = '';
                } else {
                    // إظهار رسالة خطأ (Toast)
                    this.showToast("هذا الرقم غير مسجل في المنصة", "error");
                }
            }
        });
    }

    static showToast(message, type = "info") {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const toast = document.createElement('div');
        toast.className = `glass-panel toast ${type}`;
        toast.innerText = message;
        toast.style.padding = "10px 20px";
        toast.style.marginBottom = "10px";
        toast.style.borderRadius = "20px";
        toast.style.animation = "slide-up 0.3s ease";
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// ==========================================
// 4. Telegram Virtual List Engine
// ==========================================
class VirtualChatList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.messages = [];
        this.renderedCount = ChatConfig.VIRTUAL_LIST_LIMIT;
        this.container.addEventListener('scroll', () => this.handleScroll());
    }

    renderFakeBubbles(count = 4) {
        let skeletons = '';
        for(let i = 0; i < count; i++) {
            const isSelf = i % 2 === 0;
            const width = Math.floor(Math.random() * 120 + 80);
            skeletons += `
                <div class="message-bubble ${isSelf ? 'out' : 'in'} fake-bubble" style="width: ${width}px; height: 35px; background: rgba(255,255,255,0.05);"></div>
            `;
        }
        this.container.innerHTML = skeletons;
    }

    renderSmart(messages) {
        this.messages = messages;
        const messagesToRender = this.messages.slice(-this.renderedCount);
        
        if (this.container.children.length === messagesToRender.length && !this.container.querySelector('.fake-bubble')) {
            return; 
        }

        this.container.innerHTML = '';
        messagesToRender.forEach((msg, index) => {
            this.container.insertAdjacentHTML('beforeend', this.createMessageHTML(msg));
        });

        this.scrollToBottom();
    }

    createMessageHTML(msg) {
        if (msg.isSystem) {
            return `<div class="system-msg" style="text-align:center; color:var(--text-muted); font-size:12px; margin:10px 0;">${msg.text}</div>`;
        }

        const isSelf = msg.sender === chatState.currentUser;
        const wrapClass = isSelf ? 'out' : 'in';
        const tickIcon = msg.status === 'read' ? 'fa-check-double' : 'fa-check';
        const tickColor = msg.status === 'read' ? 'var(--accent-green)' : 'var(--text-muted)';
        const ticks = isSelf ? `<i class="fa-solid ${tickIcon} msg-status-icon" style="color: ${tickColor};"></i>` : '';
        const senderName = isSelf ? '' : `<span style="font-size:12px; color:var(--accent-blue); font-weight:bold; margin-bottom:4px; display:block;">${msg.sender}</span>`;

        return `
            <div class="message-bubble ${wrapClass} bubble" data-mid="${msg.id}" data-peer-id="${msg.sender}">
                ${senderName}
                <span class="message-text">${msg.text.replace(/\n/g, '<br>')}</span>
                <div class="message-meta">
                    <span>${ChatUI.formatTime(msg.time)}</span>
                    ${ticks}
                </div>
            </div>
        `;
    }

    handleScroll() {
        if (this.container.scrollTop === 0 && this.renderedCount < this.messages.length) {
            this.renderedCount += ChatConfig.VIRTUAL_LIST_LIMIT;
            const previousHeight = this.container.scrollHeight;
            this.renderSmart(this.messages);
            this.container.scrollTop = this.container.scrollHeight - previousHeight;
        }
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }
}

// ==========================================
// 5. UI Rendering Engine
// ==========================================
const ChatUI = {
    init: () => {
        window.virtualChat = new VirtualChatList('messages-container');
        UIManager.init();
        
        // إعداد حقل الإدخال
        const chatInput = document.getElementById('chatInput');
        const sendIcon = document.getElementById('send-icon');
        const sendBtn = document.getElementById('btn-send-toggle');
        
        chatInput.addEventListener('input', (e) => {
            chatInput.style.height = 'auto';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
            
            if (e.target.value.trim().length > 0) {
                sendIcon.className = 'fa-solid fa-paper-plane';
                sendBtn.style.background = 'var(--accent-blue)';
                ChatEngine.sendTypingState(true);
            } else {
                sendIcon.className = 'fa-solid fa-microphone';
                sendBtn.style.background = 'rgba(255,255,255,0.1)';
                ChatEngine.sendTypingState(false);
            }
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.sendChatMessage();
            }
        });
    },

    formatTime: (isoString) => {
        return new Date(isoString).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
    },

    renderContacts: () => {
        const container = document.getElementById('contacts-list');
        if (!container) return;
        
        container.innerHTML = '';
        chatState.contacts.sort((a,b) => new Date(b.time) - new Date(a.time)).forEach(contact => {
            const isActive = contact.id === chatState.activeRoom ? 'active' : '';
            const isOnline = contact.type === 'private'; // محاكاة الأونلاين
            const indicator = isOnline ? '<div class="online-indicator"></div>' : '';
            
            const html = `
                <div class="contact-item ${isActive}" onclick="ChatEngine.switchRoom('${contact.id}')">
                    <div class="contact-avatar">
                        ${indicator}
                    </div>
                    <div class="contact-info">
                        <div class="contact-name-row">
                            <span class="contact-name">${contact.name}</span>
                            <span class="contact-time">${ChatUI.formatTime(contact.time)}</span>
                        </div>
                        <div class="contact-msg-row">
                            <span class="contact-msg">${contact.lastMessage}</span>
                            ${contact.unread > 0 ? `<span class="unread-count">${contact.unread}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    },

    renderMessages: () => {
        const messages = chatState.messages[chatState.activeRoom] || [];
        if (window.virtualChat) {
            window.virtualChat.renderSmart(messages);
        }
    },

    updateHeader: () => {
        const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
        if (contact) {
            document.getElementById('current-chat-name').innerText = contact.name;
            const status = document.getElementById('current-chat-status');
            const voiceBanner = document.getElementById('voice-chat-banner');

            if (contact.type === 'group') {
                status.innerText = `${contact.members || '120'} عضو`;
                status.style.color = 'var(--text-muted)';
                if(voiceBanner) voiceBanner.classList.remove('hidden'); 
            } else {
                status.innerText = 'متصل الآن';
                status.style.color = 'var(--accent-blue)';
                if(voiceBanner) voiceBanner.classList.add('hidden');
            }
            
            if(window.innerWidth <= 850) {
                document.getElementById('tg-sidebar').classList.remove('active-mobile');
                document.querySelector('.main-chat-view').classList.add('active-mobile');
            }
        }
    }
};

// ==========================================
// 6. Network Engine (WebSockets + API)
// ==========================================
const ChatEngine = {
    connect: () => {
        if (chatState.socket && chatState.socket.readyState === WebSocket.OPEN) return;

        const wsUrl = `${ChatConfig.WS_BASE_URL}${ChatConfig.WS_ENDPOINT}/${chatState.activeRoom}/${chatState.currentUser}`;
        chatState.socket = new WebSocket(wsUrl);

        chatState.socket.onopen = () => {
            chatState.reconnectAttempts = 0;
            ChatEngine.sendSystemMessage("انضم إلى المحادثة");
        };

        chatState.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // 1. استقبال حدث الكتابة (Typing...)
                if (data.type === 'typing') {
                    ChatEngine.handleTypingEvent(data);
                    return;
                }

                // 2. استقبال الرسائل العادية
                let messageData = { 
                    id: data.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    sender: data.sender, 
                    text: data.message || data.text, 
                    isSystem: data.type === 'system', 
                    time: new Date().toISOString(), 
                    status: 'read' 
                };

                if (messageData.sender !== chatState.currentUser) {
                    chatState.addMessage(chatState.activeRoom, messageData);
                    
                    const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
                    if (contact) {
                        contact.lastMessage = messageData.isSystem ? messageData.text : `${messageData.sender}: ${messageData.text.substring(0,15)}`;
                        contact.time = messageData.time;
                        if(chatState.activeRoom !== contact.id) contact.unread++;
                    }
                    ChatUI.renderMessages();
                    ChatUI.renderContacts();
                }
            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        chatState.socket.onclose = () => {
            document.getElementById('current-chat-status').innerText = 'جارٍ الاتصال...';
            document.getElementById('current-chat-status').style.color = 'var(--accent-red)';
            if (chatState.reconnectAttempts < ChatConfig.MAX_RECONNECT_ATTEMPTS) {
                chatState.reconnectAttempts++;
                setTimeout(ChatEngine.connect, ChatConfig.RECONNECT_DELAY);
            }
        };
    },

    sendSystemMessage: (text) => {
        if (chatState.socket && chatState.socket.readyState === WebSocket.OPEN) {
            chatState.socket.send(JSON.stringify({ type: "system", sender: chatState.currentUser, text }));
        }
    },

    sendTypingState: (isTyping) => {
        if (chatState.socket && chatState.socket.readyState === WebSocket.OPEN) {
            chatState.socket.send(JSON.stringify({ type: "typing", sender: chatState.currentUser, isTyping }));
        }
    },

    handleTypingEvent: (data) => {
        const statusEl = document.getElementById('current-chat-status');
        if (data.isTyping && data.sender !== chatState.currentUser) {
            statusEl.innerText = 'يكتب الآن...';
            statusEl.style.color = 'var(--accent-blue)';
        } else {
            // استعادة الحالة الأصلية
            ChatUI.updateHeader();
        }
    },

    switchRoom: (roomId) => {
        if (chatState.activeRoom === roomId) {
            // لو في الموبايل، مجرد ما يضغط يفتح الشات
            if(window.innerWidth <= 850) {
                document.querySelector('.main-chat-view').classList.add('active-mobile');
            }
            return;
        }
        
        chatState.activeRoom = roomId;
        
        // تصفير عدد الرسائل غير المقروءة
        const contact = chatState.contacts.find(c => c.id === roomId);
        if(contact) contact.unread = 0;

        if (chatState.socket) chatState.socket.close();
        
        if (window.virtualChat) window.virtualChat.renderFakeBubbles();
        
        ChatUI.updateHeader();
        ChatUI.renderContacts();
        
        setTimeout(() => {
            ChatUI.renderMessages();
            ChatEngine.connect();
        }, 150);
    },

    createNewPrivateChat: (targetPhone) => {
        if (!targetPhone.startsWith("20")) targetPhone = "20" + targetPhone.replace(/^0+/, '');
        if (targetPhone === chatState.currentUser) return;

        const sortedPhones = [chatState.currentUser, targetPhone].sort();
        const privateRoomId = `private_${sortedPhones[0]}_${sortedPhones[1]}`;

        if (!chatState.contacts.find(c => c.id === privateRoomId)) {
            chatState.contacts.unshift({ // إضافته في بداية القائمة
                id: privateRoomId,
                name: `+${targetPhone}`,
                type: 'private',
                unread: 0,
                lastMessage: 'تم بدء المحادثة',
                time: new Date().toISOString()
            });
            chatState.saveHistory();
        }
        ChatEngine.switchRoom(privateRoomId);
    }
};

// ==========================================
// 7. Global Actions & Initialization
// ==========================================
window.sendChatMessage = () => {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (text && chatState.socket && chatState.socket.readyState === WebSocket.OPEN) {
        chatState.socket.send(JSON.stringify({ type: "chat", sender: chatState.currentUser, text: text }));
        
        const msgObj = { 
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            sender: chatState.currentUser, 
            text: text, 
            isSystem: false, 
            time: new Date().toISOString(), 
            status: 'sent' 
        };
        chatState.addMessage(chatState.activeRoom, msgObj);
        
        const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
        if (contact) {
            contact.lastMessage = `أنت: ${text.substring(0,15)}`;
            contact.time = msgObj.time;
        }

        input.value = '';
        input.style.height = 'auto'; // إعادة الارتفاع
        document.getElementById('send-icon').className = 'fa-solid fa-microphone';
        document.getElementById('btn-send-toggle').style.background = 'rgba(255,255,255,0.1)';
        
        ChatEngine.sendTypingState(false);
        ChatUI.renderMessages();
        ChatUI.renderContacts();
        
        // محاكاة استلام الرسالة (علامتين صح)
        setTimeout(() => {
            const msgs = chatState.messages[chatState.activeRoom];
            if(msgs && msgs.length > 0) {
                msgs[msgs.length-1].status = 'read';
                ChatUI.renderMessages();
            }
        }, 800);
    }
};

window.goBackToSidebar = () => {
    document.querySelector('.main-chat-view').classList.remove('active-mobile');
};

// الاستماع لحدث تسجيل الدخول من auth.js
window.addEventListener('PlatformAuthSuccess', (e) => {
    chatState.currentUser = e.detail.phone;
    ChatUI.init();
    ChatUI.updateHeader();
    ChatUI.renderContacts();
    ChatUI.renderMessages();
    ChatEngine.connect();
});

// لو المستخدم مسجل دخول بالفعل
if (window.CURRENT_USER_PHONE) {
    window.dispatchEvent(new CustomEvent('PlatformAuthSuccess', { detail: { phone: window.CURRENT_USER_PHONE } }));
}
