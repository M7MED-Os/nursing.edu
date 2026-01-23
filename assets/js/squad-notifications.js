import { supabase } from "./supabaseClient.js";

// Main Entry Point
document.addEventListener('DOMContentLoaded', async () => {
    const isSquadPage = window.location.href.includes('squad.html');

    // 1. Immediate Cleanup if on Squad Page
    if (isSquadPage) {
        toggleSquadBadge(false);
    } else {
        // 2. Restore state if elsewhere
        if (localStorage.getItem('has_unread_squad_msg') === 'true') {
            toggleSquadBadge(true);
        }
    }

    initSquadNotifications();
});

async function initSquadNotifications() {
    // 1. Auth & Squad Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: records } = await supabase
        .from('squad_members')
        .select('squad_id')
        .eq('profile_id', user.id)
        .limit(1);

    if (!records || records.length === 0) return;
    const squadId = records[0].squad_id;

    // 2. Listen for Events
    supabase.channel('squad_global_events')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'squad_chat_messages',
            filter: `squad_id=eq.${squadId}`
        }, payload => {
            // Check Page status dynamically at moment of event
            const onSquadPage = window.location.href.includes('squad.html');

            // Only show badge if NOT sender AND NOT on squad page
            if (payload.new.sender_id !== user.id && !onSquadPage) {
                toggleSquadBadge(true);
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
                // Pomodoro is important, show badge too if not on page
                if (!window.location.href.includes('squad.html')) toggleSquadBadge(true);
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
                if (!window.location.href.includes('squad.html')) toggleSquadBadge(true);
            }
        })
        .subscribe();
}

function toggleSquadBadge(show) {
    const squadLink = document.getElementById('navLinkSquad');
    if (!squadLink) return;

    let badge = squadLink.querySelector('.squad-badge-dot');

    if (show) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'squad-badge-dot';
            squadLink.style.position = 'relative';
            squadLink.appendChild(badge);
        }
        badge.style.display = 'block';
        localStorage.setItem('has_unread_squad_msg', 'true');
    } else {
        if (badge) badge.style.display = 'none';
        localStorage.removeItem('has_unread_squad_msg');
    }
}



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
