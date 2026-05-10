/**
 * ============================================================================
 * Platform 2026 - Ultra-Fast Chat Engine
 * Architecture: Virtualized DOM, Frosted Glass UI, Animated Auto-Expanding Input
 * Inspired by: Telegram Web K/Z & iOS 17 Design System
 * ============================================================================
 */

const ChatConfig = {
    WS_BASE_URL: window.location.protocol === 'https:' ? `wss://${window.location.host}` : `ws://${window.location.host}`,
    WS_ENDPOINT: '/ws',
    MAIN_ROOM: 'global_room',
    STORAGE_KEY: 'platform_2026_chats',
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_ATTEMPTS: 10,
    VIRTUAL_LIST_LIMIT: 50 // عدد الرسائل المحملة في الـ DOM لتجنب التهنيج
};

// ==========================================
// 1. State Management (إدارة حالة الشات)
// ==========================================
class ChatEngineState {
    constructor() {
        this.currentUser = null;
        this.activeRoom = ChatConfig.MAIN_ROOM;
        this.socket = null;
        this.reconnectAttempts = 0;
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
        } catch (e) {}
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
        this.messages[roomId].push(msgData);
        this.saveHistory();
    }
}

const chatState = new ChatEngineState();

// ==========================================
// 2. Telegram Virtual List Engine (محرك السكرول الوهمي)
// ==========================================
class VirtualChatList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.messages = [];
        this.renderedCount = ChatConfig.VIRTUAL_LIST_LIMIT;
        
        // مراقبة السكرول لعمل DOM Shrinking وتحميل الرسائل القديمة بسلاسة
        this.container.addEventListener('scroll', () => this.handleScroll());
    }

    renderFakeBubbles(count = 4) {
        let skeletons = '';
        for(let i = 0; i < count; i++) {
            const isSelf = i % 2 === 0;
            const width = Math.floor(Math.random() * 120 + 80);
            skeletons += `
                <div class="tg-msg-wrap ${isSelf ? 'self' : 'other'} fake-bubble">
                    <div class="tg-msg-bubble skeleton-bg" style="width: ${width}px; height: 24px;"></div>
                </div>
            `;
        }
        this.container.innerHTML = skeletons;
    }

    renderSmart(messages) {
        this.messages = messages;
        const messagesToRender = this.messages.slice(-this.renderedCount); // رسم أحدث الرسائل فقط
        
        // منع الريندر الكامل لو مفيش رسائل جديدة (للحفاظ على الأداء)
        if (this.container.children.length === messagesToRender.length && !this.container.querySelector('.fake-bubble')) {
            return; 
        }

        this.container.innerHTML = '';
        messagesToRender.forEach((msg, index) => {
            // تفعيل الأنيميشن لآخر رسالة فقط (عشان ميعملش أنيميشن للقديم كله)
            const isLast = index === messagesToRender.length - 1;
            this.container.insertAdjacentHTML('beforeend', this.createMessageHTML(msg, isLast));
        });

        this.scrollToBottom();
    }

    createMessageHTML(msg, isNew) {
        if (msg.isSystem) {
            return `<div class="system-msg fade-in-msg">${msg.text}</div>`;
        }

        const isSelf = msg.sender === chatState.currentUser;
        const wrapClass = isSelf ? 'self' : 'other';
        const tickIcon = msg.status === 'read' ? 'fa-check-double' : 'fa-check';
        const tickColor = msg.status === 'read' ? '#5AC8FA' : 'var(--text-secondary)';
        const ticks = isSelf ? `<i class="fa-solid ${tickIcon}" style="color: ${tickColor}; font-size: 11px; margin-right:4px;"></i>` : '';
        const senderName = isSelf ? '' : `<span class="tg-msg-sender">${msg.sender}</span>`;
        const animClass = isNew ? 'fade-in-msg' : '';

        return `
            <div class="tg-msg-wrap ${wrapClass} ${animClass}">
                <div class="tg-msg-bubble">
                    ${senderName}
                    <span class="tg-msg-text">${msg.text.replace(/\n/g, '<br>')}</span>
                    <div class="tg-msg-meta">
                        <span>${ChatUI.formatTime(msg.time)}</span>
                        ${ticks}
                    </div>
                    <div style="clear: both;"></div>
                </div>
            </div>
        `;
    }

    handleScroll() {
        if (this.container.scrollTop === 0 && this.renderedCount < this.messages.length) {
            // تحميل المزيد من الرسائل عند الوصول للأعلى (Pagination)
            this.renderedCount += ChatConfig.VIRTUAL_LIST_LIMIT;
            const previousHeight = this.container.scrollHeight;
            
            this.renderSmart(this.messages);
            
            // الحفاظ على موضع السكرول
            this.container.scrollTop = this.container.scrollHeight - previousHeight;
        }
    }

    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }
}

