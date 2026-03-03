/**
 * Robo-Fix Blitz
 * A chaotic management game in a futuristic workshop.
 */

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    pixelArt: false
};

const game = new Phaser.Game(config);

let player;
let cursors;
let keys;
let score = 0;
let timer = 180; // 3 minutes
let heldItem = null;
let itemSprite = null;
let gameStarted = false;
let startScreen;

// Game State
const Parts = {
    RED: 'Vermelho',
    BLUE: 'Azul',
    YELLOW: 'Amarelo',
    PURPLE: 'Roxo',   // Vermelho + Azul
    GREEN: 'Verde'    // Amarelo Processado
};

let stations = [];
let clients = [];
let nextClientTime = 0;

function preload() {
    this.load.image('player', 'assets/images/player.png');
    this.load.spritesheet('parts', 'assets/images/parts.png', { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet('clients', 'assets/images/clients.png', { frameWidth: 512, frameHeight: 512 });
}

function create() {
    // World setup
    this.add.grid(400, 300, 800, 600, 40, 40, 0x0f172a, 1, 0x1e293b, 1);

    // Stations setup
    createStations(this);

    // Player setup
    player = this.physics.add.sprite(400, 300, 'player');
    player.setScale(0.15); // Adjust based on original size
    player.setCollideWorldBounds(true);
    player.setDrag(500);

    // Controls
    cursors = this.input.keyboard.createCursorKeys();
    keys = this.input.keyboard.addKeys({
        'action': Phaser.Input.Keyboard.KeyCodes.SPACE,
        'interact': Phaser.Input.Keyboard.KeyCodes.X
    });

    // Event listeners
    this.input.keyboard.on('keydown-SPACE', handleAction, this);
    this.input.keyboard.on('keydown-X', handleInteraction, this);

    // Game loop timer
    this.time.addEvent({
        delay: 1000,
        callback: updateTimer,
        callbackScope: this,
        loop: true
    });

    // Score listener
    this.events.on('updateScore', (pts) => {
        score += pts;
        document.getElementById('score').innerText = score.toString().padStart(4, '0');
        updateStars();
    });

    // Start Screen
    startScreen = this.add.container(400, 300);
    let overlay = this.add.rectangle(0, 0, 800, 600, 0x000000, 0.85);
    let title = this.add.text(0, -50, 'ROBO-FIX BLITZ', { fontSize: '48px', fontWeight: 'bold', color: '#fecdd3', fontFamily: 'Outfit' }).setOrigin(0.5);
    let subtitle = this.add.text(0, 20, 'Conserte robôs futuristas antes que a paciência acabe!', { fontSize: '18px', color: '#94a3b8', fontFamily: 'Outfit' }).setOrigin(0.5);
    let prompt = this.add.text(0, 100, 'PRESSIONE [ESPAÇO] PARA COMEÇAR', { fontSize: '20px', color: '#fbbf24', fontFamily: 'Outfit' }).setOrigin(0.5);

    this.tweens.add({
        targets: prompt,
        alpha: 0.3,
        duration: 800,
        yoyo: true,
        repeat: -1
    });

    startScreen.add([overlay, title, subtitle, prompt]);
    startScreen.setDepth(100);
}

function update(time, delta) {
    if (!gameStarted) {
        if (keys.action.isDown) {
            gameStarted = true;
            startScreen.destroy();
        }
        return;
    }
    handleMovement();
    handleCarrying();
    handleClientSpawning(time, this);
    handleClientPatience(delta, this);
}

function handleMovement() {
    const speed = 300;
    player.setVelocity(0);

    let moveX = 0;
    let moveY = 0;

    if (cursors.left.isDown) moveX = -1;
    else if (cursors.right.isDown) moveX = 1;

    if (cursors.up.isDown) moveY = -1;
    else if (cursors.down.isDown) moveY = 1;

    if (moveX !== 0 && moveY !== 0) {
        moveX *= 0.7071;
        moveY *= 0.7071;
    }

    player.setVelocityX(moveX * speed);
    player.setVelocityY(moveY * speed);
}

function handleCarrying() {
    if (itemSprite) {
        itemSprite.x = player.x;
        itemSprite.y = player.y - 40;
    }
}

function handleAction() {
    // Picking up or dropping
    if (heldItem) {
        // Find if we are near a processing table or client
        let nearestStation = findNearestStation();
        if (nearestStation) {
            if (nearestStation.canAccept(heldItem)) {
                nearestStation.receiveItem(heldItem);
                dropItem();
            }
            // Se a mesa não aceita, o jogador mantém o item na mão em vez de sumir
        } else {
            // Só solta/descarta se estiver longe de qualquer estação
            dropItem();
        }
    } else {
        // Try picking up from supply or station result
        let nearestStation = findNearestStation();
        if (nearestStation && nearestStation.hasOutput()) {
            pickUpItem(nearestStation.takeOutput(), this);
        }
    }
}

function handleInteraction() {
    let nearestStation = findNearestStation();
    if (nearestStation && nearestStation.canProcess()) {
        nearestStation.startProcessing();
    }
}

function pickUpItem(itemName, scene) {
    heldItem = itemName;

    itemSprite = scene.add.sprite(player.x, player.y - 40, 'parts', 0);
    itemSprite.setScale(0.08);

    // Aplica a cor baseada no nome da peça
    if (itemName === Parts.RED) itemSprite.setTint(0xef4444);
    else if (itemName === Parts.BLUE) itemSprite.setTint(0x3b82f6);
    else if (itemName === Parts.YELLOW) itemSprite.setTint(0xfacc15);
    else if (itemName === Parts.PURPLE) itemSprite.setTint(0xa855f7);
    else if (itemName === Parts.GREEN) itemSprite.setTint(0x22c55e);
}

function dropItem() {
    if (itemSprite) {
        itemSprite.destroy();
        itemSprite = null;
    }
    heldItem = null;
}

function createStations(scene) {
    // Supply Boxes - Agora com cores claras
    stations.push(new SupplyStation(scene, 100, 100, Parts.RED, 0xef4444));
    stations.push(new SupplyStation(scene, 100, 200, Parts.BLUE, 0x3b82f6));
    stations.push(new SupplyStation(scene, 100, 300, Parts.YELLOW, 0xfacc15));

    // Processing Stations - Receitas simples
    stations.push(new ProcessingStation(scene, 700, 200, 'PRENSA', Parts.YELLOW, Parts.GREEN, 0x334155));
    stations.push(new ProcessingStation(scene, 700, 400, 'SOLDA', [Parts.RED, Parts.BLUE], Parts.PURPLE, 0x334155));

    // Client Dock
    stations.push(new DeliveryStation(scene, 400, 550, 0x1e293b));
}

function findNearestStation() {
    let best = null;
    let minDistance = 999;

    stations.forEach(s => {
        let d = Phaser.Math.Distance.Between(player.x, player.y, s.x, s.y);
        // Aumenta o raio para a DeliveryStation (150px) pois ela é um balcão largo
        let threshold = (s instanceof DeliveryStation) ? 150 : 80;

        if (d < threshold && d < minDistance) {
            minDistance = d;
            best = s;
        }
    });
    return best;
}

// Station Classes
class SupplyStation {
    constructor(scene, x, y, part, color) {
        this.x = x;
        this.y = y;
        this.part = part;
        this.sprite = scene.add.rectangle(x, y, 60, 60, color).setStrokeStyle(2, 0x94a3b8);
        scene.add.text(x, y, part, { fontSize: '12px', color: '#fff' }).setOrigin(0.5);
    }
    canAccept() { return false; }
    hasOutput() { return true; }
    takeOutput() { return this.part; }
}

class ProcessingStation {
    constructor(scene, x, y, name, inputs, output, color) {
        this.scene = scene;
        this.x = x; this.y = y;
        this.inputs = Array.isArray(inputs) ? inputs : [inputs];
        this.output = output;
        this.stored = [];
        this.processing = false;
        this.finished = false;
        this.progress = 0;

        this.sprite = scene.add.rectangle(x, y, 80, 80, color).setStrokeStyle(2, 0x94a3b8);
        this.label = scene.add.text(x, y - 20, name, { fontSize: '14px', color: '#fff' }).setOrigin(0.5);
        this.statusText = scene.add.text(x, y + 20, 'Vazio', { fontSize: '10px', color: '#94a3b8' }).setOrigin(0.5);

        this.progressBar = scene.add.rectangle(x, y + 35, 0, 5, 0x22c55e);
    }

    canAccept(item) {
        if (this.finished || this.processing) return false;

        // Verifica se ainda precisamos desta peça específica (evita colocar duas iguais se não necessário)
        const requiredCount = this.inputs.filter(i => i === item).length;
        const currentCount = this.stored.filter(i => i === item).length;

        return currentCount < requiredCount;
    }

    receiveItem(item) {
        this.stored.push(item);
        this.updateStatus();
    }

    updateStatus() {
        if (this.finished) {
            this.statusText.setText('CONCLUÍDO!');
            this.progressBar.width = 60;
        } else if (this.processing) {
            this.statusText.setText('PROCESSANDO...');
        } else if (this.canProcess()) {
            this.statusText.setText('PRONTO! APERTE [X]');
            this.statusText.setColor('#fbbf24');
        } else {
            this.statusText.setText(`AGUARDANDO: ${this.inputs.length - this.stored.length}`);
            this.statusText.setColor('#94a3b8');
        }
    }

    canProcess() {
        return this.stored.length === this.inputs.length && !this.processing && !this.finished;
    }

    startProcessing() {
        this.processing = true;
        this.stored = [];
        this.updateStatus();
        this.scene.tweens.add({
            targets: this.progressBar,
            width: 60,
            duration: 3000,
            onComplete: () => {
                this.processing = false;
                this.finished = true;
                this.updateStatus();
            }
        });
    }

    hasOutput() { return this.finished; }
    takeOutput() {
        this.finished = false;
        this.progressBar.width = 0;
        this.updateStatus();
        return this.output;
    }
}

class DeliveryStation {
    constructor(scene, x, y, color) {
        this.scene = scene;
        this.x = x; this.y = y;
        this.sprite = scene.add.rectangle(x, y, 200, 80, color).setStrokeStyle(2, 0xfecdd3);
        scene.add.text(x, y, 'DELIVERY ZONE', { fontSize: '16px', color: '#fecdd3' }).setOrigin(0.5);
    }
    canAccept(item) {
        // Encontra o cliente que está na zona de entrega (X entre 200 e 600)
        let activeClient = clients.find(c => c.container.y > 450 && Math.abs(c.container.x - 400) < 200);
        return !!activeClient && activeClient.needsItem(item);
    }
    receiveItem(item) {
        let activeClient = clients.find(c => c.container.y > 450 && Math.abs(c.container.x - 400) < 200);
        if (activeClient) {
            activeClient.giveItem(item);
        }
    }
    hasOutput() { return false; }
}

function handleClientSpawning(time, scene) {
    if (time > nextClientTime) {
        spawnClient(scene);
        nextClientTime = time + Phaser.Math.Between(10000, 20000);
    }
}

function spawnClient(scene) {
    if (clients.length >= 3) return;

    // Clientes pedem cores específicas
    const possibleNeeds = [
        [Parts.GREEN],
        [Parts.PURPLE],
        [Parts.GREEN, Parts.PURPLE]
    ];
    let needs = Phaser.Utils.Array.GetRandom(possibleNeeds);

    let client = new RobotClient(scene, needs);
    clients.push(client);

    // Animate entry
    scene.tweens.add({
        targets: client.container,
        y: 520,
        x: 300 + (clients.length * 50),
        duration: 2000
    });
}

class RobotClient {
    constructor(scene, needs) {
        this.scene = scene;
        this.needs = needs;
        this.fulfilled = [];
        this.patience = 45; // seconds
        this.maxPatience = 45;

        this.container = scene.add.container(400, 650);
        this.sprite = scene.add.sprite(0, 0, 'clients', Phaser.Math.Between(0, 3));
        this.sprite.setScale(0.12);

        this.thoughtBubble = scene.add.rectangle(0, -60, 80, 50, 0xffffff).setAlpha(0.9).setStrokeStyle(2, 0x000000);
        this.needText = scene.add.text(0, -60, needs.join(' + \n'), {
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#000',
            align: 'center'
        }).setOrigin(0.5);

        this.patienceBar = scene.add.rectangle(0, -90, 50, 6, 0x22c55e);

        this.container.add([this.sprite, this.thoughtBubble, this.needText, this.patienceBar]);

        // Adiciona um pequeno ícone colorido no balão (agora DENTRO do container)
        needs.forEach((n, i) => {
            let color = 0x000000;
            if (n === Parts.GREEN) color = 0x22c55e;
            if (n === Parts.PURPLE) color = 0xa855f7;
            let dot = scene.add.circle(i * 20 - 10, -85, 5, color);
            this.container.add(dot);
        });
    }

    needsItem(item) {
        return this.needs.includes(item) && !this.fulfilled.includes(item);
    }

    giveItem(item) {
        this.fulfilled.push(item);
        if (this.fulfilled.length === this.needs.length) {
            this.complete();
        } else {
            this.needText.setText(this.needs.filter(n => !this.fulfilled.includes(n)).join('\n'));
        }
    }

    complete() {
        let scoreBonus = 100;
        if (this.patience > this.maxPatience * 0.75) scoreBonus = 200;
        else if (this.patience > this.maxPatience * 0.4) scoreBonus = 100;
        else scoreBonus = 50;

        this.scene.events.emit('updateScore', scoreBonus);

        // Texto de pontos flutuante
        let txt = this.scene.add.text(this.container.x, this.container.y - 50, `+${scoreBonus}`, {
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#4ade80',
            fontFamily: 'Outfit'
        }).setOrigin(0.5);

        this.scene.tweens.add({
            targets: txt,
            y: txt.y - 100,
            alpha: 0,
            duration: 1000,
            onComplete: () => txt.destroy()
        });

        // Efeito "Feliz" e saída
        this.thoughtBubble.destroy();
        this.needText.destroy();
        this.patienceBar.destroy();

        this.scene.tweens.add({
            targets: this.container,
            scale: 1.2,
            y: this.container.y - 20,
            duration: 200,
            yoyo: true,
            onComplete: () => {
                this.scene.tweens.add({
                    targets: this.container,
                    x: 900,
                    alpha: 0,
                    duration: 1000,
                    onComplete: () => this.destroy()
                });
            }
        });
    }

    destroy() {
        clients = clients.filter(c => c !== this);
        this.container.destroy();
    }
}

function handleClientPatience(delta, scene) {
    clients.forEach(c => {
        c.patience -= delta / 1000;
        c.patienceBar.width = Math.max(0, (c.patience / c.maxPatience) * 50);

        if (c.patience <= 0) {
            scene.events.emit('updateScore', -100);
            c.destroy();
        } else if (c.patience < c.maxPatience * 0.25) {
            c.patienceBar.fillColor = 0xef4444;
        } else if (c.patience < c.maxPatience * 0.5) {
            c.patienceBar.fillColor = 0xfacc15;
        }
    });
}

function updateTimer() {
    if (!gameStarted) return;
    if (timer > 0) {
        timer--;
        let mins = Math.floor(timer / 60);
        let secs = timer % 60;
        document.getElementById('timer').innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    } else {
        // Game Over Logic
        alert(`Fim de jogo! Pontuação final: ${score}`);
        location.reload();
    }
}

function updateStars() {
    const starEls = document.querySelectorAll('.star');
    let starCount = 0;
    if (score >= 1000) starCount = 3;
    else if (score >= 500) starCount = 2;
    else if (score >= 200) starCount = 1;

    starEls.forEach((s, i) => {
        if (i < starCount) s.classList.add('active');
        else s.classList.remove('active');
    });
}
