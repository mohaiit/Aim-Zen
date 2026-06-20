const lobbyUi = document.getElementById('lobby-ui');
const gameContainer = document.getElementById('game-container');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const shieldDisplay = document.getElementById('shield-timer');
const killDisplay = document.getElementById('player-kills');
const weaponSprite = document.getElementById('weapon-sprite');
const weaponTxt = document.getElementById('current-weapon-txt');
const sniperScopeUi = document.getElementById('sniper-scope-ui');
const sensiSlider = document.getElementById('mouse-sensi-slider');
const sensiDisplay = document.getElementById('sensi-value-display');

let gameActive = false;
let killCount = 0;
let shieldActive = true;
let shieldSeconds = 5;
let playerHeightOffset = 0;

// SENSITIVITY CONFIGURATION
let mouseSensitivityMultiplier = 1.0; 

// WEAPON ARCHITECTURE
let weaponsInventory = {
    deagle: { name: "DESERT EAGLE", movementSpeed: 0.045, hitWindow: 0.18, fieldOfView: Math.PI / 3, isScoped: false },
    awm:    { name: "AWM SNIPER",  movementSpeed: 0.025, hitWindow: 0.06, fieldOfView: Math.PI / 3, isScoped: false }
};
let currentWeaponKey = 'deagle';

// PLAYER VECTORS
let playerState = {
    x: 2.5, y: 2.5,
    angle: 0,
    speed: 0.045,
    baseTurnSpeed: 0.0012
};

const MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
    [1,0,0,1,1,0,0,0,0,1,1,1,1,0,0,1],
    [1,0,0,1,1,0,0,0,0,1,0,0,1,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,0,0,1,1,1,1,0,0,1,1,1,0,1],
    [1,0,0,0,0,1,0,0,1,0,0,0,0,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,1,1,1,0,0,0,0,1,1,0,0,0,1],
    [1,0,0,1,1,1,0,0,0,0,1,1,0,0,0,1],
    [1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];
const MAP_W = 16;
const MAP_H = 15;

let botsArray = [];
let keysTracker = {};
let engineLoops = {};
let zBuffer = []; 

// DIFFICULTY CONFIG MATRIX
const DIFFICULTY_PROFILES = {
    beginner: { count: 3, speed: 0.012, rateChance: 0.007 },
    medium:   { count: 5, speed: 0.024, rateChance: 0.025 },
    pro:      { count: 8, speed: 0.050, rateChance: 0.065 }
};

sensiSlider.addEventListener('input', (e) => {
    sensiDisplay.innerText = parseFloat(e.target.value).toFixed(1);
});

document.getElementById('launch-match-btn').addEventListener('click', boot3DMatch);
document.getElementById('exit-match-btn').addEventListener('click', stop3DMatch);

window.addEventListener('keydown', (e) => { 
    keysTracker[e.code] = true; 
    if(e.code === 'KeyQ') swapWeaponProfile(); 
});
window.addEventListener('keyup', (e) => { keysTracker[e.code] = false; });

canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });

canvas.addEventListener('mousedown', (e) => {
    if (!gameActive) return;
    
    if (e.button === 0) {
        weaponSprite.className = "weapon-recoil " + (currentWeaponKey === 'deagle' ? 'deagle-skin' : 'awm-skin');
        setTimeout(() => { 
            weaponSprite.className = "weapon-idle " + (currentWeaponKey === 'deagle' ? 'deagle-skin' : 'awm-skin'); 
        }, 90);

        processPlayerWeaponFire();
    } else if (e.button === 2) {
        if (currentWeaponKey === 'awm') {
            let activeWp = weaponsInventory.awm;
            activeWp.isScoped = !activeWp.isScoped;
            
            if (activeWp.isScoped) {
                activeWp.fieldOfView = Math.PI / 10; 
                activeWp.hitWindow = 0.05;          
                sniperScopeUi.classList.remove('hidden');
                weaponSprite.style.display = 'none'; 
            } else {
                activeWp.fieldOfView = Math.PI / 3;  
                activeWp.hitWindow = 0.06;
                sniperScopeUi.classList.add('hidden');
                weaponSprite.style.display = 'block';
            }
        }
    }
});

canvas.addEventListener('click', () => {
    if (gameActive) canvas.requestPointerLock();
});

// UPGRADED INPUT MOUSE ENGINE: High threshold + clamp cap to guarantee unrestricted freestyle flicks
document.addEventListener('mousemove', (e) => {
    if (!gameActive || document.pointerLockElement !== canvas) return;
    
    let deltaX = e.movementX;

    // Hard hardware glitch spike protection (e.g. initial window entry jump)
    if (Math.abs(deltaX) > 500) return; 

    // Smooth soft-clamp to handle insanely aggressive fast swipes without locking up the aim
    if (deltaX > 250) deltaX = 250;
    if (deltaX < -250) deltaX = -250;

    let calculatedRotationStep = deltaX * playerState.baseTurnSpeed * mouseSensitivityMultiplier;
    playerState.angle += calculatedRotationStep;
});

