const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// === HERNÉ PREMENNÉ ===
let gameState = 'menu';
let lastTime = 0;
let score = 0;
let survivalTime = 0;
let difficultyMultiplier = 1;
let currentLevel = 1;
let audioCtx = null;

let player;
let enemies = [];
let particles = [];
let powerups = [];
let projectiles = [];
let obstacles = [];

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

const skins = [
    { name: 'Neon Blue', color: '#00ffff' },
    { name: 'Cyber Pink', color: '#ff00ff' },
    { name: 'Toxic Green', color: '#00ff00' },
    { name: 'Sun Flare', color: '#ffff00' },
    { name: 'Ghost White', color: '#ffffff' }
];
let currentSkinIndex = parseInt(localStorage.getItem('selectedSkin')) || 0;

const powerupTypes = [
    { type: 'speed', color: '#00ff00', text: 'SPEED BOOST!' },
    { type: 'shield', color: '#00ffff', text: 'SHIELD ACTIVE!' },
    { type: 'slowmo', color: '#aaaaaa', text: 'SLOW MOTION!' },
    { type: 'multiplier', color: '#ffff00', text: '2x SCORE!' }
];

let activeEffects = { shield: 0, slowmo: 0, multiplier: 0, speed: 0 };

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'pickup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'death') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
        osc.start(); osc.stop(audioCtx.currentTime + 0.5);
    } else if (type === 'blast') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    }
}

class Player {
    constructor() {
        this.size = 20;
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.baseSpeed = 290;
        this.color = skins[currentSkinIndex].color;
    }
    update(dt) {
        let speed = this.baseSpeed * (activeEffects.speed > 0 ? 1.6 : 1);
        let dx = 0; let dy = 0;
        if (keys['w'] || keys['ArrowUp']) dy -= 1;
        if (keys['s'] || keys['ArrowDown']) dy += 1;
        if (keys['a'] || keys['ArrowLeft']) dx -= 1;
        if (keys['d'] || keys['ArrowRight']) dx += 1;

        if (dx !== 0 && dy !== 0) { const length = Math.sqrt(dx * dx + dy * dy); dx /= length; dy /= length; }
        this.x += dx * speed * dt; this.y += dy * speed * dt;
        this.x = Math.max(this.size/2, Math.min(canvas.width - this.size/2, this.x));
        this.y = Math.max(this.size/2, Math.min(canvas.height - this.size/2, this.y));

        if ((dx !== 0 || dy !== 0) && Math.random() > 0.5) particles.push(new Particle(this.x, this.y, this.color, 0.6));
    }
    draw() {
        ctx.save();
        ctx.shadowBlur = 20; ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        if (activeEffects.shield > 0) {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size + 10, 0, Math.PI * 2);
            ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.restore();
    }
}

class Enemy {
    constructor(type) {
        this.type = type || 'cube';
        this.size = 20;
        this.seed = Math.random() * 100;
        this.waveFrequency = 1.2 + Math.random() * 2;
        this.waveAmplitude = 20 + Math.random() * 30;

        this.vx = 0;
        this.vy = 0;
        this.clumpTimer = 0; 
        this.isPulsing = false;

        if (Math.random() < 0.5) {
            this.x = Math.random() < 0.5 ? -40 : canvas.width + 40;
            this.y = Math.random() * canvas.height;
        } else {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() < 0.5 ? -40 : canvas.height + 40;
        }

        this.setupStats();
    }

    setupStats() {
        if (this.type === 'cube') {
            this.baseSpeed = 60 + Math.random() * 15;
            this.color = '#ff3333'; // Červené kocky pre Lvl 1
        } else if (this.type === 'circle') {
            this.baseSpeed = 45 + Math.random() * 15;
            this.color = '#ff9900'; // Oranžové kruhy pre Lvl 1
            this.shootTimer = Math.random() * 2;
        } else if (this.type === 'triangle') {
            this.baseSpeed = 55;
            this.color = currentLevel === 2 ? '#00ffcc' : '#9900ff'; // Tyrkysová pre Lvl 2!
            this.dashState = 'walk';
            this.stateTimer = 1.5 + Math.random() * 1.0;
        } else if (this.type === 'star') {
            this.baseSpeed = 95;
            this.color = currentLevel === 2 ? '#ff00ff' : '#ffff00'; // Cyber Pink pre Lvl 2!
        } else if (this.type === 'seeker') {
            this.baseSpeed = 110;
            this.color = '#ffffff';
        }
    }

