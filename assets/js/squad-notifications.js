import { supabase } from "./supabaseClient.js";

document.addEventListener('DOMContentLoaded', async () => {
    initSquadNotifications();
});

async function initSquadNotifications() {
    // 1. Get User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 2. Check Squad
    const { data: records } = await supabase
        .from('squad_members')
        .select('squad_id')
        .eq('profile_id', user.id)
        .limit(1);

    const membership = records && records.length > 0 ? records[0] : null;


    if (!membership) return;

    const squadId = membership.squad_id;

    // 3. Listen for Squad Events
    supabase.channel('squad_global_events')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'squad_chat_messages',
            filter: `squad_id=eq.${squadId}`
        }, payload => {
            const isSquadPage = window.location.href.includes('squad.html');
            if (payload.new.sender_id !== user.id && !isSquadPage) {
                // Show Red Badge
                toggleSquadBadge(true);
                // Optional: Play a subtle sound?
            }
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'squad_pomodoro',
            filter: `squad_id=eq.${squadId}`
        }, payload => {
            if (payload.new && payload.new.status === 'running' && payload.new.started_by !== user.id) {
                showSquadAlert('مذاكرة جماعية! 🔥', 'واحد من شلتك بدأ يذاكر دلوقتي.. انضم ليه؟', 'squad.html');
                toggleSquadBadge(true);
            }
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'squad_exam_sessions',
            filter: `squad_id=eq.${squadId}`
        }, payload => {
            if (payload.new.status === 'active') {
                showSquadAlert('تحدي امتحان! 📝', 'شلتك بدأت امتحان جماعي.. ادخل حل معاهم!', 'squad.html');
                toggleSquadBadge(true);
            }
        })
        .subscribe();

    // Clear badge if on squad page
    if (window.location.href.includes('squad.html')) {
        toggleSquadBadge(false);
    }
}

function toggleSquadBadge(show) {
    // Finds the squad link directly by ID (added to all pages)
    const squadLink = document.getElementById('navLinkSquad');

    if (!squadLink) return;

    if (show) {
        // Check if badge exists
        let badge = squadLink.querySelector('.squad-badge-dot');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'squad-badge-dot';
            squadLink.style.position = 'relative'; // Ensure relative positioning
            squadLink.appendChild(badge);
        }
        badge.style.display = 'block';
        localStorage.setItem('has_unread_squad_msg', 'true');
    } else {
        const badge = squadLink.querySelector('.squad-badge-dot');
        if (badge) badge.style.display = 'none';
        localStorage.removeItem('has_unread_squad_msg');
    }
}

// Check saved state on load
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('has_unread_squad_msg') === 'true' && !window.location.href.includes('squad.html')) {
        toggleSquadBadge(true);
    }
});

function showSquadAlert(title, text, link) {
    Swal.fire({
        title: title,
        text: text,
        icon: 'info',
        toast: true,
        position: 'top-end',
        showConfirmButton: true,
        confirmButtonText: 'ذهاب',
        timer: 10000,
        timerProgressBar: true
    }).then((result) => {
        if (result.isConfirmed) {
            window.location.href = link;
        }
    });
}