// ==========================================
// 3. Telegram Animated Input (حقل الكتابة المطاطي)
// ==========================================
class AnimatedInputField {
    constructor(elementId) {
        this.input = document.getElementById(elementId);
        
        // إعدادات الـ CSS للحقل المطاطي
        this.input.style.resize = 'none';
        this.input.style.overflow = 'hidden';
        this.input.style.minHeight = '42px';
        this.input.style.maxHeight = '150px'; // أقصى ارتفاع قبل ظهور السكرول الداخلي
        this.input.style.transition = 'height 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)';
        this.input.style.boxSizing = 'border-box';

        this.input.addEventListener('input', () => this.adjustHeight());
        
        // التعامل مع زر الإرسال بالإنتر
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // منع سطر جديد
                window.sendChatMessage();
            }
        });
    }

    adjustHeight() {
        // إعادة الارتفاع للطبيعي لحساب الـ scrollHeight الحقيقي
        this.input.style.height = '42px'; 
        let newHeight = this.input.scrollHeight;
        
        if (newHeight > 150) {
            this.input.style.overflowY = 'auto';
            newHeight = 150;
        } else {
            this.input.style.overflowY = 'hidden';
        }
        
        this.input.style.height = newHeight + 'px';
    }

    reset() {
        this.input.value = '';
        this.adjustHeight();
        
        // إعادة الأيقونة لوضع المايك
        const sendIcon = document.getElementById('send-icon');
        if (sendIcon) sendIcon.className = 'fa-solid fa-microphone';
    }
}

