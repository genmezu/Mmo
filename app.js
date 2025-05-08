// 遊戲設定
const CONFIG = {
    WORLD: {
        WIDTH: 2400,
        HEIGHT: 1200,
        GRAVITY: 0.5
    },
    PLAYER: {
        WIDTH: 40,
        HEIGHT: 60,
        SPEED: 6,
        JUMP_FORCE: -12,
        MAX_HEALTH: 100
    },
    SPELL: {
        TYPES: ['FIRE', 'ICE', 'LIGHTNING'],
        COLORS: {
            FIRE: '#ff4400',
            ICE: '#00ffff',
            LIGHTNING: '#ffff00'
        },
        DAMAGE: {
            FIRE: 30,
            ICE: 20,
            LIGHTNING: 25
        },
        SIZE: 20,
        SPEED: 10,
        RANGE: 300,
        KNOCKBACK: 15
    }
};

// GUN 資料庫初始化
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);
const players = gun.get('mmorpg-players');

// 遊戲狀態
const game = {
    canvas: null,
    ctx: null,
    camera: { x: 0, y: 0 },
    keys: {},
    mousePos: { x: 0, y: 0 },
    localPlayer: null,
    players: new Map(),
    spells: [],
    platforms: [],
    initialized: false
};

// 平台設定
const PLATFORMS = [
    { x: 100, y: CONFIG.WORLD.HEIGHT - 100, w: 300, h: 40 },
    { x: CONFIG.WORLD.WIDTH/2 - 400, y: CONFIG.WORLD.HEIGHT - 200, w: 800, h: 40 },
    { x: CONFIG.WORLD.WIDTH - 400, y: CONFIG.WORLD.HEIGHT - 100, w: 300, h: 40 },
    { x: 300, y: CONFIG.WORLD.HEIGHT - 400, w: 200, h: 40 },
    { x: CONFIG.WORLD.WIDTH/2 - 100, y: CONFIG.WORLD.HEIGHT - 600, w: 200, h: 40 },
    { x: CONFIG.WORLD.WIDTH - 500, y: CONFIG.WORLD.HEIGHT - 400, w: 200, h: 40 }
];

// 玩家類別
class Player {
    constructor(id, name, x, y) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.health = CONFIG.PLAYER.MAX_HEALTH;
        this.facingRight = true;
        this.onGround = false;
        this.isDead = false;
        this.lastSpell = 0;
    }

    update() {
        if (this.isDead) return;

        // 重力
        this.vy += CONFIG.WORLD.GRAVITY;

        // 移動控制
        if (game.keys['a']) {
            this.vx = -CONFIG.PLAYER.SPEED;
            this.facingRight = false;
        } else if (game.keys['d']) {
            this.vx = CONFIG.PLAYER.SPEED;
            this.facingRight = true;
        } else {
            this.vx *= 0.8;
        }

        // 跳躍
        if ((game.keys['w'] || game.keys[' ']) && this.onGround) {
            this.vy = CONFIG.PLAYER.JUMP_FORCE;
            this.onGround = false;
        }

        // 更新位置
        this.x += this.vx;
        this.y += this.vy;

        // 碰撞檢測
        this.checkCollisions();

        // 邊界檢查
        this.x = Math.max(0, Math.min(this.x, CONFIG.WORLD.WIDTH - CONFIG.PLAYER.WIDTH));
        if (this.y > CONFIG.WORLD.HEIGHT - CONFIG.PLAYER.HEIGHT) {
            this.y = CONFIG.WORLD.HEIGHT - CONFIG.PLAYER.HEIGHT;
            this.vy = 0;
            this.onGround = true;
        }
    }

    checkCollisions() {
        this.onGround = false;
        for (const platform of game.platforms) {
            if (this.x < platform.x + platform.w &&
                this.x + CONFIG.PLAYER.WIDTH > platform.x &&
                this.y < platform.y + platform.h &&
                this.y + CONFIG.PLAYER.HEIGHT > platform.y) {

                // 從上方碰撞
                if (this.vy > 0 && this.y + CONFIG.PLAYER.HEIGHT - this.vy <= platform.y) {
                    this.y = platform.y - CONFIG.PLAYER.HEIGHT;
                    this.vy = 0;
                    this.onGround = true;
                }
                // 從下方碰撞
                else if (this.vy < 0 && this.y - this.vy >= platform.y + platform.h) {
                    this.y = platform.y + platform.h;
                    this.vy = 0;
                }
                // 從左側碰撞
                else if (this.vx > 0 && this.x + CONFIG.PLAYER.WIDTH - this.vx <= platform.x) {
                    this.x = platform.x - CONFIG.PLAYER.WIDTH;
                    this.vx = 0;
                }
                // 從右側碰撞
                else if (this.vx < 0 && this.x - this.vx >= platform.x + platform.w) {
                    this.x = platform.x + platform.w;
                    this.vx = 0;
                }
            }
        }
    }

    castSpell(targetX, targetY) {
        if (this.isDead || Date.now() - this.lastSpell < 500) return;
        
        this.lastSpell = Date.now();
        const spellType = CONFIG.SPELL.TYPES[Math.floor(Math.random() * CONFIG.SPELL.TYPES.length)];
        
        const spell = new Spell(
            spellType,
            this.x + CONFIG.PLAYER.WIDTH/2,
            this.y + CONFIG.PLAYER.HEIGHT/2,
            targetX,
            targetY,
            this
        );
        
        game.spells.push(spell);
    }

    takeDamage(amount, knockbackX, knockbackY) {
        if (this.isDead) return;
        
        this.health = Math.max(0, this.health - amount);
        this.vx += knockbackX;
        this.vy += knockbackY;

        if (this.health <= 0) {
            this.die();
        }

        // 更新血條
        if (this === game.localPlayer) {
            document.querySelector('.bar-fill').style.width = `${this.health}%`;
        }
    }

    die() {
        this.isDead = true;
        setTimeout(() => this.respawn(), 3000);
    }

    respawn() {
        this.health = CONFIG.PLAYER.MAX_HEALTH;
        this.isDead = false;
        this.x = Math.random() * (CONFIG.WORLD.WIDTH - CONFIG.PLAYER.WIDTH);
        this.y = 0;
        this.vx = 0;
        this.vy = 0;

        if (this === game.localPlayer) {
            document.querySelector('.bar-fill').style.width = '100%';
            players.get(this.id).put({
                x: this.x,
                y: this.y,
                health: this.health,
                isDead: false
            });
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.isDead ? '#666666' : (this === game.localPlayer ? '#27ae60' : '#e74c3c');
        ctx.fillRect(this.x, this.y, CONFIG.PLAYER.WIDTH, CONFIG.PLAYER.HEIGHT);

        // 名字
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, this.x + CONFIG.PLAYER.WIDTH/2, this.y - 10);

        // 血條
        if (!this.isDead) {
            const barWidth = CONFIG.PLAYER.WIDTH;
            const barHeight = 4;
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(this.x, this.y - 8, barWidth, barHeight);
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(this.x, this.y - 8, (this.health / CONFIG.PLAYER.MAX_HEALTH) * barWidth, barHeight);
        }
    }
}

