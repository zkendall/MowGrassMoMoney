(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const WORLD = {
    width: canvas.width,
    height: canvas.height,
  };

  const mowerSprite = {
    image: new Image(),
    loaded: false,
    // 1024x1024 sheet arranged as 4 columns x 3 rows.
    frame: { x: 256, y: 0, w: 256, h: 256 },
    drawW: 54,
    drawH: 54,
    headingOffset: -Math.PI / 2,
  };
  mowerSprite.image.src = 'assets/mower-sheet.png';
  mowerSprite.image.onload = () => {
    mowerSprite.loaded = true;
  };

  const grassSprites = {
    unmowed: new Image(),
    mowed: new Image(),
    unmowedLoaded: false,
    mowedLoaded: false,
  };
  grassSprites.unmowed.src = 'assets/grass-unmowed.png';
  grassSprites.mowed.src = 'assets/grass-mowed.png';
  grassSprites.unmowed.onload = () => {
    grassSprites.unmowedLoaded = true;
  };
  grassSprites.mowed.onload = () => {
    grassSprites.mowedLoaded = true;
  };

  const scene = {
    lawn: { x: 145, y: 130, w: 665, h: 455 },
    house: { x: 95, y: 20, w: 770, h: 95 },
    driveway: { x: 760, y: 115, w: 90, h: 500 },
    fenceInset: 40,
    targetCoverage: 95,
  };

  const obstacles = [
    { id: 'tree', kind: 'circle', x: 305, y: 280, r: 30 },
    { id: 'flower-bed', kind: 'rect', x: 490, y: 225, w: 125, h: 56 },
    { id: 'rock', kind: 'circle', x: 650, y: 320, r: 23 },
    { id: 'sprinkler', kind: 'circle', x: 360, y: 465, r: 17 },
    { id: 'gnome', kind: 'rect', x: 592, y: 458, w: 26, h: 30 },
  ];

  const mower = {
    x: scene.lawn.x + 72,
    y: scene.lawn.y + 58,
    heading: 0,
    radius: 18,
    deckRadius: 26,
    speed: 0,
    maxForward: 126,
    maxReverse: 72,
    accel: 270,
    drag: 3.8,
    turnRate: 3.4,
  };

  const input = {
    leftDown: false,
    rightDown: false,
    mouse: { x: mower.x, y: mower.y },
    prevMouse: { x: mower.x, y: mower.y },
  };

  const mowGrid = {
    cell: 18,
    cols: Math.floor(WORLD.width / 18),
    rows: Math.floor(WORLD.height / 18),
    states: [],
    mowableCount: 0,
    mowedCount: 0,
  };

  const state = {
    mode: 'start',
    elapsed: 0,
    coverage: 0,
    lastWinAt: null,
    steerDisplay: 0,
    musicMuted: true,
  };

  const music = {
    ctx: null,
    master: null,
    started: false,
    muted: true,
    step: 0,
    timerId: null,
    bassOsc: null,
    bassGain: null,
    padOsc: null,
    padGain: null,
  };

  function midiToHz(note) {
    return 440 * (2 ** ((note - 69) / 12));
  }

  function setMusicMuted(isMuted) {
    music.muted = isMuted;
    state.musicMuted = isMuted;
    if (music.master && music.ctx) {
      const now = music.ctx.currentTime;
      music.master.gain.cancelScheduledValues(now);
      music.master.gain.setTargetAtTime(isMuted ? 0 : 0.09, now, 0.05);
    }
  }

  function ensureMusicStarted() {
    if (!music.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      music.ctx = new AudioCtx();
      music.master = music.ctx.createGain();
      music.master.gain.value = 0.09;
      music.master.connect(music.ctx.destination);

      const padFilter = music.ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 850;
      padFilter.Q.value = 0.8;
      padFilter.connect(music.master);

      music.padOsc = music.ctx.createOscillator();
      music.padOsc.type = 'triangle';
      music.padGain = music.ctx.createGain();
      music.padGain.gain.value = 0.03;
      music.padOsc.connect(music.padGain);
      music.padGain.connect(padFilter);
      music.padOsc.start();

      music.bassOsc = music.ctx.createOscillator();
      music.bassOsc.type = 'sine';
      music.bassGain = music.ctx.createGain();
      music.bassGain.gain.value = 0.045;
      music.bassOsc.connect(music.bassGain);
      music.bassGain.connect(music.master);
      music.bassOsc.start();
    }

    music.ctx.resume();
    if (music.started) return;
    music.started = true;

    const bassPattern = [40, 40, 43, 45, 47, 45, 43, 40];
    const padPattern = [52, 55, 59, 57];

    music.timerId = window.setInterval(() => {
      if (!music.ctx || !music.bassOsc || !music.padOsc) return;
      const now = music.ctx.currentTime;
      const bassNote = bassPattern[music.step % bassPattern.length];
      const padNote = padPattern[music.step % padPattern.length];

      music.bassOsc.frequency.setTargetAtTime(midiToHz(bassNote), now, 0.08);
      music.padOsc.frequency.setTargetAtTime(midiToHz(padNote), now, 0.15);

      // Light pulse for movement in the backing track.
      music.bassGain.gain.cancelScheduledValues(now);
      music.bassGain.gain.setValueAtTime(0.03, now);
      music.bassGain.gain.linearRampToValueAtTime(0.055, now + 0.06);
      music.bassGain.gain.linearRampToValueAtTime(0.03, now + 0.28);

      music.step += 1;
    }, 320);

    setMusicMuted(music.muted);
  }

  function circleRectIntersects(cx, cy, cr, rect) {
    const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= cr * cr;
  }

  function collidesWithWorld(x, y, r) {
    const left = scene.lawn.x + r;
    const right = scene.lawn.x + scene.lawn.w - r;
    const top = scene.lawn.y + r;
    const bottom = scene.lawn.y + scene.lawn.h - r;

    if (x < left || x > right || y < top || y > bottom) {
      return true;
    }

    for (const obstacle of obstacles) {
      if (obstacle.kind === 'circle') {
        const dx = x - obstacle.x;
        const dy = y - obstacle.y;
        const minD = r + obstacle.r;
        if (dx * dx + dy * dy <= minD * minD) {
          return true;
        }
      } else if (circleRectIntersects(x, y, r, obstacle)) {
        return true;
      }
    }

    return false;
  }

  function collisionNormalAt(x, y, r) {
    let nx = 0;
    let ny = 0;

    const left = scene.lawn.x + r;
    const right = scene.lawn.x + scene.lawn.w - r;
    const top = scene.lawn.y + r;
    const bottom = scene.lawn.y + scene.lawn.h - r;

    if (x < left) nx += 1;
    if (x > right) nx -= 1;
    if (y < top) ny += 1;
    if (y > bottom) ny -= 1;

    for (const obstacle of obstacles) {
      if (obstacle.kind === 'circle') {
        const dx = x - obstacle.x;
        const dy = y - obstacle.y;
        const minD = r + obstacle.r;
        const d2 = dx * dx + dy * dy;
        if (d2 <= minD * minD) {
          const d = Math.sqrt(Math.max(0.0001, d2));
          nx += dx / d;
          ny += dy / d;
        }
      } else if (circleRectIntersects(x, y, r, obstacle)) {
        const nearestX = Math.max(obstacle.x, Math.min(x, obstacle.x + obstacle.w));
        const nearestY = Math.max(obstacle.y, Math.min(y, obstacle.y + obstacle.h));
        let dx = x - nearestX;
        let dy = y - nearestY;

        if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
          const toLeft = Math.abs(x - obstacle.x);
          const toRight = Math.abs(obstacle.x + obstacle.w - x);
          const toTop = Math.abs(y - obstacle.y);
          const toBottom = Math.abs(obstacle.y + obstacle.h - y);
          const minEdge = Math.min(toLeft, toRight, toTop, toBottom);
          if (minEdge === toLeft) dx = -1;
          else if (minEdge === toRight) dx = 1;
          else if (minEdge === toTop) dy = -1;
          else dy = 1;
        }

        const d = Math.hypot(dx, dy) || 1;
        nx += dx / d;
        ny += dy / d;
      }
    }

    const len = Math.hypot(nx, ny);
    if (len < 0.0001) {
      return { x: 0, y: 0 };
    }
    return { x: nx / len, y: ny / len };
  }

  function moveWithSlide(dx, dy, r) {
    const startX = mower.x;
    const startY = mower.y;
    const targetX = startX + dx;
    const targetY = startY + dy;

    if (!collidesWithWorld(targetX, targetY, r)) {
      mower.x = targetX;
      mower.y = targetY;
      return true;
    }

    // Move as far as possible toward target (binary search to contact point).
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 10; i += 1) {
      const mid = (lo + hi) * 0.5;
      const mx = startX + dx * mid;
      const my = startY + dy * mid;
      if (collidesWithWorld(mx, my, r)) hi = mid;
      else lo = mid;
    }

    let px = startX + dx * lo;
    let py = startY + dy * lo;
    mower.x = px;
    mower.y = py;

    const remain = 1 - lo;
    if (remain <= 0.001) return false;

    const normal = collisionNormalAt(px, py, r);
    const remX = dx * remain;
    const remY = dy * remain;
    const dot = remX * normal.x + remY * normal.y;
    let slideX = remX;
    let slideY = remY;
    if (dot < 0) {
      slideX = remX - normal.x * dot;
      slideY = remY - normal.y * dot;
    }

    const slideTargetX = px + slideX;
    const slideTargetY = py + slideY;
    if (!collidesWithWorld(slideTargetX, slideTargetY, r)) {
      mower.x = slideTargetX;
      mower.y = slideTargetY;
      return true;
    }

    // Fallback: keep whichever single-axis movement is non-colliding.
    const axisX = px + slideX;
    if (!collidesWithWorld(axisX, py, r)) {
      mower.x = axisX;
      return true;
    }

    const axisY = py + slideY;
    if (!collidesWithWorld(px, axisY, r)) {
      mower.y = axisY;
      return true;
    }

    return false;
  }

  function isPointMowable(x, y) {
    if (
      x < scene.lawn.x ||
      x > scene.lawn.x + scene.lawn.w ||
      y < scene.lawn.y ||
      y > scene.lawn.y + scene.lawn.h
    ) {
      return false;
    }

    for (const obstacle of obstacles) {
      if (obstacle.kind === 'circle') {
        const dx = x - obstacle.x;
        const dy = y - obstacle.y;
        if (dx * dx + dy * dy <= obstacle.r * obstacle.r) {
          return false;
        }
      } else if (
        x >= obstacle.x &&
        x <= obstacle.x + obstacle.w &&
        y >= obstacle.y &&
        y <= obstacle.y + obstacle.h
      ) {
        return false;
      }
    }

    return true;
  }

  function initMowGrid() {
    mowGrid.states = new Array(mowGrid.cols * mowGrid.rows).fill(0);
    mowGrid.mowableCount = 0;
    mowGrid.mowedCount = 0;

    for (let row = 0; row < mowGrid.rows; row += 1) {
      for (let col = 0; col < mowGrid.cols; col += 1) {
        const x = col * mowGrid.cell + mowGrid.cell * 0.5;
        const y = row * mowGrid.cell + mowGrid.cell * 0.5;
        if (isPointMowable(x, y)) {
          const idx = row * mowGrid.cols + col;
          mowGrid.states[idx] = 1;
          mowGrid.mowableCount += 1;
        }
      }
    }
    updateCoverage();
  }

  function updateCoverage() {
    state.coverage = mowGrid.mowableCount === 0
      ? 0
      : (mowGrid.mowedCount / mowGrid.mowableCount) * 100;
  }

  function mowUnderDeck() {
    const dx = Math.cos(mower.heading) * 8;
    const dy = Math.sin(mower.heading) * 8;
    const deckX = mower.x + dx;
    const deckY = mower.y + dy;

    const minCol = Math.max(0, Math.floor((deckX - mower.deckRadius) / mowGrid.cell));
    const maxCol = Math.min(mowGrid.cols - 1, Math.ceil((deckX + mower.deckRadius) / mowGrid.cell));
    const minRow = Math.max(0, Math.floor((deckY - mower.deckRadius) / mowGrid.cell));
    const maxRow = Math.min(mowGrid.rows - 1, Math.ceil((deckY + mower.deckRadius) / mowGrid.cell));

    let changed = 0;

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const cx = col * mowGrid.cell + mowGrid.cell * 0.5;
        const cy = row * mowGrid.cell + mowGrid.cell * 0.5;
        const offX = cx - deckX;
        const offY = cy - deckY;
        if (offX * offX + offY * offY > mower.deckRadius * mower.deckRadius) {
          continue;
        }

        const idx = row * mowGrid.cols + col;
        if (mowGrid.states[idx] === 1) {
          mowGrid.states[idx] = 2;
          mowGrid.mowedCount += 1;
          changed += 1;
        }
      }
    }

    if (changed > 0) {
      updateCoverage();
    }
  }

  function normalizeAngle(rad) {
    let a = rad;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function applyFrontPivotTurn(deltaHeading) {
    if (Math.abs(deltaHeading) < 0.000001) {
      return true;
    }

    const pivotDist = 16;
    const oldDirX = Math.cos(mower.heading);
    const oldDirY = Math.sin(mower.heading);
    const frontX = mower.x + oldDirX * pivotDist;
    const frontY = mower.y + oldDirY * pivotDist;

    const nextHeading = normalizeAngle(mower.heading + deltaHeading);
    const newDirX = Math.cos(nextHeading);
    const newDirY = Math.sin(nextHeading);
    const nextX = frontX - newDirX * pivotDist;
    const nextY = frontY - newDirY * pivotDist;

    if (!collidesWithWorld(nextX, nextY, mower.radius)) {
      mower.heading = nextHeading;
      mower.x = nextX;
      mower.y = nextY;
      return true;
    }

    return false;
  }

  function update(dt) {
    if (state.mode !== 'playing') {
      return;
    }

    state.elapsed += dt;

    const throttle = (input.leftDown ? 1 : 0) + (input.rightDown ? -0.72 : 0);
    const targetSpeed = throttle >= 0
      ? throttle * mower.maxForward
      : throttle * mower.maxReverse;

    const speedDelta = targetSpeed - mower.speed;
    mower.speed += speedDelta * Math.min(1, mower.accel * dt / Math.max(1, Math.abs(speedDelta)));
    mower.speed *= 1 / (1 + mower.drag * dt * (throttle === 0 ? 1 : 0.2));

    if (Math.abs(mower.speed) < 1.5 && throttle === 0) {
      mower.speed = 0;
    }

    // Steering is based on horizontal mouse movement, not absolute cursor position.
    // Move mouse left => turn left. Move mouse right => turn right.
    const toCursor = Math.atan2(input.mouse.y - mower.y, input.mouse.x - mower.x);
    const diff = normalizeAngle(toCursor - mower.heading);
    const steerScale = Math.max(-1, Math.min(1, diff / (Math.PI / 2)));
    const moveFactor = Math.min(1, Math.abs(mower.speed) / mower.maxForward);
    const turnStrength = 0.95 + moveFactor * 0.7;
    const headingDelta = steerScale * mower.turnRate * turnStrength * dt;
    const turned = applyFrontPivotTurn(headingDelta);
    if (!turned) {
      mower.heading = normalizeAngle(mower.heading + headingDelta * 0.35);
    }
    state.steerDisplay += (steerScale - state.steerDisplay) * 0.45;

    const vx = Math.cos(mower.heading) * mower.speed;
    const vy = Math.sin(mower.heading) * mower.speed;
    const moved = moveWithSlide(vx * dt, vy * dt, mower.radius);
    if (!moved) {
      mower.speed *= 0.75;
    }

    mowUnderDeck();

    if (state.coverage >= scene.targetCoverage) {
      state.mode = 'won';
      state.lastWinAt = state.elapsed;
      input.leftDown = false;
      input.rightDown = false;
      mower.speed = 0;
    }
  }

  function drawMowGrid() {
    for (let row = 0; row < mowGrid.rows; row += 1) {
      for (let col = 0; col < mowGrid.cols; col += 1) {
        const idx = row * mowGrid.cols + col;
        const cell = mowGrid.states[idx];
        if (cell === 0) {
          continue;
        }

        const x = col * mowGrid.cell;
        const y = row * mowGrid.cell;
        if (cell === 1 && grassSprites.unmowedLoaded) {
          ctx.drawImage(grassSprites.unmowed, 0, 0, 128, 128, x, y, mowGrid.cell, mowGrid.cell);
        } else if (cell === 2 && grassSprites.mowedLoaded) {
          ctx.drawImage(grassSprites.mowed, 0, 0, 128, 128, x, y, mowGrid.cell, mowGrid.cell);
        } else {
          if (cell === 1) {
            ctx.fillStyle = ((row + col) % 2 === 0) ? '#6aa65e' : '#72ad65';
          } else {
            ctx.fillStyle = ((row + col) % 2 === 0) ? '#4f8c4a' : '#588f50';
          }
          ctx.fillRect(x, y, mowGrid.cell, mowGrid.cell);
        }
      }
    }
  }

  function drawScene() {
    ctx.fillStyle = '#80a884';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.fillStyle = '#d3c4aa';
    ctx.fillRect(scene.house.x, scene.house.y, scene.house.w, scene.house.h);
    ctx.fillStyle = '#ae8f6f';
    ctx.fillRect(scene.house.x + 18, scene.house.y + 14, scene.house.w - 36, 20);

    ctx.fillStyle = '#b7b0a0';
    ctx.fillRect(scene.driveway.x, scene.driveway.y, scene.driveway.w, scene.driveway.h);

    drawMowGrid();

    ctx.strokeStyle = '#e8dfcf';
    ctx.lineWidth = 4;
    ctx.strokeRect(scene.lawn.x, scene.lawn.y, scene.lawn.w, scene.lawn.h);

    for (const obstacle of obstacles) {
      if (obstacle.id === 'tree') {
        ctx.fillStyle = '#6e4f33';
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y + 8, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b6b3f';
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y - 7, obstacle.r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (obstacle.id === 'flower-bed') {
        ctx.fillStyle = '#7a5e45';
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
        ctx.fillStyle = '#d9899e';
        for (let i = 0; i < 9; i += 1) {
          const fx = obstacle.x + 10 + (i % 5) * 22;
          const fy = obstacle.y + 11 + Math.floor(i / 5) * 24;
          ctx.beginPath();
          ctx.arc(fx, fy, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }

      if (obstacle.id === 'rock') {
        ctx.fillStyle = '#70767b';
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (obstacle.id === 'sprinkler') {
        ctx.fillStyle = '#8aa9bf';
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#deeff7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.r + 6, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }

      if (obstacle.id === 'gnome') {
        ctx.fillStyle = '#f5e0c4';
        ctx.fillRect(obstacle.x, obstacle.y + 10, obstacle.w, obstacle.h - 10);
        ctx.fillStyle = '#c6534a';
        ctx.beginPath();
        ctx.moveTo(obstacle.x + obstacle.w * 0.5, obstacle.y);
        ctx.lineTo(obstacle.x, obstacle.y + 12);
        ctx.lineTo(obstacle.x + obstacle.w, obstacle.y + 12);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawMower() {
    if (mowerSprite.loaded) {
      ctx.save();
      ctx.translate(mower.x, mower.y);
      ctx.rotate(mower.heading + mowerSprite.headingOffset);
      ctx.drawImage(
        mowerSprite.image,
        mowerSprite.frame.x,
        mowerSprite.frame.y,
        mowerSprite.frame.w,
        mowerSprite.frame.h,
        -mowerSprite.drawW * 0.5,
        -mowerSprite.drawH * 0.5,
        mowerSprite.drawW,
        mowerSprite.drawH
      );
      ctx.restore();
      return;
    }

    const deckX = mower.x + Math.cos(mower.heading) * 8;
    const deckY = mower.y + Math.sin(mower.heading) * 8;

    ctx.fillStyle = '#2f3136';
    ctx.beginPath();
    ctx.arc(deckX, deckY, mower.deckRadius * 0.66, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(mower.x, mower.y);
    ctx.rotate(mower.heading);

    ctx.fillStyle = '#cf3f2f';
    ctx.beginPath();
    ctx.roundRect(-18, -15, 36, 30, 7);
    ctx.fill();

    ctx.fillStyle = '#1f2125';
    ctx.fillRect(2, -12, 12, 24);

    ctx.fillStyle = '#f0efe8';
    ctx.fillRect(-16, -4, 12, 8);

    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, -15);
    ctx.lineTo(-31, -26);
    ctx.lineTo(-44, -26);
    ctx.stroke();

    ctx.restore();
  }

  function drawUi() {
    ctx.fillStyle = 'rgb(20 30 24 / 70%)';
    ctx.fillRect(16, 12, 300, 62);
    ctx.fillStyle = '#f4f0e0';
    ctx.font = '16px "Trebuchet MS", sans-serif';
    ctx.fillText(`Coverage: ${state.coverage.toFixed(1)}%`, 28, 35);
    ctx.fillText(`Target: ${scene.targetCoverage}%`, 28, 58);
    ctx.fillText(`Music: ${state.musicMuted ? 'Off' : 'On'} (M)`, 170, 35);
    drawSteeringHud();

    if (state.mode === 'start') {
      overlayMessage('Mow Grass Mo\' Money', 'Hold left mouse to mow. Cursor steers. Right mouse reverses.');
      overlayMessage('Press click or space to start', 'Clear 95% of the lawn while avoiding obstacles.', 36);
    } else if (state.mode === 'won') {
      overlayMessage('Job complete!', `Final coverage ${state.coverage.toFixed(1)}%. Press R to mow again.`);
    }
  }

  function drawSteeringHud() {
    const panelX = WORLD.width - 250;
    const panelY = 18;
    const panelW = 224;
    const panelH = 56;
    const trackX = panelX + 14;
    const trackY = panelY + 31;
    const trackW = panelW - 28;

    ctx.fillStyle = 'rgb(20 30 24 / 70%)';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.fillStyle = '#f4f0e0';
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillText('Steering', panelX + 14, panelY + 19);

    ctx.strokeStyle = '#d8d1b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(trackX, trackY);
    ctx.lineTo(trackX + trackW, trackY);
    ctx.stroke();

    const centerX = trackX + trackW * 0.5;
    ctx.strokeStyle = '#f4f0e0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, trackY - 8);
    ctx.lineTo(centerX, trackY + 8);
    ctx.stroke();

    const knobX = centerX + state.steerDisplay * (trackW * 0.5);
    ctx.fillStyle = '#d94a3c';
    ctx.beginPath();
    ctx.arc(knobX, trackY, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  function overlayMessage(title, subtitle, offset = 0) {
    const w = 580;
    const h = 90;
    const x = (WORLD.width - w) * 0.5;
    const y = (WORLD.height - h) * 0.5 + offset;

    ctx.fillStyle = 'rgb(12 18 14 / 72%)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d3c8aa';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#f4f0e0';
    ctx.font = 'bold 28px "Trebuchet MS", sans-serif';
    ctx.fillText(title, x + 24, y + 38);
    ctx.font = '16px "Trebuchet MS", sans-serif';
    ctx.fillText(subtitle, x + 24, y + 65);
  }

  function render() {
    drawScene();
    drawMower();
    drawUi();
  }

  function resetGame(startPlaying) {
    mower.x = scene.lawn.x + 72;
    mower.y = scene.lawn.y + 58;
    mower.heading = 0;
    mower.speed = 0;
    state.elapsed = 0;
    state.lastWinAt = null;
    state.steerDisplay = 0;
    input.leftDown = false;
    input.rightDown = false;
    input.prevMouse.x = mower.x;
    input.prevMouse.y = mower.y;
    initMowGrid();
    state.mode = startPlaying ? 'playing' : 'start';
  }

  function startGame() {
    if (state.mode === 'start') {
      state.mode = 'playing';
    }
  }

  function canvasPointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = WORLD.width / rect.width;
    const scaleY = WORLD.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('mousedown', (event) => {
    ensureMusicStarted();
    const pt = canvasPointFromEvent(event);
    input.mouse = pt;
    input.prevMouse = { ...pt };

    if (event.button === 0) {
      input.leftDown = true;
      startGame();
    }

    if (event.button === 2 && state.mode !== 'won') {
      input.rightDown = true;
      startGame();
    }
  });

  canvas.addEventListener('mouseup', (event) => {
    if (event.button === 0) input.leftDown = false;
    if (event.button === 2) input.rightDown = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    const pt = canvasPointFromEvent(event);
    input.mouse = pt;
    input.prevMouse = { ...pt };
  });

  window.addEventListener('mouseup', () => {
    input.leftDown = false;
    input.rightDown = false;
  });

  window.addEventListener('keydown', (event) => {
    ensureMusicStarted();
    if (event.key.toLowerCase() === 'f') {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        canvas.requestFullscreen?.();
      }
    }

    if (event.key.toLowerCase() === 'r') {
      resetGame(false);
    }

    if (event.key.toLowerCase() === 'm') {
      setMusicMuted(!music.muted);
    }

    if (event.key === ' ' && state.mode === 'start') {
      state.mode = 'playing';
    }
  });

  function renderGameToText() {
    const visibleObstacles = obstacles.map((o) =>
      o.kind === 'circle'
        ? { id: o.id, kind: o.kind, x: o.x, y: o.y, r: o.r }
        : { id: o.id, kind: o.kind, x: o.x, y: o.y, w: o.w, h: o.h }
    );

    const payload = {
      coordinate_system: 'origin top-left; +x right; +y down; units in canvas pixels',
      mode: state.mode,
      coverage_percent: Number(state.coverage.toFixed(2)),
      target_percent: scene.targetCoverage,
      mower: {
        x: Number(mower.x.toFixed(2)),
        y: Number(mower.y.toFixed(2)),
        heading_radians: Number(mower.heading.toFixed(3)),
        speed_px_per_sec: Number(mower.speed.toFixed(2)),
        body_radius: mower.radius,
        deck_radius: mower.deckRadius,
      },
      timers: {
        elapsed_seconds: Number(state.elapsed.toFixed(2)),
      },
      map: {
        lawn: scene.lawn,
        house_block: scene.house,
        driveway_block: scene.driveway,
        obstacles: visibleObstacles,
      },
      input: {
        left_mouse_held: input.leftDown,
        right_mouse_held: input.rightDown,
        steering_axis: Number(state.steerDisplay.toFixed(3)),
        music_muted: state.musicMuted,
        mouse_target: {
          x: Number(input.mouse.x.toFixed(1)),
          y: Number(input.mouse.y.toFixed(1)),
        },
      },
      objective: 'Mow 95% of mowable grass without crossing boundaries or obstacles.',
    };

    return JSON.stringify(payload);
  }

  let accumulator = 0;
  let lastTime = performance.now();
  const fixedStep = 1 / 60;

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += dt;

    while (accumulator >= fixedStep) {
      update(fixedStep);
      accumulator -= fixedStep;
    }

    render();
    requestAnimationFrame(frame);
  }

  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      update(1 / 60);
    }
    render();
  };

  window.render_game_to_text = renderGameToText;

  resetGame(false);
  render();
  requestAnimationFrame(frame);
})();