// ==========================================
// 4. UI Rendering & Glassmorphism Styling
// ==========================================
const ChatUI = {
    injectStyles: () => {
        const style = document.createElement('style');
        style.innerHTML = `
            /* --- الأساسيات وخلفية الزجاج --- */
            .tg-chat-wrapper { display: flex; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.2); border-radius: inherit; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05); }
            
            /* --- القائمة الجانبية --- */
            .tg-sidebar { width: 320px; background: rgba(15, 15, 15, 0.65); backdrop-filter: blur(25px) saturate(180%); -webkit-backdrop-filter: blur(25px) saturate(180%); border-left: 1px solid var(--glass-border); display: flex; flex-direction: column; transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); z-index: 50; }
            .tg-search-bar { padding: 12px 15px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; gap: 10px; align-items: center; }
            .tg-search-bar input { flex: 1; background: rgba(255, 255, 255, 0.08); border: 1px solid transparent; border-radius: 12px; padding: 10px 15px; color: white; font-size: 14px; outline: none; transition: 0.3s; }
            .tg-search-bar input:focus { background: rgba(255, 255, 255, 0.12); border-color: rgba(255,255,255,0.1); }
            .tg-contacts { flex: 1; overflow-y: auto; }
            .tg-contacts::-webkit-scrollbar { width: 4px; }
            .tg-contacts::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
            
            /* --- عناصر جهات الاتصال --- */
            .tg-contact-item { display: flex; align-items: center; padding: 12px 15px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid rgba(255,255,255,0.02); }
            .tg-contact-item:hover { background: rgba(255,255,255,0.05); }
            .tg-contact-item.active { background: rgba(0, 122, 255, 0.15); }
            .tg-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; color: white; margin-left: 12px; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
            .tg-contact-info { flex: 1; overflow: hidden; }
            .tg-contact-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
            .tg-contact-time { font-size: 11px; font-weight: normal; color: var(--text-secondary); }
            .tg-contact-lastmsg { font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            
            /* --- الشات الرئيسي --- */
            .tg-main { flex: 1; display: flex; flex-direction: column; position: relative; background-color: var(--ios-bg); }
            /* Pattern Background with Overlay */
            .tg-main::before {
                content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                background: radial-gradient(circle at top right, rgba(0, 122, 255, 0.15), transparent 50%),
                            radial-gradient(circle at bottom left, rgba(52, 199, 89, 0.1), transparent 50%),
                            url('https://www.transparenttextures.com/patterns/stardust.png');
                background-blend-mode: overlay; opacity: 0.8; z-index: 0; pointer-events: none;
            }

            .tg-header { padding: 10px 20px; background: rgba(20, 20, 20, 0.75); backdrop-filter: blur(25px) saturate(180%); -webkit-backdrop-filter: blur(25px) saturate(180%); border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; z-index: 10; cursor: pointer; }
            .tg-header-info h3 { margin-bottom: 2px; font-size: 16px; font-weight: 600; }
            .tg-header-status { font-size: 13px; color: var(--text-secondary); transition: color 0.3s; }
            .tg-header-status.online { color: #5AC8FA; }
            
            .tg-voice-banner { display: none; background: rgba(52, 199, 89, 0.15); border-bottom: 1px solid rgba(52, 199, 89, 0.3); padding: 10px 20px; align-items: center; justify-content: space-between; backdrop-filter: blur(15px); cursor: pointer; transition: 0.2s; z-index: 9; }
            .tg-voice-banner:hover { background: rgba(52, 199, 89, 0.25); }
            .tg-voice-banner.active { display: flex; }
            .tg-voice-banner-info { display: flex; align-items: center; gap: 15px; color: var(--ios-green); font-size: 14px; font-weight: bold; }
            .tg-voice-banner-btn { background: var(--ios-green); color: #fff; border: none; padding: 6px 15px; border-radius: 15px; font-weight: bold; cursor: pointer; }
            
            /* --- منطقة الرسائل والفقاعات --- */
            .tg-messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; z-index: 1; scroll-behavior: smooth; }
            .tg-messages::-webkit-scrollbar { width: 4px; }
            .tg-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
            
            .tg-msg-wrap { display: flex; flex-direction: column; max-width: 75%; }
            .tg-msg-wrap.self { align-self: flex-end; }
            .tg-msg-wrap.other { align-self: flex-start; }
            
            .tg-msg-bubble { padding: 8px 12px; border-radius: 18px; font-size: 15px; line-height: 1.4; position: relative; box-shadow: 0 1px 2px rgba(0,0,0,0.2); word-wrap: break-word; }
            .tg-msg-wrap.self .tg-msg-bubble { background: var(--ios-blue); color: white; border-bottom-right-radius: 4px; }
            /* Frosted Glass Bubble for Others */
            .tg-msg-wrap.other .tg-msg-bubble { background: rgba(40, 40, 40, 0.65); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border: 1px solid rgba(255,255,255,0.05); color: white; border-bottom-left-radius: 4px; }
            
            .tg-msg-meta { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; font-size: 11px; opacity: 0.7; margin-top: 4px; float: left; margin-right: 12px; }
            .tg-msg-wrap.self .tg-msg-meta { margin-right: 0; margin-left: 12px; float: right; color: rgba(255,255,255,0.8); }
            .tg-msg-sender { font-size: 13px; font-weight: 600; color: #5AC8FA; margin-bottom: 2px; display: block; }
            .tg-msg-wrap.self .tg-msg-sender { display: none; }
            
            /* --- Animation: Fade In --- */
            .fade-in-msg { animation: msgFadeIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1) forwards; transform-origin: bottom right; }
            .tg-msg-wrap.other.fade-in-msg { transform-origin: bottom left; }
            @keyframes msgFadeIn { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
            
            /* --- Animation: Skeleton Loading --- */
            .skeleton-bg { background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 200% 100%; animation: skeletonLoading 1.5s infinite ease-in-out; border-radius: 16px; border: none !important; }
            @keyframes skeletonLoading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
            
            /* --- حقل الكتابة المطاطي --- */
            .tg-input-area { padding: 10px 15px; background: rgba(20, 20, 20, 0.75); backdrop-filter: blur(25px) saturate(180%); -webkit-backdrop-filter: blur(25px) saturate(180%); border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: flex-end; gap: 10px; z-index: 10; }
            .tg-input-btn { background: none; border: none; color: var(--text-secondary); font-size: 22px; cursor: pointer; transition: 0.2s; padding: 10px; display: flex; align-items: center; justify-content: center; height: 42px; }
            .tg-input-btn:hover { color: var(--ios-blue); }
            /* Textarea بدل Input عشان يكبر */
            .tg-input-area textarea { flex: 1; background: rgba(255, 255, 255, 0.08); border: 1px solid transparent; border-radius: 21px; padding: 10px 18px; color: white; font-size: 15px; outline: none; margin-bottom: 0; font-family: inherit; line-height: 1.4; }
            .tg-input-area textarea:focus { border-color: rgba(255,255,255,0.15); background: rgba(255, 255, 255, 0.12); }
            .tg-send-btn { background: var(--ios-blue); color: white; border: none; width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; transition: transform 0.2s, background 0.2s; flex-shrink: 0; }
            .tg-send-btn:active { transform: scale(0.9); }
            
            .system-msg { align-self: center; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(10px); padding: 4px 12px; border-radius: 12px; font-size: 12px; color: rgba(255,255,255,0.7); margin: 8px 0; border: 1px solid rgba(255,255,255,0.05); }
            
            /* --- الموبايل --- */
            @media(max-width: 768px) { 
                .tg-sidebar { display: none; width: 100%; border-left: none; } 
                .tg-sidebar.active-mobile { display: flex; position: absolute; z-index: 100; height: 100%; top: 0; right: 0; } 
                .tg-msg-wrap { max-width: 90%; } 
            }
        `;
        document.head.appendChild(style);
    },

    buildLayout: () => {
        const chatSection = document.querySelector('.chat-section');
        if (!chatSection) return;

        chatSection.innerHTML = `
            <div class="tg-chat-wrapper">
                <div class="tg-sidebar" id="tg-sidebar">
                    <div class="tg-search-bar">
                        <i class="fa-solid fa-bars" style="font-size: 20px; color: var(--text-secondary); cursor: pointer; padding: 5px;"></i>
                        <input type="tel" id="newChatInput" placeholder="بحث أو إدخال رقم..." autocomplete="off">
                    </div>
                    <div class="tg-contacts" id="contacts-list"></div>
                </div>

                <div class="tg-main">
                    <div class="tg-header" onclick="ChatUI.showChatInfo()">
                        <button class="tg-input-btn" style="padding:0; margin-left:15px; display:none;" id="mobile-back-btn" onclick="event.stopPropagation(); ChatUI.toggleMobileSidebar()">
                            <i class="fa-solid fa-arrow-right"></i>
                        </button>
                        <div class="tg-avatar" id="current-chat-avatar"><i class="fa-solid fa-users"></i></div>
                        <div class="tg-header-info" style="margin-right: 15px; flex:1;">
                            <h3 id="current-chat-name">غرفة المحادثة العامة</h3>
                            <span class="tg-header-status online" id="current-chat-status">120 عضو، 5 متصلون</span>
                        </div>
                        <i class="fa-solid fa-ellipsis-vertical" style="color: var(--text-secondary); padding: 10px; font-size: 20px;"></i>
                    </div>

                    <div class="tg-voice-banner" id="voice-chat-banner" onclick="window.startCall()">
                        <div class="tg-voice-banner-info">
                            <i class="fa-solid fa-microphone-lines"></i>
                            <span>محادثة صوتية نشطة</span>
                        </div>
                        <button class="tg-voice-banner-btn">انضمام</button>
                    </div>

                    <div class="tg-messages" id="messages-container"></div>

                    <div class="tg-input-area">
                        <button class="tg-input-btn"><i class="fa-solid fa-paperclip"></i></button>
                        <!-- تم تغيير input إلى textarea لدعم الارتفاع المطاطي -->
                        <textarea id="chatInput" placeholder="رسالة..." rows="1"></textarea>
                        <button class="tg-send-btn" id="btn-send-toggle" onclick="window.sendChatMessage()">
                            <i class="fa-solid fa-microphone" id="send-icon"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // تفعيل الحقل المطاطي
        window.animatedInput = new AnimatedInputField('chatInput');
        // تفعيل القائمة الوهمية السريعة
        window.virtualChat = new VirtualChatList('messages-container');

        const chatInput = document.getElementById('chatInput');
        const sendIcon = document.getElementById('send-icon');
        
        chatInput.addEventListener('input', (e) => {
            if (e.target.value.trim().length > 0) {
                sendIcon.className = 'fa-solid fa-paper-plane';
                document.getElementById('btn-send-toggle').style.background = 'var(--ios-blue)';
            } else {
                sendIcon.className = 'fa-solid fa-microphone';
                document.getElementById('btn-send-toggle').style.background = 'rgba(255,255,255,0.1)'; // لون مختلف للمايك
            }
        });

        document.getElementById('newChatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const phone = e.target.value.replace(/\D/g, '');
                if (phone.length >= 10) {
                    ChatEngine.createNewPrivateChat(phone);
                    e.target.value = '';
                }
            }
        });

        if(window.innerWidth <= 768) {
            document.getElementById('mobile-back-btn').style.display = 'block';
            document.getElementById('tg-sidebar').classList.add('active-mobile');
        }
    },

    toggleMobileSidebar: () => {
        document.getElementById('tg-sidebar').classList.toggle('active-mobile');
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
            const icon = contact.type === 'group' ? '<i class="fa-solid fa-users"></i>' : contact.name.substring(0, 1).toUpperCase();
            const bg = contact.type === 'group' ? 'linear-gradient(135deg, #34C759, #30D158)' : 'linear-gradient(135deg, #007AFF, #00C6FF)';
            
            const html = `
                <div class="tg-contact-item ${isActive}" onclick="ChatEngine.switchRoom('${contact.id}')">
                    <div class="tg-avatar" style="background: ${bg}">${icon}</div>
                    <div class="tg-contact-info">
                        <div class="tg-contact-name">
                            <span>${contact.name}</span>
                            <span class="tg-contact-time">${ChatUI.formatTime(contact.time)}</span>
                        </div>
                        <div class="tg-contact-lastmsg">${contact.lastMessage}</div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    },

    renderMessages: () => {
        const messages = chatState.messages[chatState.activeRoom] || [];
        
        // استخدام VirtualChatList بدلاً من الريندر العادي
        if (window.virtualChat) {
            window.virtualChat.renderSmart(messages);
        }
    },

    updateHeader: () => {
        const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
        if (contact) {
            document.getElementById('current-chat-name').innerText = contact.name;
            const avatar = document.getElementById('current-chat-avatar');
            const status = document.getElementById('current-chat-status');
            const voiceBanner = document.getElementById('voice-chat-banner');

            if (contact.type === 'group') {
                avatar.innerHTML = '<i class="fa-solid fa-users"></i>';
                avatar.style.background = 'linear-gradient(135deg, #34C759, #30D158)';
                status.innerText = `${contact.members || '120'} عضو`;
                status.classList.remove('online');
                voiceBanner.classList.add('active'); 
            } else {
                avatar.innerHTML = contact.name.substring(0, 1).toUpperCase();
                avatar.style.background = 'linear-gradient(135deg, #007AFF, #00C6FF)';
                status.innerText = 'متصل الآن';
                status.classList.add('online');
                voiceBanner.classList.remove('active');
            }

            if(window.innerWidth <= 768) {
                document.getElementById('tg-sidebar').classList.remove('active-mobile');
            }
        }
    },
    
    showChatInfo: () => {
        console.log("Show chat profile info");
    }
};

