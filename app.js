// 初始化 GUN
const gun = Gun({
    peers: ['https://gun-manhattan.herokuapp.com/gun']
});

// 遊戲狀態管理
const game = {
    canvas: null,
    ctx: null,
    players: new Map(),
    spells: [],
    localPlayer: null,
    keys: {},
    gameLoop: null,
    initialized: false,
    blocks: [], // 建築物方塊
    camera: {
        x: 0,
        y: 0
    }
};

// 遊戲常數
const CONSTANTS = {
    GRAVITY: 0.5,
    JUMP_FORCE: -12,
    MOVE_SPEED: 5,
    PLAYER_WIDTH: 40,
    PLAYER_HEIGHT: 60,
    SPELL_RANGE: 300,
    SPELL_SPEED: 10,
    SPELL_SIZE: 20,
    SPELL_DAMAGE: {
        FIREBALL: 30,
        ICE: 20,
        LIGHTNING: 25
    },
    KNOCKBACK_FORCE: 25,
    MAX_HEALTH: 100,
    RESPAWN_TIME: 3000,
    BLOCK_SIZE: 40,
    DISCONNECT_TIMEOUT: 5000,
    MAP_WIDTH: 2400,  // 增大地圖寬度
    MAP_HEIGHT: 1200  // 增大地圖高度
};

// 初始化遊戲
function initGame() {
    game.canvas = document.getElementById('gameCanvas');
    game.ctx = game.canvas.getContext('2d');
    
    // 設置畫布大小
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 監聽鍵盤輸入
    document.addEventListener('keydown', e => game.keys[e.key.toLowerCase()] = true);
    document.addEventListener('keyup', e => game.keys[e.key.toLowerCase()] = false);

    // 監聽滑鼠事件
    game.canvas.addEventListener('mousedown', () => game.mouseDown = true);
    game.canvas.addEventListener('mouseup', () => game.mouseDown = false);
    game.canvas.addEventListener('mouseleave', () => game.mouseDown = false);

    // 設置開始遊戲按鈕
    document.getElementById('startGame').addEventListener('click', startGame);

    // 初始化一些建築物方塊
    initializeBlocks();

    // 在關閉頁面時清除玩家資料
    window.addEventListener('beforeunload', () => {
        if (game.localPlayer) {
            gun.get('mmorpg').get('players').get(game.localPlayer.id).put(null);
        }
    });
}

// 調整畫布大小
function resizeCanvas() {
    const container = game.canvas.parentElement;
    game.canvas.width = container.clientWidth;
    game.canvas.height = container.clientHeight;
}

// 初始化建築物方塊
function initializeBlocks() {
    // 創建多個平台
    const platforms = [
        // 左側區域
        { x: 100, y: CONSTANTS.MAP_HEIGHT - 100, width: 300, height: 40 },
        { x: 50, y: CONSTANTS.MAP_HEIGHT - 250, width: 200, height: 40 },
        { x: 300, y: CONSTANTS.MAP_HEIGHT - 400, width: 250, height: 40 },
        
        // 中間區域
        { x: CONSTANTS.MAP_WIDTH/2 - 400, y: CONSTANTS.MAP_HEIGHT - 150, width: 800, height: 40 },
        { x: CONSTANTS.MAP_WIDTH/2 - 200, y: CONSTANTS.MAP_HEIGHT - 300, width: 400, height: 40 },
        { x: CONSTANTS.MAP_WIDTH/2 - 100, y: CONSTANTS.MAP_HEIGHT - 450, width: 200, height: 40 },
        
        // 右側區域
        { x: CONSTANTS.MAP_WIDTH - 400, y: CONSTANTS.MAP_HEIGHT - 100, width: 300, height: 40 },
        { x: CONSTANTS.MAP_WIDTH - 250, y: CONSTANTS.MAP_HEIGHT - 250, width: 200, height: 40 },
        { x: CONSTANTS.MAP_WIDTH - 550, y: CONSTANTS.MAP_HEIGHT - 400, width: 250, height: 40 },
        
        // 懸空平台
        { x: 600, y: CONSTANTS.MAP_HEIGHT - 600, width: 150, height: 40 },
        { x: CONSTANTS.MAP_WIDTH - 750, y: CONSTANTS.MAP_HEIGHT - 600, width: 150, height: 40 },
        { x: CONSTANTS.MAP_WIDTH/2 - 75, y: CONSTANTS.MAP_HEIGHT - 700, width: 150, height: 40 }
    ];

    game.blocks = platforms;
}