// 法術類別
class Spell {
    constructor(type, x, y, targetX, targetY, caster) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.caster = caster;

        const angle = Math.atan2(targetY - y, targetX - x);
        this.vx = Math.cos(angle) * CONFIG.SPELL.SPEED;
        this.vy = Math.sin(angle) * CONFIG.SPELL.SPEED;

        this.traveled = 0;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        const distance = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        this.traveled += distance;

        // 檢查碰撞
        for (const [_, player] of game.players) {
            if (player !== this.caster && !player.isDead && this.checkHit(player)) {
                this.hit(player);
                return false;
            }
        }

        // 檢查平台碰撞
        for (const platform of game.platforms) {
            if (this.x >= platform.x && this.x <= platform.x + platform.w &&
                this.y >= platform.y && this.y <= platform.y + platform.h) {
                return false;
            }
        }

        return this.traveled < CONFIG.SPELL.RANGE;
    }

    checkHit(player) {
        const dx = this.x - (player.x + CONFIG.PLAYER.WIDTH/2);
        const dy = this.y - (player.y + CONFIG.PLAYER.HEIGHT/2);
        return Math.sqrt(dx * dx + dy * dy) < CONFIG.SPELL.SIZE + Math.max(CONFIG.PLAYER.WIDTH, CONFIG.PLAYER.HEIGHT)/2;
    }

    hit(player) {
        const damage = CONFIG.SPELL.DAMAGE[this.type];
        const knockback = CONFIG.SPELL.KNOCKBACK;
        const knockbackX = this.vx / CONFIG.SPELL.SPEED * knockback;
        const knockbackY = this.vy / CONFIG.SPELL.SPEED * knockback;

        player.takeDamage(damage, knockbackX, knockbackY);

        if (player !== game.localPlayer) {
            players.get(player.id).put({
                health: player.health,
                isDead: player.isDead,
                x: player.x,
                y: player.y
            });
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.fillStyle = CONFIG.SPELL.COLORS[this.type];
        ctx.arc(this.x, this.y, CONFIG.SPELL.SIZE/2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 遊戲初始化
function initGame() {
    // 設置畫布
    game.canvas = document.getElementById('gameCanvas');
    game.ctx = game.canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 設置平台
    game.platforms = PLATFORMS;

    // 事件監聽
    document.addEventListener('keydown', e => game.keys[e.key.toLowerCase()] = true);
    document.addEventListener('keyup', e => game.keys[e.key.toLowerCase()] = false);
    game.canvas.addEventListener('mousemove', handleMouseMove);
    game.canvas.addEventListener('mousedown', handleMouseClick);

    // 開始按鈕
    document.getElementById('startBtn').addEventListener('click', startGame);
}

// 處理滑鼠移動
function handleMouseMove(e) {
    const rect = game.canvas.getBoundingClientRect();
    game.mousePos.x = e.clientX - rect.left + game.camera.x;
    game.mousePos.y = e.clientY - rect.top + game.camera.y;
}

// 處理滑鼠點擊
function handleMouseClick() {
    if (game.localPlayer && !game.localPlayer.isDead) {
        game.localPlayer.castSpell(game.mousePos.x, game.mousePos.y);
    }
}

// 調整畫布大小
function resizeCanvas() {
    game.canvas.width = window.innerWidth;
    game.canvas.height = window.innerHeight;
}

// 更新相機位置
function updateCamera() {
    if (!game.localPlayer) return;

    const targetX = game.localPlayer.x - game.canvas.width/2 + CONFIG.PLAYER.WIDTH/2;
    const targetY = game.localPlayer.y - game.canvas.height/2 + CONFIG.PLAYER.HEIGHT/2;

    game.camera.x = Math.max(0, Math.min(targetX, CONFIG.WORLD.WIDTH - game.canvas.width));
    game.camera.y = Math.max(0, Math.min(targetY, CONFIG.WORLD.HEIGHT - game.canvas.height));
}

// 更新玩家列表
function updatePlayerList() {
    const playerList = document.getElementById('players');
    playerList.innerHTML = Array.from(game.players.values())
        .map(p => `
            <div class="player-item">
                <span>${p.name}${p.isDead ? ' (死亡中)' : ''}</span>
                ${p !== game.localPlayer ? 
                    `<button onclick="kickPlayer('${p.id}')">踢除</button>` : 
                    ''}
            </div>
        `).join('');
}

// 踢除玩家
window.kickPlayer = function(playerId) {
    if (confirm('確定要踢除這個玩家？')) {
        players.get(playerId).put(null);
        game.players.delete(playerId);
        updatePlayerList();
    }
};

// 開始遊戲
function startGame() {
    const playerName = document.getElementById('playerName').value.trim() || `玩家${Math.floor(Math.random() * 1000)}`;
    const playerId = Math.random().toString(36).substring(2);

    // 創建本地玩家
    game.localPlayer = new Player(
        playerId,
        playerName,
        CONFIG.WORLD.WIDTH/2,
        0
    );
    game.players.set(playerId, game.localPlayer);

    // 同步到 GUN
    players.get(playerId).put({
        id: playerId,
        name: playerName,
        x: game.localPlayer.x,
        y: game.localPlayer.y,
        health: game.localPlayer.health,
        isDead: false
    });

    // 監聽其他玩家
    players.map().on((data, id) => {
        if (!data) {
            game.players.delete(id);
            updatePlayerList();
            return;
        }

        if (id !== playerId) {
            if (!game.players.has(id)) {
                const newPlayer = new Player(id, data.name, data.x, data.y);
                game.players.set(id, newPlayer);
            }
            const player = game.players.get(id);
            player.x = data.x;
            player.y = data.y;
            player.health = data.health;
            player.isDead = data.isDead;
        }
        updatePlayerList();
    });

    // 切換畫面
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    // 開始遊戲循環
    if (!game.initialized) {
        game.initialized = true;
        gameLoop();
    }
}

// 遊戲主循環
function gameLoop() {
    // 清空畫面
    game.ctx.clearRect(0, 0, game.canvas.width, game.canvas.height);

    // 更新相機
    updateCamera();

    // 保存畫布狀態
    game.ctx.save();
    
    // 應用相機位移
    game.ctx.translate(-game.camera.x, -game.camera.y);

    // 繪製平台
    game.ctx.fillStyle = '#8b4513';
    for (const platform of game.platforms) {
        game.ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    }

    // 更新和繪製法術
    game.spells = game.spells.filter(spell => {
        const active = spell.update();
        if (active) spell.draw(game.ctx);
        return active;
    });

    // 更新和繪製玩家
    for (const player of game.players.values()) {
        if (player === game.localPlayer) {
            player.update();
            players.get(player.id).put({
                x: player.x,
                y: player.y,
                health: player.health,
                isDead: player.isDead
            });
        }
        player.draw(game.ctx);
    }

    // 恢復畫布狀態
    game.ctx.restore();

    requestAnimationFrame(gameLoop);
}

// 啟動遊戲
initGame();