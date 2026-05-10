/**
 * ============================================================================
 * Platform 2026 - Navigation, Sidebar & iOS Glass Colors Engine
 * ============================================================================
 */

// ==========================================
// 1. Peer Colors (ألوان زجاجية شفافة ستايل iOS)
// ==========================================
const PeerColors = {
    // تدرجات ألوان زجاجية (Frosted Glass Gradients)
    iosGradients: [
        'linear-gradient(135deg, rgba(0, 122, 255, 0.4), rgba(0, 198, 255, 0.4))', // Blue
        'linear-gradient(135deg, rgba(52, 199, 89, 0.4), rgba(48, 209, 88, 0.4))', // Green
        'linear-gradient(135deg, rgba(255, 149, 0, 0.4), rgba(255, 159, 10, 0.4))', // Orange
        'linear-gradient(135deg, rgba(175, 82, 222, 0.4), rgba(191, 90, 242, 0.4))', // Purple
        'linear-gradient(135deg, rgba(255, 45, 85, 0.4), rgba(255, 55, 95, 0.4))', // Pink
        'linear-gradient(135deg, rgba(255, 59, 48, 0.4), rgba(255, 69, 58, 0.4))'  // Red
    ],

    // دالة بتدي لكل شخص لون ثابت بناءً على رقم تليفونه (نفس خوارزمية تيليجرام)
    getColorForId: (idString) => {
        let hash = 0;
        for (let i = 0; i < idString.length; i++) {
            hash = idString.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % PeerColors.iosGradients.length;
        return PeerColors.iosGradients[index];
    },

    getAvatarInitials: (name) => {
        if (!name) return '?';
        const parts = name.split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }
};

// ==========================================
// 2. Navigation Controller (التحكم في حركة الشاشات)
// ==========================================
const AppNavigation = {
    state: {
        currentView: 'sidebar', // 'sidebar', 'chat', 'profile'
        isMobile: window.innerWidth <= 768
    },

    init: () => {
        // تحديث الحالة عند تغيير حجم الشاشة
        window.addEventListener('resize', () => {
            const wasMobile = AppNavigation.state.isMobile;
            AppNavigation.state.isMobile = window.innerWidth <= 768;
            if (wasMobile !== AppNavigation.state.isMobile) {
                AppNavigation.applyLayout();
            }
        });

        // التعامل مع زرار الـ Back في الموبايل
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.view) {
                AppNavigation.switchTo(e.state.view, false);
            } else {
                AppNavigation.switchTo('sidebar', false);
            }
        });

        // تهيئة الـ URL الأولي
        history.replaceState({ view: 'sidebar' }, '', '#sidebar');
    },

    switchTo: (view, pushHistory = true) => {
        AppNavigation.state.currentView = view;
        
        if (pushHistory) {
            history.pushState({ view: view }, '', `#${view}`);
        }
        
        AppNavigation.applyLayout();
    },

    applyLayout: () => {
        const sidebar = document.getElementById('tg-sidebar');
        const chatSection = document.querySelector('.tg-main');
        const profileSidebar = document.getElementById('right-sidebar');

        if (!sidebar || !chatSection) return;

        if (AppNavigation.state.isMobile) {
            // منطق الموبايل: شاشة واحدة تظهر في كل مرة
            if (AppNavigation.state.currentView === 'sidebar') {
                sidebar.style.display = 'flex';
                sidebar.style.transform = 'translateX(0)';
                chatSection.style.display = 'none';
                if (profileSidebar) profileSidebar.classList.add('hidden');
            } else if (AppNavigation.state.currentView === 'chat') {
                sidebar.style.transform = 'translateX(100%)'; // إزاحة لليمين
                setTimeout(() => sidebar.style.display = 'none', 300);
                chatSection.style.display = 'flex';
                if (profileSidebar) profileSidebar.classList.add('hidden');
            } else if (AppNavigation.state.currentView === 'profile') {
                chatSection.style.display = 'none';
                if (profileSidebar) {
                    profileSidebar.classList.remove('hidden');
                    profileSidebar.style.display = 'flex';
                }
            }
        } else {
            // منطق الديسكتوب: 2 أو 3 أعمدة
            sidebar.style.display = 'flex';
            sidebar.style.transform = 'translateX(0)';
            chatSection.style.display = 'flex';
            
            if (AppNavigation.state.currentView === 'profile') {
                if (profileSidebar) profileSidebar.classList.remove('hidden');
            } else {
                if (profileSidebar) profileSidebar.classList.add('hidden');
            }
        }
    }
};

// ==========================================
// 3. Dialog List Renderer (رسم القائمة الجانبية)
// ==========================================
const SidebarRenderer = {
    renderContacts: (contacts, activeRoomId) => {
        const container = document.getElementById('contacts-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        // ترتيب تنازلي بناءً على وقت آخر رسالة (زي تيليجرام بالظبط)
        const sortedContacts = contacts.sort((a,b) => new Date(b.time) - new Date(a.time));

        sortedContacts.forEach(contact => {
            const isActive = contact.id === activeRoomId ? 'active' : '';
            const isGroup = contact.type === 'group';
            
            // تحديد الحرف الأول واللون الزجاجي
            const iconText = isGroup ? '<i class="fa-solid fa-users"></i>' : PeerColors.getAvatarInitials(contact.name);
            const bgColor = isGroup ? 'linear-gradient(135deg, rgba(52, 199, 89, 0.4), rgba(48, 209, 88, 0.4))' : PeerColors.getColorForId(contact.id);
            
            // تأثيرات زجاجية للأيقونة
            const avatarStyle = `
                background: ${bgColor}; 
                backdrop-filter: blur(10px); 
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.1);
            `;

            const html = `
                <div class="tg-contact-item ${isActive}" onclick="handleDialogClick('${contact.id}')">
                    <div class="tg-avatar" style="${avatarStyle}">${iconText}</div>
                    <div class="tg-contact-info">
                        <div class="tg-contact-name">
                            <span>${contact.name}</span>
                            <span class="tg-contact-time">${new Date(contact.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div class="tg-contact-lastmsg">${contact.lastMessage}</div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    }
};

// ربط الضغطة على أي محادثة بفتحها وتغيير الـ URL
window.handleDialogClick = (roomId) => {
    if (window.ChatEngine && window.chatState) {
        window.ChatEngine.switchRoom(roomId);
        AppNavigation.switchTo('chat'); // انتقال ناعم للشات على الموبايل
    }
};

// الرجوع للقائمة من الموبايل
window.goBackToSidebar = () => {
    AppNavigation.switchTo('sidebar');
};

// التشغيل الأولي
document.addEventListener('DOMContentLoaded', () => {
    AppNavigation.init();
});