// 檢查方塊碰撞
function checkBlockCollision(player) {
    for (const block of game.blocks) {
        if (player.x < block.x + block.width &&
            player.x + CONSTANTS.PLAYER_WIDTH > block.x &&
            player.y < block.y + block.height &&
            player.y + CONSTANTS.PLAYER_HEIGHT > block.y) {

            // 從上方碰撞
            if (player.velocityY > 0 && 
                player.y + CONSTANTS.PLAYER_HEIGHT - player.velocityY <= block.y) {
                player.y = block.y - CONSTANTS.PLAYER_HEIGHT;
                player.velocityY = 0;
                player.onGround = true;
                return;
            }

            // 從下方碰撞
            if (player.velocityY < 0 && 
                player.y - player.velocityY >= block.y + block.height) {
                player.y = block.y + block.height;
                player.velocityY = 0;
                return;
            }

            // 從左側碰撞
            if (player.velocityX > 0 && 
                player.x + CONSTANTS.PLAYER_WIDTH - player.velocityX <= block.x) {
                player.x = block.x - CONSTANTS.PLAYER_WIDTH;
                player.velocityX = 0;
                return;
            }

            // 從右側碰撞
            if (player.velocityX < 0 && 
                player.x - player.velocityX >= block.x + block.width) {
                player.x = block.x + block.width;
                player.velocityX = 0;
                return;
            }
        }
    }
}

// 發送心跳
function sendHeartbeat() {
    if (game.localPlayer) {
        gun.get('mmorpg').get('players').get(game.localPlayer.id).get('lastPing').put(Date.now());
    }
}

// 檢查斷線玩家
function checkDisconnectedPlayers() {
    const now = Date.now();
    for (let [id, player] of game.players) {
        if (id !== game.localPlayer.id) {
            gun.get('mmorpg').get('players').get(id).get('lastPing').once((lastPing) => {
                if (lastPing && now - lastPing > CONSTANTS.DISCONNECT_TIMEOUT) {
                    game.players.delete(id);
                    gun.get('mmorpg').get('players').get(id).put(null);
                }
            });
        }
    }
}

