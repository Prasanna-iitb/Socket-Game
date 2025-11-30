// server.js
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let nextPlayerId = 1;

// id -> { x, y, score }
const players = {};
let coins = [];

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

// Spawn a random coin
function randomSpawn() {
    return {
        id: Date.now() + Math.random(),
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT
    };
}

// Send with artificial latency
function sendWithDelay(ws, msg) {
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }, 200); // 200ms latency
}

wss.on('connection', (ws) => {
    const id = nextPlayerId++;
    players[id] = { x: 100, y: 100, score: 0 };

    console.log(`Player ${id} connected`);

    sendWithDelay(ws, { type: 'welcome', id });

    ws.on('message', (data) => {
        setTimeout(() => {
            const msg = JSON.parse(data);

            if (msg.type === 'input') {
                const p = players[msg.id];
                if (!p) return;

                const speed = 5;
                const S = 12; // half player size (since we draw 24x24)

                const oldX = p.x;
                const oldY = p.y;

                // ---------- MOVEMENT ----------
                if (msg.dir === 'left')  p.x -= speed;
                if (msg.dir === 'right') p.x += speed;
                if (msg.dir === 'up')    p.y -= speed;
                if (msg.dir === 'down')  p.y += speed;

                // ---------- WALL COLLISION ----------
                if (p.x < S) p.x = S;
                if (p.x > MAP_WIDTH - S) p.x = MAP_WIDTH - S;
                if (p.y < S) p.y = S;
                if (p.y > MAP_HEIGHT - S) p.y = MAP_HEIGHT - S;

                // ---------- PLAYER–PLAYER COLLISION ----------
                for (const otherId in players) {
                    if (otherId == msg.id) continue;

                    const o = players[otherId];

                    const dx = p.x - o.x;
                    const dy = p.y - o.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const minDist = 24; // player size

                    if (distance < minDist) {
                        const overlap = minDist - distance;

                        if (distance !== 0) {
                            p.x += (dx / distance) * overlap;
                            p.y += (dy / distance) * overlap;
                        } else {
                            // Same spot → revert
                            p.x = oldX;
                            p.y = oldY;
                        }
                    }
                }
            }
        }, 200); // input latency
    });

    ws.on('close', () => {
        delete players[id];
        console.log(`Player ${id} disconnected`);
    });
});

// ---------- GAME TICK (20 FPS) ----------
setInterval(() => {
    // ----- COIN COLLISION & SCORING (AUTHORITATIVE) -----
    const coinRadiusSq = 40 * 40; // collision radius ~40px

    for (const id in players) {
        const p = players[id];

        coins = coins.filter((c) => {
            const dx = p.x - c.x;
            const dy = p.y - c.y;

            if (dx * dx + dy * dy < coinRadiusSq) {
                // Player ate the coin
                p.score += 1;
                return false; // remove coin
            }
            return true; // keep coin
        });
    }

    // ----- BROADCAST SNAPSHOT -----
    const snapshot = {
        type: 'state',
        players,
        coins
    };

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            sendWithDelay(client, snapshot);
        }
    });
}, 50);

// Spawn a coin every 3 seconds
setInterval(() => {
    coins.push(randomSpawn());
}, 3000);

console.log('Server running on ws://localhost:8080');
