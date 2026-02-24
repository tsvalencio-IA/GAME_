/* =================================================================
   PAINEL DE ADMINISTRAÇÃO E GESTÃO DE USUÁRIOS
   STATUS: CONTROLO INDIVIDUAL DE PERMISSÕES PARA JOGOS
   ================================================================= */

window.Admin = {
    init: function() {
        window.Sfx.click();
        document.getElementById('menu-screen').classList.add('hidden');
        document.getElementById('admin-screen').classList.remove('hidden');
        this.loadUsers();
    },

    loadUsers: function() {
        // Busca todos os utilizadores em tempo real na base de dados
        window.DB.ref('users').on('value', snap => {
            const users = snap.val() || {};
            this.renderUsers(users);
        });
    },

    renderUsers: function(users) {
        const grid = document.getElementById('admin-user-list');
        grid.innerHTML = ''; // Limpa a lista
        
        // Pega na lista de jogos registados no console
        const availableGames = window.Games || [];

        for (let uid in users) {
            const u = users[uid];
            // Se for o admin, não há necessidade de lhe cortar as permissões
            if (u.role === 'admin') continue;

            const card = document.createElement('div');
            card.className = 'admin-user-card';

            let togglesHTML = '';
            availableGames.forEach(game => {
                const hasAccess = u.permissions && u.permissions[game.id] === true;
                const activeClass = hasAccess ? 'active' : '';
                const btnText = hasAccess ? `${game.icon} ${game.title}` : `🚫 ${game.title}`;
                
                // Botão que chama a função para inverter o estado na base de dados
                togglesHTML += `
                    <button class="admin-toggle-btn ${activeClass}" 
                            onclick="window.Admin.togglePermission('${uid}', '${game.id}', ${hasAccess})">
                        ${btnText}
                    </button>
                `;
            });

            card.innerHTML = `
                <div class="admin-user-header">
                    <div class="admin-user-name">${u.username}</div>
                    <div class="admin-user-stats">LVL ${u.level} | 🪙 ${u.coins}</div>
                </div>
                <div class="admin-toggles">
                    ${togglesHTML}
                </div>
            `;

            grid.appendChild(card);
        }
    },

    togglePermission: function(uid, gameId, currentState) {
        window.Sfx.click();
        // Atualiza diretamente no Firebase. A alteração vai propagar e acionar o "loadUsers" novamente
        window.DB.ref(`users/${uid}/permissions/${gameId}`).set(!currentState);
    }
};