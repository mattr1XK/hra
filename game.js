/**
 * =======================================================
 * NEON CHASE - CORE GAME ENGINE
 * =======================================================
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let gameState = 'menu';
let lastTime = 0;
let score = 0;
let survivalTime = 0;
let difficultyMultiplier = 1;
let currentLevel = 1;

let player;
let enemies = [];
let particles = [];
let powerups = [];
let projectiles = [];
let obstacles = [];

let enemySpawnTimer = 0.5; 
let powerupSpawnTimer = 4; 
let obstacleSpawnTimer = 1.5;

let activeEffects = { 
    shield: 0, 
    slowmo: 0, 
    multiplier: 0, 
    speed: 0 
};

// --- PREMENNÉ PRE OVLÁDANIE MYŠOU A DOTYKOM ---
let targetX = null;
let targetY = null;
let useMotionControl = false;

window.addEventListener('mousemove', (e) => {
    if (useMotionControl) { targetX = e.clientX; targetY = e.clientY; }
});
window.addEventListener('touchmove', (e) => {
    if (useMotionControl && e.touches.length > 0) { targetX = e.touches[0].clientX; targetY = e.touches[0].clientY; }
}, {passive: true});
window.addEventListener('touchstart', (e) => {
    if (useMotionControl && e.touches.length > 0) { targetX = e.touches[0].clientX; targetY = e.touches[0].clientY; }
}, {passive: true});
window.addEventListener('touchend', () => {
    if (useMotionControl) { targetX = null; targetY = null; }
});

// --- INPUT MANAŽÉR ---
const keys = { 
    w: false, a: false, s: false, d: false, 
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false 
};

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
});

// --- KONFIGURÁCIA SKINOV A BONUSOV ---
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

function hexToRgba(hex, alpha) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(255, 255, 255, ${alpha})`;
}

// --- AUDIO SYSTÉM (MP3 HUDBA + EFEKTY) ---
let audioCtx = null;

const menuMusic = document.getElementById('bgm-menu');
const gameMusic = document.getElementById('bgm-game');
const secretMusic = document.getElementById('bgm-secret');

let isAudioInitialized = false;

function getGlobalVolume() {
    const volSlider = document.getElementById('volumeSlider');
    return volSlider ? parseFloat(volSlider.value) : 0.4;
}

function updateMusicVolume() {
    let v = getGlobalVolume();
    if(menuMusic) menuMusic.volume = v;
    if(gameMusic) gameMusic.volume = v;
    if(secretMusic) secretMusic.volume = v;
}

function unlockAudio() {
    if (!isAudioInitialized) {
        updateMusicVolume();
        if(menuMusic) menuMusic.play().catch(e => console.log(e));
        isAudioInitialized = true;
    }
}

function playMenuMusic() {
    if (gameMusic) { gameMusic.pause(); gameMusic.currentTime = 0; }
    if (secretMusic) { secretMusic.pause(); secretMusic.currentTime = 0; }
    if (menuMusic) { menuMusic.play().catch(e => console.log(e)); }
}

function playGameMusic() {
    if (menuMusic) { menuMusic.pause(); menuMusic.currentTime = 0; }
    if (secretMusic) { secretMusic.pause(); secretMusic.currentTime = 0; }
    if (gameMusic) { gameMusic.play().catch(e => console.log(e)); }
}

function playSecretMusic() {
    if (menuMusic) { menuMusic.pause(); menuMusic.currentTime = 0; }
    if (gameMusic) { gameMusic.pause(); gameMusic.currentTime = 0; }
    if (secretMusic) { secretMusic.play().catch(e => console.log(e)); }
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    let vol = getGlobalVolume();

    if (type === 'pickup') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gainNode.gain.setValueAtTime(0.4 * vol, now); osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'death') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(120, now); osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
        gainNode.gain.setValueAtTime(0.8 * vol, now); osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'blast') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(160, now); osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
        gainNode.gain.setValueAtTime(0.4 * vol, now); osc.start(now); osc.stop(now + 0.15);
    }
}

// --- HERNÉ TRIEDY (OBJEKTY) ---

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
        let dx = 0; 
        let dy = 0;

        if (useMotionControl && targetX !== null && targetY !== null) {
            let distX = targetX - this.x;
            let distY = targetY - this.y;
            let distance = Math.sqrt(distX * distX + distY * distY);
            
            if (distance > 5) {
                dx = distX / distance;
                dy = distY / distance;
            }
        } else {
            if (keys['w'] || keys['ArrowUp']) dy -= 1;
            if (keys['s'] || keys['ArrowDown']) dy += 1;
            if (keys['a'] || keys['ArrowLeft']) dx -= 1;
            if (keys['d'] || keys['ArrowRight']) dx += 1;

            if (dx !== 0 && dy !== 0) { 
                const length = Math.sqrt(dx * dx + dy * dy); 
                dx /= length; dy /= length; 
            }
        }

        this.x += dx * speed * dt; 
        this.y += dy * speed * dt;

        this.x = Math.max(this.size / 2, Math.min(canvas.width - this.size / 2, this.x));
        this.y = Math.max(this.size / 2, Math.min(canvas.height - this.size / 2, this.y));

        if ((dx !== 0 || dy !== 0) && Math.random() > 0.5) {
            particles.push(new Particle(this.x, this.y, this.color, 0.6));
        }
    }

    draw() {
        ctx.save(); 
        ctx.shadowBlur = 20; ctx.shadowColor = this.color; ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
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
        const globalPalette = ['#ff3333', '#00ffcc', '#ff00ff', '#ffff00', '#00ff00', '#9900ff', '#ff8800'];
        this.color = globalPalette[Math.floor(Math.random() * globalPalette.length)];

        if (this.type === 'cube') { this.baseSpeed = 60 + Math.random() * 15 + (currentLevel * 2.5); } 
        else if (this.type === 'circle') { this.baseSpeed = 45 + Math.random() * 15 + (currentLevel * 2); this.shootTimer = Math.random() * 2; } 
        else if (this.type === 'triangle') { this.baseSpeed = 55 + (currentLevel * 3); this.dashState = 'walk'; this.stateTimer = 1.5; } 
        else if (this.type === 'star') { this.baseSpeed = 95 + (currentLevel * 2); } 
        else if (this.type === 'seeker') { this.baseSpeed = 110 + (currentLevel * 2.5); }
    }

    update(dt, index) {
        let currentSpeed = this.baseSpeed * difficultyMultiplier * (activeEffects.slowmo > 0 ? 0.35 : 1);
        let targetX = player ? player.x : canvas.width / 2;
        let targetY = player ? player.y : canvas.height / 2;
        
        let dx = targetX - this.x; 
        let dy = targetY - this.y; 
        let dist = Math.sqrt(dx * dx + dy * dy);

        this.x += this.vx * dt; 
        this.y += this.vy * dt;
        this.vx *= 0.88; 
        this.vy *= 0.88;

        let isClumpingRightNow = false;

        for (let j = 0; j < enemies.length; j++) {
            if (index === j) continue;
            let e2 = enemies[j]; 
            let ex = e2.x - this.x; 
            let ey = e2.y - this.y; 
            let edist = Math.sqrt(ex * ex + ey * ey);
            
            if (edist < 28) {
                isClumpingRightNow = true;
                if (edist === 0) { ex = Math.random() - 0.5; ey = Math.random() - 0.5; edist = 0.1; }
                this.x -= (ex / edist) * 6 * dt; 
                this.y -= (ey / edist) * 6 * dt;
            }
        }

        if (isClumpingRightNow) {
            this.clumpTimer += dt;
            if (this.clumpTimer > 1.2) {
                this.isPulsing = true; 
                let angle = Math.random() * Math.PI * 2; 
                let forcePower = 500;
                
                this.vx = Math.cos(angle) * -forcePower; 
                this.vy = Math.sin(angle) * -forcePower;
                
                for(let i = 0; i < 8; i++) {
                    particles.push(new Particle(this.x, this.y, this.color, 1.2));
                }
                this.clumpTimer = 0; 
                this.isPulsing = false; 
                playSound('blast');
            }
        } else { 
            this.clumpTimer = Math.max(0, this.clumpTimer - dt); 
        }

        if (dist > 0) {
            let dirX = dx / dist; 
            let dirY = dy / dist;
            let perpX = -dirY; 
            let perpY = dirX;
            let wave = Math.sin(survivalTime * this.waveFrequency + this.seed) * this.waveAmplitude;

            if (this.type === 'cube') { 
                this.x += dirX * currentSpeed * dt + perpX * wave * dt; 
                this.y += dirY * currentSpeed * dt + perpY * wave * dt; 
            } else if (this.type === 'circle') {
                if (dist > 240) { 
                    this.x += dirX * currentSpeed * dt; 
                    this.y += dirY * currentSpeed * dt; 
                } else if (dist < 160) { 
                    this.x -= dirX * currentSpeed * dt; 
                    this.y -= dirY * currentSpeed * dt; 
                }
                
                this.shootTimer += dt;
                if (this.shootTimer >= (activeEffects.slowmo > 0 ? 3.5 : 2.0)) {
                    this.shootTimer = 0; 
                    projectiles.push(new Projectile(this.x, this.y, dirX * 170, dirY * 170, this.color));
                }
            } else if (this.type === 'triangle') {
                this.stateTimer -= dt;
                if (this.dashState === 'walk') {
                    this.x += dirX * currentSpeed * dt; 
                    this.y += dirY * currentSpeed * dt;
                    if (this.stateTimer <= 0) { 
                        this.dashState = 'charge'; 
                        this.stateTimer = 0.5; 
                        this.dashDirX = dirX; 
                        this.dashDirY = dirY; 
                    }
                } else if (this.dashState === 'charge') { 
                    if (this.stateTimer <= 0) { 
                        this.dashState = 'dash'; 
                        this.stateTimer = 0.4; 
                    }
                } else if (this.dashState === 'dash') {
                    this.x += this.dashDirX * currentSpeed * 2.5 * dt; 
                    this.y += this.dashDirY * currentSpeed * 2.5 * dt;
                    if (this.stateTimer <= 0) { 
                        this.dashState = 'walk'; 
                        this.stateTimer = 1.5; 
                    }
                }
            } else if (this.type === 'star') {
                let zigZag = Math.sin(survivalTime * 5) * 70;
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
        ctx.shadowColor = this.color; 
        ctx.fillStyle = this.color;
        ctx.translate(this.x, this.y);
        
        if (this.type === 'cube' || this.type === 'star') {
            ctx.rotate(survivalTime * (this.type === 'star' ? 4 : 1.2));
            if (this.type === 'star') { 
                ctx.fillRect(-this.size/2, -this.size/6, this.size, this.size/3); 
                ctx.fillRect(-this.size/6, -this.size/2, this.size/3, this.size); 
                
                ctx.fillStyle = '#000'; 
                ctx.font = 'bold 12px Orbitron, Arial'; 
                ctx.textAlign = 'center'; 
                ctx.textBaseline = 'middle';
                ctx.fillText('!', 0, 1);
            } else {
                ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
            }
        } else if (this.type === 'circle') {
            ctx.beginPath(); 
            ctx.arc(0, 0, this.size/2, 0, Math.PI * 2); 
            ctx.fill();
        } else if (this.type === 'triangle' || this.type === 'seeker') {
            let targetX = player ? player.x : canvas.width / 2; 
            let targetY = player ? player.y : canvas.height / 2;
            let angle = Math.atan2(targetY - this.y, targetX - this.x); 
            
            ctx.rotate(angle + Math.PI/2); 
            ctx.beginPath();
            
            if (this.type === 'seeker') { 
                ctx.moveTo(0, -this.size/2); 
                ctx.lineTo(this.size/2, 0); 
                ctx.lineTo(0, this.size/2); 
                ctx.lineTo(-this.size/2, 0); 
            } else { 
                ctx.moveTo(0, -this.size/2); 
                ctx.lineTo(-this.size/2, this.size/2); 
                ctx.lineTo(this.size/2, this.size/2); 
            }
            
            ctx.closePath(); 
            ctx.fill();
        }
        ctx.restore();
    }
}

class Obstacle {
    constructor(type) { 
        this.type = type; 
        this.size = type === 'spike' ? 48 : 22; 
        this.x = 80 + Math.random() * (canvas.width - 160); 
        this.y = 80 + Math.random() * (canvas.height - 160); 
        this.color = type === 'spike' ? '#ff5500' : '#ff0000'; 
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
            ctx.fillStyle = '#000'; 
            ctx.font = 'bold 16px Orbitron, Arial'; 
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'middle'; 
            ctx.fillText('!', 0, 1);
        } else {
            ctx.beginPath(); 
            ctx.arc(this.x, this.y, Math.max(1, this.size/2 + this.pulse/2), 0, Math.PI * 2); 
            ctx.fill();
            
            ctx.fillStyle = '#000'; 
            ctx.font = 'bold 16px Orbitron, Arial'; 
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'middle'; 
            ctx.fillText('!', this.x, this.y + 1);
        }
        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, vx, vy, color) { 
        this.x = x; 
        this.y = y; 
        this.vx = vx; 
        this.vy = vy; 
        this.size = 4; 
        this.color = color; 
    }
    
    update(dt) { 
        this.x += this.vx * dt; 
        this.y += this.vy * dt; 
    }
    
    draw() { 
        ctx.save(); 
        ctx.shadowBlur = 10; 
        ctx.shadowColor = this.color; 
        ctx.fillStyle = this.color; 
        ctx.beginPath(); 
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); 
        ctx.fill(); 
        ctx.restore(); 
    }
}

class PowerUp {
    constructor() { 
        this.size = 14; 
        this.x = 60 + Math.random() * (canvas.width - 120); 
        this.y = 60 + Math.random() * (canvas.height - 120); 
        this.typeData = powerupTypes[Math.floor(Math.random() * powerupTypes.length)]; 
        this.lifeTime = 12; 
    }
    
    update(dt) { 
        this.lifeTime -= dt; 
    }
    
    draw() { 
        ctx.save(); 
        ctx.shadowBlur = 20; 
        ctx.shadowColor = this.typeData.color; 
        ctx.fillStyle = this.typeData.color; 
        
        ctx.beginPath(); 
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); 
        ctx.fill(); 
        
        ctx.shadowBlur = 0; 
        ctx.fillStyle = '#000'; 
        ctx.font = 'bold 16px Orbitron, Arial'; 
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';
        ctx.fillText('?', this.x, this.y + 1);
        ctx.restore(); 
    }
}

class Particle {
    constructor(x, y, color, mod) { 
        this.x = x; 
        this.y = y; 
        this.size = Math.random() * 3 + 1.5; 
        this.color = color; 
        this.life = 0.6 * mod; 
        this.maxLife = this.life; 
        this.vx = (Math.random() - 0.5) * 80; 
        this.vy = (Math.random() - 0.5) * 80; 
    }
    
    update(dt) { 
        this.x += this.vx * dt; 
        this.y += this.vy * dt; 
        this.life -= dt; 
    }
    
    draw() { 
        ctx.save(); 
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife); 
        ctx.fillStyle = this.color; 
        ctx.fillRect(this.x, this.y, this.size, this.size); 
        ctx.restore(); 
    }
}

// --- VYKRESLENIE POZADIA ---
function drawCyberGrid() {
    ctx.save();
    
    const alertColors = ['#00ffff', '#ff00ff', '#00ff00', '#ffff00', '#ff3333', '#9900ff'];
    let rawColor = alertColors[currentLevel % alertColors.length];
    
    ctx.strokeStyle = rawColor; 
    ctx.lineWidth = 1; 
    ctx.globalAlpha = 0.05; 
    
    let gridSize = 55;
    let timeRef = gameState === 'playing' ? survivalTime : (Date.now() / 1000);
    let offsetX = (timeRef * 20) % gridSize; 
    let offsetY = (timeRef * 20) % gridSize;
    
    for (let x = -offsetX; x < canvas.width; x += gridSize) { 
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); 
    }
    for (let y = -offsetY; y < canvas.height; y += gridSize) { 
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); 
    }
    
    let grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 50, 
        canvas.width / 2, canvas.height / 2, canvas.width * 0.8
    );
    
    grad.addColorStop(0, 'rgba(4, 4, 12, 0)'); 
    grad.addColorStop(1, hexToRgba(rawColor, 0.10)); 
    
    ctx.fillStyle = grad; 
    ctx.globalAlpha = 1.0; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.restore();
}

// --- HERNÁ LOGIKA A KOLÍZIE ---
function resetGame() {
    player = new Player(); 
    enemies = []; 
    particles = []; 
    powerups = []; 
    projectiles = []; 
    obstacles = [];
    
    score = 0; 
    survivalTime = 0; 
    difficultyMultiplier = 1; 
    currentLevel = 1;
    activeEffects = { shield: 0, slowmo: 0, multiplier: 0, speed: 0 };
    
    enemySpawnTimer = 0.5; 
    powerupSpawnTimer = 4; 
    obstacleSpawnTimer = 1.5;
    
    lastTime = performance.now();
    document.getElementById('lvlVal').innerText = "1";
    document.getElementById('multiplierDisp').classList.add('hidden');
}

function showNotification(text, color) {
    const alert = document.getElementById('powerupAlert');
    if (!alert) return;
    alert.innerText = text; 
    alert.style.color = color; 
    alert.style.textShadow = `0 0 20px ${color}`; 
    alert.style.opacity = 1;
    setTimeout(() => { alert.style.opacity = 0; }, 2000);
}

function checkLevelProgress() {
    let calculatedLevel = 1;
    if (score >= 2000) {
        calculatedLevel = 2 + Math.floor((score - 2000) / 1000);
    }

    if (calculatedLevel !== currentLevel) {
        currentLevel = calculatedLevel; 
        document.getElementById('lvlVal').innerText = currentLevel;
        
        const alertColors = ['#00ffff', '#ff00ff', '#00ff00', '#ffff00', '#ff3333'];
        let lvlColor = alertColors[currentLevel % alertColors.length];
        
        showNotification(`LEVEL UP: PHASE ${currentLevel}`, lvlColor);
        
        enemies.forEach(e => { 
            for (let k = 0; k < 12; k++) {
                particles.push(new Particle(e.x, e.y, e.color, 1.2));
            }
        });
        
        enemies = []; 
        projectiles = []; 
        enemySpawnTimer = 1.0; 
        playSound('blast');
    }
}

function checkCollisions() {
    if (!player) return;

    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i]; 
        let dist = Math.sqrt((player.x - obs.x)**2 + (player.y - obs.y)**2);
        
        if (dist < (player.size/2 + obs.size/2)) {
            if (activeEffects.shield > 0) { 
                obstacles.splice(i, 1); 
                playSound('blast'); 
            } else { 
                gameOver(); 
                return; 
            }
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i]; 
        let dist = Math.sqrt((player.x - p.x)**2 + (player.y - p.y)**2);
        
        if (dist < (player.size/2 + p.size)) {
            projectiles.splice(i, 1); 
            if (activeEffects.shield <= 0) { 
                gameOver(); 
                return; 
            }
        }
    }

    for (let i = powerups.length - 1; i >= 0; i--) {
        let p = powerups[i]; 
        let dist = Math.sqrt((player.x - p.x)**2 + (player.y - p.y)**2);
        
        if (dist < (player.size/2 + p.size)) {
            playSound('pickup'); 
            showNotification(p.typeData.text, p.typeData.color); 
            activeEffects[p.typeData.type] = 5;
            
            if (p.typeData.type === 'multiplier') {
                document.getElementById('multiplierDisp').classList.remove('hidden');
            }
            
            score += 400; 
            powerups.splice(i, 1);
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i]; 
        let isColliding = Math.abs(player.x - e.x) < (player.size/2 + e.size/2) && 
                          Math.abs(player.y - e.y) < (player.size/2 + e.size/2);

        if (isColliding) {
            if (activeEffects.shield > 0) { 
                for(let k = 0; k < 15; k++) {
                    particles.push(new Particle(e.x, e.y, e.color, 1));
                }
                enemies.splice(i, 1); 
                score += 200; 
                playSound('blast');
            } else { 
                gameOver(); 
                return; 
            }
        }
    }
}

// --- HLAVNÁ SLUČKA A UI ---
function updateHUD() {
    document.getElementById('scoreVal').innerText = Math.floor(score);
    document.getElementById('timeVal').innerText = survivalTime.toFixed(1);
}

function gameOver() {
    playSound('death'); 
    gameState = 'gameover';
    
    // Zastavíme všetky hudby a pustíme opäť Menu hudbu (nie TIKI TIKI)
    if (gameMusic) gameMusic.pause();
    if (secretMusic) secretMusic.pause();
    setTimeout(() => { playMenuMusic(); }, 1500);
    
    canvas.classList.add('shake-canvas'); 
    setTimeout(() => canvas.classList.remove('shake-canvas'), 400);
    
    document.getElementById('hud').classList.remove('active');
    document.getElementById('gameOverScreen').classList.add('active');
    document.getElementById('finalScore').innerText = Math.floor(score);
    document.getElementById('finalTime').innerText = survivalTime.toFixed(1);
    
    saveScore(Math.floor(score)); 
    renderLeaderboard('gameOverLeaderboard');
}

function gameLoop(timestamp) {
    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; 
    lastTime = timestamp;

    ctx.fillStyle = 'rgba(6, 6, 16, 0.22)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawCyberGrid();

    if (gameState === 'playing') {
        survivalTime += dt; 
        score += (14 * dt) * (activeEffects.multiplier > 0 ? 2 : 1); 
        difficultyMultiplier = 1 + (survivalTime / 60);

        for (let key in activeEffects) {
            if (activeEffects[key] > 0) activeEffects[key] -= dt;
        }
        
        checkLevelProgress();

        enemySpawnTimer -= dt;
        if (enemySpawnTimer <= 0) {
            let type = 'cube'; 
            let rand = Math.random();
            
            if (currentLevel === 1) {
                type = rand > 0.5 ? 'circle' : 'cube';
            } else {
                let waveSet = currentLevel % 4;
                if (waveSet === 0) type = rand > 0.5 ? 'triangle' : 'seeker';
                else if (waveSet === 1) type = rand > 0.5 ? 'star' : 'circle';
                else type = rand > 0.5 ? 'seeker' : 'cube';
            }
            
            enemies.push(new Enemy(type)); 
            enemySpawnTimer = Math.max(0.6, 2.8 - (survivalTime / 45));
        }

        obstacleSpawnTimer -= dt;
        if (obstacleSpawnTimer <= 0) {
            if (obstacles.length < 5 + Math.min(6, currentLevel)) {
                obstacles.push(new Obstacle(Math.random() > 0.5 ? 'spike' : 'bomb'));
            }
            obstacleSpawnTimer = 8 + Math.random() * 5;
        }

        powerupSpawnTimer -= dt;
        if (powerupSpawnTimer <= 0) { 
            if (powerups.length < 2) powerups.push(new PowerUp()); 
            powerupSpawnTimer = 12 + Math.random() * 6; 
        }

        player.update(dt); 
        player.draw();
        
        obstacles.forEach(o => o.draw());
        
        for (let i = powerups.length - 1; i >= 0; i--) {
            let p = powerups[i];
            p.update(dt); 
            p.draw(); 
            if (p.lifeTime <= 0) powerups.splice(i, 1);
        }

        for (let i = projectiles.length - 1; i >= 0; i--) {
            let p = projectiles[i];
            p.update(dt); 
            p.draw(); 
            if (p.x < -20 || p.x > canvas.width+20 || p.y < -20 || p.y > canvas.height+20) {
                projectiles.splice(i, 1);
            }
        }

        enemies.forEach((e, idx) => { 
            e.update(dt, idx); 
            e.draw(); 
        });

        checkCollisions(); 
        updateHUD();
    }

    for (let i = particles.length - 1; i >= 0; i--) { 
        let p = particles[i]; 
        p.update(dt); 
        p.draw(); 
        if (p.life <= 0) particles.splice(i, 1); 
    }
    
    requestAnimationFrame(gameLoop);
}

// --- LEADERBOARD A INICIALIZÁCIA MENU ---
function getTopScores() { 
    return JSON.parse(localStorage.getItem('neonChaseLeaderboard')) || []; 
}

function saveScore(newScore) {
    let scores = getTopScores(); 
    scores.push(newScore); 
    scores.sort((a, b) => b - a);
    scores = scores.slice(0, 5); 
    localStorage.setItem('neonChaseLeaderboard', JSON.stringify(scores));
}

function renderLeaderboard(elementId) {
    const list = document.getElementById(elementId); 
    if (!list) return; 
    
    list.innerHTML = ''; 
    const scores = getTopScores();
    
    if (scores.length === 0) { 
        list.innerHTML = '<li>Zatiaľ bez výsledkov</li>'; 
        return; 
    }
    
    scores.forEach((s, i) => {
        const li = document.createElement('li');
        let medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `#${i+1} `;
        li.innerHTML = `<span>${medal} miesto</span> <span style="color:#00ffff; text-shadow:0 0 10px #00ffff">${s}</span>`;
        list.appendChild(li);
    });
}

function setupSkins() {
    const container = document.getElementById('skinsContainer'); 
    if (!container) return; 
    
    container.innerHTML = '';
    
    skins.forEach((skin, index) => {
        const btn = document.createElement('button'); 
        btn.className = `skin-btn ${index === currentSkinIndex ? 'selected' : ''}`;
        
        btn.style.background = `radial-gradient(circle, ${skin.color} 0%, rgba(6, 6, 16, 0.8) 100%)`;
        btn.style.boxShadow = `0 0 15px ${skin.color}`;
        btn.style.border = index === currentSkinIndex ? '3px solid #ffffff' : '2px solid rgba(255, 255, 255, 0.2)';
        
        btn.onclick = () => { 
            unlockAudio(); 
            document.querySelectorAll('.skin-btn').forEach((b, idx) => {
                b.classList.remove('selected');
                b.style.border = '2px solid rgba(255, 255, 255, 0.2)';
                b.style.boxShadow = `0 0 15px ${skins[idx].color}`;
            }); 
            
            btn.classList.add('selected'); 
            btn.style.border = '3px solid #ffffff';
            btn.style.boxShadow = `0 0 25px ${skin.color}`;
            
            currentSkinIndex = index; 
            localStorage.setItem('selectedSkin', index); 
            
            if (player) player.color = skin.color;
        };
        
        container.appendChild(btn);
    });
}

function startGame() { 
    initAudio(); 
    playGameMusic(); 
    
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); 
    document.getElementById('hud').classList.add('active'); 
    resetGame(); 
    gameState = 'playing'; 
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', unlockAudio, { once: true });

    document.getElementById('startBtn').addEventListener('click', startGame);
    
    document.getElementById('retryBtn').addEventListener('click', startGame);
    document.getElementById('menuBtn').addEventListener('click', () => {
        playMenuMusic(); 
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); 
        document.getElementById('mainMenu').classList.add('active'); 
        renderLeaderboard('mainLeaderboard'); 
        gameState = 'menu'; 
        currentLevel = 1;
    });

    // --- FUNKČNOSŤ TLAČIDIEL NASTAVENÍ ---
    document.getElementById('openSettingsBtn').addEventListener('click', () => {
        document.getElementById('settingsScreen').style.display = 'flex';
    });

    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
        document.getElementById('settingsScreen').style.display = 'none';
    });

    // --- TAJNÁ HUDBA ---
    document.getElementById('secretBtn').addEventListener('click', () => {
        playSecretMusic();
    });

    // --- HLASITOSŤ ---
    const volSlider = document.getElementById('volumeSlider');
    if (volSlider) {
        let savedVol = localStorage.getItem('neonVolume');
        if (savedVol !== null) { volSlider.value = savedVol; }
        updateMusicVolume(); 
        
        volSlider.addEventListener('input', () => {
            updateMusicVolume();
            localStorage.setItem('neonVolume', volSlider.value);
        });
    }

    // --- OVLÁDANIE MYŠ/DOTYK ---
    const motionToggle = document.getElementById('motionToggle');
    if (motionToggle) {
        let savedMotion = localStorage.getItem('neonMotion');
        if (savedMotion !== null) {
            useMotionControl = savedMotion === 'true';
            motionToggle.checked = useMotionControl;
        }
        motionToggle.addEventListener('change', (e) => {
            useMotionControl = e.target.checked;
            localStorage.setItem('neonMotion', useMotionControl);
            if (!useMotionControl) { targetX = null; targetY = null; }
        });
    }

    setupSkins(); 
    renderLeaderboard('mainLeaderboard'); 
    requestAnimationFrame(gameLoop);
});