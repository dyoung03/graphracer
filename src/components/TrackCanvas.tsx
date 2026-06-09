import React, { useEffect, useRef, useState } from 'react';
import { CarState, Obstacle, TelemetryPoint } from '../types';
import { Play, Pause, RotateCcw, Info, Check, HelpCircle, FastForward, Sliders, Compass, Trophy } from 'lucide-react';

interface TrackCanvasProps {
  onEmitTelemetry: (distance: number, velocity: number, acceleration: number, state: CarState, x: number, y: number) => void;
  hoveredPoint: TelemetryPoint | null;
  obstacles: Obstacle[];
  isRecording: boolean;
  onSetLaps: (laps: number) => void;
  lapsCount: number;
  onReset?: () => void;
}

// Track Geometry Parameters
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;

// Central coordinates for straightaways transition
const X_LEFT_TRANSITION = 260;
const X_RIGHT_TRANSITION = 540;
const Y_CENTER = 200;
const TRACK_RADIUS = 120;
const TRACK_WIDTH = 85;

// Boundary thresholds
const RADIUS_INNER = TRACK_RADIUS - TRACK_WIDTH / 2; // 77.5
const RADIUS_OUTER = TRACK_RADIUS + TRACK_WIDTH / 2; // 162.5

// Checkerboard Start/Finish Line
const FINISH_LINE_X = 360;
const FINISH_LINE_Y_MIN = Y_CENTER + RADIUS_INNER - 2; // ~275
const FINISH_LINE_Y_MAX = Y_CENTER + RADIUS_OUTER + 2; // ~365