function swapWeaponProfile() {
    if(!gameActive) return;
    
    weaponsInventory.awm.isScoped = false;
    weaponsInventory.awm.fieldOfView = Math.PI / 3;
    weaponsInventory.awm.hitWindow = 0.06;
    sniperScopeUi.classList.add('hidden');
    weaponSprite.style.display = 'block';

    currentWeaponKey = (currentWeaponKey === 'deagle') ? 'awm' : 'deagle';
    let activeWp = weaponsInventory[currentWeaponKey];

    playerState.speed = activeWp.movementSpeed;
    weaponTxt.innerText = activeWp.name;

    if(currentWeaponKey === 'awm') {
        weaponTxt.className = "text-red";
        weaponSprite.className = "weapon-idle awm-skin";
    } else {
        weaponTxt.className = "text-cyan";
        weaponSprite.className = "weapon-idle deagle-skin";
    }
}

function boot3DMatch() {
    mouseSensitivityMultiplier = parseFloat(sensiSlider.value);

    lobbyUi.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    
    gameActive = true;
    killCount = 0;
    shieldActive = true;
    shieldSeconds = 5;
    playerHeightOffset = 0;
    playerState.x = 2.5; playerState.y = 2.5; playerState.angle = 0;
    currentWeaponKey = 'deagle'; swapWeaponProfile(); 
    
    killDisplay.innerText = killCount;
    shieldDisplay.innerText = "5s";

    resizeEngineCanvas();
    spawnEnemyBots();
    
    canvas.requestPointerLock(); 

    engineLoops.shield = setInterval(runShieldClock, 1000);
    engineLoops.render = requestAnimationFrame(processMainGameLoop);
}

function resizeEngineCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    zBuffer = new Array(canvas.width).fill(Infinity);
}

function spawnEnemyBots() {
    botsArray = [];
    const difficultySelection = document.getElementById('bot-difficulty').value;
    const activeProfile = DIFFICULTY_PROFILES[difficultySelection];
    
    for(let i=0; i < activeProfile.count; i++) {
        spawnSingleRandomBot(i, activeProfile.speed);
    }
}

function spawnSingleRandomBot(id, enforcedSpeed) {
    let placed = false;
    while(!placed) {
        let bx = Math.floor(Math.random() * MAP_W);
        let by = Math.floor(Math.random() * MAP_H);
        if(MAP[by][bx] === 0 && (Math.abs(bx - playerState.x) > 2)) {
            botsArray.push({
                id: id,
                x: bx + 0.5,
                y: by + 0.5,
                targetX: bx + 0.5, 
                targetY: by + 0.5,
                moveSpeed: enforcedSpeed, 
                lastShotTime: performance.now(),
                fireRateInterval: Math.random() * 1200 + 800
            });
            placed = true;
        }
    }
}

function runShieldClock() {
    shieldSeconds--;
    if (shieldSeconds <= 0) {
        clearInterval(engineLoops.shield);
        shieldActive = false;
        shieldDisplay.innerText = "OFFLINE";
    } else {
        shieldDisplay.innerText = `${shieldSeconds}s`;
    }
}

function processMainGameLoop() {
    if (!gameActive) return;

    processPlayerInputLogic();
    processBotCombatBehavior();
    render3DRaycastView();

    engineLoops.render = requestAnimationFrame(processMainGameLoop);
}

function processPlayerInputLogic() {
    let moveX = 0;
    let moveY = 0;

    if (keysTracker['KeyW']) {
        moveX += Math.cos(playerState.angle) * playerState.speed;
        moveY += Math.sin(playerState.angle) * playerState.speed;
    }
    if (keysTracker['KeyS']) {
        moveX -= Math.cos(playerState.angle) * playerState.speed;
        moveY -= Math.sin(playerState.angle) * playerState.speed;
    }
    if (keysTracker['KeyA']) {
        moveX += Math.sin(playerState.angle) * playerState.speed;
        moveY -= Math.cos(playerState.angle) * playerState.speed;
    }
    if (keysTracker['KeyD']) {
        moveX -= Math.sin(playerState.angle) * playerState.speed;
        moveY += Math.cos(playerState.angle) * playerState.speed;
    }

    if (keysTracker['Space']) {
        playerHeightOffset = canvas.height * 0.15;
    } else {
        playerHeightOffset = 0;
    }

    let targetX = playerState.x + moveX;
    let targetY = playerState.y + moveY;

    if (MAP[Math.floor(playerState.y)][Math.floor(targetX)] === 0) playerState.x = targetX;
    if (MAP[Math.floor(targetY)][Math.floor(playerState.x)] === 0) playerState.y = targetY;
}

