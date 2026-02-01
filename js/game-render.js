function draw() {
  // Don't draw if game hasn't started
  if (!gameStarted) {
    ctx.fillStyle = '#1a5276';
    ctx.fillRect(0, 0, 900, 600);
    return;
  }

  // Safety check for zoom
  if (!zoom || !zoom.level || zoom.level <= 0) {
    zoom = { level: 0.7, min: 0.5, max: 2.0, target: 0.7, speed: 0.1 };
  }

  const waterGrad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  waterGrad.addColorStop(0, '#1a5276'); waterGrad.addColorStop(0.5, '#1e6f8f'); waterGrad.addColorStop(1, '#1a5276');
  ctx.fillStyle = waterGrad; ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  ctx.save();

  // Apply zoom and camera transform
  // Scale from screen center, then offset to show camera position
  ctx.translate(VIEW.width / 2, VIEW.height / 2);
  ctx.scale(zoom.level, zoom.level);
  // Camera shake (Stage 3)
  if (cameraShake.t > 0) {
    ctx.translate(cameraShake.x, cameraShake.y);
  }

  // Calculate where the boat should be in the scaled view
  const viewW = VIEW.width / zoom.level;
  const viewH = VIEW.height / zoom.level;
  ctx.translate(-viewW / 2 - camera.x, -viewH / 2 - camera.y);

  // Draw currents (beneath everything)
  drawCurrents();

  drawWaves(); drawRipples(); drawIslands(); drawDocks(); drawWaterParticles();

  // Draw region environmental features
  drawRegionFeatures();

  for (const cargo of cargos) {
    if (cargo && cargo.width && cargo.height) drawCargoShip(cargo);
    if (!tugboat.attached && currentJob && !currentJob.pickedUp) {
      const jt = currentJob.jobType;
      const pulse = Math.sin(game.time * 0.1) * 0.3 + 0.7;

      // Only show PICK UP on first cargo (or the only cargo)
      if (cargo === cargos[0]) {
        ctx.save(); ctx.shadowColor = jt.color; ctx.shadowBlur = 15;
        ctx.fillStyle = jt.color;
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        const pickupText = jt === JOB_TYPES.TANDEM ? `PICK UP (x${cargos.length})` : `PICK UP`;
        ctx.fillText(pickupText, cargo.x, cargo.y - cargo.height - 12);
        ctx.restore();
      }

      // Sinking animation for rescue
      if (cargo.sinkTimer !== null) {
        const sinkPct = cargo.sinkTimer / currentJob.timeLimit;
        ctx.strokeStyle = `rgba(52, 152, 219, ${pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cargo.x, cargo.y, 40 + (1 - sinkPct) * 20, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Salvage drifting indicator
      if (jt === JOB_TYPES.SALVAGE && cargo.driftAngle !== null) {
        ctx.strokeStyle = `rgba(26, 188, 156, ${pulse * 0.7})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(cargo.x, cargo.y, 50 + Math.sin(game.time * 0.05) * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Drift direction arrow
        const arrowLen = 35;
        const ax = cargo.x + Math.cos(weather.windAngle) * arrowLen;
        const ay = cargo.y + Math.sin(weather.windAngle) * arrowLen;
        ctx.strokeStyle = `rgba(26, 188, 156, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cargo.x, cargo.y);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        // Arrowhead
        const headAngle = 0.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - Math.cos(weather.windAngle - headAngle) * 10, ay - Math.sin(weather.windAngle - headAngle) * 10);
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - Math.cos(weather.windAngle + headAngle) * 10, ay - Math.sin(weather.windAngle + headAngle) * 10);
        ctx.stroke();
      }
    }
  }

  // Draw competitor cargo
  for (const cargo of competitorJobs) {
    if (cargo && cargo.width && cargo.height) drawCargoShip(cargo);
  }

  // Draw competitors and their ropes
  for (const comp of competitors) {
    if (comp.attached) drawCompetitorRope(comp);
    drawCompetitorTug(comp);
  }

  if (tugboat.attached) drawRope();
  drawTugboat(tugboat.x, tugboat.y, tugboat.angle);

  ctx.restore();

  // Draw weather effects (screen space, after game world)
  drawWeatherEffects();
  drawWindIndicator();
  drawZoomIndicator();
  drawRegionIndicator();

  drawMinimap();
}

function drawRegionFeatures() {
  const viewW = VIEW.width / zoom.level;
  const viewH = VIEW.height / zoom.level;

  for (const feature of regionFeatures) {
    // Skip if off screen
    if (feature.x < camera.x - 150 || feature.x > camera.x + viewW + 150) continue;
    if (feature.y < camera.y - 150 || feature.y > camera.y + viewH + 150) continue;

    ctx.save();
    ctx.translate(feature.x, feature.y);

    switch (feature.type) {
      case 'buoy':
        // Clean bobbing buoy with reflection
        const bob = Math.sin(game.time * 0.06 + feature.x * 0.05) * 4;
        ctx.translate(0, bob);

        // Water ring shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(2, 8, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Buoy body
        const buoyGrad = ctx.createRadialGradient(-3, -3, 0, 0, 0, 12);
        buoyGrad.addColorStop(0, feature.color === '#e74c3c' ? '#ff6b6b' : '#ffd93d');
        buoyGrad.addColorStop(1, feature.color);
        ctx.fillStyle = buoyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        // Stripe
        ctx.fillStyle = '#fff';
        ctx.fillRect(-10, -2, 20, 4);

        // Top pole
        ctx.fillStyle = '#666';
        ctx.fillRect(-2, -20, 4, 12);

        // Light on top
        const lightPulse = (Math.sin(game.time * 0.1) + 1) * 0.5;
        ctx.fillStyle = `rgba(255, 255, 200, ${0.5 + lightPulse * 0.5})`;
        ctx.beginPath();
        ctx.arc(0, -22, 4, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'oilPlatform':
        // Modern oil platform - clean geometric design
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;

        // Platform legs (in water)
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(-35, 10, 8, 30);
        ctx.fillRect(27, 10, 8, 30);
        ctx.fillRect(-35, -40, 8, 30);
        ctx.fillRect(27, -40, 8, 30);

        // Cross braces
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-31, 10); ctx.lineTo(31, -10);
        ctx.moveTo(31, 10); ctx.lineTo(-31, -10);
        ctx.stroke();

        // Main platform
        const platGrad = ctx.createLinearGradient(0, -25, 0, 15);
        platGrad.addColorStop(0, '#6a6a6a');
        platGrad.addColorStop(1, '#4a4a4a');
        ctx.fillStyle = platGrad;
        ctx.shadowBlur = 0;
        ctx.fillRect(-40, -20, 80, 35);

        // Helipad circle
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(15, -5, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('H', 15, -1);

        // Derrick tower
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(-20, -20);
        ctx.lineTo(-15, -55);
        ctx.lineTo(-10, -20);
        ctx.closePath();
        ctx.fill();

        // Flame stack
        if (feature.hasFlame !== false) {
          const flameFlicker = Math.sin(game.time * 0.3) * 2;
          const flameGrad = ctx.createRadialGradient(30, -30 + flameFlicker, 0, 30, -30, 12);
          flameGrad.addColorStop(0, '#fff');
          flameGrad.addColorStop(0.3, '#f39c12');
          flameGrad.addColorStop(1, 'rgba(231, 76, 60, 0.5)');
          ctx.fillStyle = flameGrad;
          ctx.beginPath();
          ctx.arc(30, -30 + flameFlicker, 8 + Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'lighthouse':
        // Elegant lighthouse
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;

        // Rock base
        ctx.fillStyle = '#5d5d5d';
        ctx.beginPath();
        ctx.ellipse(0, 5, 25, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tower body - gradient
        const towerGrad = ctx.createLinearGradient(-12, 0, 12, 0);
        towerGrad.addColorStop(0, '#e8e8e8');
        towerGrad.addColorStop(0.5, '#ffffff');
        towerGrad.addColorStop(1, '#d0d0d0');
        ctx.fillStyle = towerGrad;
        ctx.shadowBlur = 0;

        // Tapered tower
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(-10, -60);
        ctx.lineTo(10, -60);
        ctx.lineTo(14, 0);
        ctx.closePath();
        ctx.fill();

        // Red stripes
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(-13, -15, 26, 12);
        ctx.fillRect(-11, -45, 22, 12);

        // Light housing
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(-12, -70, 24, 12);

        // Glass/light
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(-8, -68, 16, 8);

        // Rotating beam
        const beamAngle = game.time * 0.025;
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(0, -64);
        const beamLen = 180;
        ctx.lineTo(Math.cos(beamAngle) * beamLen, -64 + Math.sin(beamAngle) * beamLen);
        ctx.lineTo(Math.cos(beamAngle + 0.15) * beamLen, -64 + Math.sin(beamAngle + 0.15) * beamLen);
        ctx.closePath();
        ctx.fill();
        // Second beam opposite
        ctx.beginPath();
        ctx.moveTo(0, -64);
        ctx.lineTo(Math.cos(beamAngle + Math.PI) * beamLen, -64 + Math.sin(beamAngle + Math.PI) * beamLen);
        ctx.lineTo(Math.cos(beamAngle + Math.PI + 0.15) * beamLen, -64 + Math.sin(beamAngle + Math.PI + 0.15) * beamLen);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        // Roof
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(0, -80);
        ctx.lineTo(-14, -70);
        ctx.lineTo(14, -70);
        ctx.closePath();
        ctx.fill();
        break;

      case 'sailboat':
        // Anchored sailboat
        const sailBob = Math.sin(game.time * 0.04 + feature.x * 0.02) * 3;
        const sailRock = Math.sin(game.time * 0.03 + feature.x * 0.01) * 0.05;
        ctx.translate(0, sailBob);
        ctx.rotate(sailRock);

        // Hull shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(3, 5, 22, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hull
        const hullGrad = ctx.createLinearGradient(0, -8, 0, 8);
        hullGrad.addColorStop(0, feature.hullColor || '#2980b9');
        hullGrad.addColorStop(1, feature.hullColorDark || '#1a5276');
        ctx.fillStyle = hullGrad;
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.quadraticCurveTo(28, -6, 20, -8);
        ctx.lineTo(-18, -8);
        ctx.quadraticCurveTo(-25, -6, -22, 2);
        ctx.quadraticCurveTo(-20, 8, -15, 8);
        ctx.lineTo(18, 8);
        ctx.quadraticCurveTo(26, 6, 25, 0);
        ctx.closePath();
        ctx.fill();

        // Deck line
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-18, -6);
        ctx.lineTo(20, -6);
        ctx.stroke();

        // Mast
        ctx.fillStyle = '#8b7355';
        ctx.fillRect(-2, -45, 4, 40);

        // Sail
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(0, -42);
        ctx.quadraticCurveTo(25, -25, 20, -8);
        ctx.lineTo(2, -8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.stroke();
        break;

      case 'yacht':
        // Luxury yacht - sleek design
        const yachtBob = Math.sin(game.time * 0.035 + feature.x * 0.02) * 2;
        ctx.translate(0, yachtBob);
        ctx.rotate(feature.angle || 0);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(4, 6, 35, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hull - sleek white
        const yachtGrad = ctx.createLinearGradient(0, -12, 0, 12);
        yachtGrad.addColorStop(0, '#ffffff');
        yachtGrad.addColorStop(0.7, '#f0f0f0');
        yachtGrad.addColorStop(1, '#1a5276');
        ctx.fillStyle = yachtGrad;
        ctx.beginPath();
        ctx.moveTo(40, 0);
        ctx.quadraticCurveTo(45, -8, 35, -12);
        ctx.lineTo(-25, -12);
        ctx.quadraticCurveTo(-35, -10, -32, 0);
        ctx.quadraticCurveTo(-35, 10, -25, 12);
        ctx.lineTo(35, 12);
        ctx.quadraticCurveTo(45, 8, 40, 0);
        ctx.closePath();
        ctx.fill();

        // Windows
        ctx.fillStyle = '#3498db';
        ctx.fillRect(-15, -10, 30, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(-15, -10, 30, 2);

        // Upper deck
        ctx.fillStyle = '#f5f5f5';
        ctx.beginPath();
        ctx.roundRect(-20, -18, 35, 8, 2);
        ctx.fill();

        // Antenna
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(10, -18);
        ctx.lineTo(10, -28);
        ctx.stroke();
        break;
    }

    ctx.restore();
  }
}

function updateRegionFeatures(delta = 1) {
  // Update animated features
  for (const feature of regionFeatures) {
    if (feature.type === 'waveCrest') {
      feature.phase += 0.02 * delta;
    }
  }
}

// Get region info based on position (for UI)
function getRegionAtPosition(x, y) {
  const areaName = getAreaName(x, y);
  // Map area name to display info
  if (areaName.includes('Ocean')) {
    return { name: 'Open Ocean', icon: '<span class="icon icon-salvage"></span>', color: '#0d4a6f' };
  } else if (areaName.includes('Harbor')) {
    return { name: 'Harbor', icon: '<span class="icon icon-anchor"></span>', color: '#1a8aaa' };
  } else if (areaName.includes('North')) {
    return { name: 'North Channel', icon: '<span class="icon icon-boat"></span>', color: '#2ecc71' };
  } else if (areaName.includes('Main')) {
    return { name: 'Main River', icon: '<span class="icon icon-boat"></span>', color: '#3498db' };
  } else if (areaName.includes('South')) {
    return { name: 'South Passage', icon: '<span class="icon icon-boat"></span>', color: '#9b59b6' };
  } else {
    return { name: 'Coastline', icon: '<span class="icon icon-casual"></span>', color: '#2d5a27' };
  }
}

function drawRegionIndicator() {
  // Show region based on player's current position
  const region = getRegionAtPosition(tugboat.x, tugboat.y);
  const indicator = document.getElementById('regionIndicator');
  const text = document.getElementById('regionText');

  text.innerHTML = `${region.icon} ${region.name}`;
  indicator.style.borderColor = region.color;

  // Also show tide info
  const tideText = TIDE.isHighTide() ? '<span class="icon icon-wave"></span> High Tide' : '<span class="icon icon-wave"></span> Low Tide';
  // Could add tide indicator here if desired
}

function drawWaves() {
  if (!options.waves) return;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)'; ctx.lineWidth = 1.5;

  // Calculate visible area accounting for zoom
  const viewW = VIEW.width / zoom.level;
  const viewH = VIEW.height / zoom.level;

  const startX = Math.floor(camera.x / 40) * 40;
  const startY = Math.floor(camera.y / 40) * 40;
  for (let y = startY; y < camera.y + viewH + 40; y += 40) {
    ctx.beginPath();
    for (let x = startX; x < camera.x + viewW + 10; x += 6) {
      const wave = Math.sin((x + waveOffset * 45 + y * 0.3) * 0.04) * 4;
      x === startX ? ctx.moveTo(x, y + wave) : ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
}

function drawRipples() {
  ripples.forEach(r => {
    ctx.strokeStyle = `rgba(255, 255, 255, ${r.opacity * 0.45})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2); ctx.stroke();
  });
}

// NEW MAP: Draw land, rivers, coastline
function drawIslands() {
  // This function now draws the entire map terrain
  drawMapTerrain();
}

function drawMapTerrain() {
  const viewW = VIEW.width / zoom.level;
  const viewH = VIEW.height / zoom.level;

  // Draw base land (everything is land by default)
  ctx.fillStyle = '#2d5a27'; // Dark green land
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  // Draw coastline grass/terrain texture
  drawLandTexture();

  // Draw ocean (right side)
  drawOcean();

  // Draw rivers (carve through land)
  drawRivers();

  // Draw harbor area (left side)
  drawHarbor();

  // Draw bridges over rivers
  drawBridges();

  // Draw riverbank details
  drawRiverbanks();
}

function drawLandTexture() {
  // Rolling hills / terrain variation
  ctx.fillStyle = '#3a7035';
  for (let i = 0; i < 80; i++) {
    const x = (Math.sin(i * 127) * 0.5 + 0.5) * WORLD.width;
    const y = (Math.cos(i * 83) * 0.5 + 0.5) * WORLD.height;
    if (x > HARBOR.width + 100 && x < OCEAN.x - 100) {
      ctx.beginPath();
      ctx.ellipse(x, y, 80 + (i % 60), 50 + (i % 40), i * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Forest clusters (darker green patches)
  ctx.fillStyle = '#1e4a1e';
  for (let i = 0; i < 40; i++) {
    const x = (Math.sin(i * 97 + 20) * 0.5 + 0.5) * WORLD.width;
    const y = (Math.cos(i * 71 + 10) * 0.5 + 0.5) * WORLD.height;
    if (x > HARBOR.width + 400 && x < OCEAN.x - 400) {
      // Avoid river corridors
      const inNorthCorridor = y > 400 && y < 1000;
      const inMainCorridor = y > 1300 && y < 2200;
      const inSouthCorridor = y > 2600 && y < 3600;
      if (!inNorthCorridor && !inMainCorridor && !inSouthCorridor) {
        // Draw a cluster of trees
        for (let t = 0; t < 8; t++) {
          const tx = x + Math.sin(t * 2.5) * 40;
          const ty = y + Math.cos(t * 2.5) * 30;
          ctx.beginPath();
          ctx.arc(tx, ty, 15 + (t % 4) * 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Individual trees
  ctx.fillStyle = '#2a5a2a';
  for (let i = 0; i < 120; i++) {
    const x = (Math.sin(i * 73 + 50) * 0.5 + 0.5) * WORLD.width;
    const y = (Math.cos(i * 91 + 30) * 0.5 + 0.5) * WORLD.height;
    if (x > HARBOR.width + 250 && x < OCEAN.x - 250) {
      const inNorthCorridor = y > 450 && y < 950;
      const inMainCorridor = y > 1350 && y < 2150;
      const inSouthCorridor = y > 2650 && y < 3550;
      if (!inNorthCorridor && !inMainCorridor && !inSouthCorridor) {
        ctx.beginPath();
        ctx.arc(x, y, 6 + (i % 4) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Sandy beaches along coastline (transition to ocean)
  ctx.fillStyle = '#c4a663';
  ctx.fillRect(OCEAN.x - 220, 0, 40, WORLD.height);

  // Rocky outcrops near ocean
  ctx.fillStyle = '#5a5a5a';
  for (let i = 0; i < 15; i++) {
    const y = 200 + i * 250;
    const x = OCEAN.x - 180 + Math.sin(i * 3) * 30;
    ctx.beginPath();
    ctx.ellipse(x, y, 20 + (i % 3) * 10, 15 + (i % 2) * 8, i * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOcean() {
  // Ocean gradient from shore to deep
  const oceanGrad = ctx.createLinearGradient(OCEAN.x - 200, 0, WORLD.width, 0);
  oceanGrad.addColorStop(0, '#2a8aaa'); // Shallow/turquoise
  oceanGrad.addColorStop(0.15, '#1a6b8a'); // Medium shallow
  oceanGrad.addColorStop(0.4, '#0d5070'); // Medium
  oceanGrad.addColorStop(1, '#082840'); // Deep blue

  ctx.fillStyle = oceanGrad;
  ctx.fillRect(OCEAN.x - 200, 0, WORLD.width - OCEAN.x + 200, WORLD.height);

  // River mouth inlets: soften the straight coastline where rivers meet the ocean
  // Draw shallow "bays" extending into land so the transition isn't a hard seawall line.
  const coastX = OCEAN.x - 200;
  for (const key in RIVERS) {
    const river = RIVERS[key];
    const path = river.path;
    // Find last segment that crosses the coastline boundary
    let my = null;
    for (let i = path.length - 2; i >= 0; i--) {
      const a = path[i];
      const b = path[i + 1];
      if ((a.x <= coastX && b.x >= coastX) || (a.x >= coastX && b.x <= coastX)) {
        const t = (coastX - a.x) / (b.x - a.x || 1);
        my = a.y + (b.y - a.y) * t;
        break;
      }
    }
    if (my === null) continue;

    // Inlet size scales with river width (and mouth widening in collision)
    const inletR = 220 + river.width * 0.35;
    const inletW = 260; // how far it cuts into land
    const grad = ctx.createRadialGradient(coastX - 40, my, 30, coastX - 40, my, inletR);
    grad.addColorStop(0, 'rgba(42, 138, 170, 0.95)'); // shallow ocean
    grad.addColorStop(0.55, 'rgba(42, 138, 170, 0.55)');
    grad.addColorStop(1, 'rgba(42, 138, 170, 0.0)');

    ctx.save();
    ctx.fillStyle = grad;
    // Only paint into the land side of the coast
    ctx.beginPath();
    ctx.rect(coastX - inletW, my - inletR, inletW, inletR * 2);
    ctx.fill();

    // A darker wet-sand rim to hide the straight edge
    ctx.strokeStyle = 'rgba(20, 70, 95, 0.25)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(coastX - 40, my, inletR * 0.78, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.restore();
  }

  // Animated wave patterns
  ctx.strokeStyle = 'rgba(120, 200, 240, 0.12)';
  ctx.lineWidth = 2;
  const waveTime = game.time * 0.4;
  for (let y = 50; y < WORLD.height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(OCEAN.x - 100, y);
    for (let x = OCEAN.x - 100; x < WORLD.width; x += 15) {
      const waveY = y + Math.sin((x * 0.015) + waveTime + y * 0.005) * 8;
      ctx.lineTo(x, waveY);
    }
    ctx.stroke();
  }

  // Foam/whitecaps (random sparkles)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let i = 0; i < 30; i++) {
    const x = OCEAN.x + 100 + Math.sin(i * 47 + waveTime * 0.1) * (WORLD.width - OCEAN.x - 200) * 0.5 + (WORLD.width - OCEAN.x) * 0.3;
    const y = Math.cos(i * 31 + waveTime * 0.05) * WORLD.height * 0.4 + WORLD.height * 0.5;
    const size = 2 + Math.sin(waveTime + i) * 1.5;
    if (size > 1) {
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Distant ships (decorative)
  ctx.fillStyle = '#4a4a4a';
  const shipY1 = 600 + Math.sin(waveTime * 0.2) * 5;
  const shipY2 = 2200 + Math.sin(waveTime * 0.15 + 2) * 5;
  const shipY3 = 3400 + Math.sin(waveTime * 0.18 + 4) * 5;

  // Ship 1
  ctx.fillRect(7600, shipY1, 40, 12);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(7610, shipY1 - 15, 8, 15);

  // Ship 2
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(7700, shipY2, 50, 15);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(7715, shipY2 - 20, 10, 20);

  // Ship 3
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(7550, shipY3, 35, 10);
}

function drawRivers() {
  for (const key in RIVERS) {
    const river = RIVERS[key];
    drawRiver(river);
  }
}

function drawRiver(river) {
  const path = river.path;
  const width = river.width;

  const safePath = Array.isArray(path) ? path.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
  if (safePath.length < 2) return;

  // --- Visual ocean-mouth clipping ---
  // Rivers extend into the ocean in the path data for collision continuity,
  // but visually that creates a weird "channel" + muddy banks in open water.
  // So we CLIP the drawn river/banks to just inside the ocean boundary, and
  // let the estuary blend handle the rest.
  const COAST_X = (typeof OCEAN !== 'undefined' ? (OCEAN.x - 200) : 6000);
  const OCEAN_MOUTH_CLIP_X = COAST_X - 12;
  // NOTE: clip a hair INSIDE the coast so the muddy bank stroke never paints into open ocean.

  function clipPathToMaxX(pts, maxX) {
    // Assumes rivers generally flow left->right. Keeps points until they cross maxX,
    // then adds an interpolated point at maxX and stops.
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.x <= maxX) {
        out.push(p);
      } else {
        if (out.length === 0) { out.push({ x: maxX, y: p.y }); break; }
        const a = pts[i - 1];
        const b = p;
        const t = (maxX - a.x) / ((b.x - a.x) || 1);
        const y = a.y + (b.y - a.y) * Math.max(0, Math.min(1, t));
        out.push({ x: maxX, y });
        break;
      }
    }
    return out.length >= 2 ? out : pts;
  }

  const drawPath = clipPathToMaxX(safePath, OCEAN_MOUTH_CLIP_X);
  if (!Array.isArray(drawPath) || drawPath.length < 2) return;


  // Hard-clip river drawing to the land side of the coastline so fat stroke caps
  // (mud banks / shallow edge) don't "bulge" into open ocean and look like a grey seawall.
  const __hasOcean = (typeof OCEAN !== 'undefined');
  if (__hasOcean) {
    ctx.save();
    ctx.beginPath();
    // Clip slightly PAST the path maxX so straight segments still reach the coast,
    // but caps cannot extend into the ocean.
    ctx.rect(0, -200, OCEAN_MOUTH_CLIP_X + 2, WORLD.height + 400);
    ctx.clip();
  }
  // Draw muddy/sandy riverbanks first (under the water)
  ctx.strokeStyle = '#8a7a5a';
  ctx.lineWidth = width + 50;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(drawPath[0].x, drawPath[0].y);
  for (let i = 1; i < drawPath.length; i++) {
    ctx.lineTo(drawPath[i].x, drawPath[i].y);
  }
  ctx.stroke();

  // Shallow water edge
  ctx.strokeStyle = '#3aa0b5';
  ctx.lineWidth = width + 25;
  ctx.beginPath();
  ctx.moveTo(drawPath[0].x, drawPath[0].y);
  for (let i = 1; i < drawPath.length; i++) {
    ctx.lineTo(drawPath[i].x, drawPath[i].y);
  }
  ctx.stroke();

  // Main river water with gradient
  const riverGrad = ctx.createLinearGradient(0, 0, WORLD.width, 0);
  riverGrad.addColorStop(0, '#2090b0'); // Harbor end (cleaner blue-green)
  riverGrad.addColorStop(0.5, '#1a7a95');
  riverGrad.addColorStop(1, '#1a6b85'); // Ocean end (blends with ocean)

  ctx.strokeStyle = riverGrad;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(drawPath[0].x, drawPath[0].y);
  for (let i = 1; i < drawPath.length; i++) {
    ctx.lineTo(drawPath[i].x, drawPath[i].y);
  }
  ctx.stroke();

  // === Endpoint widening (visual) ===
  // Collision uses a widened river near endpoints to prevent "phantom land".
  // Mirror that here so what you SEE matches what you COLLIDE with.
  const mouthLen = 800;
  const mouthExtra = 200;

  function __strokePartial(extraWidth, alpha, fromStart = true) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineWidth = width + extraWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Determine how many points cover ~mouthLen from the chosen end
    const pts = fromStart ? drawPath : [...drawPath].reverse();
    let acc = 0;
    let endIdx = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      acc += Math.hypot(dx, dy);
      endIdx = i + 1;
      if (acc >= mouthLen) break;
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= endIdx; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Use the same water color as the main river so it blends.
  // Layered strokes approximate a taper.
  ctx.strokeStyle = riverGrad;
  __strokePartial(mouthExtra * 2.0, 0.25, true);
  __strokePartial(mouthExtra * 1.2, 0.35, true);
  __strokePartial(mouthExtra * 0.6, 0.45, true);

  // Ocean-end widening removed (river is clipped at ocean edge; estuary blend handles it)


  // End ocean-mouth clip
  if (__hasOcean) ctx.restore();

  // === River mouth blending (visual polish) ===
  // Blend river into harbor/ocean on BOTH ends so transitions don't look harsh.
  function __hexToRgba(hex, a) {
    // hex like #rrggbb
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function __mouthBlend(p0, p1, innerHex, outerHex) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len, ny = dy / len;

    // Place the blend slightly "downstream" from the endpoint
    const cx = p0.x + nx * 35;
    const cy = p0.y + ny * 35;

    const r0 = Math.max(20, width * 0.55);
    const r1 = r0 + 220;

    ctx.save();
    // Feathered color blend
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0.0, __hexToRgba(innerHex, 0.35));
    g.addColorStop(0.35, __hexToRgba(outerHex, 0.22));
    g.addColorStop(1.0, __hexToRgba(outerHex, 0.0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, Math.PI * 2);
    ctx.fill();

    // Subtle foam/estuary texture: 3 short arcs across the mouth
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    const px = -ny, py = nx; // perpendicular
    for (let i = -1; i <= 1; i++) {
      const ox = cx + px * (width * 0.18) * i;
      const oy = cy + py * (width * 0.18) * i;
      ctx.beginPath();
      // small curved line perpendicular-ish to flow
      ctx.moveTo(ox - px * (width * 0.35), oy - py * (width * 0.35));
      ctx.quadraticCurveTo(ox, oy, ox + px * (width * 0.35), oy + py * (width * 0.35));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Harbor end blend
  __mouthBlend(drawPath[0], drawPath[1], '#2090b0', '#2595b5');
  // Ocean end blend
  __mouthBlend(drawPath[drawPath.length - 1], drawPath[drawPath.length - 2], '#1a6b85', '#2a8aaa');


  // Ocean-mouth cap cleanup: hide the rounded stroke caps (the "grey line" seam)
  // so the river blends naturally into the ocean without a hard rim.
  try {
    const coastX = (typeof OCEAN !== 'undefined' ? (OCEAN.x - 200) : 6000);
    const end = drawPath[drawPath.length - 1];
    if (end && end.x >= coastX - 60) {
      // Paint a shallow-ocean gradient "over" the cap area
      const r = 140 + width * 0.6;
      const cx = end.x + 35;
      const cy = end.y;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
      g.addColorStop(0, 'rgba(42, 138, 170, 0.95)');   // shallow ocean
      g.addColorStop(0.45, 'rgba(42, 138, 170, 0.65)');
      g.addColorStop(1, 'rgba(42, 138, 170, 0.0)');
      ctx.save();
      ctx.fillStyle = g;
      // Only apply on the ocean side + a tiny overlap
      ctx.beginPath();
      ctx.rect(coastX - 40, cy - r, r + 120, r * 2);
      ctx.fill();
      ctx.restore();
    }
  } catch (e) { }


  // Darker center channel (deep water)
  ctx.strokeStyle = 'rgba(10, 50, 70, 0.3)';
  ctx.lineWidth = width * 0.4;
  ctx.beginPath();
  ctx.moveTo(drawPath[0].x, drawPath[0].y);
  for (let i = 1; i < drawPath.length; i++) {
    ctx.lineTo(drawPath[i].x, drawPath[i].y);
  }
  ctx.stroke();

  // Animated current lines
  if (options.waves) {
    const flowTime = game.time * 0.3;
    ctx.strokeStyle = 'rgba(150, 220, 255, 0.15)';
    ctx.lineWidth = 1.5;

    for (let i = 0; i < path.length - 1; i++) {
      const p1 = drawPath[i];
      const p2 = drawPath[i + 1];
      if (!p1 || !p2) continue;
      const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      // Flowing lines along river
      const offset = (flowTime * 50) % 120;
      for (let d = offset; d < segDist; d += 120) {
        const cx = p1.x + Math.cos(angle) * d;
        const cy = p1.y + Math.sin(angle) * d;

        // Small chevron pointing downstream
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(angle) * 8 - Math.cos(angle + 0.6) * 6,
          cy - Math.sin(angle) * 8 - Math.sin(angle + 0.6) * 6);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx - Math.cos(angle) * 8 - Math.cos(angle - 0.6) * 6,
          cy - Math.sin(angle) * 8 - Math.sin(angle - 0.6) * 6);
        ctx.stroke();
      }
    }
  }
}

function drawHarbor() {
  // River positions AT THE SEAWALL (x â‰ˆ 1200-1300), not at harbor entry
  // North river: starts y:700, goes to y:750 at x:500, y:780 at x:900 â†’ ~y:800 at seawall
  // Main river: starts y:1900, goes to y:1850 at x:500, y:1800 at x:900 â†’ ~y:1750 at seawall  
  // South river: starts y:3100, goes to y:3000 at x:500, y:2950 at x:900 â†’ ~y:2900 at seawall
  const northRiverY = 820;
  const northRiverGap = 350; // Extra wide for smooth entry
  const mainRiverY = 1720;
  const mainRiverGap = 300;
  const southRiverY = 3030;// aligned to South Passage center at seawall (xâ‰ˆ1200)
  const southRiverGap = 360;// widened to match collision mouth widening

  // Harbor water area with gradient (draw first, under everything)
  const harborGrad = ctx.createLinearGradient(0, 0, HARBOR.width + 100, 0);
  harborGrad.addColorStop(0, '#2595b5'); // Clean harbor water
  harborGrad.addColorStop(0.7, '#1a85a5');
  harborGrad.addColorStop(1, '#1a7595');

  ctx.fillStyle = harborGrad;
  ctx.beginPath();
  ctx.moveTo(0, 300);
  ctx.lineTo(HARBOR.width, 400);
  ctx.lineTo(HARBOR.width + 100, 600);
  ctx.lineTo(HARBOR.width + 100, 3400);
  ctx.lineTo(HARBOR.width, 3600);
  ctx.lineTo(0, 3700);
  ctx.lineTo(0, 300);
  ctx.fill();

  // Harbor seawall/breakwater - drawn in sections with gaps for rivers
  ctx.fillStyle = '#5a5a5a';

  // Top section (above north river)
  ctx.beginPath();
  ctx.moveTo(0, 280);
  ctx.lineTo(HARBOR.width + 20, 380);
  ctx.lineTo(HARBOR.width + 130, 500);
  ctx.lineTo(HARBOR.width + 130, northRiverY - northRiverGap / 2);
  ctx.lineTo(HARBOR.width + 100, northRiverY - northRiverGap / 2);
  ctx.lineTo(HARBOR.width + 100, 600);
  ctx.lineTo(HARBOR.width, 400);
  ctx.lineTo(0, 300);
  ctx.closePath();
  ctx.fill();

  // Section between north and main rivers
  ctx.beginPath();
  ctx.moveTo(HARBOR.width + 100, northRiverY + northRiverGap / 2);
  ctx.lineTo(HARBOR.width + 130, northRiverY + northRiverGap / 2);
  ctx.lineTo(HARBOR.width + 130, mainRiverY - mainRiverGap / 2);
  ctx.lineTo(HARBOR.width + 100, mainRiverY - mainRiverGap / 2);
  ctx.closePath();
  ctx.fill();

  // Section between main and south rivers
  ctx.beginPath();
  ctx.moveTo(HARBOR.width + 100, mainRiverY + mainRiverGap / 2);
  ctx.lineTo(HARBOR.width + 130, mainRiverY + mainRiverGap / 2);
  ctx.lineTo(HARBOR.width + 130, southRiverY - southRiverGap / 2);
  ctx.lineTo(HARBOR.width + 100, southRiverY - southRiverGap / 2);
  ctx.closePath();
  ctx.fill();

  // Bottom section (below south river)
  ctx.beginPath();
  ctx.moveTo(HARBOR.width + 100, southRiverY + southRiverGap / 2);
  ctx.lineTo(HARBOR.width + 130, southRiverY + southRiverGap / 2);
  ctx.lineTo(HARBOR.width + 130, 3420);
  ctx.lineTo(HARBOR.width + 20, 3620);
  ctx.lineTo(0, 3720);
  ctx.lineTo(0, 3700);
  ctx.lineTo(HARBOR.width, 3600);
  ctx.lineTo(HARBOR.width + 100, 3400);
  ctx.closePath();
  ctx.fill();

  // Industrial/dock area (concrete) - left edge
  ctx.fillStyle = '#6a6a6a';
  ctx.fillRect(0, 300, 100, 3400);

  // Pier structures extending into water
  ctx.fillStyle = '#5a5550';
  for (let y = 450; y < 3550; y += 250) {
    // Skip piers near river mouths (using harbor entry positions)
    if (y > 550 && y < 900) continue;   // North river area
    if (y > 1700 && y < 2100) continue; // Main river area  
    if (y > 2900 && y < 3250) continue; // South river area

    // Main pier
    ctx.fillRect(0, y, 200, 20);
    // Pier posts
    ctx.fillStyle = '#4a4540';
    for (let x = 20; x < 200; x += 40) {
      ctx.beginPath();
      ctx.arc(x, y + 10, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#5a5550';
  }

  // Warehouses/buildings along shore (avoiding river mouths)
  ctx.fillStyle = '#4a4a52';
  const warehouseYs = [380, 480, 1000, 1100, 1250, 1400, 1550, 2200, 2350, 2500, 2650, 2800, 3350, 3500];
  warehouseYs.forEach((y, i) => {
    const w = 70 + (i % 3) * 10;
    const h = 60 + (i % 4) * 15;
    ctx.fillRect(0, y, w, h);
    // Roof
    ctx.fillStyle = '#5a5a62';
    ctx.fillRect(0, y, w, 12);
    ctx.fillStyle = '#4a4a52';
  });

  // Cranes
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 4;
  // Crane 1
  ctx.beginPath();
  ctx.moveTo(60, 500);
  ctx.lineTo(60, 440);
  ctx.lineTo(150, 440);
  ctx.stroke();
  // Crane 2
  ctx.beginPath();
  ctx.moveTo(50, 1150);
  ctx.lineTo(50, 1080);
  ctx.lineTo(160, 1080);
  ctx.stroke();
  // Crane 3
  ctx.beginPath();
  ctx.moveTo(55, 2400);
  ctx.lineTo(55, 2330);
  ctx.lineTo(145, 2330);
  ctx.stroke();
  // Crane 4
  ctx.beginPath();
  ctx.moveTo(55, 3450);
  ctx.lineTo(55, 3380);
  ctx.lineTo(145, 3380);
  ctx.stroke();

  // Lighthouse at harbor entrance
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath();
  ctx.moveTo(HARBOR.width + 80, 320);
  ctx.lineTo(HARBOR.width + 100, 320);
  ctx.lineTo(HARBOR.width + 95, 270);
  ctx.lineTo(HARBOR.width + 85, 270);
  ctx.closePath();
  ctx.fill();
  // Red stripes
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(HARBOR.width + 82, 290, 16, 10);
  ctx.fillRect(HARBOR.width + 82, 310, 16, 8);
  // Light
  ctx.fillStyle = '#ffff88';
  ctx.beginPath();
  ctx.arc(HARBOR.width + 90, 275, 6, 0, Math.PI * 2);
  ctx.fill();
  // Light beam (subtle)
  ctx.fillStyle = 'rgba(255, 255, 150, 0.1)';
  ctx.beginPath();
  ctx.moveTo(HARBOR.width + 90, 275);
  ctx.lineTo(HARBOR.width + 300, 200);
  ctx.lineTo(HARBOR.width + 300, 350);
  ctx.closePath();
  ctx.fill();
}

function drawBridges() {
  for (const bridge of bridges) {
    const river = RIVERS[bridge.river];
    if (!river) continue;

    // Find Y position at bridge X
    let bridgeY = 0;
    const path = river.path;
    for (let i = 0; i < path.length - 1; i++) {
      if (path[i].x <= bridge.x && path[i + 1].x >= bridge.x) {
        const t = (bridge.x - path[i].x) / (path[i + 1].x - path[i].x);
        bridgeY = path[i].y + t * (path[i + 1].y - path[i].y);
        break;
      }
    }

    const width = river.width + 60;

    // Bridge shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(bridge.x - 40, bridgeY - width / 2 + 10, 80, width);

    // Bridge deck
    ctx.fillStyle = '#6b6b6b';
    ctx.fillRect(bridge.x - 35, bridgeY - width / 2, 70, width);

    // Bridge road
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(bridge.x - 25, bridgeY - width / 2 + 10, 50, width - 20);

    // Bridge railings
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(bridge.x - 35, bridgeY - width / 2, 10, width);
    ctx.fillRect(bridge.x + 25, bridgeY - width / 2, 10, width);

    // Road markings
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(bridge.x, bridgeY - width / 2 + 15);
    ctx.lineTo(bridge.x, bridgeY + width / 2 - 15);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawRiverbanks() {
  // Draw darkened land edges along rivers
  // Use simple offset math, no expensive isInWater checks

  ctx.fillStyle = '#1a4a1a'; // Dark vegetation color

  for (const key in RIVERS) {
    const river = RIVERS[key];
    const path = river.path;
    const bankDist = river.width / 2 + 40; // Outside the water

    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const perpAngle = angle + Math.PI / 2;

      const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      // Draw vegetation patches along banks
      for (let d = 0; d < segDist; d += 100) {
        const x = p1.x + Math.cos(angle) * d;
        const y = p1.y + Math.sin(angle) * d;

        // Both sides of river - these are on land by definition
        for (const side of [-1, 1]) {
          const bx = x + Math.cos(perpAngle) * bankDist * side;
          const by = y + Math.sin(perpAngle) * bankDist * side;

          // Skip if in harbor or ocean areas
          if (bx < HARBOR.width + 100 || bx > OCEAN.x - 220) continue;

          ctx.beginPath();
          ctx.arc(bx, by, 15 + ((d + i * 50) % 15), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function drawDocks() {
  // Calculate visible area accounting for zoom
  const viewW = VIEW.width / zoom.level;
  const viewH = VIEW.height / zoom.level;
  const margin = 150 / zoom.level;

  for (const dock of docks) {
    if (dock.x < camera.x - margin || dock.x > camera.x + viewW + margin) continue;
    if (dock.y < camera.y - margin || dock.y > camera.y + viewH + margin) continue;

    const x = dock.x;
    const y = dock.y;
    const w = dock.width;
    const h = dock.height;

    // Dock shadow in water
    ctx.fillStyle = 'rgba(0, 20, 40, 0.5)';
    ctx.fillRect(x + 4, y + 4, w, h + 8);

    // Support pillars in water
    ctx.fillStyle = '#5d4037';
    for (let i = 0; i < 3; i++) {
      const px = x + 10 + i * (w - 20) / 2;
      ctx.beginPath();
      ctx.ellipse(px, y + h + 6, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px - 4, y + h - 2, 8, 10);
    }

    // Main dock platform
    const deckGrad = ctx.createLinearGradient(x, y, x, y + h);
    deckGrad.addColorStop(0, '#a1887f');
    deckGrad.addColorStop(0.3, '#8d6e63');
    deckGrad.addColorStop(1, '#6d4c41');
    ctx.fillStyle = deckGrad;
    ctx.fillRect(x, y, w, h);

    // Wood planks
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= w; i += 8) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i, y + h);
      ctx.stroke();
    }

    // Plank highlights
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    for (let i = 4; i <= w; i += 8) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i, y + h);
      ctx.stroke();
    }

    // Cross beams
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillRect(x, y, w, 3);

    // Dock edge trim
    ctx.fillStyle = '#4e342e';
    ctx.fillRect(x - 2, y - 2, 4, h + 4);
    ctx.fillRect(x + w - 2, y - 2, 4, h + 4);

    // Mooring posts (bollards)
    const bollardPositions = [[x + 8, y + h / 2], [x + w - 8, y + h / 2]];
    for (const [bx, by] of bollardPositions) {
      // Post shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(bx + 2, by + 2, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Post base
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.ellipse(bx, by, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Post body
      ctx.fillStyle = '#455a64';
      ctx.fillRect(bx - 3, by - 10, 6, 10);

      // Post top
      ctx.fillStyle = '#546e7a';
      ctx.beginPath();
      ctx.ellipse(bx, by - 10, 4, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rope coil on post
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(bx, by - 6, 5, 2, 0, 0, Math.PI);
      ctx.stroke();
    }

    // Fuel station equipment
    if (dock.hasFuel) {
      // Fuel pump
      const fx = x + w + 8;
      const fy = y + h / 2;

      // Pump base
      ctx.fillStyle = '#d32f2f';
      ctx.fillRect(fx - 6, fy - 12, 12, 20);

      // Pump top
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(fx - 7, fy - 14, 14, 4);

      // Pump display
      ctx.fillStyle = '#fff';
      ctx.fillRect(fx - 4, fy - 8, 8, 6);

      // Pump hose
      ctx.strokeStyle = '#212121';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 4);
      ctx.quadraticCurveTo(fx + 8, fy + 10, fx + 5, fy + 15);
      ctx.stroke();

      // Hose nozzle
      ctx.fillStyle = '#424242';
      ctx.fillRect(fx + 3, fy + 13, 6, 4);

      const distToTug = Math.hypot(tugboat.x - (x + w / 2), tugboat.y - (y + h / 2 + 30));
      if (distToTug < 100 && tugboat.fuel < tugboat.maxFuel) {
        const pulse = Math.sin(game.time * 0.15) * 0.3 + 0.7;
        ctx.save();
        ctx.shadowColor = 'rgba(243, 156, 18, 0.8)';
        ctx.shadowBlur = 15;
        ctx.fillStyle = `rgba(243, 156, 18, ${pulse})`;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u26FD REFUEL', x + w / 2, y + h + 55);
        ctx.restore();
      }
    }

    // Shipyard / Repair station
    if (dock.hasRepair) {
      // Crane structure
      const rx = x + w + 10;
      const ry = y + h / 2;

      // Crane base
      ctx.fillStyle = '#1565c0';
      ctx.fillRect(rx - 8, ry - 5, 16, 15);

      // Crane tower
      ctx.fillStyle = '#1976d2';
      ctx.fillRect(rx - 4, ry - 35, 8, 30);

      // Crane arm
      ctx.fillStyle = '#2196f3';
      ctx.fillRect(rx - 20, ry - 35, 35, 5);

      // Hook
      ctx.strokeStyle = '#ffc107';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx + 8, ry - 30);
      ctx.lineTo(rx + 8, ry - 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx + 8, ry - 15, 4, 0, Math.PI);
      ctx.stroke();

      // Tools icon
      ctx.fillStyle = '#64b5f6';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ðŸ”§', rx, ry + 18);

      const distToTug = Math.hypot(tugboat.x - (x + w / 2), tugboat.y - (y + h / 2 + 30));
      if (distToTug < 100 && tugboat.health < tugboat.maxHealth) {
        const pulse = Math.sin(game.time * 0.15) * 0.3 + 0.7;
        ctx.save();
        ctx.shadowColor = 'rgba(52, 152, 219, 0.8)';
        ctx.shadowBlur = 15;
        ctx.fillStyle = `rgba(52, 152, 219, ${pulse})`;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u{1F527} REPAIR', x + w / 2, y + h + 55);
        ctx.restore();
      }
    }

    // Crates and barrels on dock
    if (!dock.hasFuel && !dock.hasRepair) {
      // Crate
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(x + w - 18, y + 4, 12, 10);
      ctx.strokeStyle = '#4e342e';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + w - 18, y + 4, 12, 10);
      ctx.beginPath();
      ctx.moveTo(x + w - 18, y + 9);
      ctx.lineTo(x + w - 6, y + 9);
      ctx.stroke();

      // Barrel
      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.ellipse(x + w - 25, y + 10, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(x + w - 30, y + 3, 10, 7);
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(x + w - 30, y + 5, 10, 2);
    }

    // Lamp post
    const lx = x + 15;
    const ly = y - 5;
    ctx.fillStyle = '#37474f';
    ctx.fillRect(lx - 2, ly - 25, 4, 25);
    ctx.fillStyle = '#455a64';
    ctx.beginPath();
    ctx.moveTo(lx - 6, ly - 25);
    ctx.lineTo(lx + 6, ly - 25);
    ctx.lineTo(lx + 4, ly - 30);
    ctx.lineTo(lx - 4, ly - 30);
    ctx.closePath();
    ctx.fill();
    // Lamp glow
    ctx.fillStyle = 'rgba(255, 235, 150, 0.3)';
    ctx.beginPath();
    ctx.arc(lx, ly - 27, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff9c4';
    ctx.beginPath();
    ctx.arc(lx, ly - 27, 3, 0, Math.PI * 2);
    ctx.fill();

    // Delivery/pickup indicators
    if (currentJob && dock === currentJob.delivery) {
      const pulse = Math.sin(game.time * 0.1) * 0.3 + 0.7;
      const jt = currentJob.jobType;
      ctx.save();
      ctx.shadowColor = jt.color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = jt.color;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x - 8, y - 8, w + 16, h + 50);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.fillStyle = jt.color;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`DELIVER`, x + w / 2, y + h + 55);
    }
    if (currentJob && dock === currentJob.pickup && !currentJob.pickedUp) {
      const pulse = Math.sin(game.time * 0.1) * 0.3 + 0.7;
      const jt = currentJob.jobType;
      ctx.strokeStyle = jt.color;
      ctx.globalAlpha = pulse * 0.5;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Dock name sign
    ctx.fillStyle = 'rgba(0, 30, 50, 0.8)';
    const nameWidth = ctx.measureText(dock.name).width + 12;
    ctx.beginPath();
    ctx.roundRect(x + w / 2 - nameWidth / 2, y - 18, nameWidth, 14, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dock.name, x + w / 2, y - 8);
  }
}

function drawWaterParticles() {
  if (!options.particles) return;
  waterParticles.forEach(p => {
    ctx.fillStyle = `rgba(200, 230, 255, ${p.life * 0.55})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  });
}

function drawRope() {
  const cargo = tugboat.attached;
  const sx = tugboat.x - Math.cos(tugboat.angle) * 28, sy = tugboat.y - Math.sin(tugboat.angle) * 28;
  const bx = cargo.x + Math.cos(cargo.angle) * (cargo.width / 2), by = cargo.y + Math.sin(cargo.angle) * (cargo.width / 2);
  const mx = (sx + bx) / 2, my = (sy + by) / 2 + 7;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 4; ctx.beginPath();
  ctx.moveTo(sx + 2, sy + 2); ctx.quadraticCurveTo(mx + 2, my + 2, bx + 2, by + 2); ctx.stroke();
  ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 3; ctx.beginPath();
  ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
  ctx.fillStyle = '#5d4037'; ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();

  // Draw ropes between tandem cargo
  if (currentJob && currentJob.jobType === JOB_TYPES.TANDEM && currentJob.allCargo) {
    const chainCargo = currentJob.allCargo;
    for (let i = 1; i < chainCargo.length; i++) {
      const leader = chainCargo[i - 1];
      const follower = chainCargo[i];
      const lx = leader.x - Math.cos(leader.angle) * (leader.width / 2);
      const ly = leader.y - Math.sin(leader.angle) * (leader.width / 2);
      const fx = follower.x + Math.cos(follower.angle) * (follower.width / 2);
      const fy = follower.y + Math.sin(follower.angle) * (follower.width / 2);
      const cmx = (lx + fx) / 2, cmy = (ly + fy) / 2 + 5;
      // Shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(lx + 2, ly + 2); ctx.quadraticCurveTo(cmx + 2, cmy + 2, fx + 2, fy + 2); ctx.stroke();
      // Rope
      ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(lx, ly); ctx.quadraticCurveTo(cmx, cmy, fx, fy); ctx.stroke();
      // Connection points
      ctx.fillStyle = '#6d4c41'; ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.arc(fx, fy, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawTugboat(x, y, angle) {
  const boat = BOATS[tugboat.currentBoat];
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3, 3, 24, 12, 0, 0, Math.PI * 2); ctx.fill();
  const hg = ctx.createLinearGradient(0, -11, 0, 11);
  hg.addColorStop(0, boat.color1);
  hg.addColorStop(0.5, boat.color2);
  hg.addColorStop(1, boat.color3);
  ctx.fillStyle = hg; ctx.beginPath();
  ctx.moveTo(24, 0); ctx.quadraticCurveTo(26, -8, 15, -11); ctx.lineTo(-18, -11);
  ctx.quadraticCurveTo(-24, -11, -24, 0); ctx.quadraticCurveTo(-24, 11, -18, 11);
  ctx.lineTo(15, 11); ctx.quadraticCurveTo(26, 8, 24, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = boat.color3; ctx.beginPath();
  ctx.moveTo(21, 5); ctx.lineTo(-18, 5); ctx.quadraticCurveTo(-22, 5, -22, 8);
  ctx.quadraticCurveTo(-22, 11, -18, 11); ctx.lineTo(15, 11); ctx.quadraticCurveTo(24, 8, 21, 5); ctx.fill();
  ctx.fillStyle = '#8d6e63'; ctx.beginPath(); ctx.roundRect(-16, -8, 28, 16, 2); ctx.fill();
  ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.roundRect(-1, -7, 13, 14, 2); ctx.fill();
  ctx.fillStyle = '#1565c0'; ctx.beginPath(); ctx.roundRect(1, -5, 9, 4, 1); ctx.fill();
  ctx.fillStyle = '#263238'; ctx.beginPath(); ctx.roundRect(-12, -11, 6, 8, 1); ctx.fill();
  ctx.fillStyle = boat.color1; ctx.fillRect(-12, -6, 6, 2);
  if ((keys['KeyW'] || keys['ArrowUp']) && tugboat.fuel > 0) {
    for (let i = 0; i < 3; i++) {
      const off = ((game.time * 0.15) + i * 7) % 22;
      ctx.fillStyle = `rgba(110, 110, 110, ${Math.max(0, 0.3 - off * 0.018)})`;
      ctx.beginPath(); ctx.arc(-9 - off * 0.3, -14 - off, 2.5 + off * 0.1, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#455a64'; ctx.beginPath(); ctx.arc(-22, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(22, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCompetitorTug(comp) {
  ctx.save(); ctx.translate(comp.x, comp.y); ctx.rotate(comp.angle);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(3, 3, 24, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hull gradient
  const hg = ctx.createLinearGradient(0, -11, 0, 11);
  hg.addColorStop(0, comp.color1);
  hg.addColorStop(0.5, comp.color2);
  hg.addColorStop(1, comp.color3);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(24, 0); ctx.quadraticCurveTo(26, -8, 15, -11); ctx.lineTo(-18, -11);
  ctx.quadraticCurveTo(-24, -11, -24, 0); ctx.quadraticCurveTo(-24, 11, -18, 11);
  ctx.lineTo(15, 11); ctx.quadraticCurveTo(26, 8, 24, 0);
  ctx.closePath();
  ctx.fill();

  // Hull bottom stripe
  ctx.fillStyle = comp.color3;
  ctx.beginPath();
  ctx.moveTo(21, 5); ctx.lineTo(-18, 5); ctx.quadraticCurveTo(-22, 5, -22, 8);
  ctx.quadraticCurveTo(-22, 11, -18, 11); ctx.lineTo(15, 11); ctx.quadraticCurveTo(24, 8, 21, 5);
  ctx.fill();

  // Cabin
  ctx.fillStyle = '#5d4037';
  ctx.beginPath(); ctx.roundRect(-16, -8, 28, 16, 2); ctx.fill();

  // Windows
  ctx.fillStyle = '#263238';
  ctx.beginPath(); ctx.roundRect(-1, -7, 13, 14, 2); ctx.fill();
  ctx.fillStyle = '#455a64';
  ctx.beginPath(); ctx.roundRect(1, -5, 9, 4, 1); ctx.fill();

  // Smokestack
  ctx.fillStyle = '#37474f';
  ctx.beginPath(); ctx.roundRect(-12, -11, 6, 8, 1); ctx.fill();
  ctx.fillStyle = comp.color1;
  ctx.fillRect(-12, -6, 6, 2);

  // Smoke when moving
  const speed = Math.hypot(comp.vx, comp.vy);
  if (speed > 0.5) {
    for (let i = 0; i < 3; i++) {
      const off = ((game.time * 0.15) + i * 7) % 22;
      ctx.fillStyle = `rgba(80, 80, 80, ${Math.max(0, 0.25 - off * 0.015)})`;
      ctx.beginPath(); ctx.arc(-9 - off * 0.3, -14 - off, 2.5 + off * 0.1, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Tow hitch
  ctx.fillStyle = '#37474f';
  ctx.beginPath(); ctx.arc(-22, 0, 4, 0, Math.PI * 2); ctx.fill();

  // Bow light
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath(); ctx.arc(22, 0, 2.5, 0, Math.PI * 2); ctx.fill();

  // Name tag above boat
  ctx.restore();

  // Draw name above competitor
  ctx.fillStyle = comp.color1;
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(comp.name, comp.x, comp.y - 25);

  // Draw delivery count
  if (comp.deliveries > 0) {
    ctx.fillStyle = '#ffd700';
    ctx.font = '9px sans-serif';
    ctx.fillText(`\u2605${comp.deliveries}`, comp.x, comp.y - 15);
  }
}

function drawCompetitorRope(comp) {
  const cargo = comp.attached;
  const sx = comp.x - Math.cos(comp.angle) * 28;
  const sy = comp.y - Math.sin(comp.angle) * 28;
  const bx = cargo.x + Math.cos(cargo.angle) * (cargo.width / 2);
  const by = cargo.y + Math.sin(cargo.angle) * (cargo.width / 2);
  const mx = (sx + bx) / 2, my = (sy + by) / 2 + 7;

  // Shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy + 2);
  ctx.quadraticCurveTo(mx + 2, my + 2, bx + 2, by + 2);
  ctx.stroke();

  // Rope
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(mx, my, bx, by);
  ctx.stroke();

  // Attachment points
  ctx.fillStyle = '#4e342e';
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.arc(bx, by, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCargoShip(cargo) {
  if (!cargo || !cargo.width || !cargo.height) return;
  ctx.save(); ctx.translate(cargo.x, cargo.y); ctx.rotate(cargo.angle);
  const w = cargo.width, h = cargo.height;

  // Sinking effect
  if (cargo.sinkTimer !== null && currentJob) {
    const sinkPct = cargo.sinkTimer / currentJob.timeLimit;
    ctx.globalAlpha = 0.5 + sinkPct * 0.5;
    const bob = Math.sin(game.time * 0.2) * (1 - sinkPct) * 3;
    ctx.translate(0, bob);
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(4, 4, w / 2 + 5, h / 2 + 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Water line ripple
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2 + 3, h / 2 + 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Hull base gradient
  const hg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  hg.addColorStop(0, cargo.accent);
  hg.addColorStop(0.4, cargo.color);
  hg.addColorStop(1, shadeColor(cargo.color, -20));

  // Draw hull shape
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.quadraticCurveTo(w / 2 + 2, -h / 4, w / 3, -h / 2);
  ctx.lineTo(-w / 2 + 5, -h / 2);
  ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2, -h / 3);
  ctx.lineTo(-w / 2, h / 3);
  ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2 + 5, h / 2);
  ctx.lineTo(w / 3, h / 2);
  ctx.quadraticCurveTo(w / 2 + 2, h / 4, w / 2, 0);
  ctx.closePath();
  ctx.fill();

  // Hull stripe (waterline)
  ctx.fillStyle = shadeColor(cargo.color, -30);
  ctx.beginPath();
  ctx.moveTo(w / 2 - 2, h / 4);
  ctx.lineTo(-w / 2 + 3, h / 4);
  ctx.lineTo(-w / 2 + 3, h / 2 - 3);
  ctx.quadraticCurveTo(-w / 2 + 3, h / 2, -w / 2 + 8, h / 2);
  ctx.lineTo(w / 3 - 3, h / 2);
  ctx.quadraticCurveTo(w / 2, h / 3, w / 2 - 2, h / 4);
  ctx.closePath();
  ctx.fill();

  // Type-specific details
  if (cargo.type === 'barge') {
    drawBarge(w, h);
  } else if (cargo.type === 'fishing') {
    drawFishingBoat(w, h);
  } else if (cargo.type === 'yacht') {
    drawYacht(w, h);
  } else if (cargo.type === 'container') {
    drawContainerShip(w, h);
  } else if (cargo.type === 'tanker') {
    drawTanker(w, h);
  } else if (cargo.type === 'hazmat') {
    drawChemicalBarge(w, h);
  }

  // Bow light
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(255,255,255,0.8)';
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.arc(w / 2 - 2, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Port (left/red) and starboard (right/green) lights
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath(); ctx.arc(w / 4, -h / 2 + 2, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2ecc71';
  ctx.beginPath(); ctx.arc(w / 4, h / 2 - 2, 1.5, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

function drawBarge(w, h) {
  // Wooden deck
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(-w / 2 + 8, -h / 2 + 4, w - 20, h - 8);

  // Deck planks
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  for (let i = -w / 2 + 15; i < w / 2 - 15; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, -h / 2 + 5);
    ctx.lineTo(i, h / 2 - 5);
    ctx.stroke();
  }

  // Cargo crates
  const crateColors = ['#a1887f', '#6d4c41', '#8d6e63', '#5d4037'];
  let crateX = -w / 3;
  for (let i = 0; i < Math.floor(w / 25); i++) {
    const crateW = 12 + Math.random() * 6;
    const crateH = 8 + Math.random() * 4;
    ctx.fillStyle = crateColors[i % crateColors.length];
    ctx.fillRect(crateX, -crateH / 2, crateW, crateH);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(crateX, -crateH / 2, crateW, crateH);
    // Crate straps
    ctx.strokeStyle = '#37474f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(crateX + crateW / 2, -crateH / 2);
    ctx.lineTo(crateX + crateW / 2, crateH / 2);
    ctx.stroke();
    crateX += crateW + 3;
  }

  // Railing posts
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(-w / 2 + 5, -h / 2 + 2, 3, 4);
  ctx.fillRect(-w / 2 + 5, h / 2 - 6, 3, 4);
  ctx.fillRect(w / 4, -h / 2 + 2, 3, 4);
  ctx.fillRect(w / 4, h / 2 - 6, 3, 4);
}

function drawFishingBoat(w, h) {
  // Cabin
  const cabinGrad = ctx.createLinearGradient(0, -h / 3, 0, h / 4);
  cabinGrad.addColorStop(0, '#fafafa');
  cabinGrad.addColorStop(1, '#cfd8dc');
  ctx.fillStyle = cabinGrad;
  ctx.beginPath();
  ctx.roundRect(-w / 6, -h / 3, w / 2.5, h / 1.8, 3);
  ctx.fill();

  // Cabin window
  ctx.fillStyle = '#1565c0';
  ctx.beginPath();
  ctx.roundRect(-w / 8, -h / 4, w / 4, h / 4, 2);
  ctx.fill();
  ctx.fillStyle = '#64b5f6';
  ctx.fillRect(-w / 8 + 2, -h / 4 + 2, w / 4 - 4, h / 8);

  // Fishing mast
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-w / 4, 0);
  ctx.lineTo(-w / 4, -h);
  ctx.stroke();

  // Mast crossbar
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w / 4 - 10, -h + 8);
  ctx.lineTo(-w / 4 + 10, -h + 8);
  ctx.stroke();

  // Fishing lines
  ctx.strokeStyle = 'rgba(150, 150, 150, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(-w / 4 - 8, -h + 8);
  ctx.lineTo(-w / 4 - 15, -h / 2);
  ctx.moveTo(-w / 4 + 8, -h + 8);
  ctx.lineTo(-w / 4 + 15, -h / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Nets on deck
  ctx.fillStyle = 'rgba(100, 80, 60, 0.5)';
  ctx.beginPath();
  ctx.ellipse(w / 5, 0, w / 6, h / 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 5 - w / 6 + i * 5, -h / 4);
    ctx.lineTo(w / 5 - w / 6 + i * 5, h / 4);
    ctx.stroke();
  }
}

function drawYacht(w, h) {
  // Sleek cabin
  const cabinGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 3);
  cabinGrad.addColorStop(0, '#fafafa');
  cabinGrad.addColorStop(1, '#e0e0e0');
  ctx.fillStyle = cabinGrad;
  ctx.beginPath();
  ctx.moveTo(w / 5, -h / 3);
  ctx.quadraticCurveTo(-w / 4, -h / 2.5, -w / 3, -h / 4);
  ctx.lineTo(-w / 3, h / 4);
  ctx.quadraticCurveTo(-w / 4, h / 2.5, w / 5, h / 3);
  ctx.closePath();
  ctx.fill();

  // Windows (panoramic)
  ctx.fillStyle = '#0d47a1';
  ctx.beginPath();
  ctx.moveTo(w / 6, -h / 4);
  ctx.quadraticCurveTo(-w / 5, -h / 3, -w / 4, -h / 5);
  ctx.lineTo(-w / 4, h / 5);
  ctx.quadraticCurveTo(-w / 5, h / 3, w / 6, h / 4);
  ctx.closePath();
  ctx.fill();

  // Window reflection
  ctx.fillStyle = 'rgba(100, 180, 255, 0.4)';
  ctx.beginPath();
  ctx.moveTo(w / 8, -h / 5);
  ctx.quadraticCurveTo(-w / 6, -h / 4, -w / 5, -h / 6);
  ctx.lineTo(-w / 5, 0);
  ctx.quadraticCurveTo(-w / 6, h / 8, w / 8, h / 10);
  ctx.closePath();
  ctx.fill();

  // Deck details
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(w / 6, -h / 6, w / 5, h / 3);

  // Sun deck railing
  ctx.strokeStyle = '#bdbdbd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 6, -h / 6);
  ctx.lineTo(w / 3, -h / 6);
  ctx.moveTo(w / 6, h / 6);
  ctx.lineTo(w / 3, h / 6);
  ctx.stroke();

  // Satellite dome
  ctx.fillStyle = '#eceff1';
  ctx.beginPath();
  ctx.arc(-w / 5, 0, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawContainerShip(w, h) {
  // Deck base
  ctx.fillStyle = '#455a64';
  ctx.fillRect(-w / 2 + 10, -h / 2 + 5, w - 25, h - 10);

  // Containers - stacked 2 high
  const containerColors = [
    ['#c0392b', '#e74c3c'], // Red
    ['#2471a3', '#3498db'], // Blue
    ['#27ae60', '#2ecc71'], // Green
    ['#d35400', '#e67e22'], // Orange
    ['#8e44ad', '#9b59b6'], // Purple
    ['#f39c12', '#f1c40f']  // Yellow
  ];

  let cx = -w / 2 + 12;
  const containerW = 18;
  const containerH = (h - 14) / 2;
  let colorIdx = 0;

  while (cx + containerW < w / 3) {
    // Bottom container
    const colors1 = containerColors[colorIdx % containerColors.length];
    const cg1 = ctx.createLinearGradient(cx, 0, cx + containerW, 0);
    cg1.addColorStop(0, colors1[0]);
    cg1.addColorStop(0.5, colors1[1]);
    cg1.addColorStop(1, colors1[0]);
    ctx.fillStyle = cg1;
    ctx.fillRect(cx, -h / 2 + 6, containerW - 1, containerH - 1);
    ctx.fillRect(cx, 1, containerW - 1, containerH - 1);

    // Container ridges
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let r = 0; r < 3; r++) {
      const rx = cx + 4 + r * 5;
      ctx.beginPath();
      ctx.moveTo(rx, -h / 2 + 7);
      ctx.lineTo(rx, -h / 2 + containerH + 4);
      ctx.moveTo(rx, 2);
      ctx.lineTo(rx, containerH);
      ctx.stroke();
    }

    // Top container (different color)
    colorIdx++;
    const colors2 = containerColors[colorIdx % containerColors.length];
    const cg2 = ctx.createLinearGradient(cx, 0, cx + containerW, 0);
    cg2.addColorStop(0, colors2[0]);
    cg2.addColorStop(0.5, colors2[1]);
    cg2.addColorStop(1, colors2[0]);
    ctx.fillStyle = cg2;

    colorIdx++;
    cx += containerW + 1;
  }

  // Bridge/cabin at back
  const bridgeGrad = ctx.createLinearGradient(-w / 2 + 12, 0, -w / 2 + 30, 0);
  bridgeGrad.addColorStop(0, '#fafafa');
  bridgeGrad.addColorStop(1, '#cfd8dc');
  ctx.fillStyle = bridgeGrad;
  ctx.fillRect(-w / 2 + 12, -h / 3, 18, h / 1.6);

  // Bridge windows
  ctx.fillStyle = '#1565c0';
  ctx.fillRect(-w / 2 + 14, -h / 4, 14, h / 3);
  ctx.fillStyle = '#64b5f6';
  ctx.fillRect(-w / 2 + 15, -h / 4 + 2, 12, h / 6);

  // Crane
  ctx.strokeStyle = '#f57c00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 5, 0);
  ctx.lineTo(w / 5, -h * 0.8);
  ctx.lineTo(w / 3, -h * 0.7);
  ctx.stroke();
}

function drawTanker(w, h) {
  // Main tank
  const tankGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  tankGrad.addColorStop(0, '#546e7a');
  tankGrad.addColorStop(0.3, '#37474f');
  tankGrad.addColorStop(0.7, '#37474f');
  tankGrad.addColorStop(1, '#263238');
  ctx.fillStyle = tankGrad;
  ctx.beginPath();
  ctx.ellipse(-w / 8, 0, w / 2.8, h / 2.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tank highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-w / 8, 0, w / 2.8, h / 2.8, 0, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.stroke();

  // Tank segments
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const sx = -w / 3 + i * (w / 4);
    ctx.beginPath();
    ctx.moveTo(sx, -h / 3);
    ctx.lineTo(sx, h / 3);
    ctx.stroke();
  }

  // Pipes on top
  ctx.strokeStyle = '#78909c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-w / 3, 0);
  ctx.lineTo(w / 5, 0);
  ctx.stroke();

  // Pipe joints
  ctx.fillStyle = '#90a4ae';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-w / 4 + i * (w / 5), 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Valve wheels
  ctx.strokeStyle = '#b71c1c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-w / 4, -h / 5, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 10, -h / 5, 5, 0, Math.PI * 2);
  ctx.stroke();

  // Bridge at back
  const bridgeGrad = ctx.createLinearGradient(0, -h / 3, 0, h / 3);
  bridgeGrad.addColorStop(0, '#fafafa');
  bridgeGrad.addColorStop(1, '#b0bec5');
  ctx.fillStyle = bridgeGrad;
  ctx.fillRect(-w / 2 + 8, -h / 3, 15, h / 1.6);

  // Bridge windows
  ctx.fillStyle = '#0d47a1';
  ctx.fillRect(-w / 2 + 10, -h / 4, 11, h / 3);

  // Warning stripes at bow
  ctx.fillStyle = '#f57f17';
  ctx.fillRect(w / 4, -h / 4, 8, h / 2);
  ctx.fillStyle = '#212121';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(w / 4, -h / 4 + i * (h / 4), 8, h / 8);
  }

  // Hazmat symbol
  ctx.fillStyle = '#f57f17';
  ctx.beginPath();
  ctx.arc(w / 4 + 4, 0, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawChemicalBarge(w, h) {
  // Chemical tanks - multiple cylindrical tanks
  const tankCount = 3;
  const tankWidth = w / (tankCount + 1);
  const tankHeight = h * 0.65;

  for (let i = 0; i < tankCount; i++) {
    const tx = -w / 3 + i * tankWidth;

    // Tank body gradient
    const tankGrad = ctx.createLinearGradient(tx, -tankHeight / 2, tx, tankHeight / 2);
    tankGrad.addColorStop(0, '#9b59b6');
    tankGrad.addColorStop(0.2, '#8e44ad');
    tankGrad.addColorStop(0.8, '#7d3c98');
    tankGrad.addColorStop(1, '#6c3483');
    ctx.fillStyle = tankGrad;

    // Rounded tank shape
    ctx.beginPath();
    ctx.moveTo(tx - tankWidth / 3, -tankHeight / 2 + 3);
    ctx.quadraticCurveTo(tx - tankWidth / 3, -tankHeight / 2, tx - tankWidth / 3 + 3, -tankHeight / 2);
    ctx.lineTo(tx + tankWidth / 3 - 3, -tankHeight / 2);
    ctx.quadraticCurveTo(tx + tankWidth / 3, -tankHeight / 2, tx + tankWidth / 3, -tankHeight / 2 + 3);
    ctx.lineTo(tx + tankWidth / 3, tankHeight / 2 - 3);
    ctx.quadraticCurveTo(tx + tankWidth / 3, tankHeight / 2, tx + tankWidth / 3 - 3, tankHeight / 2);
    ctx.lineTo(tx - tankWidth / 3 + 3, tankHeight / 2);
    ctx.quadraticCurveTo(tx - tankWidth / 3, tankHeight / 2, tx - tankWidth / 3, tankHeight / 2 - 3);
    ctx.closePath();
    ctx.fill();

    // Tank highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(tx - tankWidth / 4, -tankHeight / 2 + 2, 3, tankHeight - 4);

    // Tank band
    ctx.fillStyle = '#5b2c6f';
    ctx.fillRect(tx - tankWidth / 3, -2, tankWidth * 0.66, 4);
  }

  // Hazmat warning signs on tanks
  ctx.fillStyle = '#f39c12';
  for (let i = 0; i < tankCount; i++) {
    const tx = -w / 3 + i * tankWidth;
    // Diamond hazmat symbol
    ctx.save();
    ctx.translate(tx, -tankHeight / 4);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
    // Hazmat icon
    ctx.fillStyle = '#000';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('â˜£', tx, -tankHeight / 4 + 2);
    ctx.fillStyle = '#f39c12';
  }

  // Connecting pipes between tanks
  ctx.strokeStyle = '#7f8c8d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-w / 3, 0);
  ctx.lineTo(w / 4, 0);
  ctx.stroke();

  // Pipe valves
  ctx.fillStyle = '#e74c3c';
  for (let i = 0; i < tankCount - 1; i++) {
    const vx = -w / 3 + tankWidth / 2 + i * tankWidth;
    ctx.beginPath();
    ctx.arc(vx, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    // Valve handle
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vx - 3, -5);
    ctx.lineTo(vx + 3, -5);
    ctx.stroke();
  }

  // Warning stripes at bow
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(w / 4, -h / 3, 6, h / 1.5);
  ctx.fillStyle = '#2c3e50';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(w / 4, -h / 3 + i * (h / 3.75), 6, h / 7.5);
  }

  // Pulsing glow effect for hazmat
  const pulse = Math.sin(game.time * 0.08) * 0.2 + 0.3;
  ctx.fillStyle = `rgba(155, 89, 182, ${pulse})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2 - 5, h / 2 - 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Helper function to shade colors
function shadeColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function drawMinimap() {
  if (!options.minimap) return;
  const scale = minimapCanvas.width / WORLD.width;

  // Fill background with land
  minimapCtx.fillStyle = '#2d5a27';
  minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  // Draw ocean (right side)
  minimapCtx.fillStyle = '#0d4a6f';
  minimapCtx.fillRect((OCEAN.x - 200) * scale, 0, (WORLD.width - OCEAN.x + 200) * scale, minimapCanvas.height);

  // Draw harbor (left side)
  minimapCtx.fillStyle = '#1a7a9a';
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, 300 * scale);
  minimapCtx.lineTo(HARBOR.width * scale, 400 * scale);
  minimapCtx.lineTo((HARBOR.width + 100) * scale, 600 * scale);
  minimapCtx.lineTo((HARBOR.width + 100) * scale, 3400 * scale);
  minimapCtx.lineTo(HARBOR.width * scale, 3600 * scale);
  minimapCtx.lineTo(0, 3700 * scale);
  minimapCtx.fill();

  // Draw rivers
  minimapCtx.strokeStyle = '#1a7a9a';
  minimapCtx.lineCap = 'round';
  for (const key in RIVERS) {
    const river = RIVERS[key];
    minimapCtx.lineWidth = river.width * scale * 0.8;
    minimapCtx.beginPath();
    minimapCtx.moveTo(river.path[0].x * scale, river.path[0].y * scale);
    for (let i = 1; i < river.path.length; i++) {
      minimapCtx.lineTo(river.path[i].x * scale, river.path[i].y * scale);
    }
    minimapCtx.stroke();
  }

  // Docks
  docks.forEach(d => {
    minimapCtx.fillStyle = d.hasFuel ? '#f39c12' : d.hasRepair ? '#3498db' : '#a1887f';
    minimapCtx.fillRect(d.x * scale - 2, d.y * scale - 1, Math.max(4, d.width * scale), Math.max(2, d.height * scale));
  });

  // Current job markers
  if (currentJob) {
    const jt = currentJob.jobType;
    const d = currentJob.delivery;
    minimapCtx.strokeStyle = jt.color;
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(d.x * scale - 2, d.y * scale - 2, 8, 6);
  }

  if (currentJob && !currentJob.pickedUp) {
    const jt = currentJob.jobType;
    minimapCtx.fillStyle = jt.color;

    // For salvage, show pulsing indicator
    if (jt === JOB_TYPES.SALVAGE) {
      const pulse = Math.sin(game.time * 0.1) * 0.3 + 0.7;
      minimapCtx.globalAlpha = pulse;
      minimapCtx.beginPath();
      minimapCtx.arc(currentJob.cargo.x * scale, currentJob.cargo.y * scale, 5 + Math.sin(game.time * 0.08) * 2, 0, Math.PI * 2);
      minimapCtx.fill();
      minimapCtx.globalAlpha = 1;
      // Inner dot
      minimapCtx.fillStyle = '#fff';
      minimapCtx.beginPath();
      minimapCtx.arc(currentJob.cargo.x * scale, currentJob.cargo.y * scale, 2, 0, Math.PI * 2);
      minimapCtx.fill();
    } else if (jt === JOB_TYPES.TANDEM) {
      // Show all tandem cargo
      for (const cargo of cargos) {
        minimapCtx.fillStyle = jt.color;
        minimapCtx.beginPath();
        minimapCtx.arc(cargo.x * scale, cargo.y * scale, 2.5, 0, Math.PI * 2);
        minimapCtx.fill();
      }
    } else {
      minimapCtx.beginPath();
      minimapCtx.arc(currentJob.cargo.x * scale, currentJob.cargo.y * scale, 3, 0, Math.PI * 2);
      minimapCtx.fill();
    }
  }

  // Competitors
  for (const comp of competitors) {
    minimapCtx.fillStyle = comp.color1;
    minimapCtx.beginPath();
    minimapCtx.arc(comp.x * scale, comp.y * scale, 2.5, 0, Math.PI * 2);
    minimapCtx.fill();

    if (comp.attached) {
      minimapCtx.fillStyle = comp.color2;
      minimapCtx.beginPath();
      minimapCtx.arc(comp.attached.x * scale, comp.attached.y * scale, 2, 0, Math.PI * 2);
      minimapCtx.fill();
    }
  }

  // Player
  minimapCtx.fillStyle = '#ff5722';
  minimapCtx.beginPath();
  minimapCtx.arc(tugboat.x * scale, tugboat.y * scale, 3, 0, Math.PI * 2);
  minimapCtx.fill();

  // Camera view box
  minimapCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(camera.x * scale, camera.y * scale, VIEW.width * scale / zoom.level, VIEW.height * scale / zoom.level);
}

// Delta time variables
let lastFrameTime = 0;
const TARGET_FPS = 60;
const TARGET_FRAME_TIME = 1000 / TARGET_FPS; // ~16.67ms

function gameLoop(currentTime) {
  // Stop loop on fatal error
  if (__fatalError) { return; }
  // Calculate delta time (capped to prevent spiral of death on tab switch)
  const rawDelta = currentTime - lastFrameTime;
  const deltaMs = Math.min(rawDelta, 100); // Cap at 100ms (10fps min)
  const delta = deltaMs / TARGET_FRAME_TIME; // Normalized: 1.0 = 60fps
  lastFrameTime = currentTime;

  handleGamepad(delta);
  update(delta);
  updateCameraShake(deltaMs / 1000);
  draw();
  updateDebugHud(deltaMs, delta);
  requestAnimationFrame(gameLoop);
}

/* === Profiles: 3 Save/Load Slots === */
const SAVE_SYS = {
  slots: 3,
  keyPrefix: 'tugboat_save_slot_',
  activeKey: 'tugboat_active_slot',
  namePrefix: 'tugboat_profile_name_',
  exportPrefix: 'tugboat_profile_export_',
  version: 2
};
let activeSaveSlot = (() => {
  const n = parseInt(localStorage.getItem(SAVE_SYS.activeKey) || '1', 10);
  return (n >= 1 && n <= SAVE_SYS.slots) ? n : 1;
})();
let _selectedDifficultyKey = 'normal';

function _saveKey(slot) { return SAVE_SYS.keyPrefix + String(slot); }


function _nameKey(slot) { return SAVE_SYS.namePrefix + String(slot); }

function getProfileName(slot) {
  try {
    const raw = localStorage.getItem(_nameKey(slot));
    if (raw && raw.trim()) return raw.trim().slice(0, 28);
  } catch (e) { }
  return `Profile ${slot}`;
}

function setProfileName(slot, name) {
  try {
    const n = String(name || '').trim().slice(0, 28);
    localStorage.setItem(_nameKey(slot), n || `Profile ${slot}`);
  } catch (e) { }
  try { updateProfileUI(); } catch (e) { }
}

// ---- Robust Save Payload + Migration ----
function _isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function _migrateSaveData(data) {
  // Always return an object (or null if hopelessly invalid)
  if (!_isObj(data)) return null;

  const v = Number(data.version || 0);

  // v0/v1 -> v2 (add missing fields, keep compatible)
  if (v < 2) {
    data.version = 2;
    if (!('savedAt' in data)) data.savedAt = Date.now();
    if (!('difficultyKey' in data)) data.difficultyKey = 'normal';
    if (!_isObj(data.options)) data.options = (typeof options === 'object') ? { ...options } : {};
    if (!_isObj(data.game)) data.game = (typeof game === 'object') ? { ...game } : {};
    if (!('playerTier' in data)) data.playerTier = (typeof playerTier === 'number') ? playerTier : 0;

    if (!_isObj(data.tugboat)) data.tugboat = {};
    if (typeof data.tugboat.ownedBoats === 'undefined') data.tugboat.ownedBoats = Array.isArray(tugboat.ownedBoats) ? [...tugboat.ownedBoats] : [];
    if (typeof data.tugboat.currentBoat === 'undefined') data.tugboat.currentBoat = tugboat.currentBoat || 0;

    if (!_isObj(data.career)) data.career = {};
    if (!Array.isArray(data.career.unlockedRegions)) data.career.unlockedRegions = Array.isArray(career.unlockedRegions) ? [...career.unlockedRegions] : [];
    if (!Array.isArray(data.career.regionDeliveries)) data.career.regionDeliveries = Array.isArray(career.regionDeliveries) ? [...career.regionDeliveries] : [];

    if (!_isObj(data.licenses)) data.licenses = {};
    if (!Array.isArray(data.licenses.owned)) data.licenses.owned = Array.isArray(licenses.owned) ? [...licenses.owned] : [];
  }

  return data;
}

// ---- Autosave: rate-limited + hooks ----
let __lastAutosaveAt = 0;
function triggerAutosave(reason = 'autosave') {
  // Don't spam saves; also avoid saving before init.
  const now = Date.now();
  if (now - __lastAutosaveAt < 8000) return;
  if (!game || typeof activeSaveSlot !== 'number') return;
  __lastAutosaveAt = now;
  try {
    // silent=true (use subtle indicator only)
    saveToSlot(activeSaveSlot, true);
    showAutosaveIndicator();
  } catch (e) {
    console.warn('Autosave failed:', reason, e);
  }
}

function renameActiveProfile() {
  const slot = activeSaveSlot || 1;
  const current = getProfileName(slot);
  const name = prompt('Profile name (max 28 chars):', current);
  if (name === null) return;
  setProfileName(slot, name);
}

function exportActiveProfile() {
  const slot = activeSaveSlot || 1;
  try {
    const raw = localStorage.getItem(_saveKey(slot));
    if (!raw) { alert('Nothing saved in this profile yet.'); return; }
    const payload = {
      exportVersion: 1,
      exportedAt: Date.now(),
      slot,
      name: getProfileName(slot),
      data: JSON.parse(raw)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const safeName = (getProfileName(slot) || ('Profile_' + slot)).replace(/[^a-z0-9\-_ ]/gi, '_').trim().replace(/\s+/g, '_');
    a.download = `tugboat_${safeName}_slot${slot}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  } catch (e) {
    console.error(e);
    alert('Export failed (see console).');
  }
}

function importIntoActiveProfile() {
  const input = document.getElementById('profileImportInput');
  if (!input) { alert('Import control missing.'); return; }
  input.value = '';
  input.onchange = async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const payload = JSON.parse(text);
      const slot = activeSaveSlot || 1;

      // Accept either wrapped export or raw save data
      let data = payload && payload.data ? payload.data : payload;
      data = _migrateSaveData(data);
      if (!data) { alert('That file does not look like a Tugboat save.'); return; }

      localStorage.setItem(_saveKey(slot), JSON.stringify(data));
      if (payload && payload.name) setProfileName(slot, payload.name);

      updateMenuButtons();
      updateProfileUI();
      alert(`Imported into ${getProfileName(slot)}.`);
    } catch (e) {
      console.error(e);
      alert('Import failed. Make sure it is a valid .json save file.');
    }
  };
  input.click();
}

// Wrap important progression functions to autosave after changes.
function _wrapAutosave(fnName, reason) {
  try {
    const fn = window[fnName];
    if (typeof fn !== 'function') return;
    if (fn.__autosaveWrapped) return;
    const wrapped = function (...args) {
      const r = fn.apply(this, args);
      // defer so any state changes finish first
      setTimeout(() => triggerAutosave(reason || fnName), 0);
      return r;
    };
    wrapped.__autosaveWrapped = true;
    window[fnName] = wrapped;
  } catch (e) { }
}

// install wrappers after everything is defined
setTimeout(() => {
  _wrapAutosave('completeJob', 'jobComplete');
  _wrapAutosave('failJob', 'jobFail');
  _wrapAutosave('buyBoat', 'buyBoat');
  _wrapAutosave('purchaseBoat', 'buyBoat');
  _wrapAutosave('buyLicense', 'buyLicense');
  _wrapAutosave('purchaseLicense', 'buyLicense');
  _wrapAutosave('unlockTier', 'unlockTier');
  _wrapAutosave('unlockRegion', 'unlockTier');
  _wrapAutosave('refuel', 'refuel');
}, 0);

// Timed autosave while playing
setInterval(() => {
  try {
    if (!gameStarted) return;
    // autosave even if paused (menu open), but only if we actually started a run
    triggerAutosave('timer');
  } catch (e) { }
}, 120000); // every 2 minutes

function _getDifficultyKey() {
  // Prefer tracked key
  if (_selectedDifficultyKey && DIFFICULTY[_selectedDifficultyKey] === currentDifficulty) return _selectedDifficultyKey;
  // Fallback: find by reference
  for (const k in DIFFICULTY) {
    if (DIFFICULTY[k] === currentDifficulty) return k;
  }
  // Fallback: match by name
  for (const k in DIFFICULTY) {
    if (DIFFICULTY[k] && DIFFICULTY[k].name === (currentDifficulty && currentDifficulty.name)) return k;
  }
  return 'normal';
}

function _collectSaveData() {
  return {
    version: SAVE_SYS.version,
    savedAt: Date.now(),
    difficultyKey: _getDifficultyKey(),
    safeMode: (typeof __safeMode !== 'undefined') ? !!__safeMode : false,
    options: { ...options },
    game: { ...game },
    playerTier: playerTier,  // Save current tier
    tugboat: {
      x: tugboat.x, y: tugboat.y, angle: tugboat.angle,
      vx: tugboat.vx, vy: tugboat.vy, angularVel: tugboat.angularVel,
      fuel: tugboat.fuel, health: tugboat.health,
      currentBoat: tugboat.currentBoat,
      ownedBoats: Array.isArray(tugboat.ownedBoats) ? [...tugboat.ownedBoats] : []
    },
    career: {
      currentRegion: career.currentRegion,
      unlockedRegions: Array.isArray(career.unlockedRegions) ? [...career.unlockedRegions] : [],
      totalDeliveries: career.totalDeliveries,
      totalEarnings: career.totalEarnings,
      regionDeliveries: Array.isArray(career.regionDeliveries) ? [...career.regionDeliveries] : []
    },
    licenses: {
      owned: Array.isArray(licenses.owned) ? [...licenses.owned] : [],
      rushJobs: licenses.rushJobs,
      fragileJobs: licenses.fragileJobs,
      rescueJobs: licenses.rescueJobs,
      salvageJobs: licenses.salvageJobs
    }
  };
}

function _applySaveData(data) {
  data = _migrateSaveData(data);
  if (!data) return false;
  if (!data || typeof data !== 'object') return false;

  // Difficulty
  const dk = data.difficultyKey || 'normal';
  _selectedDifficultyKey = dk;
  currentDifficulty = DIFFICULTY[dk] || DIFFICULTY.normal;

  // Safe mode + options
  if (typeof data.safeMode === 'boolean' && typeof __safeMode !== 'undefined') __safeMode = data.safeMode;
  if (data.options && typeof data.options === 'object') {
    for (const k in options) {
      if (k in data.options) options[k] = data.options[k];
    }
  }

  // Game stats
  if (data.game && typeof data.game === 'object') {
    for (const k in game) {
      if (k in data.game) game[k] = data.game[k];
    }
  }

  // Player tier (new map system)
  if (typeof data.playerTier === 'number') {
    playerTier = data.playerTier;
  }

  // Tugboat
  if (data.tugboat && typeof data.tugboat === 'object') {
    const t = data.tugboat;
    if (typeof t.x === 'number') tugboat.x = t.x;
    if (typeof t.y === 'number') tugboat.y = t.y;
    if (typeof t.angle === 'number') tugboat.angle = t.angle;
    if (typeof t.vx === 'number') tugboat.vx = t.vx;
    if (typeof t.vy === 'number') tugboat.vy = t.vy;
    if (typeof t.angularVel === 'number') tugboat.angularVel = t.angularVel;
    if (typeof t.fuel === 'number') tugboat.fuel = t.fuel;
    if (typeof t.health === 'number') tugboat.health = t.health;
    if (typeof t.currentBoat === 'number') tugboat.currentBoat = t.currentBoat;
    if (Array.isArray(t.ownedBoats)) tugboat.ownedBoats = [...t.ownedBoats];
  }

  // Career
  if (data.career && typeof data.career === 'object') {
    const c = data.career;
    if (typeof c.currentRegion === 'number') career.currentRegion = c.currentRegion;
    if (Array.isArray(c.unlockedRegions)) career.unlockedRegions = [...c.unlockedRegions];
    if (typeof c.totalDeliveries === 'number') career.totalDeliveries = c.totalDeliveries;
    if (typeof c.totalEarnings === 'number') career.totalEarnings = c.totalEarnings;
    if (Array.isArray(c.regionDeliveries)) career.regionDeliveries = [...c.regionDeliveries];
  }

  // Licenses
  if (data.licenses && typeof data.licenses === 'object') {
    const l = data.licenses;
    if (Array.isArray(l.owned)) licenses.owned = [...l.owned];
    if (typeof l.rushJobs === 'number') licenses.rushJobs = l.rushJobs;
    if (typeof l.fragileJobs === 'number') licenses.fragileJobs = l.fragileJobs;
    if (typeof l.rescueJobs === 'number') licenses.rescueJobs = l.rescueJobs;
    if (typeof l.salvageJobs === 'number') licenses.salvageJobs = l.salvageJobs;
  }

  // Refresh UI
  try { updateOptionsUI(); } catch (e) { }
  try { updateUI(); } catch (e) { }
  try { updateCareerUI(); } catch (e) { }
  try { updateLicenseUI(); } catch (e) { }
  try { updateRegionUI(); } catch (e) { }
  try { updateBoatShopUI(); } catch (e) { }

  return true;
}

function saveToSlot(slot, silent = false) {
  try {
    const data = _collectSaveData();
    localStorage.setItem(_saveKey(slot), JSON.stringify(data));
    activeSaveSlot = slot;
    localStorage.setItem(SAVE_SYS.activeKey, String(activeSaveSlot));
    updateProfileUI();

    // Show subtle save indicator (not the big center notification)
    if (!silent) {
      showAutosaveIndicator();
    }
    return true;
  } catch (e) {
    console.error('Save failed', e);
    return false;
  }
}

function showAutosaveIndicator() {
  const indicator = document.getElementById('autosaveIndicator');
  if (!indicator) return;
  indicator.classList.add('show');
  setTimeout(() => indicator.classList.remove('show'), 1500);
}

function loadFromSlot(slot) {
  try {
    const raw = localStorage.getItem(_saveKey(slot));
    if (!raw) return false;
    const data = JSON.parse(raw);
    const ok = _applySaveData(data);
    if (!ok) return false;
    activeSaveSlot = slot;
    localStorage.setItem(SAVE_SYS.activeKey, String(activeSaveSlot));

    // Clear transient game state (jobs, competitors, particles)
    currentJob = null;
    availableJobs = [];
    cargos = [];
    competitors = [];
    competitorJobs = [];
    waterParticles = [];
    ripples = [];
    tugboat.attached = null;

    // Only spawn entities and start if we're actually going to play
    if (!gameStarted) {
      // Spawn AI for current region
      const region = getCurrentRegion();
      for (let i = 0; i < region.aiCount; i++) {
        competitors.push(createCompetitor(i));
      }

      // Generate jobs for job board
      spawnJobBoard();

      // Start the game
      startGame();
    } else {
      // Game already running - just refresh entities
      const region = getCurrentRegion();
      for (let i = 0; i < region.aiCount; i++) {
        competitors.push(createCompetitor(i));
      }
      spawnJobBoard();
    }

    updateProfileUI();
    try { showEvent('comeback', 'Loaded', `Profile ${slot} loaded`); } catch (e) { }
    return true;
  } catch (e) {
    console.error('Load failed', e);
    return false;
  }
}

function newSlot(slot) {
  // Just create save data with defaults - don't start game
  try {
    const saveData = {
      version: SAVE_SYS.version,
      savedAt: Date.now(),
      difficultyKey: 'normal',
      safeMode: false,
      options: { ...options },
      game: { money: 100, jobsDone: 0, time: 0, paused: false },
      tugboat: {
        x: 500, y: 2000, angle: 0,
        vx: 0, vy: 0, angularVel: 0,
        fuel: 100, health: 100,
        currentBoat: 0,
        ownedBoats: [true, false, false, false, false, false, false]
      },
      career: {
        currentRegion: 0,
        unlockedRegions: [true, false, false, false, false],
        totalDeliveries: 0,
        totalEarnings: 0,
        regionDeliveries: [0, 0, 0, 0, 0]
      },
      licenses: {
        owned: [],
        rushJobs: 0, fragileJobs: 0, rescueJobs: 0, salvageJobs: 0
      }
    };

    localStorage.setItem(_saveKey(slot), JSON.stringify(saveData));
    activeSaveSlot = slot;
    localStorage.setItem(SAVE_SYS.activeKey, String(activeSaveSlot));
    updateProfileUI();
    return true;
  } catch (e) {
    console.error('New slot failed', e);
    return false;
  }
}

function deleteSlot(slot) {
  localStorage.removeItem(_saveKey(slot));
  if (activeSaveSlot === slot) {
    activeSaveSlot = 1;
    localStorage.setItem(SAVE_SYS.activeKey, String(activeSaveSlot));
  }
  updateProfileUI();
}

function setActiveSlot(slot) {
  activeSaveSlot = slot;
  localStorage.setItem(SAVE_SYS.activeKey, String(activeSaveSlot));
  updateProfileUI();
}

function _slotSummary(data) {
  if (!data) return { title: 'Empty', meta: 'No save data' };
  const dName = (DIFFICULTY[data.difficultyKey] ? DIFFICULTY[data.difficultyKey].name : (data.difficultyKey || 'Standard'));
  const money = (data.game && typeof data.game.money === 'number') ? data.game.money : 0;
  const jobs = (data.game && typeof data.game.jobsDone === 'number') ? data.game.jobsDone : 0;
  const tier = (typeof data.playerTier === 'number') ? data.playerTier : 0;
  const tierName = JOB_TIERS[tier] ? JOB_TIERS[tier].name : 'Rookie';
  const when = data.savedAt ? new Date(data.savedAt).toLocaleString() : 'Unknown';
  return {
    title: `Difficulty: ${dName}`,
    meta: `Money: $${Math.floor(money)} â€¢ Jobs: ${jobs} â€¢ Tier: ${tierName}\nSaved: ${when}`
  };
}

function updateProfileUI() {
  const grid = document.getElementById('slotGrid');
  const label = document.getElementById('activeSlotLabel');
  if (!grid) return;

  grid.innerHTML = '';
  for (let slot = 1; slot <= SAVE_SYS.slots; slot++) {
    let data = null;
    try {
      const raw = localStorage.getItem(_saveKey(slot));
      if (raw) data = JSON.parse(raw);
    } catch (e) { }

    const sum = _slotSummary(data);

    const card = document.createElement('div');
    card.className = 'slot-card' + (slot === activeSaveSlot ? ' active' : '');
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.dataset.slot = String(slot);

    const left = document.createElement('div');
    left.innerHTML = `<div class="slot-title">${getProfileName(slot)}</div>
                          <div class="slot-meta">${sum.title}<br>${sum.meta.replaceAll('\n', '<br>')}</div>`;

    const actions = document.createElement('div');
    actions.className = 'slot-actions';

    const btnSelect = document.createElement('button');
    btnSelect.className = 'mini-btn primary';
    btnSelect.textContent = 'Select';
    btnSelect.onclick = () => {
      setActiveSlot(slot);
      updateMenuButtons(); // Update continue button
      hideProfiles();
    };

    const btnLoad = document.createElement('button');
    btnLoad.className = 'mini-btn';
    btnLoad.textContent = 'Load & Play';
    btnLoad.onclick = () => {
      setActiveSlot(slot);
      if (loadFromSlot(slot)) {
        hideProfiles();
      } else {
        alert('No save data in this slot. Use "New Game" from menu.');
      }
    };

    const btnSave = document.createElement('button');
    btnSave.className = 'mini-btn';
    btnSave.textContent = 'Save';
    btnSave.onclick = () => { setActiveSlot(slot); saveToSlot(slot); };

    const btnDel = document.createElement('button');
    btnDel.className = 'mini-btn';
    btnDel.textContent = 'Delete';
    btnDel.onclick = () => {
      // Double-click protection - require clicking twice
      if (btnDel.dataset.confirmDelete === 'true') {
        deleteSlot(slot);
        updateMenuButtons();
        btnDel.textContent = 'Delete';
        btnDel.dataset.confirmDelete = 'false';
        btnDel.style.background = '';
      } else {
        btnDel.dataset.confirmDelete = 'true';
        btnDel.textContent = 'Confirm?';
        btnDel.style.background = 'rgba(231, 76, 60, 0.5)';
        // Reset after 3 seconds
        setTimeout(() => {
          if (btnDel.dataset.confirmDelete === 'true') {
            btnDel.textContent = 'Delete';
            btnDel.dataset.confirmDelete = 'false';
            btnDel.style.background = '';
          }
        }, 3000);
      }
    };

    actions.append(btnSelect, btnLoad, btnSave, btnDel);

    card.append(left, actions);
    grid.appendChild(card);

    // Controller focus helper
    try {
      _gpEnhanceClickable(card);
      _gpEnhanceClickable(btnSelect);
      _gpEnhanceClickable(btnLoad);
      _gpEnhanceClickable(btnSave);
      _gpEnhanceClickable(btnDel);
    } catch (e) { }
  }

  if (label) label.textContent = `Active Profile: ${activeSaveSlot} (${getProfileName(activeSaveSlot)})`;
}

function showProfiles() {
  if (window.Game && Game.ui && Game.ui.isModalOpen && Game.ui.isModalOpen()) return;
  const panel = document.getElementById('profilePanel');
  if (!panel) return;
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  updateProfileUI();
  // Focus first card for controller
  try {
    const first = panel.querySelector('.slot-card');
    if (first) { _gpEnhanceClickable(first); _gpSetFocused(first); }
  } catch (e) { }
}

function hideProfiles() {
  const panel = document.getElementById('profilePanel');
  if (!panel) return;
  panel.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
}

// Continue from last save
function continueGame() {
  loadFromSlot(activeSaveSlot);
}

// Check if there's save data and update menu buttons
function updateMenuButtons() {
  const continueBtn = document.getElementById('continueBtn');
  const newGameBtn = document.getElementById('newGameBtn');
  if (!continueBtn || !newGameBtn) return;

  // Check if active slot has save data
  const raw = localStorage.getItem(_saveKey(activeSaveSlot));
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data && data.savedAt) {
        continueBtn.style.display = 'flex';
        // Show profile info on continue button
        const money = (data.game && data.game.money) || 0;
        const jobs = (data.game && data.game.jobsDone) || 0;
        continueBtn.querySelector('.btn-text').textContent = `Continue (Profile ${activeSaveSlot}: $${money}, ${jobs} jobs)`;
        return;
      }
    } catch (e) { }
  }
  continueBtn.style.display = 'none';
}

// Auto-save (lightweight) every 30s while playing
setInterval(() => {
  try {
    if (gameStarted && !game.paused) saveToSlot(activeSaveSlot);
  } catch (e) { }
}, 30000);

// Track selected difficulty key when starting
const _origStartGameWithDifficulty = startGameWithDifficulty;
startGameWithDifficulty = function (diff) {
  _selectedDifficultyKey = diff;
  return _origStartGameWithDifficulty(diff);
};

// Update menu on load
setTimeout(updateMenuButtons, 100);

init();

/* ==========================================================
   Debug / Integration Surface (non-breaking)
   ----------------------------------------------------------
   You can call these from the browser console:
   - GameAPI.getState()
   - GameAPI.setMoney(99999)
   - GameAPI.spawnJob()
   - GameAPI.resetRun()
   ========================================================== */
window.GameAPI = window.GameAPI || {
  version: 'refactor-pass-3',
  // State access (read-only references)
  getState: () => ({ game, tugboat, career, licenses, options, weather, currentJob, playerTier }),
  // Safe helpers
  setMoney: (amount) => { game.money = Math.max(0, Math.floor(amount || 0)); try { updateUI(); } catch (e) { } },
  addMoney: (amount) => { game.money = Math.max(0, game.money + Math.floor(amount || 0)); try { updateUI(); } catch (e) { } },
  setFuel: (amount) => { tugboat.fuel = Math.max(0, Math.min(tugboat.maxFuel || 999999, Math.floor(amount || 0))); try { updateUI(); } catch (e) { } },
  heal: (amount = 999) => { tugboat.health = Math.max(0, Math.min(tugboat.maxHealth || 100, tugboat.health + amount)); try { updateUI(); } catch (e) { } },
  damage: (amount = 10) => { tugboat.health = Math.max(0, tugboat.health - amount); try { updateUI(); } catch (e) { } },
  // Flow actions
  spawnJob: () => { try { spawnNewJob(); updateUI(); } catch (e) { } },
  resetRun: () => { try { resetGame(); } catch (e) { } },
  // Convenience
  pause: () => { game.paused = true; },
  resume: () => { game.paused = false; },
};


/* ==========================================================
   Stage 3: Global State Consolidation (non-breaking)
   ----------------------------------------------------------
   Goal: Provide a single namespace (window.Game) that exposes
   game systems while leaving existing globals untouched.
 
   Why: Makes future refactors / UI / tooling much easier.
   ========================================================== */
(function setupGameNamespace() {
  const G = window.Game = window.Game || {};

  // Direct object references (shared, not copied)
  G.state = game;
  G.tugboat = tugboat;
  G.career = career;
  G.licenses = licenses;
  G.options = options;
  G.weather = weather;

  // Collections / dynamic references
  G.collections = {
    get docks() { return docks; },
    get cargos() { return cargos; },
    get competitors() { return competitors; },
    get competitorJobs() { return competitorJobs; },
    get waterParticles() { return waterParticles; },
    get ripples() { return ripples; },
    get availableJobs() { return availableJobs; },
  };

  // Primitive / transient vars exposed via getters/setters
  // (These are still local 'let' variables in this script, so we proxy them.)
  const vars = G.vars = G.vars || {};
  const def = (k, get, set) => {
    // Don't overwrite if already defined (allows external extensions)
    if (Object.getOwnPropertyDescriptor(vars, k)) return;
    Object.defineProperty(vars, k, { enumerable: true, configurable: true, get, set });
  };

  def('playerTier', () => playerTier, v => { playerTier = v | 0; try { updateRegionUI(); } catch (e) { } });
  def('currentJob', () => currentJob, v => { currentJob = v; });
  def('gameStarted', () => gameStarted, v => { gameStarted = !!v; });
  def('gameWon', () => gameWon, v => { gameWon = !!v; });
  def('gameLost', () => gameLost, v => { gameLost = !!v; });
  def('eventCooldown', () => eventCooldown, v => { eventCooldown = +v || 0; });
  def('lastPlayerRank', () => lastPlayerRank, v => { lastPlayerRank = v | 0; });
  def('lastLeaderName', () => lastLeaderName, v => { lastLeaderName = String(v ?? ''); });

  // Function hooks (no renames; just references)
  G.fn = G.fn || {};
  const fn = G.fn;
  fn.updateUI = updateUI;
  fn.updateRegionUI = updateRegionUI;
  fn.spawnNewJob = spawnNewJob;
  fn.resetRun = (typeof resetRun === "function") ? resetRun : null;
  fn.saveToSlot = (typeof saveToSlot === 'function') ? saveToSlot : null;
  fn.loadFromSlot = (typeof loadFromSlot === 'function') ? loadFromSlot : null;

  // ===========================
  // UI MODAL LOCK + PAUSE GATE
  // ===========================
  G.ui = G.ui || {};
  const ui = G.ui;

  // Active hard-modal name (boatShop, career, licenses, jobBoard) or null
  ui.modal = ui.modal || null;

  // Pause lock set (supports multiple independent pause reasons)
  ui.pauseLocks = ui.pauseLocks || new Set();

  ui.isModalOpen = () => ui.modal !== null;

  ui.lockModal = (name) => {
    // If another modal is open, block stacking
    if (ui.modal && ui.modal !== name) return false;

    ui.modal = name;
    ui.pauseLocks.add('modal:' + name);

    // Pause the world
    game.paused = true;
    return true;
  };

  ui.unlockModal = (name) => {
    if (ui.modal !== name) return;
    ui.pauseLocks.delete('modal:' + name);
    ui.modal = null;

    // Only unpause if nothing else is locking pause
    if (ui.pauseLocks.size === 0) game.paused = false;
  };

  // Generic gate: prevent opening any other panel while a hard modal is open
  ui.canOpenPanel = (name = '') => (!ui.modal || ui.modal === name);

  // Keep GameAPI in sync for external tooling
  try {
    window.GameAPI = window.GameAPI || {};
    window.GameAPI.getState = () => ({
      game: G.state,
      tugboat: G.tugboat,
      career: G.career,
      licenses: G.licenses,
      options: G.options,
      weather: G.weather,
      currentJob: vars.currentJob,
      playerTier: vars.playerTier
    });
  } catch (e) { }
})();