export default function TrackCanvas({
  onEmitTelemetry,
  hoveredPoint,
  obstacles,
  isRecording,
  onSetLaps,
  lapsCount,
  onReset
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Real-time animation states
  const [activePlaybackSpeed, setActivePlaybackSpeed] = useState<number>(1.0); // Slow-mo support!
  const [isControlsExpanded, setIsControlsExpanded] = useState<boolean>(false);

  // Input states ref to ensure latency-free controls on render loops
  const keysPressed = useRef<{ [key: string]: boolean }>({});

  // Car Physics Ref
  const carStateRef = useRef({
    x: 420,
    y: 320,
    angle: Math.PI, // Facing right-to-left for standard counterclockwise loop
    velocity: 0,
    cumulativeDistance: 0,
    boostTimer: 0,
    previousTelemetryEmitTime: 0,
    lastSecVelocity: 0,
    lapsCount: 0,
    lastLapDistance: 0
  });

  // Track particle systems (exhaust puffs, mud splashes)
  const particles = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
    alpha: number;
    decay: number;
  }>>([]);

  // Skidmarks trailing accumulator
  const skidmarks = useRef<Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    alpha: number;
  }>>([]);

  // Reset track session
  const handleResetCar = () => {
    carStateRef.current = {
      x: 420,
      y: 320,
      angle: Math.PI,
      velocity: 0,
      cumulativeDistance: 0,
      boostTimer: 0,
      previousTelemetryEmitTime: 0,
      lastSecVelocity: 0,
      lapsCount: 0,
      lastLapDistance: 0
    };
    onSetLaps(0);
    skidmarks.current = [];
    particles.current = [];
    if (onReset) onReset();
  };

  // Keep car inside track bounds and slide along boundaries smoothly
  const constrainToTrack = (x: number, y: number, margin = 6): { x: number; y: number; collided: boolean } => {
    let nx = x;
    let ny = y;
    let collided = false;

    if (nx < X_LEFT_TRANSITION) {
      // Left curves
      const dx = nx - X_LEFT_TRANSITION;
      const dy = ny - Y_CENTER;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const minR = RADIUS_INNER + margin;
      const maxR = RADIUS_OUTER - margin;
      
      if (dist < minR) {
        const theta = Math.atan2(dy, dx);
        nx = X_LEFT_TRANSITION + minR * Math.cos(theta);
        ny = Y_CENTER + minR * Math.sin(theta);
        collided = true;
      } else if (dist > maxR) {
        const theta = Math.atan2(dy, dx);
        nx = X_LEFT_TRANSITION + maxR * Math.cos(theta);
        ny = Y_CENTER + maxR * Math.sin(theta);
        collided = true;
      }
    } else if (nx > X_RIGHT_TRANSITION) {
      // Right curves
      const dx = nx - X_RIGHT_TRANSITION;
      const dy = ny - Y_CENTER;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const minR = RADIUS_INNER + margin;
      const maxR = RADIUS_OUTER - margin;
      
      if (dist < minR) {
        const theta = Math.atan2(dy, dx);
        nx = X_RIGHT_TRANSITION + minR * Math.cos(theta);
        ny = Y_CENTER + minR * Math.sin(theta);
        collided = true;
      } else if (dist > maxR) {
        const theta = Math.atan2(dy, dx);
        nx = X_RIGHT_TRANSITION + maxR * Math.cos(theta);
        ny = Y_CENTER + maxR * Math.sin(theta);
        collided = true;
      }
    } else {
      // Middle straights
      if (ny < Y_CENTER) {
        // Top straight
        const centerY = Y_CENTER - TRACK_RADIUS; // 80
        const minY = centerY - TRACK_WIDTH / 2 + margin; // 37.5 + 6 = 43.5
        const maxY = centerY + TRACK_WIDTH / 2 - margin; // 122.5 - 6 = 116.5
        if (ny < minY) {
          ny = minY;
          collided = true;
        } else if (ny > maxY) {
          ny = maxY;
          collided = true;
        }
      } else {
        // Bottom straight
        const centerY = Y_CENTER + TRACK_RADIUS; // 320
        const minY = centerY - TRACK_WIDTH / 2 + margin; // 277.5 + 6 = 283.5
        const maxY = centerY + TRACK_WIDTH / 2 - margin; // 362.5 - 6 = 356.5
        if (ny < minY) {
          ny = minY;
          collided = true;
        } else if (ny > maxY) {
          ny = maxY;
          collided = true;
        }
      }
    }

    return { x: nx, y: ny, collided };
  };

  // Mathematical track state validation helper
  const getTrackSurfaceAndFriction = (x: number, y: number): {
    state: CarState;
    friction: number;
    maxSpeed: number;
  } => {
    let onTrack = false;
    
    if (x < X_LEFT_TRANSITION) {
      // Check left radial curve loop
      const dx = x - X_LEFT_TRANSITION;
      const dy = y - Y_CENTER;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= RADIUS_INNER && dist <= RADIUS_OUTER) {
        onTrack = true;
      }
    } else if (x > X_RIGHT_TRANSITION) {
      // Check right radial curve loop
      const dx = x - X_RIGHT_TRANSITION;
      const dy = y - Y_CENTER;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= RADIUS_INNER && dist <= RADIUS_OUTER) {
        onTrack = true;
      }
    } else {
      // Check middle top/bottom straights
      const topDist = Math.abs(y - (Y_CENTER - TRACK_RADIUS));
      const bottomDist = Math.abs(y - (Y_CENTER + TRACK_RADIUS));
      if (topDist <= TRACK_WIDTH / 2 || bottomDist <= TRACK_WIDTH / 2) {
        onTrack = true;
      }
    }

    // Evaluate Obstacles
    for (const obs of obstacles) {
      if (obs.type === 'mud' && obs.radius) {
        const dx = x - obs.x;
        const dy = y - obs.y;
        if (Math.sqrt(dx * dx + dy * dy) < obs.radius) {
          return { state: 'mud', friction: 0.45, maxSpeed: 1.333 };
        }
      } else if (obs.type === 'booster' && obs.width && obs.height) {
        // Simple rectangular booster intersection bounds checks
        if (x >= obs.x - obs.width/2 && x <= obs.x + obs.width/2 &&
            y >= obs.y - obs.height/2 && y <= obs.y + obs.height/2) {
          return { state: 'boost', friction: 0.01, maxSpeed: 6.0 };
        }
      }
    }

    if (!onTrack) {
      // Off-road grass friction penalty
      return { state: 'offtrack', friction: 0.14, maxSpeed: 1.0 };
    }

    return { state: 'normal', friction: 0.04, maxSpeed: 3.0 };
  };

  // Render Loop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling behaviors for arrow keys / space
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      keysPressed.current[e.key.toLowerCase()] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const delta = (now - lastTime) / 16.666; // Normalized to 60fps unit multiplier
      lastTime = now;

      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameId = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const scaleDelta = delta * activePlaybackSpeed;

      // Update Car physics
      const car = carStateRef.current;

      const surface = getTrackSurfaceAndFriction(car.x, car.y);
      let driveState = surface.state;

      // Booster booster-timer physics
      if (driveState === 'boost') {
        car.boostTimer = 18; // Apply 18 frames of visual velocity kick
        car.velocity = 5.8;
      } else if (car.boostTimer > 0) {
        car.boostTimer -= scaleDelta;
        driveState = 'boost';
      }

      // Accelerate / Brake input triggers
      let acc = 0;
      const isRaceEnded = car.lapsCount >= 3;
      if (!isRaceEnded) {
        if (keysPressed.current['arrowup'] || keysPressed.current['w']) {
          acc = driveState === 'boost' ? 0.3 : 0.14;
        } else if (keysPressed.current['arrowdown'] || keysPressed.current['s']) {
          acc = -0.11;
        }
      } else {
        // Coast vehicle to rapid stop
        car.velocity -= Math.sign(car.velocity) * 0.15 * scaleDelta;
        if (Math.abs(car.velocity) < 0.05) car.velocity = 0;
      }

      // Slow down logic
      const activeFriction = surface.friction;
      const initialVelocity = car.velocity;

      if (acc !== 0) {
        car.velocity += acc * scaleDelta;
      } else if (!isRaceEnded) {
        // Natural speed decayed by friction
        car.velocity -= Math.sign(car.velocity) * activeFriction * scaleDelta;
        // Damp sub-zero snaps
        if (Math.abs(car.velocity) < 0.08) car.velocity = 0;
      }

      // Clamp velocities
      let maxCap = driveState === 'boost' ? 6.2 : surface.maxSpeed;
      if (car.velocity > maxCap) {
        // Boost transitions slowly back to normal
        if (driveState === 'boost' || driveState === 'mud') {
          car.velocity = maxCap;
        } else {
          car.velocity -= 0.15 * scaleDelta;
        }
      }
      if (driveState === 'mud') {
         if (car.velocity > 1.333) car.velocity = 1.333;
         if (car.velocity < -1.333) car.velocity = -1.333;
      }
      if (car.velocity < -1.1) car.velocity = -1.1;

      // Angular Steering calculations
      // Steering speed depends on vehicle motion speed (harder to steer if perfectly static)
      if (Math.abs(car.velocity) > 0.1 && !isRaceEnded) {
        // Scale steering so extreme speeds have slightly wider turn circles for high playability
        const steerSpeedBase = 0.046;
        const speedRatio = Math.min(1.2, Math.abs(car.velocity) / 4);
        const steerAngle = steerSpeedBase * speedRatio * scaleDelta;

        if (keysPressed.current['arrowleft'] || keysPressed.current['a']) {
          car.angle -= steerAngle * Math.sign(car.velocity);
        }
        if (keysPressed.current['arrowright'] || keysPressed.current['d']) {
          car.angle += steerAngle * Math.sign(car.velocity);
        }
      }

      // Position update
      const prevX = car.x;
      const prevY = car.y;

      car.x += car.velocity * Math.cos(car.angle) * scaleDelta;
      car.y += car.velocity * Math.sin(car.angle) * scaleDelta;

      // Enforce physical track boundary limits, preventing offroad grass driving
      const constraint = constrainToTrack(car.x, car.y, 6);
      car.x = constraint.x;
      car.y = constraint.y;
      if (constraint.collided) {
        // Damp sliding speed slightly when scraping outer barriers to reward precise steering
        car.velocity *= 0.93;
        
        // Visual smoke puff/spark particles when scraping boundaries
        if (Math.random() < 0.25) {
          particles.current.push({
            x: car.x + (Math.random() - 0.5) * 6,
            y: car.y + (Math.random() - 0.5) * 6,
            vx: -Math.cos(car.angle) * 1.0 + (Math.random() - 0.5) * 0.5,
            vy: -Math.sin(car.angle) * 1.0 + (Math.random() - 0.5) * 0.5,
            color: 'rgba(255, 255, 255, 0.45)', // white wall spark dust
            size: Math.random() * 3 + 1.5,
            alpha: 0.6,
            decay: 0.05
          });
        }
      }

      // Incremental distance (meters scaling: 16 pixels = 1 meter)
      const distAdded = Math.sqrt(Math.pow(car.x - prevX, 2) + Math.pow(car.y - prevY, 2));
      const distanceMetersAdded = distAdded * 0.1; // scale pixel increments
      car.cumulativeDistance += distanceMetersAdded;

      // Accurate Acceleration computation (dv / dt)
      const accelerationVal = (car.velocity - initialVelocity) / (0.0166 * scaleDelta);

      // Stopped checking
      if (Math.abs(car.velocity) < 0.05 && acc === 0) {
        driveState = 'stopped';
      }

      // LAP PROGRESS CROSSING EVALUATOR:
      // Paved loop goes Counter Clockwise.
      // Bottom Straight is around y = 320. Direction vector goes from right to left (angle is ~Math.PI).
      // Let's check cross: prevX >= 360 and currX < 360, while inside bottom straight y bounds
      if (prevY >= FINISH_LINE_Y_MIN && prevY <= FINISH_LINE_Y_MAX) {
        if (prevX >= FINISH_LINE_X && car.x < FINISH_LINE_X) {
          // Require at least 80 meters traversed to count a full lap (prevents initial spawn crossing trigger)
          if (car.cumulativeDistance - car.lastLapDistance >= 80) {
            car.lapsCount += 1;
            car.lastLapDistance = car.cumulativeDistance;
            onSetLaps(car.lapsCount);
            // Flash lap particle trigger!
            for (let pIndex = 0; pIndex < 15; pIndex++) {
              particles.current.push({
                x: FINISH_LINE_X,
                y: Y_CENTER + RADIUS_INNER + (Math.random() * TRACK_WIDTH),
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                color: `hsl(${Math.random() * 360}, 100%, 70%)`,
                size: Math.random() * 5 + 3,
                alpha: 1.0,
                decay: 0.03
              });
            }
          }
        }
      }

      // Emit telemetry every 150ms regardless of recording state, so parent can listen to start-driving triggers
      const timeMs = performance.now();
      const updateInterval = 150; // Emit telemetry to charts every 150ms
      if (timeMs - car.previousTelemetryEmitTime >= updateInterval) {
        // Convert to physical dashboard units (meters and m/s)
        const displayVelocity = car.velocity * 1.5; // conversion mapping
        const displayDistance = car.cumulativeDistance;
        const displayAcceleration = accelerationVal * 1.5;

        onEmitTelemetry(
          displayDistance,
          displayVelocity,
          displayAcceleration,
          driveState,
          car.x,
          car.y
        );
        car.previousTelemetryEmitTime = timeMs;
      }

      // ACCUMULATE PARTICLE EFFECTS
      if (Math.abs(car.velocity) > 0.4) {
        // Emit skidmarks if making sharp turns, braking, or slogging muddy asphalt
        const isBraking = keysPressed.current['arrowdown'] || keysPressed.current['s'];
        const steerLeft = keysPressed.current['arrowleft'] || keysPressed.current['a'];
        const steerRight = keysPressed.current['arrowright'] || keysPressed.current['d'];
        const inMud = driveState === 'mud';
        const inGrass = driveState === 'offtrack';

        if (isBraking || ((steerLeft || steerRight) && Math.abs(car.velocity) > 2.8) || inMud || inGrass) {
          // Add skidmark segment from rear tire pivots
          const tireOffsetLeftX = car.x - 10 * Math.cos(car.angle) - 4 * Math.sin(car.angle);
          const tireOffsetLeftY = car.y - 10 * Math.sin(car.angle) + 4 * Math.cos(car.angle);

          const driftAlpha = inMud ? 0.35 : inGrass ? 0.15 : isBraking ? 0.5 : 0.25;
          const strokeCol = inMud ? '#5c3a21' : inGrass ? '#1e3a1e' : '#1e293b';

          skidmarks.current.push({
            x1: tireOffsetLeftX,
            y1: tireOffsetLeftY,
            x2: tireOffsetLeftX - car.velocity * Math.cos(car.angle) * 0.8,
            y2: tireOffsetLeftY - car.velocity * Math.sin(car.angle) * 0.8,
            alpha: driftAlpha
          });

          // Limit total global skidmark buffers to conserve Canvas performance
          if (skidmarks.current.length > 550) {
            skidmarks.current.shift();
          }

          // Generate physical splashing debris particles based on current state
          if (Math.random() < 0.35) {
            let partColor = '#5c3a21'; // mud brown
            let pSize = Math.random() * 4 + 2;
            if (inGrass) partColor = '#4ade80'; // bright green grass clumps
            if (driveState === 'boost') partColor = '#10b981'; // green flares

            particles.current.push({
              x: car.x - 12 * Math.cos(car.angle) + (Math.random() - 0.5) * 8,
              y: car.y - 12 * Math.sin(car.angle) + (Math.random() - 0.5) * 8,
              vx: -car.velocity * Math.cos(car.angle) * 0.3 + (Math.random() - 0.5) * 2,
              vy: -car.velocity * Math.sin(car.angle) * 0.3 + (Math.random() - 0.5) * 2,
              color: partColor,
              size: pSize,
              alpha: 0.9,
              decay: 0.04
            });
          }
        }

        // Exhaust puff tail particles
        if (Math.random() < 0.15) {
          particles.current.push({
            x: car.x - 14 * Math.cos(car.angle) + Math.cos(car.angle + Math.PI/2) * 5,
            y: car.y - 14 * Math.sin(car.angle) + Math.sin(car.angle + Math.PI/2) * 5,
            vx: -Math.cos(car.angle) * 1.5 + (Math.random() - 0.5) * 0.5,
            vy: -Math.sin(car.angle) * 1.5 + (Math.random() - 0.5) * 0.5,
            color: 'rgba(203, 213, 225, 0.45)', // soft slate smoke
            size: Math.random() * 6 + 3,
            alpha: 0.7,
            decay: 0.03
          });
        }
      }

      // Update particle structures
      particles.current.forEach((p, idx) => {
        p.x += p.vx * scaleDelta;
        p.y += p.vy * scaleDelta;
        p.alpha -= p.decay * scaleDelta;
      });
      particles.current = particles.current.filter(p => p.alpha > 0);


      // ======================================
      // RENDERING CANVAS GRAPHICS
      // ======================================
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 1) BACKGROUND: GRASS OFFROAD FIELD
      // Give soft grass texture
      ctx.fillStyle = '#14532d'; // Dark forest green grass background
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw beautiful lawnmower stripe variations across the grass fields
      ctx.fillStyle = '#15803d'; // slightly lighter green stripes
      for (let wIndex = 0; wIndex < CANVAS_WIDTH; wIndex += 60) {
        if ((wIndex / 60) % 2 === 0) {
          ctx.fillRect(wIndex, 0, 30, CANVAS_HEIGHT);
        }
      }

      // 2) ROADWAY PAVED TRACK
      ctx.strokeStyle = '#334155'; // Dark blue-slate track guardrails
      ctx.lineWidth = TRACK_WIDTH + 14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Design track spinal core shape
      const drawTrackShape = (c: CanvasRenderingContext2D) => {
        c.beginPath();
        c.moveTo(X_LEFT_TRANSITION, Y_CENTER - TRACK_RADIUS); // top straight left
        c.lineTo(X_RIGHT_TRANSITION, Y_CENTER - TRACK_RADIUS); // top straight right
        c.arc(X_RIGHT_TRANSITION, Y_CENTER, TRACK_RADIUS, -Math.PI / 2, Math.PI / 2, false); // right loop
        c.lineTo(X_LEFT_TRANSITION, Y_CENTER + TRACK_RADIUS); // bottom straight right-to-left
        c.arc(X_LEFT_TRANSITION, Y_CENTER, TRACK_RADIUS, Math.PI / 2, -Math.PI / 2, false); // left loop
        c.closePath();
      };

      // Draw asphalt foundation base shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 6;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Draw clean dark-gray road core asphalt
      ctx.strokeStyle = '#1e293b'; // slate-800 asphalt asphalt roadway
      ctx.lineWidth = TRACK_WIDTH;
      ctx.stroke();

      // 3) INNER GRASS OVAL BOUNDARY FILL
      ctx.fillStyle = '#15803d'; // matching field color
      ctx.beginPath();
      ctx.moveTo(X_LEFT_TRANSITION, Y_CENTER - RADIUS_INNER);
      ctx.lineTo(X_RIGHT_TRANSITION, Y_CENTER - RADIUS_INNER);
      ctx.arc(X_RIGHT_TRANSITION, Y_CENTER, RADIUS_INNER, -Math.PI / 2, Math.PI / 2, false);
      ctx.lineTo(X_LEFT_TRANSITION, Y_CENTER + RADIUS_INNER);
      ctx.arc(X_LEFT_TRANSITION, Y_CENTER, RADIUS_INNER, Math.PI / 2, -Math.PI / 2, false);
      ctx.closePath();
      ctx.fill();

      // Draw elegant inner grass bounds ring outline
      ctx.strokeStyle = '#052e16'; // dark green forest shadow ring
      ctx.lineWidth = 4;
      ctx.stroke();

      // Draw outer track bounds ring outline
      ctx.beginPath();
      ctx.moveTo(X_LEFT_TRANSITION, Y_CENTER - RADIUS_OUTER);
      ctx.lineTo(X_RIGHT_TRANSITION, Y_CENTER - RADIUS_OUTER);
      ctx.arc(X_RIGHT_TRANSITION, Y_CENTER, RADIUS_OUTER, -Math.PI / 2, Math.PI / 2, false);
      ctx.lineTo(X_LEFT_TRANSITION, Y_CENTER + RADIUS_OUTER);
      ctx.arc(X_LEFT_TRANSITION, Y_CENTER, RADIUS_OUTER, Math.PI / 2, -Math.PI / 2, false);
      ctx.closePath();
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 4;
      ctx.stroke();

      // 4) CENTER PAINT LINES: Dynamic Dashed Lane Markers
      ctx.strokeStyle = '#94a3b8'; // light slate core dashed yellow line
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 16]);
      drawTrackShape(ctx);
      ctx.stroke();
      ctx.setLineDash([]); // Reset dashboards

      // 5) DRAW TIRE SKIDMARKS
      skidmarks.current.forEach((skid) => {
        ctx.beginPath();
        ctx.moveTo(skid.x1, skid.y1);
        ctx.lineTo(skid.x2, skid.y2);
        ctx.strokeStyle = `rgba(15, 23, 42, ${skid.alpha})`;
        ctx.lineWidth = 3.5;
        ctx.stroke();
      });

      // 6) DRAW THE CHECKERED START/FINISH LINE
      // Checker width/height is 8px
      const checkerSize = 7.5;
      const columns = 2;
      const rows = Math.ceil(TRACK_WIDTH / checkerSize);

      ctx.save();
      for (let col = 0; col < columns; col++) {
        for (let row = 0; row < rows; row++) {
          const squareX = FINISH_LINE_X + col * checkerSize;
          const squareY = FINISH_LINE_Y_MIN + row * checkerSize;
          
          if (squareY + checkerSize <= FINISH_LINE_Y_MAX) {
            // Alternate colors
            ctx.fillStyle = (col + row) % 2 === 0 ? '#ffffff' : '#000000';
            ctx.fillRect(squareX, squareY, checkerSize, checkerSize);
          }
        }
      }
      ctx.restore();

      // Start text markers banner card
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(FINISH_LINE_X - 12, FINISH_LINE_Y_MIN - 18, 38, 14, 3);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('START', FINISH_LINE_X + 7, FINISH_LINE_Y_MIN - 8);

      // 7) DRAW OBSTACLES: Mud pits and Booster Pads
      obstacles.forEach((obs) => {
        if (obs.type === 'mud' && obs.radius) {
          // Draw mud blob
          ctx.save();
          ctx.fillStyle = '#3e2723'; // Dark brown muddy shell
          ctx.beginPath();
          ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Outer sticky ring
          ctx.strokeStyle = '#5d4037';
          ctx.lineWidth = 3.5;
          ctx.stroke();

          // Organic textured blobs inside the mud to make it look highly high-fidelity and detailed
          ctx.fillStyle = '#271510';
          ctx.beginPath();
          ctx.arc(obs.x - 12, obs.y + 4, obs.radius * 0.35, 0, Math.PI * 2);
          ctx.arc(obs.x + 8, obs.y - 8, obs.radius * 0.4, 0, Math.PI * 2);
          ctx.arc(obs.x + 4, obs.y + 12, obs.radius * 0.3, 0, Math.PI * 2);
          ctx.fill();

          // Mud Text label
          ctx.fillStyle = '#d7ccc8';
          ctx.font = 'bold 9px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(obs.label, obs.x, obs.y + 4);
          ctx.restore();
        } else if (obs.type === 'booster' && obs.width && obs.height) {
          // Draw booster rectangles pointing forward
          ctx.save();
          ctx.translate(obs.x, obs.y);
          if (obs.angle) {
            ctx.rotate(obs.angle);
          }

          // Dark frame base
          ctx.fillStyle = '#064e3b';
          ctx.beginPath();
          ctx.roundRect(-obs.width/2, -obs.height/2, obs.width, obs.height, 5);
          ctx.fill();

          // Neon glowing green borders
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Pulse chevron arrows
          const pulseOffset = (performance.now() / 160) % 4;
          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 3.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          for (let c = 0; c < 2; c++) {
            const arrowX = -15 + c * 18 + pulseOffset * 1.5;
            ctx.beginPath();
            ctx.moveTo(arrowX, -7);
            ctx.lineTo(arrowX + 5, 0);
            ctx.lineTo(arrowX, 7);
            ctx.stroke();
          }

          // Text marker
          ctx.fillStyle = '#e6fffa';
          ctx.font = '7px sans-serif';
          ctx.textAlign = 'right';
          ctx.restore();
        }
      });

      // 8) RENDERING PARTICLES UPDATES
      particles.current.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0; // reset
      });

       // 9) DRAW THE CONVERTED RACING CAR MODEL
      ctx.save();
      // Translate origin coordinate to vehicle center pivot
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      // Shadow overlay underneath vehicle body
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = -2;
      ctx.shadowOffsetY = 3;

      // Draw wheels (flipped 180 deg)
      ctx.fillStyle = '#090d16'; // sleek black tires
      // Front Wheels are now at negative X side -12
      ctx.fillRect(-12, -8, 6, 3); // Front Left tire
      ctx.fillRect(-12, 5, 6, 3);  // Front Right tire
      // Rear Wheels are now at positive X side 6
      ctx.fillRect(6, -8, 6, 3);  // Rear Left tire
      ctx.fillRect(6, 5, 6, 3);   // Rear Right tire

      // Frame Base: Sports Car Body Red Carbon chassis
      ctx.fillStyle = driveState === 'boost' ? '#059669' : '#e11d48'; // energetic green under boost, ruby red normally
      ctx.beginPath();
      ctx.roundRect(-12, -6, 24, 12, 4);
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Dual racing stripe decal detailing
      ctx.fillStyle = '#f8fafc'; // alpine white stripes
      ctx.fillRect(-11, -3, 22, 1);
      ctx.fillRect(-11, 2, 22, 1);

      // Glass cockpit canopy dome (Black mask) - shifted forward to negative X side
      ctx.fillStyle = '#0f172a'; // tinted black mask
      ctx.beginPath();
      ctx.roundRect(-7, -4, 11, 8, 2.5);
      ctx.fill();

      // Clear Glass Windshield (highlighting front direction clearly at the negative X side)
      ctx.fillStyle = '#a5f3fc'; // shiny cyan/blue glass windshield
      ctx.beginPath();
      ctx.roundRect(-7, -3, 3, 6, 1.5);
      ctx.fill();

      // Highlight white shine line on windshield
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6.5, -2, 1, 4);

      // Side windows styling
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-3, -3.5, 5, 0.8);
      ctx.fillRect(-3, 2.7, 5, 0.8);

      // Front headlights glow circles (now on the negative X side)
      ctx.fillStyle = '#fef08a'; // bright warm yellow
      ctx.fillRect(-12.5, -5, 1.5, 2);
      ctx.fillRect(-12.5, 3, 1.5, 2);

      // Rear Spoiler spoiler wing brackets (now on the positive X side)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(11, -7, 2, 14); // spoiler blade
      ctx.fillRect(9, -4, 2, 1);
      ctx.fillRect(9, 3, 2, 1);

      ctx.restore();

      // ======================================
      // 10) LINK DATA COUPLING CURSOR COUPLER:
      // If hoveredPoint lies valid, draw a coordinate pointer and text detail popup
      // ======================================
      if (hoveredPoint) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(hoveredPoint.x, hoveredPoint.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#818cf8';
        ctx.fill();

        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`GPS Telemetry at t = ${hoveredPoint.time.toFixed(1)}s`, hoveredPoint.x + 20, hoveredPoint.y - 2);
        ctx.fillText(`d: ${hoveredPoint.distance.toFixed(1)}m | v: ${hoveredPoint.velocity.toFixed(2)}m/s`, hoveredPoint.x + 20, hoveredPoint.y + 8);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [obstacles, activePlaybackSpeed, isRecording, onEmitTelemetry]);

  return (
    <div className="flex flex-col bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-5 backdrop-blur-md" id="race-arena">
      
      {/* HUD Bar Display */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/5 pb-3 mb-4 gap-3">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-cyan-400 animate-spin-slow" />
          <h3 className="font-bold text-sm tracking-tight text-white uppercase font-sans">
            Live Race Course Arena
          </h3>
          <span className="text-xs bg-slate-950 text-cyan-400 font-mono px-2 py-0.5 rounded-full border border-cyan-500/20">
            Laps: {lapsCount}
          </span>
        </div>

        {/* Playback speed controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase leading-none mr-1 flex items-center gap-1">
            <Sliders className="h-3 w-3 text-cyan-400" />
            Simulation Scale:
          </span>
          
          <button
            onClick={() => setActivePlaybackSpeed(0.5)}
            className={`cursor-pointer px-2.5 py-1 rounded-lg text-[10px] font-mono leading-none border transition-all ${
              activePlaybackSpeed === 0.5
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                : 'bg-slate-950 text-slate-400 border-white/5 hover:text-white hover:bg-slate-900'
            }`}
            title="Slow Motion makes controlling a rocketed car with keyboard significantly more precise!"
          >
            0.5x (Slow-Mo)
          </button>
          
          <button
            onClick={() => setActivePlaybackSpeed(1.0)}
            className={`cursor-pointer px-2.5 py-1 rounded-lg text-[10px] font-mono leading-none border transition-all ${
              activePlaybackSpeed === 1.0
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                : 'bg-slate-950 text-slate-400 border-white/5 hover:text-white hover:bg-slate-900'
            }`}
          >
            1.0x (Normal)
          </button>
        </div>
      </div>

      {/* Actual HTML5 Physical Canvas Wrapper */}
      <div className="relative w-full aspect-[2/1] bg-slate-950 rounded-xl border border-white/5 overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full object-contain"
        />

        {/* Help controls Overlay Legend */}
        <div className="absolute bottom-3 left-3 z-10 transition-all duration-300">
          {!isControlsExpanded ? (
            <button
              onClick={() => setIsControlsExpanded(true)}
              className="bg-slate-950/90 hover:bg-slate-900 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-bold text-cyan-400 font-mono tracking-wider shadow-lg flex items-center gap-1 cursor-pointer hover:border-cyan-500/30 transition-colors uppercase outline-none"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>View Controls</span>
            </button>
          ) : (
            <div className="bg-slate-950/90 backdrop-blur-sm p-3 rounded-xl border border-white/5 leading-normal w-[210px] font-sans text-slate-100 shadow-2xl">
              <div className="flex items-center justify-between gap-1 border-b border-white/10 pb-1.5 mb-1.5">
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest font-mono">Driving Cockpit Config</span>
                <button
                  onClick={() => setIsControlsExpanded(false)}
                  className="text-[9px] text-slate-400 hover:text-white font-bold font-mono transition-colors bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded cursor-pointer select-none"
                >
                  MIN
                </button>
              </div>
              <div className="space-y-1 text-[11px] font-mono text-slate-300 animate-fadeIn">
                <div className="flex justify-between">
                  <span>W / <span className="text-cyan-400 font-bold">▲</span></span>
                  <span className="text-slate-400 font-sans">Gas (Accel)</span>
                </div>
                <div className="flex justify-between">
                  <span>S / <span className="text-cyan-400 font-bold">▼</span></span>
                  <span className="text-slate-400 font-sans">Brake / Rev</span>
                </div>
                <div className="flex justify-between">
                  <span>A / D / ◄ / ►</span>
                  <span className="text-slate-400 font-sans">Steer Wheel</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Overlay Lap Indicator Badge */}
        {lapsCount > 0 && lapsCount < 3 && (
          <div className="absolute top-3 right-3 bg-cyan-950/85 backdrop-blur px-3 py-1.5 rounded-lg border border-cyan-500/40 shadow-lg pointer-events-none flex items-center gap-1.5 animate-bounce">
            <Check className="h-4 w-4 text-cyan-400 stroke-[3]" />
            <span className="text-xs font-bold text-cyan-200">LAP {lapsCount} COMPLETE</span>
          </div>
        )}

        {/* Race Completed Overlay screen, force a full restart/reset to drive again */}
        {lapsCount >= 3 && (
          <div className="absolute inset-0 bg-slate-950/60 flex flex-col items-center justify-center text-center p-6 animate-fadeIn z-10 transition-all">
            <div className="w-16 h-16 bg-yellow-500 rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(234,179,8,0.45)] border border-white/25 mb-4">
               <Trophy className="h-9 w-9 text-slate-950 stroke-[2.5]" />
            </div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight font-sans">
              Race Completed!
            </h2>
            <p className="text-cyan-200 text-sm mt-1 max-w-sm font-medium">
              You completed <span className="font-bold text-white text-base">3 Laps</span> successfully!
            </p>
            
            <div className="text-slate-300 text-xs mt-3.5 max-w-md leading-relaxed font-sans bg-slate-900/90 border border-white/5 py-2.5 px-4 rounded-xl shadow-xl flex flex-col items-center gap-1">
              <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider">🔬 Interactive Evaluation</span>
              <span>
                Move your mouse pointer over the <strong className="text-cyan-300 font-semibold">Telemetry graphs</strong> below to inspect exact physical speeds, displacement values, tangent slope velocities, and accelerations at any recorded instant!
              </span>
            </div>

            <p className="text-slate-400 text-xs mt-3.5 max-w-xs leading-relaxed">
              Click below to reset the racer's position, clear old streams, and drive again!
            </p>
            <button
              onClick={handleResetCar}
              className="mt-4 px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold uppercase tracking-wider text-xs rounded-xl font-mono shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.65)] hover:scale-102 flex items-center gap-2 transition-all cursor-pointer border border-cyan-300"
            >
              <RotateCcw className="h-4 w-4" />
              Restart Simulation
            </button>
          </div>
        )}
      </div>

      {/* Control panel buttons below */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pb-1">
        <div className="flex items-center gap-2">
          {isRecording ? (
            <span className="flex items-center gap-1.5 text-xs bg-cyan-950/60 text-cyan-400 border border-cyan-500/25 py-1.5 px-3 rounded-lg font-medium shadow-inner font-mono">
              <span className="h-2 w-2 bg-cyan-400 rounded-full animate-pulse shrink-0" />
              RECORDING DATA STREAM ONLINE
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs bg-slate-950 text-slate-400 border border-white/5 py-1.5 px-3 rounded-lg font-medium font-mono">
              <span className="h-2 w-2 bg-slate-600 rounded-full shrink-0" />
              TELEMETRY LOG STREAM PAUSED
            </span>
          )}
        </div>

        <button
          onClick={handleResetCar}
          className="cursor-pointer px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 hover:bg-slate-900 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5 transition-all shadow-md self-end hover:border-cyan-500/40"
        >
          <RotateCcw className="h-3.5 w-3.5 text-cyan-400" />
          Reset Racer Position
        </button>
      </div>
    </div>
  );
}