function processBotCombatBehavior() {
    const now = performance.now();
    const difficultySelection = document.getElementById('bot-difficulty').value;
    const activeProfile = DIFFICULTY_PROFILES[difficultySelection];

    botsArray.forEach(bot => {
        let distToTarget = Math.hypot(bot.targetX - bot.x, bot.targetY - bot.y);
        
        if (distToTarget < 0.08) {
            let randomizedTriggerChance = difficultySelection === 'pro' ? 0.08 : 0.02;
            if (Math.random() < randomizedTriggerChance) {
                let directions = [[0,1],[0,-1],[1,0],[-1,0]];
                let dir = directions[Math.floor(Math.random()*4)];
                let nextX = Math.floor(bot.x + dir[0]);
                let nextY = Math.floor(bot.y + dir[1]);
                if (MAP[nextY] && MAP[nextY][nextX] === 0) {
                    bot.targetX = nextX + 0.5;
                    bot.targetY = nextY + 0.5;
                }
            }
        } else {
            let angleToTarget = Math.atan2(bot.targetY - bot.y, bot.targetX - bot.x);
            bot.x += Math.cos(angleToTarget) * bot.moveSpeed;
            bot.y += Math.sin(angleToTarget) * bot.moveSpeed;
        }

        if (now - bot.lastShotTime > bot.fireRateInterval) {
            bot.lastShotTime = now;

            if (Math.random() < activeProfile.rateChance) {
                let distanceToPlayer = Math.hypot(playerState.x - bot.x, playerState.y - bot.y);
                let isWallBlocking = checkRayIntersectsSolidWall(bot.x, bot.y, playerState.x, playerState.y, distanceToPlayer);

                if (isWallBlocking || shieldActive || playerHeightOffset > 0) return;

                gameActive = false;
                document.exitPointerLock();
                cancelAnimationFrame(engineLoops.render);
                alert(`☠️ ELIMINATED! A BOT ONE-TAPPED YOU ON ${difficultySelection.toUpperCase()} MODE.\nKills Tracked: ${killCount}`);
                stop3DMatch();
            }
        }
    });
}

function render3DRaycastView() {
    ctx.fillStyle = "#010408"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#0a0f1d"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height / 2 + playerHeightOffset);

    const numRays = canvas.width;
    const activeWp = weaponsInventory[currentWeaponKey];
    const halfFov = activeWp.fieldOfView / 2;

    for (let i = 0; i < numRays; i++) {
        let rayAngle = playerState.angle - halfFov + (i / numRays) * activeWp.fieldOfView;
        let distanceToWall = 0;
        let hitWall = false;
        let sideHit = 0; 
        let exactHitCoordinate = 0; 

        let cosAngle = Math.cos(rayAngle);
        let sinAngle = Math.sin(rayAngle);

        while (!hitWall && distanceToWall < 16) {
            distanceToWall += 0.02; 
            let testX = playerState.x + cosAngle * distanceToWall;
            let testY = playerState.y + sinAngle * distanceToWall;
            
            let checkX = Math.floor(testX);
            let checkY = Math.floor(testY);

            if (checkX < 0 || checkX >= MAP_W || checkY < 0 || checkY >= MAP_H) {
                hitWall = true;
                distanceToWall = 16;
            } else if (MAP[checkY][checkX] > 0) {
                hitWall = true;
                
                let diffX = Math.abs(testX - (checkX + 0.5));
                let diffY = Math.abs(testY - (checkY + 0.5));
                if (diffX > diffY) {
                    sideHit = 0;
                    exactHitCoordinate = testY;
                } else {
                    sideHit = 1;
                    exactHitCoordinate = testX;
                }
            }
        }

        let correctedDist = distanceToWall * Math.cos(rayAngle - playerState.angle);
        zBuffer[i] = correctedDist; 

        let wallStripHeight = Math.floor((canvas.height / correctedDist));
        let baseLuminance = Math.max(15, 170 - (correctedDist * 11)); 
        
        let rValue = 0;
        let gValue = baseLuminance;
        let bValue = baseLuminance + 35;

        if (sideHit === 1) {
            gValue = Math.floor(gValue * 0.7);
            bValue = Math.floor(bValue * 0.7);
        }

        let wallTextureSample = exactHitCoordinate % 1.0;
        if (wallTextureSample > 0.96 || wallTextureSample < 0.04) {
            gValue = Math.floor(gValue * 0.4); 
            bValue = Math.floor(bValue * 0.4);
        }

        ctx.fillStyle = `rgb(${rValue}, ${gValue}, ${bValue})`; 

        let drawStart = (canvas.height / 2) - (wallStripHeight / 2) + playerHeightOffset;
        ctx.fillRect(i, drawStart, 1, wallStripHeight);
    }

    render3DBotsSprites(activeWp.fieldOfView);
}

