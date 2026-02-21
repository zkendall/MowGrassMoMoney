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

  const FUEL_PRICE_PER_GALLON = 3;
  const MOWER_TYPES = {
    manual: {
      id: 'manual',
      label: 'Manual Push',
      playbackSpeed: 95,
      deckRadius: 22,
      fuelCapacity: 0,
      fuelBurnPerPixel: 0,
      spriteFrame: { x: 0, y: 0, w: 256, h: 256 },
      spriteDraw: { w: 50, h: 50 },
    },
    small_gas: {
      id: 'small_gas',
      label: 'Small Gas',
      playbackSpeed: 120,
      deckRadius: 26,
      fuelCapacity: 0.5,
      fuelBurnPerPixel: 0.0002,
      spriteFrame: { x: 256, y: 0, w: 256, h: 256 },
      spriteDraw: { w: 54, h: 54 },
    },
    large_rider: {
      id: 'large_rider',
      label: 'Large Rider',
      playbackSpeed: 158,
      deckRadius: 34,
      fuelCapacity: 1.5,
      fuelBurnPerPixel: 0.00032,
      // Tight crop of row 2, col 3 orange rider to avoid neighboring bleed.
      spriteFrame: { x: 537, y: 348, w: 192, h: 164 },
      spriteDraw: { w: 72, h: 72 },
    },
  };
  const DEFAULT_MOWER_TYPE_ID = 'small_gas';
  const LAWN_MAPS = typeof window.createMowingLawnMaps === 'function'
    ? window.createMowingLawnMaps()
    : window.MOWING_LAWN_MAPS;
  if (!LAWN_MAPS) {
    throw new Error('Missing lawn maps registry. Ensure maps.js loads before game.js.');
  }
  const DEFAULT_LAWN_MAP_ID = 'medium';

  let activeScene = { ...LAWN_MAPS[DEFAULT_LAWN_MAP_ID].scene };
  let activeObstacles = LAWN_MAPS[DEFAULT_LAWN_MAP_ID].obstacles.map((obstacle) => ({ ...obstacle }));
  let lastSelections = {
    mowerId: null,
    lawnId: null,
  };

  const mower = {
    x: activeScene.lawn.x + 72,
    y: activeScene.lawn.y + 58,
    heading: 0,
    radius: 18,
    deckRadius: MOWER_TYPES[DEFAULT_MOWER_TYPE_ID].deckRadius,
    playbackSpeed: MOWER_TYPES[DEFAULT_MOWER_TYPE_ID].playbackSpeed,
    typeId: DEFAULT_MOWER_TYPE_ID,
    typeLabel: MOWER_TYPES[DEFAULT_MOWER_TYPE_ID].label,
    fuelCapacity: MOWER_TYPES[DEFAULT_MOWER_TYPE_ID].fuelCapacity,
    fuel: MOWER_TYPES[DEFAULT_MOWER_TYPE_ID].fuelCapacity,
    fuelBurnPerPixel: MOWER_TYPES[DEFAULT_MOWER_TYPE_ID].fuelBurnPerPixel,
  };

  const input = {
    pointerDown: false,
    pointer: { x: mower.x, y: mower.y },
    fastForward: false,
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
    mode: 'menu',
    elapsed: 0,
    coverage: 0,
    lastWinAt: null,
    musicMuted: true,
    cash: 0,
    totalCrashes: 0,
    lastPenalty: 0,
    transientMessage: '',
    transientTimer: 0,
    selectedMowerId: null,
    selectedLawnId: null,
    activeMapId: DEFAULT_LAWN_MAP_ID,
    menu: {
      section: 0,
      buttonIndex: 0,
      buttons: [],
    },
  };

  const pathState = {
    draftPoints: [],
    draftLength: 0,
    playbackPoints: [],
    playbackLengths: [],
    totalLength: 0,
    progress: 0,
    brushRadius: mower.deckRadius,
    minPointSpacing: 5,
    minPathLength: 20,
    fastForwardMultiplier: 3,
    pausedForFuel: false,
  };

  const animationState = {
    flipActive: false,
    flipTimer: 0,
    flipDuration: 0.4,
    flipBaseHeading: 0,
  };

  const penaltyPopups = [];
  let overlappingObstacleIds = [];

  const reviewLayout = {
    width: 170,
    height: 50,
    gap: 24,
    y: WORLD.height - 95,
  };

  const menuLayout = {
    panel: { x: 120, y: 94, w: 720, h: 492 },
    optionWidth: 180,
    optionHeight: 44,
    optionGap: 14,
    startButton: { id: 'start_job', label: 'Start Job', x: 270, y: 500, w: 220, h: 50 },
    resetButton: { id: 'reset_defaults', label: 'Reset Defaults', x: 510, y: 500, w: 220, h: 50 },
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

  function isPointMowable(x, y) {
    if (
      x < activeScene.lawn.x ||
      x > activeScene.lawn.x + activeScene.lawn.w ||
      y < activeScene.lawn.y ||
      y > activeScene.lawn.y + activeScene.lawn.h
    ) {
      return false;
    }

    for (const obstacle of activeObstacles) {
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
    const deckX = mower.x;
    const deckY = mower.y;

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

  function dist(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.hypot(dx, dy);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeAngle(rad) {
    let a = rad;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function clampPointToPlaybackBounds(point) {
    return {
      x: clamp(point.x, activeScene.lawn.x + mower.radius, activeScene.lawn.x + activeScene.lawn.w - mower.radius),
      y: clamp(point.y, activeScene.lawn.y + mower.radius, activeScene.lawn.y + activeScene.lawn.h - mower.radius),
    };
  }

  function dedupeClosePoints(points, minSpacing = 1) {
    if (points.length < 2) return points.slice();
    const out = [points[0]];
    for (let i = 1; i < points.length; i += 1) {
      if (dist(out[out.length - 1], points[i]) >= minSpacing) {
        out.push(points[i]);
      }
    }
    return out;
  }

  function resamplePolyline(points, spacing) {
    if (points.length < 2 || spacing <= 0) return points.slice();

    const out = [points[0]];
    let segmentStart = { ...points[0] };
    let carry = 0;

    for (let i = 1; i < points.length; i += 1) {
      const segmentEnd = points[i];
      const dx = segmentEnd.x - segmentStart.x;
      const dy = segmentEnd.y - segmentStart.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.0001) {
        segmentStart = { ...segmentEnd };
        continue;
      }

      const ux = dx / length;
      const uy = dy / length;
      let traveled = spacing - carry;

      while (traveled <= length) {
        out.push({
          x: segmentStart.x + ux * traveled,
          y: segmentStart.y + uy * traveled,
        });
        traveled += spacing;
      }

      carry = length - (traveled - spacing);
      segmentStart = { ...segmentEnd };
    }

    const last = points[points.length - 1];
    if (dist(out[out.length - 1], last) > 0.1) {
      out.push({ ...last });
    }

    return out;
  }

  function catmullRomPoint(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x)
        + (-p0.x + p2.x) * t
        + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
        + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y)
        + (-p0.y + p2.y) * t
        + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
        + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  function smoothPolyline(points, samplesPerSegment = 6) {
    if (points.length < 3) return points.slice();

    const out = [{ ...points[0] }];
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(points.length - 1, i + 1)];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      for (let j = 1; j <= samplesPerSegment; j += 1) {
        const t = j / samplesPerSegment;
        out.push(catmullRomPoint(p0, p1, p2, p3, t));
      }
    }

    return out;
  }

  function measurePolyline(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += dist(points[i - 1], points[i]);
    }
    return total;
  }

  function buildCumulativeLengths(points) {
    if (!points.length) return [];
    const lengths = [0];
    for (let i = 1; i < points.length; i += 1) {
      lengths.push(lengths[i - 1] + dist(points[i - 1], points[i]));
    }
    return lengths;
  }

  function samplePointOnPath(points, lengths, distanceAlongPath) {
    if (!points.length) return null;
    if (points.length === 1 || lengths.length < 2) {
      return { x: points[0].x, y: points[0].y, heading: mower.heading };
    }

    const total = lengths[lengths.length - 1];
    const d = clamp(distanceAlongPath, 0, total);

    let index = 1;
    while (index < lengths.length && lengths[index] < d) {
      index += 1;
    }
    const hi = Math.min(lengths.length - 1, index);
    const lo = Math.max(0, hi - 1);

    const a = points[lo];
    const b = points[hi];
    const span = Math.max(0.0001, lengths[hi] - lengths[lo]);
    const t = clamp((d - lengths[lo]) / span, 0, 1);

    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const heading = normalizeAngle(Math.atan2(b.y - a.y, b.x - a.x));

    return { x, y, heading };
  }

  function createPlaybackPath(rawPoints) {
    if (rawPoints.length < 2) return [];

    const coarse = dedupeClosePoints(rawPoints, 2);
    const resampled = resamplePolyline(coarse, 6);
    const smoothed = smoothPolyline(resampled, 4);
    const finalResample = resamplePolyline(smoothed, 6);
    const clamped = finalResample.map(clampPointToPlaybackBounds);

    return dedupeClosePoints(clamped, 1);
  }

  function addDraftPoint(point) {
    const next = { x: point.x, y: point.y };
    const points = pathState.draftPoints;
    if (points.length === 0) {
      points.push(next);
      pathState.draftLength = 0;
      return;
    }

    const prev = points[points.length - 1];
    if (dist(prev, next) < pathState.minPointSpacing) {
      return;
    }

    points.push(next);
    pathState.draftLength += dist(prev, next);
  }

  function clearDraftPath() {
    pathState.draftPoints = [];
    pathState.draftLength = 0;
  }

  function clearPlaybackPath() {
    pathState.playbackPoints = [];
    pathState.playbackLengths = [];
    pathState.totalLength = 0;
    pathState.progress = 0;
    pathState.pausedForFuel = false;
    overlappingObstacleIds = [];
    animationState.flipActive = false;
    animationState.flipTimer = 0;
  }

  function markTransientMessage(text, duration = 1.2) {
    state.transientMessage = text;
    state.transientTimer = duration;
  }

  function mowerUsesFuel() {
    return mower.fuelCapacity > 0 && mower.fuelBurnPerPixel > 0;
  }

  function getRefillGallonsNeeded() {
    if (!mowerUsesFuel()) return 0;
    return Math.max(0, mower.fuelCapacity - mower.fuel);
  }

  function getRefillCost() {
    return getRefillGallonsNeeded() * FUEL_PRICE_PER_GALLON;
  }

  function tryRefillMower() {
    if (!mowerUsesFuel()) {
      markTransientMessage(`${mower.typeLabel} uses no fuel.`);
      return false;
    }

    const gallonsNeeded = getRefillGallonsNeeded();
    if (gallonsNeeded <= 0.0001) {
      markTransientMessage('Tank already full.');
      return false;
    }

    const refillCost = getRefillCost();
    mower.fuel = mower.fuelCapacity;
    state.cash -= refillCost;
    pathState.pausedForFuel = false;
    if (state.mode === 'animating' && pathState.totalLength > 0 && pathState.progress < pathState.totalLength) {
      markTransientMessage(`Refilled ${gallonsNeeded.toFixed(2)} gal for $${refillCost.toFixed(2)}. Continuing route.`);
    } else {
      markTransientMessage(`Refilled ${gallonsNeeded.toFixed(2)} gal for $${refillCost.toFixed(2)}.`);
    }
    return true;
  }

  function getReviewButtons() {
    const totalWidth = reviewLayout.width * 2 + reviewLayout.gap;
    const startX = (WORLD.width - totalWidth) * 0.5;
    const enabled = state.mode === 'review' && pathState.draftPoints.length >= 2;

    return [
      {
        id: 'accept',
        label: 'Accept',
        x: startX,
        y: reviewLayout.y,
        w: reviewLayout.width,
        h: reviewLayout.height,
        enabled,
      },
      {
        id: 'retry',
        label: 'Retry',
        x: startX + reviewLayout.width + reviewLayout.gap,
        y: reviewLayout.y,
        w: reviewLayout.width,
        h: reviewLayout.height,
        enabled,
      },
    ];
  }

  function pointInRect(point, rect) {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.w &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.h
    );
  }

  function triggerCrashPenalty(obstacleIds) {
    for (const obstacleId of obstacleIds) {
      state.cash -= 1;
      state.totalCrashes += 1;
      state.lastPenalty = -1;
      penaltyPopups.push({
        text: '-$1',
        x: mower.x + (Math.random() * 14 - 7),
        y: mower.y - 10,
        vy: -28,
        ttl: 0.9,
        maxTtl: 0.9,
        obstacleId,
      });
    }

    animationState.flipActive = true;
    animationState.flipTimer = 0;
    animationState.flipBaseHeading = mower.heading;
  }

  function getObstacleOverlapIds(x, y, r) {
    const ids = [];
    for (const obstacle of activeObstacles) {
      if (obstacle.kind === 'circle') {
        const dx = x - obstacle.x;
        const dy = y - obstacle.y;
        const overlap = r + obstacle.r;
        if (dx * dx + dy * dy <= overlap * overlap) {
          ids.push(obstacle.id);
        }
      } else if (circleRectIntersects(x, y, r, obstacle)) {
        ids.push(obstacle.id);
      }
    }
    return ids;
  }

  function beginDrawing(point) {
    clearPlaybackPath();
    clearDraftPath();
    addDraftPoint(point);
    input.pointerDown = true;
    input.pointer = { ...point };
    state.mode = 'drawing';
  }

  function finalizeDrawing() {
    input.pointerDown = false;

    if (state.mode !== 'drawing') {
      return;
    }

    if (pathState.draftPoints.length < 2 || pathState.draftLength < pathState.minPathLength) {
      clearDraftPath();
      markTransientMessage('Path too short. Draw a longer route.');
      return;
    }

    state.mode = 'review';
  }

  function retryPath() {
    clearPlaybackPath();
    clearDraftPath();
    state.mode = 'drawing';
  }

  function acceptPath() {
    if (mowerUsesFuel() && mower.fuel <= 0.0001) {
      markTransientMessage(`Tank empty. Press E to refill ($${FUEL_PRICE_PER_GALLON.toFixed(2)}/gal).`);
      state.mode = 'review';
      return;
    }

    const playbackPoints = createPlaybackPath(pathState.draftPoints);
    if (playbackPoints.length < 2) {
      clearPlaybackPath();
      markTransientMessage('Path invalid. Please retry.');
      state.mode = 'drawing';
      return;
    }

    pathState.playbackPoints = playbackPoints;
    pathState.playbackLengths = buildCumulativeLengths(playbackPoints);
    pathState.totalLength = pathState.playbackLengths[pathState.playbackLengths.length - 1] || 0;
    pathState.progress = 0;
    pathState.pausedForFuel = false;

    const startSample = samplePointOnPath(pathState.playbackPoints, pathState.playbackLengths, 0);
    if (startSample) {
      mower.x = startSample.x;
      mower.y = startSample.y;
      mower.heading = startSample.heading;
    }

    overlappingObstacleIds = getObstacleOverlapIds(mower.x, mower.y, 0);
    animationState.flipActive = false;
    animationState.flipTimer = 0;

    state.mode = 'animating';
  }

  function handleReviewClick(point) {
    if (state.mode !== 'review') return;
    const buttons = getReviewButtons();
    for (const button of buttons) {
      if (!button.enabled) continue;
      if (!pointInRect(point, button)) continue;

      if (button.id === 'accept') {
        acceptPath();
      } else if (button.id === 'retry') {
        retryPath();
      }
      return;
    }
  }

  function updateTransients(dt) {
    if (state.transientTimer > 0) {
      state.transientTimer = Math.max(0, state.transientTimer - dt);
      if (state.transientTimer === 0) {
        state.transientMessage = '';
      }
    }

    for (let i = penaltyPopups.length - 1; i >= 0; i -= 1) {
      const popup = penaltyPopups[i];
      popup.ttl -= dt;
      popup.y += popup.vy * dt;
      if (popup.ttl <= 0) {
        penaltyPopups.splice(i, 1);
      }
    }
  }

  function updateAnimation(dt) {
    if (state.mode !== 'animating') {
      return;
    }

    if (!pathState.playbackPoints.length || pathState.totalLength <= 0) {
      state.mode = 'drawing';
      clearPlaybackPath();
      return;
    }

    if (mowerUsesFuel() && mower.fuel <= 0.0001) {
      if (!pathState.pausedForFuel) {
        pathState.pausedForFuel = true;
        markTransientMessage(`Out of fuel. Press E to refill ($${FUEL_PRICE_PER_GALLON.toFixed(2)}/gal).`);
      }
      return;
    }
    pathState.pausedForFuel = false;

    if (animationState.flipActive) {
      animationState.flipTimer += dt;
      if (animationState.flipTimer >= animationState.flipDuration) {
        animationState.flipTimer = 0;
        animationState.flipActive = false;
      }
      return;
    }

    const speed = input.fastForward
      ? mower.playbackSpeed * pathState.fastForwardMultiplier
      : mower.playbackSpeed;

    const requestedTravel = speed * dt;
    const maxTravelFromFuel = mowerUsesFuel()
      ? (mower.fuel / mower.fuelBurnPerPixel)
      : requestedTravel;
    const actualTravel = Math.max(0, Math.min(requestedTravel, maxTravelFromFuel));

    const priorProgress = pathState.progress;
    pathState.progress = Math.min(
      pathState.totalLength,
      pathState.progress + actualTravel
    );
    const traveledThisStep = Math.max(0, pathState.progress - priorProgress);
    if (mowerUsesFuel()) {
      mower.fuel = Math.max(0, mower.fuel - traveledThisStep * mower.fuelBurnPerPixel);
    }

    const sample = samplePointOnPath(
      pathState.playbackPoints,
      pathState.playbackLengths,
      pathState.progress
    );

    if (sample) {
      mower.x = sample.x;
      mower.y = sample.y;
      mower.heading = sample.heading;
    }

    const nextOverlaps = getObstacleOverlapIds(mower.x, mower.y, 0);
    const overlapSet = new Set(overlappingObstacleIds);
    const newEntries = nextOverlaps.filter((id) => !overlapSet.has(id));

    if (newEntries.length) {
      triggerCrashPenalty(newEntries);
    }

    overlappingObstacleIds = nextOverlaps;

    mowUnderDeck();

    if (pathState.progress >= pathState.totalLength) {
      clearPlaybackPath();
      clearDraftPath();
      if (state.coverage >= activeScene.targetCoverage) {
        state.mode = 'won';
        state.lastWinAt = state.elapsed;
      } else {
        state.mode = 'drawing';
      }
      return;
    }

    if (mowerUsesFuel() && actualTravel < requestedTravel && mower.fuel <= 0.0001) {
      pathState.pausedForFuel = true;
      markTransientMessage(`Out of fuel. Press E to refill ($${FUEL_PRICE_PER_GALLON.toFixed(2)}/gal).`);
    }
  }

  function update(dt) {
    state.elapsed += dt;
    updateTransients(dt);
    updateAnimation(dt);
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
        } else if (cell === 1) {
          ctx.fillStyle = ((row + col) % 2 === 0) ? '#6aa65e' : '#72ad65';
          ctx.fillRect(x, y, mowGrid.cell, mowGrid.cell);
        } else {
          ctx.fillStyle = ((row + col) % 2 === 0) ? '#4f8c4a' : '#588f50';
          ctx.fillRect(x, y, mowGrid.cell, mowGrid.cell);
        }
      }
    }
  }

  function drawScene() {
    ctx.fillStyle = '#80a884';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.fillStyle = '#d3c4aa';
    ctx.fillRect(activeScene.house.x, activeScene.house.y, activeScene.house.w, activeScene.house.h);
    ctx.fillStyle = '#ae8f6f';
    ctx.fillRect(activeScene.house.x + 18, activeScene.house.y + 14, activeScene.house.w - 36, 20);

    ctx.fillStyle = '#b7b0a0';
    ctx.fillRect(activeScene.driveway.x, activeScene.driveway.y, activeScene.driveway.w, activeScene.driveway.h);

    drawMowGrid();

    ctx.strokeStyle = '#e8dfcf';
    ctx.lineWidth = 4;
    ctx.strokeRect(activeScene.lawn.x, activeScene.lawn.y, activeScene.lawn.w, activeScene.lawn.h);

    for (const obstacle of activeObstacles) {
      const style = obstacle.style || obstacle.id;
      if (style.includes('tree')) {
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

      if (style.includes('flower-bed')) {
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

      if (style.includes('rock')) {
        ctx.fillStyle = '#70767b';
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (style.includes('sprinkler')) {
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

      if (style.includes('gnome')) {
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

  function drawPathOverlay(points, options = {}) {
    if (points.length < 2) {
      return;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const showBrush = options.showBrush !== false;
    if (showBrush) {
      ctx.strokeStyle = options.fillColor || 'rgba(88, 181, 234, 0.34)';
      ctx.lineWidth = pathState.brushRadius * 2;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = options.centerColor || '#f4fbff';
    ctx.lineWidth = options.centerWidth || 2;
    ctx.setLineDash(Array.isArray(options.centerDash) ? options.centerDash : []);
    const smoothCenter = options.smoothCenter === true && points.length > 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (smoothCenter) {
      for (let i = 1; i < points.length - 1; i += 1) {
        const midX = (points[i].x + points[i + 1].x) * 0.5;
        const midY = (points[i].y + points[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      const tail = points[points.length - 1];
      ctx.lineTo(tail.x, tail.y);
    } else {
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawMower() {
    let headingToDraw = mower.heading;
    if (animationState.flipActive) {
      const t = clamp(animationState.flipTimer / animationState.flipDuration, 0, 1);
      headingToDraw = animationState.flipBaseHeading + t * Math.PI * 2;
    }

    if (mowerSprite.loaded) {
      ctx.save();
      ctx.translate(mower.x, mower.y);
      ctx.rotate(headingToDraw + mowerSprite.headingOffset);
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

    ctx.save();
    ctx.translate(mower.x, mower.y);
    ctx.rotate(headingToDraw);

    ctx.fillStyle = '#cf3f2f';
    ctx.fillRect(-18, -15, 36, 30);

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

  function drawRoundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawReviewButtons() {
    const buttons = getReviewButtons();
    for (const button of buttons) {
      ctx.save();
      drawRoundedRect(button.x, button.y, button.w, button.h, 12);
      ctx.fillStyle = button.id === 'accept' ? '#2d7f49' : '#a34b3f';
      if (!button.enabled) {
        ctx.fillStyle = 'rgba(90, 90, 90, 0.7)';
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(236, 233, 218, 0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#f4f0e0';
      ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
      const textWidth = ctx.measureText(button.label).width;
      ctx.fillText(button.label, button.x + (button.w - textWidth) * 0.5, button.y + 33);
      ctx.restore();
    }
  }

  function overlayMessage(title, subtitle, offset = 0) {
    const w = 620;
    const h = 92;
    const x = (WORLD.width - w) * 0.5;
    const y = (WORLD.height - h) * 0.5 + offset;

    ctx.fillStyle = 'rgb(12 18 14 / 72%)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d3c8aa';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#f4f0e0';
    ctx.font = 'bold 27px "Trebuchet MS", sans-serif';
    ctx.fillText(title, x + 24, y + 38);
    ctx.font = '16px "Trebuchet MS", sans-serif';
    ctx.fillText(subtitle, x + 24, y + 65);
  }

  function menuStartEnabled() {
    return Boolean(MOWER_TYPES[state.selectedMowerId] && LAWN_MAPS[state.selectedLawnId]);
  }

  function getMenuButtons() {
    return [
      {
        ...menuLayout.startButton,
        enabled: menuStartEnabled(),
      },
      {
        ...menuLayout.resetButton,
        enabled: true,
      },
    ];
  }

  function getMenuOptionRects() {
    const mowerIds = Object.keys(MOWER_TYPES);
    const lawnIds = Object.keys(LAWN_MAPS);

    const mowerStartX = menuLayout.panel.x + 32;
    const mowerY = menuLayout.panel.y + 150;
    const lawnStartX = menuLayout.panel.x + 32;
    const lawnY = menuLayout.panel.y + 282;

    const mowerOptions = mowerIds.map((id, index) => ({
      id,
      label: MOWER_TYPES[id].label,
      x: mowerStartX + index * (menuLayout.optionWidth + menuLayout.optionGap),
      y: mowerY,
      w: menuLayout.optionWidth,
      h: menuLayout.optionHeight,
      selected: id === state.selectedMowerId,
    }));

    const lawnOptions = lawnIds.map((id, index) => ({
      id,
      label: LAWN_MAPS[id].label,
      x: lawnStartX + index * (menuLayout.optionWidth + menuLayout.optionGap),
      y: lawnY,
      w: menuLayout.optionWidth,
      h: menuLayout.optionHeight,
      selected: id === state.selectedLawnId,
    }));

    return { mowerOptions, lawnOptions };
  }

  function applySelectedSetup() {
    const mowerType = MOWER_TYPES[state.selectedMowerId] || MOWER_TYPES[DEFAULT_MOWER_TYPE_ID];
    const lawnMap = LAWN_MAPS[state.selectedLawnId] || LAWN_MAPS[DEFAULT_LAWN_MAP_ID];

    state.activeMapId = lawnMap.id;
    activeScene = { ...lawnMap.scene };
    activeObstacles = lawnMap.obstacles.map((obstacle) => ({ ...obstacle }));

    mower.typeId = mowerType.id;
    mower.typeLabel = mowerType.label;
    mower.playbackSpeed = mowerType.playbackSpeed;
    mower.deckRadius = mowerType.deckRadius;
    mower.fuelCapacity = mowerType.fuelCapacity;
    mower.fuelBurnPerPixel = mowerType.fuelBurnPerPixel;
    mower.fuel = mower.fuelCapacity;
    if (mowerType.spriteFrame) {
      mowerSprite.frame = { ...mowerType.spriteFrame };
    }
    if (mowerType.spriteDraw) {
      mowerSprite.drawW = mowerType.spriteDraw.w;
      mowerSprite.drawH = mowerType.spriteDraw.h;
    }
    pathState.brushRadius = mower.deckRadius;

    mower.x = activeScene.lawn.x + 72;
    mower.y = activeScene.lawn.y + 58;
    mower.heading = 0;

    state.elapsed = 0;
    state.lastWinAt = null;
    state.coverage = 0;
    state.cash = 0;
    state.totalCrashes = 0;
    state.lastPenalty = 0;
    state.transientMessage = '';
    state.transientTimer = 0;

    input.pointerDown = false;
    input.pointer = { x: mower.x, y: mower.y };
    input.fastForward = false;

    clearDraftPath();
    clearPlaybackPath();
    penaltyPopups.length = 0;
    initMowGrid();
  }

  function startGameFromMenu() {
    if (!menuStartEnabled()) {
      markTransientMessage('Select mower and lawn to start.');
      return;
    }

    lastSelections = {
      mowerId: state.selectedMowerId,
      lawnId: state.selectedLawnId,
    };
    applySelectedSetup();
    state.mode = 'start';
  }

  function resetMenuDefaults() {
    state.selectedMowerId = DEFAULT_MOWER_TYPE_ID;
    state.selectedLawnId = DEFAULT_LAWN_MAP_ID;
    state.menu.section = 0;
    state.menu.buttonIndex = 0;
    markTransientMessage('Menu reset to defaults.');
  }

  function openMenu() {
    input.pointerDown = false;
    clearDraftPath();
    clearPlaybackPath();
    penaltyPopups.length = 0;
    state.transientMessage = '';
    state.transientTimer = 0;
    state.selectedMowerId = lastSelections.mowerId;
    state.selectedLawnId = lastSelections.lawnId;
    state.menu.section = 0;
    state.menu.buttonIndex = 0;
    applySelectedSetup();
    state.mode = 'menu';
  }

  function handleMenuClick(point) {
    if (state.mode !== 'menu') return;
    const { mowerOptions, lawnOptions } = getMenuOptionRects();

    for (const option of mowerOptions) {
      if (pointInRect(point, option)) {
        state.selectedMowerId = option.id;
        state.menu.section = 0;
        return;
      }
    }
    for (const option of lawnOptions) {
      if (pointInRect(point, option)) {
        state.selectedLawnId = option.id;
        state.menu.section = 1;
        return;
      }
    }

    const buttons = getMenuButtons();
    for (let i = 0; i < buttons.length; i += 1) {
      const button = buttons[i];
      if (!pointInRect(point, button)) continue;
      state.menu.section = 2;
      state.menu.buttonIndex = i;
      if (button.id === 'start_job' && button.enabled) {
        startGameFromMenu();
      } else if (button.id === 'start_job') {
        markTransientMessage('Select mower and lawn to start.');
      } else if (button.id === 'reset_defaults') {
        resetMenuDefaults();
      }
      return;
    }
  }

  function getMenuCursorInfo() {
    const mowerIds = Object.keys(MOWER_TYPES);
    const lawnIds = Object.keys(LAWN_MAPS);
    const mowerIndex = Math.max(0, mowerIds.indexOf(state.selectedMowerId));
    const lawnIndex = Math.max(0, lawnIds.indexOf(state.selectedLawnId));
    return { mowerIds, lawnIds, mowerIndex, lawnIndex };
  }

  function shiftMenuSelection(direction) {
    const info = getMenuCursorInfo();
    if (state.menu.section === 0) {
      const nextIndex = (info.mowerIndex + direction + info.mowerIds.length) % info.mowerIds.length;
      state.selectedMowerId = info.mowerIds[nextIndex];
    } else if (state.menu.section === 1) {
      const nextIndex = (info.lawnIndex + direction + info.lawnIds.length) % info.lawnIds.length;
      state.selectedLawnId = info.lawnIds[nextIndex];
    } else if (state.menu.section === 2) {
      const buttons = getMenuButtons();
      state.menu.buttonIndex = (state.menu.buttonIndex + direction + buttons.length) % buttons.length;
    }
  }

  function activateMenuSection() {
    if (state.menu.section === 2) {
      const buttons = getMenuButtons();
      const activeButton = buttons[state.menu.buttonIndex] || buttons[0];
      if (activeButton.id === 'start_job') {
        startGameFromMenu();
      } else {
        resetMenuDefaults();
      }
      return;
    }
    if (!menuStartEnabled()) {
      markTransientMessage('Select mower and lawn to start.');
      return;
    }
    startGameFromMenu();
  }

  function drawMenu() {
    const panel = menuLayout.panel;
    const { mowerOptions, lawnOptions } = getMenuOptionRects();
    const buttons = getMenuButtons();
    state.menu.buttons = buttons.map((button) => ({ ...button }));

    ctx.save();
    drawRoundedRect(panel.x, panel.y, panel.w, panel.h, 18);
    ctx.fillStyle = 'rgba(8, 15, 12, 0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 205, 164, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f4f0e0';
    ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
    ctx.fillText('MoGrassMoMoney Setup', panel.x + 28, panel.y + 52);
    ctx.font = '16px "Trebuchet MS", sans-serif';
    ctx.fillText('Pick your mower and lawn map before starting the route-planning loop.', panel.x + 28, panel.y + 78);

    ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
    ctx.fillText('Mower Type', panel.x + 28, panel.y + 126);
    for (const option of mowerOptions) {
      drawRoundedRect(option.x, option.y, option.w, option.h, 10);
      ctx.fillStyle = option.selected ? '#2f7f48' : 'rgba(48, 64, 55, 0.94)';
      ctx.fill();
      ctx.strokeStyle = option.selected ? '#e9e2ca' : 'rgba(168, 178, 171, 0.8)';
      ctx.lineWidth = state.menu.section === 0 && option.selected ? 3 : 1.5;
      ctx.stroke();
      ctx.fillStyle = '#f4f0e0';
      ctx.font = '16px "Trebuchet MS", sans-serif';
      ctx.fillText(option.label, option.x + 12, option.y + 28);
    }

    ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
    ctx.fillText('Lawn Map', panel.x + 28, panel.y + 258);
    for (const option of lawnOptions) {
      drawRoundedRect(option.x, option.y, option.w, option.h, 10);
      ctx.fillStyle = option.selected ? '#2f7f48' : 'rgba(48, 64, 55, 0.94)';
      ctx.fill();
      ctx.strokeStyle = option.selected ? '#e9e2ca' : 'rgba(168, 178, 171, 0.8)';
      ctx.lineWidth = state.menu.section === 1 && option.selected ? 3 : 1.5;
      ctx.stroke();
      ctx.fillStyle = '#f4f0e0';
      ctx.font = '16px "Trebuchet MS", sans-serif';
      ctx.fillText(option.label, option.x + 12, option.y + 28);
    }

    for (const button of buttons) {
      drawRoundedRect(button.x, button.y, button.w, button.h, 12);
      const isPrimary = button.id === 'start_job';
      if (!button.enabled) {
        ctx.fillStyle = 'rgba(86, 86, 86, 0.82)';
      } else {
        ctx.fillStyle = isPrimary ? '#2d7f49' : '#8b5d3c';
      }
      ctx.fill();
      const isFocused = state.menu.section === 2 && buttons[state.menu.buttonIndex]?.id === button.id;
      ctx.strokeStyle = isFocused
        ? '#f7efd0'
        : 'rgba(236, 233, 218, 0.95)';
      ctx.lineWidth = isFocused ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = '#f4f0e0';
      ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
      const textWidth = ctx.measureText(button.label).width;
      ctx.fillText(button.label, button.x + (button.w - textWidth) * 0.5, button.y + 32);
    }

    ctx.font = '15px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(240, 235, 219, 0.95)';
    ctx.fillText('Mouse: click options and Start Job. Keyboard: Up/Down section, Left/Right cycle, Enter/Space start.', panel.x + 28, panel.y + panel.h - 18);
    ctx.restore();
  }

  function drawUi() {
    if (state.mode === 'menu') {
      drawMenu();
      if (state.transientMessage) {
        overlayMessage(state.transientMessage, 'Choose your setup and start the job.', 220);
      }
      return;
    }

    ctx.fillStyle = 'rgb(20 30 24 / 72%)';
    ctx.fillRect(16, 12, 410, 126);

    ctx.fillStyle = '#f4f0e0';
    ctx.font = '16px "Trebuchet MS", sans-serif';
    ctx.fillText(`Coverage: ${state.coverage.toFixed(1)}%`, 28, 34);
    ctx.fillText(`Target: ${activeScene.targetCoverage}%`, 28, 56);
    ctx.fillText(`Cash: $${state.cash.toFixed(2)}`, 28, 78);

    const fuelText = mowerUsesFuel()
      ? `${mower.fuel.toFixed(2)} / ${mower.fuelCapacity.toFixed(2)} gal`
      : 'N/A (manual)';
    ctx.fillText(`Fuel: ${fuelText}`, 28, 100);
    ctx.fillText(`Type: ${mower.typeLabel}`, 28, 122);

    ctx.fillText(`Music: ${state.musicMuted ? 'Off' : 'On'} (M)`, 220, 34);
    ctx.fillText(`Crashes: ${state.totalCrashes}`, 220, 56);
    ctx.fillText(`Mode: ${state.mode}`, 220, 78);
    if (mowerUsesFuel()) {
      ctx.fillText(`Refill: E ($${FUEL_PRICE_PER_GALLON.toFixed(2)}/gal)`, 220, 100);
    }

    if (state.mode === 'start') {
      overlayMessage('MoGrassMoMoney', 'Draw a mowing path with left mouse. Accept to run it, or Retry to redraw.');
      overlayMessage('Click to begin planning', 'Press E to refill, R to return to setup, F for fullscreen, M to toggle music.', 40);
    } else if (state.mode === 'review') {
      overlayMessage('Review Path', 'Click Accept to execute this route, or Retry to draw again.');
      drawReviewButtons();
    } else if (state.mode === 'animating') {
      const animatingSubtitle = pathState.pausedForFuel
        ? `Out of fuel. Press E to refill ($${FUEL_PRICE_PER_GALLON.toFixed(2)}/gal) and continue.`
        : 'Mower is following your planned path. Hold Space to fast-forward.';
      overlayMessage('Executing Route', animatingSubtitle, -226);
    } else if (state.mode === 'won') {
      overlayMessage('Job complete!', `Coverage ${state.coverage.toFixed(1)}%. Final cash: $${state.cash}. Press R to restart.`);
    } else if (state.mode === 'drawing' && pathState.draftPoints.length < 2) {
      overlayMessage('Plan Your Route', 'Click and drag to draw a mow path.', -226);
    }

    if (state.transientMessage) {
      overlayMessage(state.transientMessage, 'Adjust your path and try again.', 220);
    }
  }

  function drawPenaltyPopups() {
    for (const popup of penaltyPopups) {
      const alpha = clamp(popup.ttl / popup.maxTtl, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ff3d3d';
      ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
      ctx.fillText(popup.text, popup.x, popup.y);
      ctx.restore();
    }
  }

  function drawPointerBrush() {
    if (!(state.mode === 'drawing' && input.pointerDown)) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(232, 248, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(input.pointer.x, input.pointer.y, pathState.brushRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawRouteLayers() {
    if (state.mode === 'animating' && pathState.playbackPoints.length > 1) {
      drawPathOverlay(pathState.playbackPoints, {
        centerColor: '#101010',
        centerWidth: 2,
        centerDash: [8, 6],
        showBrush: false,
        smoothCenter: true,
      });
      return;
    }

    if ((state.mode === 'drawing' || state.mode === 'review') && pathState.draftPoints.length > 1) {
      drawPathOverlay(pathState.draftPoints, {
        fillColor: 'rgba(71, 166, 225, 0.32)',
        centerColor: '#f7fdff',
        centerWidth: 2,
      });
    }
  }

  function render() {
    drawScene();
    drawRouteLayers();
    drawMower();
    drawPointerBrush();
    drawUi();
    drawPenaltyPopups();
  }

  function resetGame() {
    openMenu();
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
    const point = canvasPointFromEvent(event);
    input.pointer = { ...point };

    if (event.button !== 0) {
      return;
    }

    if (state.mode === 'menu') {
      handleMenuClick(point);
      return;
    }

    if (state.mode === 'review') {
      handleReviewClick(point);
      return;
    }

    if (state.mode === 'won') {
      return;
    }

    if (state.mode === 'start' || state.mode === 'drawing') {
      beginDrawing(point);
    }
  });

  canvas.addEventListener('mousemove', (event) => {
    const point = canvasPointFromEvent(event);
    input.pointer = { ...point };

    if (!(input.pointerDown && state.mode === 'drawing')) {
      return;
    }

    addDraftPoint(point);
  });

  canvas.addEventListener('mouseup', (event) => {
    if (event.button !== 0) {
      return;
    }

    if (input.pointerDown) {
      finalizeDrawing();
    }
  });

  window.addEventListener('mouseup', () => {
    if (input.pointerDown) {
      finalizeDrawing();
    }
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
      resetGame();
    }

    if (event.key.toLowerCase() === 'm') {
      setMusicMuted(!music.muted);
    }

    if (event.key.toLowerCase() === 'e') {
      tryRefillMower();
      return;
    }

    if (state.mode === 'menu') {
      if (event.key === 'ArrowUp') {
        state.menu.section = (state.menu.section + 2) % 3;
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowDown') {
        state.menu.section = (state.menu.section + 1) % 3;
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowLeft') {
        shiftMenuSelection(-1);
        event.preventDefault();
        return;
      }
      if (event.key === 'ArrowRight') {
        shiftMenuSelection(1);
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter' || event.code === 'Space' || event.key === ' ') {
        activateMenuSection();
        event.preventDefault();
        return;
      }
    }

    if (event.code === 'Space' && state.mode === 'animating') {
      input.fastForward = true;
      event.preventDefault();
      return;
    }

    if ((event.key === ' ' || event.code === 'Space') && state.mode === 'start') {
      state.mode = 'drawing';
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      input.fastForward = false;
    }
  });

  function renderGameToText() {
    const visibleObstacles = activeObstacles.map((o) => (
      o.kind === 'circle'
        ? { id: o.id, style: o.style, kind: o.kind, x: o.x, y: o.y, r: o.r }
        : { id: o.id, style: o.style, kind: o.kind, x: o.x, y: o.y, w: o.w, h: o.h }
    ));

    const reviewButtons = getReviewButtons().map((button) => ({
      id: button.id,
      label: button.label,
      x: Number(button.x.toFixed(2)),
      y: Number(button.y.toFixed(2)),
      w: Number(button.w.toFixed(2)),
      h: Number(button.h.toFixed(2)),
      enabled: Boolean(button.enabled),
    }));
    const menuOptionRects = getMenuOptionRects();

    const payload = {
      coordinate_system: 'origin top-left; +x right; +y down; units in canvas pixels',
      mode: state.mode,
      coverage_percent: Number(state.coverage.toFixed(2)),
      target_percent: activeScene.targetCoverage,
      setup: {
        menu_active: state.mode === 'menu',
        selected_mower_id: state.selectedMowerId,
        selected_lawn_id: state.selectedLawnId,
        start_enabled: menuStartEnabled(),
        mower_options: Object.keys(MOWER_TYPES).map((id) => ({
          id,
          label: MOWER_TYPES[id].label,
          selected: id === state.selectedMowerId,
        })),
        lawn_options: Object.keys(LAWN_MAPS).map((id) => ({
          id,
          label: LAWN_MAPS[id].label,
          selected: id === state.selectedLawnId,
        })),
        mower_option_hitboxes: menuOptionRects.mowerOptions.map((option) => ({
          id: option.id,
          x: Number(option.x.toFixed(2)),
          y: Number(option.y.toFixed(2)),
          w: Number(option.w.toFixed(2)),
          h: Number(option.h.toFixed(2)),
        })),
        lawn_option_hitboxes: menuOptionRects.lawnOptions.map((option) => ({
          id: option.id,
          x: Number(option.x.toFixed(2)),
          y: Number(option.y.toFixed(2)),
          w: Number(option.w.toFixed(2)),
          h: Number(option.h.toFixed(2)),
        })),
        buttons: getMenuButtons().map((button) => ({
          id: button.id,
          label: button.label,
          x: Number(button.x.toFixed(2)),
          y: Number(button.y.toFixed(2)),
          w: Number(button.w.toFixed(2)),
          h: Number(button.h.toFixed(2)),
          enabled: Boolean(button.enabled),
        })),
      },
      planning: {
        is_drawing: state.mode === 'drawing' && input.pointerDown,
        point_count: pathState.draftPoints.length,
        path_length_px: Number(pathState.draftLength.toFixed(2)),
        brush_radius_px: pathState.brushRadius,
        has_review_path: state.mode === 'review' && pathState.draftPoints.length > 1,
      },
      review: {
        mode_active: state.mode === 'review',
        buttons: reviewButtons,
      },
      playback: {
        is_animating: state.mode === 'animating',
        waiting_for_fuel: pathState.pausedForFuel,
        progress_0_to_1: pathState.totalLength > 0
          ? Number((pathState.progress / pathState.totalLength).toFixed(4))
          : 0,
        speed_px_per_sec: mower.playbackSpeed,
        effective_speed_px_per_sec: input.fastForward
          ? mower.playbackSpeed * pathState.fastForwardMultiplier
          : mower.playbackSpeed,
        flip_active: animationState.flipActive,
        current_heading_radians: Number(mower.heading.toFixed(3)),
      },
      economy: {
        cash: Number(state.cash.toFixed(2)),
        total_crashes: state.totalCrashes,
        last_penalty: state.lastPenalty,
        refill_price_per_gallon: FUEL_PRICE_PER_GALLON,
        refill_cost: Number(getRefillCost().toFixed(2)),
      },
      effects: {
        active_penalty_popups: penaltyPopups.length,
      },
      mower: {
        x: Number(mower.x.toFixed(2)),
        y: Number(mower.y.toFixed(2)),
        heading_radians: Number(mower.heading.toFixed(3)),
        body_radius: mower.radius,
        deck_radius: mower.deckRadius,
        type_id: mower.typeId,
        type_label: mower.typeLabel,
        uses_fuel: mowerUsesFuel(),
        fuel: Number(mower.fuel.toFixed(2)),
        fuel_capacity: mower.fuelCapacity,
        fuel_burn_per_pixel: mower.fuelBurnPerPixel,
      },
      collision_debug: {
        overlapping_obstacle_ids: overlappingObstacleIds.slice(),
      },
      map: {
        id: state.activeMapId,
        lawn: activeScene.lawn,
        house_block: activeScene.house,
        driveway_block: activeScene.driveway,
        obstacles: visibleObstacles,
      },
      input: {
        pointer_down: input.pointerDown,
        pointer: {
          x: Number(input.pointer.x.toFixed(2)),
          y: Number(input.pointer.y.toFixed(2)),
        },
        fast_forward: input.fastForward,
        music_muted: state.musicMuted,
      },
      objective: 'Pick mower + lawn, draw routes, accept playback, and reach 95% coverage while minimizing crash penalties.',
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

  resetGame();
  render();
  requestAnimationFrame(frame);
})();
