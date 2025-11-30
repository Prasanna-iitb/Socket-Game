// client.js
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const socket = new WebSocket("ws://localhost:8080");

let myId = null;

// Buffer of latest snapshots for interpolation
let stateBuffer = [];

// Handle messages from server (with simulated latency)
socket.onmessage = (event) => {
    setTimeout(() => {
        const msg = JSON.parse(event.data);

        if (msg.type === "welcome") {
            myId = msg.id;
        }

        if (msg.type === "state") {
            stateBuffer.push({ time: Date.now(), state: msg });

            // Keep buffer from growing too large
            if (stateBuffer.length > 20) {
                stateBuffer.shift();
            }
        }
    }, 200); // client receive latency
};

// Send input with simulated latency
function sendInput(dir) {
    if (myId == null) return;

    setTimeout(() => {
        socket.send(JSON.stringify({
            type: "input",
            id: myId,
            dir
        }));
    }, 200); // client send latency
}

// Keyboard handling
document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft")  sendInput("left");
    if (e.key === "ArrowRight") sendInput("right");
    if (e.key === "ArrowUp")    sendInput("up");
    if (e.key === "ArrowDown")  sendInput("down");
});

// Interpolation
function getInterpolatedState() {
    if (stateBuffer.length < 2) return null;

    // Render 100ms in the past
    const renderTimestamp = Date.now() - 100;

    let older = null;
    let newer = null;

    for (let i = stateBuffer.length - 2; i >= 0; i--) {
        if (stateBuffer[i].time <= renderTimestamp) {
            older = stateBuffer[i];
            newer = stateBuffer[i + 1];
            break;
        }
    }

    // If we didn't find a good pair, just use the oldest
    if (!older || !newer) {
        return stateBuffer[0].state;
    }

    const t0 = older.time;
    const t1 = newer.time;
    const alpha = (renderTimestamp - t0) / (t1 - t0);

    const interpPlayers = {};
    for (const id in older.state.players) {
        const p0 = older.state.players[id];
        const p1 = newer.state.players[id] || p0;

        interpPlayers[id] = {
            x: p0.x + (p1.x - p0.x) * alpha,
            y: p0.y + (p1.y - p0.y) * alpha,
            score: p1.score
        };
    }

    return {
        players: interpPlayers,
        coins: newer.state.coins
    };
}

function render() {
    // ----- Alternating green tile background -----
    const tileSize = 40;

    for (let x = 0; x < canvas.width; x += tileSize) {
        for (let y = 0; y < canvas.height; y += tileSize) {
            const isEven = ((x / tileSize) + (y / tileSize)) % 2 === 0;
            ctx.fillStyle = isEven ? "#009b2a" : "#049e36";
            ctx.fillRect(x, y, tileSize, tileSize);
        }
    }

    const s = getInterpolatedState();
    if (!s) {
        requestAnimationFrame(render);
        return;
    }

    // ----- Draw coins -----
    s.coins.forEach(c => {
        const radgrad = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 10);
        radgrad.addColorStop(0, "yellow");
        radgrad.addColorStop(1, "gold");

        ctx.fillStyle = radgrad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
        ctx.fill();
    });

    // ----- Draw players -----
    ctx.font = "14px Arial";
    ctx.textBaseline = "bottom";

    for (const id in s.players) {
        const p = s.players[id];

        // Player body
        ctx.fillStyle = (parseInt(id) === myId) ? "#2b6dff" : "#ff3b3b";
        ctx.strokeStyle = "#001000";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.rect(p.x - 12, p.y - 12, 24, 24);
        ctx.fill();
        ctx.stroke();

        // Name + score
        ctx.fillStyle = "black";
        ctx.fillText(`P${id}: ${p.score}`, p.x - 18, p.y - 16);
    }

    // ----- HUD -----
    if (myId !== null && s.players[myId]) {
        const me = s.players[myId];
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(5, 5, 170, 55);

        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText(`You: P${myId}`, 15, 25);
        ctx.fillText(`Score: ${me.score}`, 15, 45);
    }

    requestAnimationFrame(render);
}

render();