// ==========================================
// 5. Network Engine (WebSockets)
// ==========================================
const ChatEngine = {
    connect: () => {
        if (chatState.socket && chatState.socket.readyState === WebSocket.OPEN) return;

        const wsUrl = `${ChatConfig.WS_BASE_URL}${ChatConfig.WS_ENDPOINT}/${chatState.activeRoom}/${chatState.currentUser}`;
        chatState.socket = new WebSocket(wsUrl);

        chatState.socket.onopen = () => {
            chatState.reconnectAttempts = 0;
            const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
            if(contact && contact.type === 'private') {
                document.getElementById('current-chat-status').innerText = 'متصل الآن';
            }
            chatState.socket.send(JSON.stringify({ type: "system", sender: chatState.currentUser, text: "انضم إلى المحادثة" }));
        };

        chatState.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                let messageData;

                if (data.message && typeof data.message === 'string') {
                    try {
                        const innerData = JSON.parse(data.message);
                        messageData = { sender: innerData.sender, text: innerData.text, isSystem: innerData.type === 'system', time: new Date().toISOString(), status: 'read' };
                    } catch (e) {
                        messageData = { sender: data.sender, text: data.message, isSystem: false, time: new Date().toISOString(), status: 'read' };
                    }
                }

                if (messageData) {
                    if (messageData.sender !== chatState.currentUser) {
                        chatState.addMessage(chatState.activeRoom, messageData);
                        const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
                        if (contact) {
                            contact.lastMessage = messageData.isSystem ? messageData.text : `${messageData.sender}: ${messageData.text.substring(0,15)}`;
                            contact.time = messageData.time;
                        }
                        ChatUI.renderMessages();
                        ChatUI.renderContacts();
                    }
                }
            } catch (e) {}
        };

        chatState.socket.onclose = () => {
            document.getElementById('current-chat-status').innerText = 'جارٍ الاتصال...';
            document.getElementById('current-chat-status').classList.remove('online');
            if (chatState.reconnectAttempts < ChatConfig.MAX_RECONNECT_ATTEMPTS) {
                chatState.reconnectAttempts++;
                setTimeout(ChatEngine.connect, ChatConfig.RECONNECT_DELAY);
            }
        };
    },

    switchRoom: (roomId) => {
        if (chatState.activeRoom === roomId) return;
        chatState.activeRoom = roomId;
        if (chatState.socket) chatState.socket.close();
        
        // عرض Skeletons أثناء التبديل لإعطاء إحساس بالسرعة
        if (window.virtualChat) window.virtualChat.renderFakeBubbles();
        
        ChatUI.updateHeader();
        ChatUI.renderContacts();
        
        // محاكاة تأخير بسيط للتحميل لإظهار تأثير الـ Skeleton
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
            chatState.contacts.push({
                id: privateRoomId,
                name: `+${targetPhone}`,
                type: 'private',
                unread: 0,
                lastMessage: 'ابدأ المحادثة الآن',
                time: new Date().toISOString()
            });
            chatState.saveHistory();
        }
        ChatEngine.switchRoom(privateRoomId);
    }
};