function render3DBotsSprites(currentFov) {
    botsArray.forEach(bot => {
        bot.dist = Math.hypot(bot.x - playerState.x, bot.y - playerState.y);
    });
    botsArray.sort((a, b) => b.dist - a.dist);

    botsArray.forEach(bot => {
        if (bot.dist < 0.2 || bot.dist > 14) return;

        let spriteAngle = Math.atan2(bot.y - playerState.y, bot.x - playerState.x) - playerState.angle;
        while (spriteAngle < -Math.PI) spriteAngle += Math.PI * 2;
        while (spriteAngle > Math.PI) spriteAngle -= Math.PI * 2;

        if (Math.abs(spriteAngle) < currentFov) {
            let spriteScreenSize = Math.floor(canvas.height / bot.dist);
            let spriteScreenX = Math.floor((canvas.width / 2) + (Math.tan(spriteAngle) * (canvas.width / 2)) - (spriteScreenSize / 2));
            let spriteScreenY = Math.floor((canvas.height / 2) - (spriteScreenSize / 2) + playerHeightOffset);

            let pillarWidth = Math.floor(spriteScreenSize / 2.5);
            let pillarHeight = Math.floor(spriteScreenSize * 0.9);
            
            let startX = Math.max(0, spriteScreenX + Math.floor(spriteScreenSize/2) - Math.floor(pillarWidth/2));
            let endX = Math.min(canvas.width, spriteScreenX + Math.floor(spriteScreenSize/2) + Math.floor(pillarWidth/2));

            for (let x = startX; x < endX; x++) {
                if (zBuffer[x] && zBuffer[x] < bot.dist) {
                    continue; 
                }

                ctx.fillStyle = "#ef4444";
                ctx.fillRect(x, spriteScreenY + Math.floor(spriteScreenSize * 0.1), 1, pillarHeight);
                
                if (x >= spriteScreenX + Math.floor(spriteScreenSize/2) - Math.floor(pillarWidth/4) &&
                    x <= spriteScreenX + Math.floor(spriteScreenSize/2) + Math.floor(pillarWidth/4)) {
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(x, spriteScreenY - Math.floor(spriteScreenSize * 0.15), 1, Math.floor(pillarWidth / 2));
                }
            }
        }
    });
}

function processPlayerWeaponFire() {
    let targetedBot = null;
    let activeWp = weaponsInventory[currentWeaponKey];
    let minAngleTolerance = activeWp.hitWindow; 

    botsArray.forEach(bot => {
        let spriteAngle = Math.atan2(bot.y - playerState.y, bot.x - playerState.x) - playerState.angle;
        while (spriteAngle < -Math.PI) spriteAngle += Math.PI * 2;
        while (spriteAngle > Math.PI) spriteAngle -= Math.PI * 2;

        if (Math.abs(spriteAngle) < minAngleTolerance) {
            if (!targetedBot || bot.dist < targetedBot.dist) {
                targetedBot = bot;
            }
        }
    });

    if (targetedBot) {
        let wallBlocksBullet = checkRayIntersectsSolidWall(playerState.x, playerState.y, targetedBot.x, targetedBot.y, targetedBot.dist);

        if (wallBlocksBullet) return; 

        botsArray = botsArray.filter(b => b.id !== targetedBot.id);
        killCount++;
        killDisplay.innerText = killCount;
        
        const difficultySelection = document.getElementById('bot-difficulty').value;
        const activeProfile = DIFFICULTY_PROFILES[difficultySelection];
        setTimeout(() => { if (gameActive) spawnSingleRandomBot(targetedBot.id, activeProfile.speed); }, 500);
    }
}

function checkRayIntersectsSolidWall(startX, startY, endX, endY, maxDistance) {
    let angle = Math.atan2(endY - startY, endX - startX);
    let stepSize = 0.1;
    let currentDistance = 0;
    
    let cos = Math.cos(angle);
    let sin = Math.sin(angle);

    while (currentDistance < maxDistance) {
        currentDistance += stepSize;
        let testX = Math.floor(startX + cos * currentDistance);
        let testY = Math.floor(startY + sin * currentDistance);

        if (testX >= 0 && testX < MAP_W && testY >= 0 && testY < MAP_H) {
            if (MAP[testY][testX] > 0) return true;
        }
    }
    return false;
}

function stop3DMatch() {
    gameActive = false;
    document.exitPointerLock();
    cancelAnimationFrame(engineLoops.render);
    clearInterval(engineLoops.shield);
    
    gameContainer.classList.add('hidden');
    lobbyUi.classList.remove('hidden');
    botsArray = [];
}