// 玩家類別
class Player {
    constructor(id, name, x, y) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.velocityX = 0;
        this.velocityY = 0;
        this.onGround = false;
        this.health = CONSTANTS.MAX_HEALTH;
        this.lastAttackTime = 0;
        this.facingRight = true;
        this.isAttacking = false;
        this.isDead = false;
        this.respawnTimer = null;
    }

    update() {
        if (this.isDead) return;

        // 重力
        this.velocityY += CONSTANTS.GRAVITY;
        
        // 移動 (使用 WASD)
        if (game.keys['a']) {
            this.velocityX = -CONSTANTS.MOVE_SPEED;
            this.facingRight = false;
        }
        else if (game.keys['d']) {
            this.velocityX = CONSTANTS.MOVE_SPEED;
            this.facingRight = true;
        }
        else {
            // 逐漸減緩移動速度（摩擦力）
            this.velocityX *= 0.8;
        }

        // 跳躍 (使用 w 或空白鍵)
        if ((game.keys['w'] || game.keys[' ']) && this.onGround) {
            this.velocityY = CONSTANTS.JUMP_FORCE;
            this.onGround = false;
        }

        // 攻擊 (滑鼠左鍵)
        if (game.mouseDown && Date.now() - this.lastAttackTime > 500) {
            this.attack();
        }

        // 更新位置
        this.x += this.velocityX;
        this.y += this.velocityY;

        // 檢查與方塊的碰撞
        checkBlockCollision(this);

        // 基本碰撞檢測（地面）
        if (this.y + CONSTANTS.PLAYER_HEIGHT > game.canvas.height) {
            this.y = game.canvas.height - CONSTANTS.PLAYER_HEIGHT;
            this.velocityY = 0;
            this.onGround = true;
        }

        // 限制在畫面內
        this.x = Math.max(0, Math.min(this.x, game.canvas.width - CONSTANTS.PLAYER_WIDTH));
    }

    attack() {
        if (this.isDead) return;
        
        this.lastAttackTime = Date.now();
        this.isAttacking = true;

        // 獲取滑鼠位置（相對於畫布）
        const rect = game.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // 選擇隨機法術
        const spellTypes = ['FIREBALL', 'ICE', 'LIGHTNING'];
        const randomSpell = spellTypes[Math.floor(Math.random() * spellTypes.length)];

        // 創建法術
        const spell = new Spell(
            randomSpell,
            this.x + CONSTANTS.PLAYER_WIDTH / 2,
            this.y + CONSTANTS.PLAYER_HEIGHT / 2,
            mouseX,
            mouseY,
            this
        );

        // 添加到遊戲中的法術列表
        game.spells.push(spell);

        setTimeout(() => {
            this.isAttacking = false;
        }, 200);
    }

    handlePlayerDeath(player) {
        player.isDead = true;
        gun.get('mmorpg').get('players').get(player.id).get('isDead').put(true);
        
        // 設置重生計時器
        setTimeout(() => {
            if (player.id === game.localPlayer.id) {
                this.respawn();
            }
        }, CONSTANTS.RESPAWN_TIME);
    }

    respawn() {
        this.health = CONSTANTS.MAX_HEALTH;
        this.isDead = false;
        this.x = Math.random() * (game.canvas.width - CONSTANTS.PLAYER_WIDTH);
        this.y = 0;
        this.velocityX = 0;
        this.velocityY = 0;

        // 同步重生狀態
        const playerData = {
            health: this.health,
            isDead: false,
            x: this.x,
            y: this.y
        };
        gun.get('mmorpg').get('players').get(this.id).put(playerData);
    }

    checkCollision(target, attackBox) {
        return !(attackBox.x > target.x + CONSTANTS.PLAYER_WIDTH ||
                attackBox.x + attackBox.width < target.x ||
                attackBox.y > target.y + CONSTANTS.PLAYER_HEIGHT ||
                attackBox.y + attackBox.height < target.y);
    }

    applyKnockback(knockback) {
        if (this.isDead) return;
        this.velocityX = knockback.x;
        this.velocityY = knockback.y;
    }

    draw(ctx) {
        if (this.isDead) {
            // 死亡時顯示灰色
            ctx.fillStyle = '#666666';
        } else {
            ctx.fillStyle = this.id === game.localPlayer.id ? '#27ae60' : '#e74c3c';
        }
        
        ctx.fillRect(this.x, this.y, CONSTANTS.PLAYER_WIDTH, CONSTANTS.PLAYER_HEIGHT);
        
        // 只有活著的玩家才顯示血條
        if (!this.isDead) {
            // 繪製血條
            const healthBarWidth = CONSTANTS.PLAYER_WIDTH;
            const healthBarHeight = 5;
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(this.x, this.y - 10, healthBarWidth, healthBarHeight);
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(this.x, this.y - 10, (this.health / CONSTANTS.MAX_HEALTH) * healthBarWidth, healthBarHeight);

            // 繪製攻擊範圍（debug用）
            if (this.isAttacking) {
                ctx.strokeStyle = 'yellow';
                ctx.lineWidth = 2;
                if (this.facingRight) {
                    ctx.strokeRect(this.x + CONSTANTS.PLAYER_WIDTH, this.y, 
                        CONSTANTS.ATTACK_RANGE, CONSTANTS.PLAYER_HEIGHT);
                } else {
                    ctx.strokeRect(this.x - CONSTANTS.ATTACK_RANGE, this.y, 
                        CONSTANTS.ATTACK_RANGE, CONSTANTS.PLAYER_HEIGHT);
                }
            }
        }
        
        // 繪製玩家名稱和狀態
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        const displayName = this.isDead ? `${this.name} (死亡中...)` : this.name;
        ctx.fillText(displayName, this.x + CONSTANTS.PLAYER_WIDTH/2, this.y - 15);
    }
}