    update(dt, index) {
        let currentSpeed = this.baseSpeed * difficultyMultiplier * (activeEffects.slowmo > 0 ? 0.35 : 1);
        let dx = player.x - this.x;
        let dy = player.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.88;
        this.vy *= 0.88;

        let isClumpingRightNow = false;

        for (let j = 0; j < enemies.length; j++) {
            if (index === j) continue;
            let e2 = enemies[j];
            let ex = e2.x - this.x; let ey = e2.y - this.y;
            let edist = Math.sqrt(ex * ex + ey * ey);

            if (edist < 28) {
                isClumpingRightNow = true;
                if (edist === 0) { ex = Math.random()-0.5; ey = Math.random()-0.5; edist = 0.1; }
                this.x -= (ex / edist) * 6 * dt;
                this.y -= (ey / edist) * 6 * dt;
            }
        }

        if (isClumpingRightNow) {
            this.clumpTimer += dt;
            if (this.clumpTimer > 1.2) {
                this.isPulsing = true;
                let angle = Math.random() * Math.PI * 2;
                let force = 450 + Math.random() * 300;
                this.vx = Math.cos(angle) * -force;
                this.vy = Math.sin(angle) * -force;
                
                for(let i=0; i<8; i++) particles.push(new Particle(this.x, this.y, this.color, 1.2));
                
                this.clumpTimer = 0;
                this.isPulsing = false;
                playSound('blast');
            }
        } else {
            this.clumpTimer = Math.max(0, this.clumpTimer - dt);
            if (this.clumpTimer === 0) this.isPulsing = false;
        }

        if (dist > 0) {
            let dirX = dx / dist; let dirY = dy / dist;
            let perpX = -dirY; let perpY = dirX;
            let wave = Math.sin(survivalTime * this.waveFrequency + this.seed) * this.waveAmplitude;

            if (this.type === 'cube') {
                this.x += dirX * currentSpeed * dt + perpX * wave * dt;
                this.y += dirY * currentSpeed * dt + perpY * wave * dt;
            } else if (this.type === 'circle') {
                if (dist > 240) {
                    this.x += dirX * currentSpeed * dt + perpX * wave * 0.5 * dt;
                    this.y += dirY * currentSpeed * dt + perpY * wave * 0.5 * dt;
                } else if (dist < 160) {
                    this.x -= dirX * currentSpeed * dt; this.y -= dirY * currentSpeed * dt;
                }
                this.shootTimer += dt;
                if (this.shootTimer >= (activeEffects.slowmo > 0 ? 3.5 : 2.0)) {
                    this.shootTimer = 0;
                    projectiles.push(new Projectile(this.x, this.y, dirX * 170, dirY * 170, this.color));
                }
            } else if (this.type === 'triangle') {
                this.stateTimer -= dt;
                if (this.dashState === 'walk') {
                    this.x += dirX * currentSpeed * dt; this.y += dirY * currentSpeed * dt;
                    if (this.stateTimer <= 0) { this.dashState = 'charge'; this.stateTimer = 0.6; this.dashDirX = dirX; this.dashDirY = dirY; }
                } else if (this.dashState === 'charge') {
                    if (this.stateTimer <= 0) { this.dashState = 'dash'; this.stateTimer = 0.4; }
                } else if (this.dashState === 'dash') {
                    this.x += this.dashDirX * currentSpeed * 2.6 * dt; this.y += this.dashDirY * currentSpeed * 2.6 * dt;
                    if (this.stateTimer <= 0) { this.dashState = 'walk'; this.stateTimer = 1.8 + Math.random()*1.5; }
                }
            } else if (this.type === 'star') {
                let zigZag = Math.sin(survivalTime * 5) * 80;
                this.x += dirX * currentSpeed * dt + perpX * zigZag * dt;
                this.y += dirY * currentSpeed * dt + perpY * zigZag * dt;
            } else if (this.type === 'seeker') {
                this.x += dirX * currentSpeed * dt;
                this.y += dirY * currentSpeed * dt;
            }
        }
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = this.isPulsing ? 25 : 12;
        ctx.shadowColor = this.isPulsing ? '#ff0000' : this.color;
        ctx.fillStyle = this.isPulsing ? (Math.floor(Date.now() / 70) % 2 === 0 ? '#ff0000' : '#ffffff') : this.color;

        if (this.type === 'cube' || this.type === 'star') {
            ctx.translate(this.x, this.y);
            ctx.rotate(survivalTime * (this.type === 'star' ? 4 : 1.2));
            if (this.type === 'star') {
                ctx.fillRect(-this.size/2, -this.size/6, this.size, this.size/3);
                ctx.fillRect(-this.size/6, -this.size/2, this.size/3, this.size);
            } else {
                ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
            }
        } else if (this.type === 'circle') {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size/2, 0, Math.PI * 2); ctx.fill();
        } else if (this.type === 'triangle' || this.type === 'seeker') {
            ctx.translate(this.x, this.y);
            let angle = Math.atan2(player.y - this.y, player.x - this.x);
            ctx.rotate(angle + Math.PI/2);
            ctx.beginPath();
            if (this.type === 'seeker') {
                ctx.moveTo(0, -this.size/2); ctx.lineTo(this.size/2, 0);
                ctx.lineTo(0, this.size/2); ctx.lineTo(-this.size/2, 0);
            } else {
                ctx.moveTo(0, -this.size/2); ctx.lineTo(-this.size/2, this.size/2); ctx.lineTo(this.size/2, this.size/2);
            }
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
}

class Obstacle {
    constructor(type) {
        this.type = type; 
        this.size = this.type === 'spike' ? 48 : 22;
        this.x = 80 + Math.random() * (canvas.width - 160);
        this.y = 80 + Math.random() * (canvas.height - 160);
        this.color = this.type === 'spike' ? '#ff5500' : '#ff0000';
        this.pulse = 0;
    }
    draw() {
        ctx.save();
        this.pulse = Math.sin(Date.now() / 150) * 5;
        ctx.shadowBlur = 18 + this.pulse;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;

        if (this.type === 'spike') {
            ctx.translate(this.x, this.y);
            for (let i = 0; i < 4; i++) {
                ctx.rotate(Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(0, -this.size / 2);
                ctx.lineTo(-this.size / 5, 0); 
                ctx.lineTo(this.size / 5, 0);
                ctx.closePath(); 
                ctx.fill();
            }
        } else if (this.type === 'bomb') {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size/2 + this.pulse/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.beginPath();
            ctx.arc(this.x, this.y, 4, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, vx, vy, color) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.size = 4; this.color = color; }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; }
    draw() { ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = this.color; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
}

class PowerUp {
    constructor() {
        this.size = 14; this.x = 60 + Math.random() * (canvas.width - 120); this.y = 60 + Math.random() * (canvas.height - 120);
        this.typeData = powerupTypes[Math.floor(Math.random() * powerupTypes.length)]; this.lifeTime = 12;
    }
    update(dt) { this.lifeTime -= dt; }
    draw() {
        ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = this.typeData.color; ctx.fillStyle = this.typeData.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 11px Orbitron'; ctx.fillText('?', this.x, this.y); ctx.restore();
    }
}

class Particle {
    constructor(x, y, color, modifier) {
        this.x = x; this.y = y; this.size = Math.random() * 3 + 1.5; this.color = color;
        this.life = 0.6 * modifier; this.maxLife = this.life;
        this.vx = (Math.random() - 0.5) * 70; this.vy = (Math.random() - 0.5) * 70;
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt; }
    draw() { ctx.save(); ctx.globalAlpha = Math.max(0, this.life / this.maxLife); ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.size, this.size); ctx.restore(); }
}

// === LOGIKA HRY ===
let enemySpawnTimer = 0;
let powerupSpawnTimer = 0;
let obstacleSpawnTimer = 0;

function resetGame() {
    player = new Player();
    enemies = []; particles = []; powerups = []; projectiles = []; obstacles = [];
    score = 0; survivalTime = 0; difficultyMultiplier = 1; currentLevel = 1;
    activeEffects = { shield: 0, slowmo: 0, multiplier: 0, speed: 0 };
    enemySpawnTimer = 0.5; powerupSpawnTimer = 4; obstacleSpawnTimer = 1.5;
    lastTime = performance.now();
    document.getElementById('lvlVal').innerText = "1";
    document.getElementById('multiplierDisp').classList.add('hidden');
}

function showNotification(text, color) {
    const alert = document.getElementById('powerupAlert');
    alert.innerText = text; alert.style.color = color;
    alert.style.textShadow = `0 0 25px ${color}`; alert.style.opacity = 1;
    setTimeout(() => { alert.style.opacity = 0; }, 2000);
}

// === MASÍVNY WIPEOUT PRI LEVEL UP-E A NOVÝ LIMIT (2000 SCORE) ===
function checkLevelProgress() {
    let oldLevel = currentLevel;
    if (score >= 9000) { currentLevel = 3; }
    else if (score >= 2000) { currentLevel = 2; } // ZMENENÉ NA 2000 SCORE
    else { currentLevel = 1; }

    if (currentLevel !== oldLevel) {
        document.getElementById('lvlVal').innerText = currentLevel;
        let lvlName = currentLevel === 2 ? "CYBER DISTRICT" : "APOCALYPSE CORE";
        let lvlColor = currentLevel === 2 ? "#ccff00" : "#ff0033";
        showNotification(`LEVEL UP: ${lvlName}`, lvlColor);
        
        // Zničenie všetkých nepriateľov s efektom explózie
        enemies.forEach(e => {
            for (let k = 0; k < 15; k++) {
                particles.push(new Particle(e.x, e.y, e.color, 1.5));
            }
        });
        enemies = []; // Kompletné vymazanie starej vlny potvor
        projectiles = []; // Vyčistenie projektilov kvôli férovosti
        playSound('blast'); // Zvuk explózie celej mapy
    }
}

function checkCollisions() {
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        let dx = player.x - obs.x; let dy = player.y - obs.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < player.size/2 + obs.size/2) {
            if (activeEffects.shield > 0) {
                obstacles.splice(i, 1);
                playSound('blast');
            } else {
                gameOver(); return;
            }
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        if (Math.sqrt((player.x - p.x)**2 + (player.y - p.y)**2) < player.size/2 + p.size) {
            projectiles.splice(i, 1);
            if (activeEffects.shield <= 0) { gameOver(); return; }
        }
    }