window.sendChatMessage = () => {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (text && chatState.socket && chatState.socket.readyState === WebSocket.OPEN) {
        chatState.socket.send(JSON.stringify({ type: "chat", sender: chatState.currentUser, text: text }));
        const msgObj = { sender: chatState.currentUser, text: text, isSystem: false, time: new Date().toISOString(), status: 'sent' };
        chatState.addMessage(chatState.activeRoom, msgObj);
        
        const contact = chatState.contacts.find(c => c.id === chatState.activeRoom);
        if (contact) {
            contact.lastMessage = `أنت: ${text.substring(0,15)}`;
            contact.time = msgObj.time;
        }

        // تفريغ الحقل واستعادة الحجم الطبيعي
        if (window.animatedInput) {
            window.animatedInput.reset();
        } else {
            input.value = '';
        }
        
        ChatUI.renderMessages();
        ChatUI.renderContacts();
        
        // محاكاة وصول الرسالة
        setTimeout(() => {
            const msgs = chatState.messages[chatState.activeRoom];
            if(msgs && msgs.length > 0) {
                msgs[msgs.length-1].status = 'read';
                ChatUI.renderMessages();
            }
        }, 1000);
    }
};

window.addEventListener('PlatformAuthSuccess', (e) => {
    chatState.currentUser = e.detail.phone;
    ChatUI.injectStyles();
    ChatUI.buildLayout();
    ChatUI.updateHeader();
    ChatUI.renderContacts();
    ChatUI.renderMessages();
    ChatEngine.connect();
});

if (window.CURRENT_USER_PHONE) {
    window.dispatchEvent(new CustomEvent('PlatformAuthSuccess', { detail: { phone: window.CURRENT_USER_PHONE } }));
}

/**
 * ============================================================================
 * End of chat.js
 * ============================================================================
 */