// 法術類別
class Spell {
    constructor(type, x, y, targetX, targetY, caster) {
        this.type = type;
        this.x = x;
        this.y = y;
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.vx = (dx / dist) * CONSTANTS.SPELL_SPEED;
        this.vy = (dy / dist) * CONSTANTS.SPELL_SPEED;
        this.caster = caster;
        this.traveled = 0;
        this.maxRange = CONSTANTS.SPELL_RANGE;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.traveled += Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        return this.traveled < this.maxRange;
    }

    draw(ctx) {
        ctx.beginPath();
        switch(this.type) {
            case 'FIREBALL':
                ctx.fillStyle = '#ff4400';
                break;
            case 'ICE':
                ctx.fillStyle = '#00ffff';
                break;
            case 'LIGHTNING':
                ctx.fillStyle = '#ffff00';
                break;
        }
        ctx.arc(this.x, this.y, CONSTANTS.SPELL_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    checkHit(player) {
        if (player.id === this.caster.id || player.isDead) return false;
        
        const dx = this.x - (player.x + CONSTANTS.PLAYER_WIDTH / 2);
        const dy = this.y - (player.y + CONSTANTS.PLAYER_HEIGHT / 2);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance < CONSTANTS.SPELL_SIZE + Math.max(CONSTANTS.PLAYER_WIDTH, CONSTANTS.PLAYER_HEIGHT) / 2;
    }
}

// 開始遊戲
function startGame() {
    const playerName = document.getElementById('playerName').value || '玩家' + Math.floor(Math.random() * 1000);
    const playerId = Math.random().toString(36).substr(2, 9);

    game.localPlayer = new Player(playerId, playerName, 
        game.canvas.width / 2, 
        game.canvas.height - CONSTANTS.PLAYER_HEIGHT
    );
    game.players.set(playerId, game.localPlayer);

    // 同步玩家資料到 GUN
    const players = gun.get('mmorpg').get('players');
    players.get(playerId).put({
        id: playerId,
        name: playerName,
        x: game.localPlayer.x,
        y: game.localPlayer.y,
        active: true  // 新增活躍狀態標記
    });

    // 監聽玩家資料變化
    players.map().on((data, id) => {
        if (id === playerId) return;
        
        // 檢查玩家是否被踢除或斷線
        if (!data || data === null) {
            game.players.delete(id);
            return;
        }

        // 更新或新增玩家
        if (!game.players.has(id) && data.active) {
            game.players.set(id, new Player(id, data.name, data.x, data.y));
        } else if (game.players.has(id)) {
            const player = game.players.get(id);
            if (data.x !== undefined) player.x = data.x;
            if (data.y !== undefined) player.y = data.y;
            if (data.health !== undefined) player.health = data.health;
            if (data.isDead !== undefined) player.isDead = data.isDead;
            if (data.knockback) {
                player.applyKnockback(data.knockback);
                gun.get('mmorpg').get('players').get(id).get('knockback').put(null);
            }
        }
    });

    if (!game.initialized) {
        game.initialized = true;
        gameLoop();
    }

    document.getElementById('startGame').style.display = 'none';
}

// 遊戲主循環
function gameLoop() {
    // 清空畫面
    game.ctx.clearRect(0, 0, game.canvas.width, game.canvas.height);

    // 更新相機位置
    updateCamera();

    // 保存畫布狀態
    game.ctx.save();
    
    // 應用相機偏移
    game.ctx.translate(-game.camera.x, -game.camera.y);

    // 繪製建築物方塊
    game.ctx.fillStyle = '#8b4513';
    for (const block of game.blocks) {
        game.ctx.fillRect(block.x, block.y, block.width, block.height);
    }

    // 更新和繪製法術
    game.spells = game.spells.filter(spell => {
        if (spell.update()) {
            spell.draw(game.ctx);
            // 檢查法術碰撞
            for (let player of game.players.values()) {
                if (spell.checkHit(player)) {
                    handleSpellHit(spell, player);
                    return false;
                }
            }
            return true;
        }
        return false;
    });

    // 更新和繪製所有玩家
    for (let player of game.players.values()) {
        if (player.id === game.localPlayer.id) {
            player.update();
            // 同步位置到 GUN
            const playerData = {
                x: player.x,
                y: player.y,
                lastPing: Date.now()
            };
            gun.get('mmorpg').get('players').get(player.id).put(playerData);
        }
        player.draw(game.ctx);
    }

    // 恢復畫布狀態
    game.ctx.restore();

    // 更新在線玩家列表
    updatePlayersList();

    requestAnimationFrame(gameLoop);
}

// 處理法術命中
function handleSpellHit(spell, target) {
    const damage = CONSTANTS.SPELL_DAMAGE[spell.type];
    const newHealth = target.health - damage;
    
    // 計算擊退方向
    const knockbackDirection = {
        x: spell.vx * CONSTANTS.KNOCKBACK_FORCE / CONSTANTS.SPELL_SPEED,
        y: spell.vy * CONSTANTS.KNOCKBACK_FORCE / CONSTANTS.SPELL_SPEED
    };

    // 同步傷害和擊退
    gun.get('mmorpg').get('players').get(target.id).get('health').put(newHealth);
    gun.get('mmorpg').get('players').get(target.id).get('knockback').put(knockbackDirection);

    if (newHealth <= 0) {
        spell.caster.handlePlayerDeath(target);
    }
}

// 更新在線玩家列表
function updatePlayersList() {
    const list = document.getElementById('players-online');
    list.innerHTML = '<h3>在線玩家:</h3>' + 
        Array.from(game.players.values())
            .map(p => `
                <div class="player-item">
                    <span>${p.name} ${p.isDead ? '(死亡中...)' : ''}</span>
                    ${p.id !== game.localPlayer.id ? 
                        `<button onclick="kickPlayer('${p.id}')" class="kick-button">踢除</button>` : 
                        ''}
                </div>
            `)
            .join('');
}

// 踢除玩家
function kickPlayer(playerId) {
    if (confirm('確定要踢除這個玩家嗎？')) {
        gun.get('mmorpg').get('players').get(playerId).put(null);
        game.players.delete(playerId);
    }
}

// 更新相機位置
function updateCamera() {
    if (!game.localPlayer) return;
    
    // 相機跟隨本地玩家，保持玩家在畫面中央
    game.camera.x = game.localPlayer.x - game.canvas.width / 2 + CONSTANTS.PLAYER_WIDTH / 2;
    game.camera.y = game.localPlayer.y - game.canvas.height / 2 + CONSTANTS.PLAYER_HEIGHT / 2;
    
    // 限制相機不要超出地圖範圍
    game.camera.x = Math.max(0, Math.min(game.camera.x, CONSTANTS.MAP_WIDTH - game.canvas.width));
    game.camera.y = Math.max(0, Math.min(game.camera.y, CONSTANTS.MAP_HEIGHT - game.canvas.height));
}

// 初始化遊戲
initGame();