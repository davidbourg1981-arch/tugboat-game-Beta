    function updateCompetitors(delta = 1) {
      // Use tier's AI count
      const tier = getCurrentTier();
      const targetCount = tier.aiCount;
      while (competitors.length < targetCount) {
        const newComp = createCompetitor(competitors.length);
        newComp.waitTimer = 1; // Start immediately
        competitors.push(newComp);
      }

      for (const comp of competitors) {
        let targetX = null;
        let targetY = null;
        let targetRadius = 20;
        // --- FAILSAFE: Check coordinates ---
        if (isNaN(comp.x) || isNaN(comp.y)) {
          // Reset to safe spot
          comp.x = WORLD.width / 2; comp.y = WORLD.height / 2;
          comp.vx = 0; comp.vy = 0;
          console.warn(`AI ${comp.name} reset due to NaN`);
        }

        // DEBUG: Status check every 3s
        if (Math.floor(game.time) % 180 === 0 && Math.floor(game.time - delta) % 180 !== 0) {
          const zone = getZoneAt(comp.x, comp.y);
          // Safely get target distance
          let tDist = -1;
          if (typeof targetX !== 'undefined' && targetX !== null) tDist = Math.hypot(comp.x - targetX, comp.y - targetY);

          console.log(`AI ${comp.name}: State=${comp.state} Zone=${zone} Pos=(${Math.round(comp.x)},${Math.round(comp.y)}) Vel=(${comp.vx.toFixed(2)},${comp.vy.toFixed(2)}) TargetDist=${Math.round(tDist)}`);
        }

        // --- STUCK DETECTION ---
        // Track movement over time
        if (!comp.lastPosTimer) comp.lastPosTimer = 0;
        comp.lastPosTimer += delta;
        if (comp.lastPosTimer > 60) {
          const dist = Math.hypot(comp.x - (comp.safeX || comp.x), comp.y - (comp.safeY || comp.y));
          if (dist < 20 && comp.state !== 'RECOVER') {
            // Stuck! Enter RECOVER mode
            comp.state = 'RECOVER';
            comp.recoverTimer = 180; // 3 seconds
            comp.stuckTimer = 0;
          }
          comp.safeX = comp.x;
          comp.safeY = comp.y;
          comp.lastPosTimer = 0;
        }



        // --- STATE MACHINE ---

        // --- STATE MACHINE ---



        // 1. RECOVER STATE (Absolute Priority)
        if (comp.state === 'RECOVER') {
          comp.recoverTimer -= delta;
          if (comp.recoverTimer <= 0) {
            // Finished recovery
            comp.state = comp.job ? (comp.attached ? 'TO_DOCK' : 'TO_CARGO') : 'IDLE';
            comp.velocity = { x: 0, y: 0 }; // Kill momentum
          } else {
            // Drive to center of map or nearest river center
            // FORCE VELOCITY directly - ignore physics engine throttle
            const best = __nearestRiverCenterPoint(comp.x, comp.y);
            let rx = WORLD.width / 2, ry = WORLD.height / 2;
            if (best) { rx = best.x; ry = best.y; }

            const dx = rx - comp.x;
            const dy = ry - comp.y;
            const dist = Math.hypot(dx, dy);

            // Fix: Snap to target if close to avoid oscillation
            if (dist < 10) {
              comp.x = rx; comp.y = ry;
              comp.vx = 0; comp.vy = 0;
              comp.state = 'IDLE'; // Recovered!
              comp.recoverTimer = 0;
            } else {
              const speed = 2.0; // Force valid speed
              comp.vx = (dx / dist) * speed;
              comp.vy = (dy / dist) * speed;
              comp.angle = Math.atan2(dy, dx);
            }

            // Skip normal movement logic
            targetX = null;
          }
        }

        // 2. IDLE / SEEKING
        else if (!comp.job || comp.state === 'seeking' || comp.state === 'IDLE') {
          comp.state = 'IDLE'; // Normalizing state name
          if (comp.waitTimer > 0) comp.waitTimer -= delta;
          else spawnCompetitorJob(comp);

          // Just drift or move slowly
          comp.vx *= 0.95; comp.vy *= 0.95;
        }

        // 3. JOB EXECUTION
        else if (comp.job) {
          // Ensure job entities exist
          if (!comp.job.cargo || !comp.job.pickup || !comp.job.delivery) {
            // Invalid job, abort
            comp.job = null; comp.state = 'IDLE';
          } else {
            if (comp.attached) {
              // === DELIVERING ===
              comp.state = 'TO_DOCK';
              const dock = comp.job.delivery;
              // Target PAST the dock so cargo hits it
              const dx = dock.x + dock.width / 2 - comp.x;
              const dy = dock.y + dock.height / 2 + 50 - comp.y; // +50y to aim slightly below
              const dist = Math.hypot(dx, dy);

              // Overshoot target
              const overshoot = 150;
              targetX = (dock.x + dock.width / 2) + (dx / dist) * overshoot;
              targetY = (dock.y + dock.height / 2 + 50) + (dy / dist) * overshoot;

              // Check delivery condition
              const distCargo = Math.hypot(comp.attached.x - (dock.x + dock.width / 2), comp.attached.y - (dock.y + dock.height / 2));
              if (distCargo < 80) {
                // SUCCESS!
                comp.deliveries++;
                addRipple(comp.attached.x, comp.attached.y, 40);
                // Remove cargo
                const cargoIdx = competitorJobs.indexOf(comp.attached);
                if (cargoIdx > -1) competitorJobs.splice(cargoIdx, 1);
                // Reset
                comp.attached = null; comp.job = null; comp.state = 'IDLE'; comp.waitTimer = 60;
              }
            } else {
              // === PICKING UP ===
              comp.state = 'TO_CARGO';
              targetX = comp.job.cargo.x;
              targetY = comp.job.cargo.y;
              targetRadius = 60;

              const dist = Math.hypot(comp.x - targetX, comp.y - targetY);
              if (dist < targetRadius) {
                // ATTACH!
                comp.attached = comp.job.cargo;
                comp.job.pickedUp = true;
                addRipple(comp.x, comp.y, 30);
              }
            }
          }
        }

        // --- EXECUTE MOVEMENT ---
        if (targetX !== null) {
          moveCompetitorToward(comp, targetX, targetY, delta);
        } else {
          // Manual movement (IDLE or RECOVER)
          if (comp.state !== 'RECOVER') {
            // Drag when idle
            comp.vx *= 0.98; comp.vy *= 0.98;
          }
          comp.x += comp.vx * delta;
          comp.y += comp.vy * delta;
        }

        // --- UPDATE ATTACHMENT ---
        if (comp.attached) updateCompetitorCargo(comp, delta);

        // --- BOUNDS CHECK ---
        comp.x = Math.max(20, Math.min(WORLD.width - 20, comp.x));
        comp.y = Math.max(20, Math.min(WORLD.height - 20, comp.y));

        // Final Land Push
        if (comp.state !== 'RECOVER' && getZoneAt(comp.x, comp.y) === ZONE.LAND) {
          __clampToWater(comp, 0.2); // Gentle push
        }
      }
    }



    function moveCompetitorToward(comp, targetX, targetY, delta = 1) {
      // 1. Basic Pathing
      const dx = targetX - comp.x;
      const dy = targetY - comp.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 5) return;

      // 2. River Navigation Enhancements
      let bestX = targetX;
      let bestY = targetY;

      const currentRiver = isInRiver(comp.x, comp.y);
      if (currentRiver) {
        // Stronger bias to follow river flow/center
        const riverPath = currentRiver.path;
        // Find closest segment
        let closestIdx = 0;
        let minDistStr = Infinity;
        for (let i = 0; i < riverPath.length; i++) {
          const d = Math.hypot(comp.x - riverPath[i].x, comp.y - riverPath[i].y);
          if (d < minDistStr) { minDistStr = d; closestIdx = i; }
        }

        // Determine upstream vs downstream based on target X
        const goingUpstream = targetX < comp.x;
        let wpIdx = closestIdx + (goingUpstream ? -2 : 2);

        // Clamp index
        wpIdx = Math.max(0, Math.min(riverPath.length - 1, wpIdx));

        // Target the river waypoint first, then blend to actual target
        // This keeps them in the channel
        const wayX = riverPath[wpIdx].x;
        const wayY = riverPath[wpIdx].y;

        // Blend logic: if far from target, prioritize channel
        // If close (e.g. at dock), prioritize target
        const blend = Math.min(1, dist / 300);
        bestX = wayX * blend + targetX * (1 - blend);
        bestY = wayY * blend + targetY * (1 - blend);
      }

      // 3. Whisker Raycasts (Obstacle Avoidance)
      const desiredAngle = Math.atan2(bestY - comp.y, bestX - comp.x);
      let finalAngle = desiredAngle;

      // Raycast configuration
      const whiskers = [
        { angle: 0, len: 140, weight: 1.0 },
        { angle: 0.4, len: 100, weight: 0.6 },
        { angle: -0.4, len: 100, weight: 0.6 },
        { angle: 0.9, len: 70, weight: 0.3 },
        { angle: -0.9, len: 70, weight: 0.3 }
      ];

      // Check current trajectory for obstacles
      let blockedScore = 0;
      let avoidTurn = 0;

      for (let w of whiskers) {
        const rayAngle = comp.angle + w.angle;
        const rX = comp.x + Math.cos(rayAngle) * w.len;
        const rY = comp.y + Math.sin(rayAngle) * w.len;

        // Check terrain (land) and bounds
        if (getZoneAt(rX, rY) === ZONE.LAND ||
          rX < 20 || rX > WORLD.width - 20 ||
          rY < 20 || rY > WORLD.height - 20) {

          blockedScore += w.weight;
          // Turn away from blockage
          avoidTurn -= Math.sign(w.angle || 0.1) * w.weight * 0.8;
        }
      }

      // If blocked, override the desired path
      if (blockedScore > 0) {
        // If center is blocked, turn hard
        if (Math.abs(avoidTurn) < 0.1) avoidTurn = Math.PI;
        finalAngle = comp.angle + avoidTurn;
      }

      // 4. Dynamic Collision Avoidance (Boats)
      // Simple predictive repulsion
      const lookAheadTime = 30; // frames
      for (const other of competitors) {
        if (other === comp) continue;
        const distFuture = Math.hypot(
          (comp.x + comp.vx * lookAheadTime) - (other.x + other.vx * lookAheadTime),
          (comp.y + comp.vy * lookAheadTime) - (other.y + other.vy * lookAheadTime)
        );
        if (distFuture < 70) {
          // Steer away
          const angToOther = Math.atan2(other.y - comp.y, other.x - comp.x);
          let diff = angToOther - comp.angle;
          // wrap
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;

          // Turn away
          finalAngle -= Math.sign(diff) * 0.5;
        }
      }

      // 5. Physics & Steering
      let angDiff = finalAngle - comp.angle;
      while (angDiff > Math.PI) angDiff -= Math.PI * 2;
      while (angDiff < -Math.PI) angDiff += Math.PI * 2;

      // Variable turn speed (slower when carrying heavy load)
      let turnSpeed = comp.turnSpeed * (blockedScore > 0 ? 2.5 : 1.5); // Turn faster to avoid obstacles
      if (comp.attached) turnSpeed *= 0.7;

      // Proportional steering control
      comp.angularVel += angDiff * 0.08 * delta;

      // Damping
      comp.angularVel *= Math.pow(0.8, delta);
      comp.angularVel = Math.max(-turnSpeed, Math.min(turnSpeed, comp.angularVel));

      comp.angle += comp.angularVel * delta;

      // Thrust Logic
      // Slow down if turning sharp or blocked
      let throttle = 1.0;
      if (Math.abs(angDiff) > 0.5) throttle = 0.4;
      if (blockedScore > 0.5) throttle = 0.2;

      const speedMult = comp.attached ? 0.75 : 1.0;
      const thrust = comp.acceleration * speedMult * throttle;

      comp.vx += Math.cos(comp.angle) * thrust * delta;
      comp.vy += Math.sin(comp.angle) * thrust * delta;

      // Drag
      const drag = Math.pow(0.97, delta);
      comp.vx *= drag;
      comp.vy *= drag;

      // Environmental Forces
      const current = getRiverCurrentAt(comp.x, comp.y);
      if (current.x !== 0 || current.y !== 0) {
        const riverForce = comp.attached ? 0.6 : 0.8;
        comp.vx += current.x * delta * riverForce;
        comp.vy += current.y * delta * riverForce;
      }

      applyWeatherPhysics(comp, delta);

      // Max Speed Cap
      const spd = Math.hypot(comp.vx, comp.vy);
      let maxSpd = comp.speed * (comp.attached ? 0.7 : 1.0);
      if (spd > maxSpd) {
        comp.vx = (comp.vx / spd) * maxSpd;
        comp.vy = (comp.vy / spd) * maxSpd;
      }

      // INTEGRATE POSITION (Critical Fix)
      comp.x += comp.vx * delta;
      comp.y += comp.vy * delta;

      // Land failsafe
      if (getZoneAt(comp.x, comp.y) === ZONE.LAND) {
        __clampToWater(comp, 0.5); // Aggressive push out
      }
    }

    // Helper to blend two angles
    function blendAngles(a1, a2, weight) {
      // Convert to vectors, blend, convert back
      const x1 = Math.cos(a1), y1 = Math.sin(a1);
      const x2 = Math.cos(a2), y2 = Math.sin(a2);
      const bx = x1 * (1 - weight) + x2 * weight;
      const by = y1 * (1 - weight) + y2 * weight;
      return Math.atan2(by, bx);
    }

    // AI helper: Check if AI can make progress upstream in a given river
    function canAINavigateRiverUpstream(aiSpeed, river) {
      const tideMult = TIDE.getCurrentMultiplier();
      // Current pushes at roughly this speed
      const effectiveCurrentSpeed = river.currentStrength * tideMult * 0.15 * 10;
      // AI needs to be significantly faster than current
      return aiSpeed > effectiveCurrentSpeed * 1.3;
    }

    // AI helper: Find best river for this AI's speed
    function getBestRiverForAI(comp, targetY) {
      const rivers = Object.values(RIVERS);
      let bestRiver = null;
      let bestScore = -Infinity;

      for (const river of rivers) {
        if (!canAINavigateRiverUpstream(comp.speed, river)) continue;

        const riverMidY = river.path[Math.floor(river.path.length / 2)].y;
        const yProximity = 1000 - Math.abs(riverMidY - targetY);
        const easinessBonus = (0.5 - river.currentStrength) * 500;
        const score = yProximity + easinessBonus;

        if (score > bestScore) {
          bestScore = score;
          bestRiver = river;
        }
      }

      return bestRiver || RIVERS.north; // Fallback to easiest river
    }

    // AI helper: Get waypoint for smarter river navigation
    function getAIRiverWaypoint(comp, targetX, targetY) {
      const currentRiver = isInRiver(comp.x, comp.y);
      const goingUpstream = targetX < comp.x;

      // If stuck in a river that's too strong, exit to ocean
      if (currentRiver && goingUpstream && !canAINavigateRiverUpstream(comp.speed, currentRiver)) {
        const oceanExit = currentRiver.path[currentRiver.path.length - 1];
        return { x: oceanExit.x + 100, y: oceanExit.y, reason: 'exiting' };
      }

      // If in ocean and need to reach harbor, find best river
      if (!currentRiver && comp.x > OCEAN.x - 500 && targetX < HARBOR.width + 500) {
        const bestRiver = getBestRiverForAI(comp, targetY);
        const entry = bestRiver.path[bestRiver.path.length - 1];
        return { x: entry.x - 100, y: entry.y, reason: 'entering ' + bestRiver.name };
      }

      return null;
    }

    // === MISSING HELPER FUNCTIONS ===

    function __nearestRiverCenterPoint(x, y) {
      let best = null;
      let minD2 = Infinity;

      for (const key in RIVERS) {
        const river = RIVERS[key];
        for (const p of river.path) {
          const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
          if (d2 < minD2) {
            minD2 = d2;
            best = { x: p.x, y: p.y, d2, river };
          }
        }
      }
      return best;
    }

    function __findNearestWaterPoint(targetX, targetY, searchRadius, step) {
      // Spiral search outwards
      let angle = 0;
      let r = 10;
      while (r < searchRadius) {
        const tx = targetX + Math.cos(angle) * r;
        const ty = targetY + Math.sin(angle) * r;
        if (isInWater(tx, ty)) return { x: tx, y: ty };

        angle += 1;
        r += step * 0.1;
      }
      return { x: targetX, y: targetY }; // Failed
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
      const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
      if (l2 === 0) return Math.hypot(px - x1, py - y1);

      let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
      t = Math.max(0, Math.min(1, t));

      return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }

    function __clampToWater(comp, pushStrength) {
      if (getZoneAt(comp.x, comp.y) !== ZONE.LAND) return;

      // We are on land. Find nearest water.
      const best = __nearestRiverCenterPoint(comp.x, comp.y);
      let targetX = WORLD.width / 2;
      let targetY = WORLD.height / 2;

      if (best && best.d2 < 600 * 600) {
        targetX = best.x;
        targetY = best.y;
      } else {
        // Fallback to ocean/harbor center line
        targetY = WORLD.height / 2;
        if (comp.x < HARBOR.width) targetX = HARBOR.width / 2;
        else targetX = OCEAN.x + 200;
      }

      const dx = targetX - comp.x;
      const dy = targetY - comp.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 0) {
        comp.vx += (dx / dist) * pushStrength;
        comp.vy += (dy / dist) * pushStrength;
      }
    }

    function updateCompetitorCargo(comp, delta = 1) {
      const cargo = comp.attached;
      const sternX = comp.x - Math.cos(comp.angle) * 28;
      const sternY = comp.y - Math.sin(comp.angle) * 28;
      const bowX = cargo.x + Math.cos(cargo.angle) * (cargo.width / 2);
      const bowY = cargo.y + Math.sin(cargo.angle) * (cargo.width / 2);

      // Rope physics
      const dx = bowX - sternX, dy = bowY - sternY, dist = Math.hypot(dx, dy);
      if (dist > tugboat.ropeLength) {
        const pullAmount = (dist - tugboat.ropeLength) * 0.22 * delta;
        cargo.x -= (dx / dist) * pullAmount;
        cargo.y -= (dy / dist) * pullAmount;
      }

      // Rotate cargo to follow
      const targetAngle = Math.atan2(sternY - cargo.y, sternX - cargo.x);
      let angleDiff = targetAngle - cargo.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      cargo.angle += angleDiff * 0.022 * delta;
    }