    for (let i = powerups.length - 1; i >= 0; i--) {
        let p = powerups[i];
        if (Math.sqrt((player.x - p.x)**2 + (player.y - p.y)**2) < player.size/2 + p.size) {
            playSound('pickup'); showNotification(p.typeData.text, p.typeData.color);
            activeEffects[p.typeData.type] = 5;
            if (p.typeData.type === 'multiplier') document.getElementById('multiplierDisp').classList.remove('hidden');
            score += 400; powerups.splice(i, 1);
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        if (Math.abs(player.x - e.x) < player.size/2 + e.size/2 && Math.abs(player.y - e.y) < player.size/2 + e.size/2) {
            if (activeEffects.shield > 0) {
                for(let k=0; k<20; k++) particles.push(new Particle(e.x, e.y, e.color, 1.2));
                enemies.splice(i, 1); score += 200; playSound('pickup');
            } else {
                gameOver(); return;
            }
        }
    }
}

function updateHUD() {
    document.getElementById('scoreVal').innerText = Math.floor(score);
    document.getElementById('timeVal').innerText = survivalTime.toFixed(1);
}

function gameOver() {
    playSound('death'); gameState = 'gameover';
    canvas.classList.add('shake-canvas');
    setTimeout(() => canvas.classList.remove('shake-canvas'), 400);
    document.getElementById('hud').classList.remove('active');
    document.getElementById('gameOverScreen').classList.add('active');
    document.getElementById('finalScore').innerText = Math.floor(score);
    document.getElementById('finalTime').innerText = survivalTime.toFixed(1);
    saveScore(Math.floor(score)); renderLeaderboard('gameOverLeaderboard');
}

function gameLoop(timestamp) {
    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastTime = timestamp;

    if (gameState === 'playing') {
        if (currentLevel === 1) ctx.fillStyle = 'rgba(3, 3, 7, 0.28)';
        else if (currentLevel === 2) ctx.fillStyle = 'rgba(15, 5, 18, 0.28)'; // Mierne upravené pozadie pre Lvl 2
        else if (currentLevel === 3) ctx.fillStyle = 'rgba(22, 5, 5, 0.28)';
    } else {
        ctx.fillStyle = '#030307';
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'playing') {
        survivalTime += dt;
        score += (14 * dt) * (activeEffects.multiplier > 0 ? 2 : 1);
        difficultyMultiplier = 1 + (survivalTime / 60);

        for (let key in activeEffects) if (activeEffects[key] > 0) activeEffects[key] -= dt;

        checkLevelProgress();

        // === UPRAVENÝ SPAWN POOL PRE ÚPLNE INÉ MONŠTRÁ V LEVELI 2 ===
        enemySpawnTimer -= dt;
        if (enemySpawnTimer <= 0) {
            let type = 'cube'; let rand = Math.random();
            if (currentLevel === 1) { 
                type = rand > 0.5 ? 'circle' : 'cube'; // Iba kocky a kruhy
            } else if (currentLevel === 2) { 
                type = rand > 0.5 ? 'triangle' : 'star'; // Úplne nové potvory pre Level 2! (Ružové hviezdy / Tyrkysové trojuholníky)
            } else if (currentLevel === 3) { 
                type = rand > 0.75 ? 'seeker' : (rand > 0.5 ? 'triangle' : (rand > 0.25 ? 'star' : 'circle')); 
            }
            enemies.push(new Enemy(type));
            enemySpawnTimer = Math.max(0.65, 3.0 - (survivalTime / 45));
        }

        obstacleSpawnTimer -= dt;
        if (obstacleSpawnTimer <= 0) {
            if (obstacles.length < 5 + currentLevel) {
                let type = Math.random() > 0.5 ? 'spike' : 'bomb';
                obstacles.push(new Obstacle(type));
            }
            obstacleSpawnTimer = 7 + Math.random() * 6;
        }

        powerupSpawnTimer -= dt;
        if (powerupSpawnTimer <= 0) {
            if (powerups.length < 3) powerups.push(new PowerUp());
            powerupSpawnTimer = 11 + Math.random() * 7;
        }

        player.update(dt); player.draw();
        obstacles.forEach(o => o.draw());

        powerups.forEach((p, idx) => { p.update(dt); p.draw(); if (p.lifeTime <= 0) powerups.splice(idx, 1); });
        projectiles.forEach((p, idx) => { p.update(dt); p.draw(); if (p.x < -20 || p.x > canvas.width+20 || p.y < -20 || p.y > canvas.height+20) projectiles.splice(idx, 1); });
        enemies.forEach((e, idx) => { e.update(dt, idx); e.draw(); });

        checkCollisions();
        updateHUD();
    }

    for (let i = particles.length - 1; i >= 0; i--) { let p = particles[i]; p.update(dt); p.draw(); if (p.life <= 0) particles.splice(i, 1); }

    requestAnimationFrame(gameLoop);
}

function getTopScores() { return JSON.parse(localStorage.getItem('neonChaseLeaderboard')) || []; }
function saveScore(newScore) {
    let scores = getTopScores(); scores.push(newScore); scores.sort((a, b) => b - a);
    scores = scores.slice(0, 5); localStorage.setItem('neonChaseLeaderboard', JSON.stringify(scores));
}
function renderLeaderboard(elementId) {
    const list = document.getElementById(elementId); list.innerHTML = ''; const scores = getTopScores();
    if (scores.length === 0) { list.innerHTML = '<li>Zatiaľ bez výsledkov</li>'; return; }
    scores.forEach((s, i) => {
        const li = document.createElement('li');
        let medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `#${i+1} `;
        li.innerHTML = `<span>${medal} miesto</span> <span style="color:#0ff; text-shadow:0 0 10px #0ff">${s}</span>`;
        list.appendChild(li);
    });
}
function setupSkins() {
    const container = document.getElementById('skinsContainer'); container.innerHTML = '';
    skins.forEach((skin, index) => {
        const btn = document.createElement('button'); btn.className = `skin-btn ${index === currentSkinIndex ? 'selected' : ''}`;
        btn.style.backgroundColor = skin.color; btn.style.boxShadow = `0 0 12px ${skin.color}`;
        btn.onclick = () => { document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); currentSkinIndex = index; localStorage.setItem('selectedSkin', index); };
        container.appendChild(btn);
    });
}
function startGame() { initAudio(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById('hud').classList.add('active'); resetGame(); gameState = 'playing'; }

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('retryBtn').addEventListener('click', startGame);
document.getElementById('menuBtn').addEventListener('click', () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById('mainMenu').classList.add('active'); renderLeaderboard('mainLeaderboard'); gameState = 'menu';
});

setupSkins(); renderLeaderboard('mainLeaderboard'); requestAnimationFrame(gameLoop);