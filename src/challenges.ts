import { Challenge, TelemetryPoint } from './types';

export const CHALLENGES: Challenge[] = [
  {
    id: 'free',
    title: 'Free Exploration',
    description: 'Drive around open-endedly to see how the graph reacts to your speed, braking, mud pits, and booster pads.',
    instruction: 'Accelerate with Up/W, steer with Left/Right (A/D), and brake with Down/S. Try out the speed boosters and mud pits!',
    targetExplanation: 'Notice how a steep slope means high velocity, flat means stopped, and a shallow slope means you are slowed down in mud.',
    evaluate: (points: TelemetryPoint[]) => {
      return {
        success: false,
        progress: points.length > 0 ? 100 : 0,
        message: points.length === 0 ? 'Start driving to generate your graph!' : 'Exploring! Try hovering over the graph to see live slopes.'
      };
    }
  },
  {
    id: 'constant',
    title: 'The Constant Cruiser',
    description: 'Establish a perfect, constant-speed cruise around the track.',
    instruction: 'Drive at a steady pace for at least 8 seconds without stopping, colliding, or hitting mud. Give gentle, minor acceleration tap inputs.',
    targetExplanation: 'A constant velocity produces a perfectly straight diagonal line on the Distance vs. Time chart. If the velocity is constant, the rate of change is constant!',
    evaluate: (points: TelemetryPoint[]) => {
      // Filter out points prior to driving
      const drivingPoints = points.filter(p => p.velocity > 0.5);
      
      if (drivingPoints.length < 4) {
        return {
          success: false,
          progress: 0,
          message: 'Start driving at a steady speed to begin evaluating!'
        };
      }

      // Check duration of dynamic driving
      const firstTime = drivingPoints[0].time;
      const lastTime = drivingPoints[drivingPoints.length - 1].time;
      const duration = lastTime - firstTime;

      // Ensure they didn't hit mud or offtrack
      const hadOfftrackOrMud = drivingPoints.some(p => p.state === 'mud' || p.state === 'offtrack');
      if (hadOfftrackOrMud) {
        return {
          success: false,
          progress: Math.min(40, Math.floor((duration / 8) * 100)),
          message: 'Oops! Avoid mud and off-track grass to make current velocity uniform.'
        };
      }

      const progress = Math.min(100, Math.floor((duration / 8) * 100));

      if (duration < 8) {
        return {
          success: false,
          progress,
          message: `Keep it up! Cruise steadily for another ${(8 - duration).toFixed(1)}s.`
        };
      }

      // Calculate mean and standard deviation of velocity during this period
      const velocities = drivingPoints.map(p => p.velocity);
      const meanVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;
      
      const variance = velocities.reduce((sum, v) => sum + Math.pow(v - meanVelocity, 2), 0) / velocities.length;
      const stdDev = Math.sqrt(variance);

      // Std dev of < 0.8 is excellent constant cruise
      const maxAllowedDev = 0.85; 

      if (stdDev <= maxAllowedDev) {
        return {
          success: true,
          progress: 100,
          message: `Excellent job! Uniform velocity achieved! Mean speed: ${meanVelocity.toFixed(1)} m/s, Variation: ±${stdDev.toFixed(2)}. This draws a beautiful straight diagonal line!`
        };
      } else {
        return {
          success: false,
          progress: 90,
          message: `Steady, but a bit too jumpy (Variation: ±${stdDev.toFixed(2)}). Try tapping the accelerator more smoothly to keep velocity locked.`
        };
      }
    }
  },
  {
    id: 'slogger',
    title: 'The Mud Slogger',
    description: 'Learn how massive friction and speed drop-offs affect your graphs rate of change.',
    instruction: 'Drive directly into a mud pit, slog through it slowly, and exit the other side while continuing to hold the throttle.',
    targetExplanation: 'Observe how the slope of the Distance-Time graph flattens (getting much less steep) while you are in the mud, then steepens again as you escape!',
    evaluate: (points: TelemetryPoint[]) => {
      // Find consecutive or cumulative mud points
      const mudPoints = points.filter(p => p.state === 'mud');
      
      const durationInMud = mudPoints.length * 0.15; // each point interval is roughly 150ms
      const progress = Math.min(100, Math.floor((durationInMud / 2.5) * 100));

      if (progress < 100) {
        return {
          success: false,
          progress,
          message: `Drive over the dark brown Mud Pits and hold throttle. Spent ${durationInMud.toFixed(1)}s / 2.5s in mud.`
        };
      }

      // Ensure they transitioned from normal -> mud -> normal
      const hasNormalBefore = points.slice(0, points.indexOf(mudPoints[0])).some(p => p.state === 'normal' && p.velocity > 1);
      const hasNormalAfter = points.slice(points.indexOf(mudPoints[mudPoints.length - 1])).some(p => p.state === 'normal' && p.velocity > 2);

      if (!hasNormalBefore || !hasNormalAfter) {
        return {
          success: true,
          progress: 100,
          message: 'Mud transit recorded! The sudden flattening of the slope represents a deceleration as the rate of change drops.'
        };
      }

      return {
        success: true,
        progress: 100,
        message: 'Fantastic! Notice the distinct "S" bend in the graph. The rate of change suddenly drops inside the mud, making the slope shallow!'
      };
    }
  },
  {
    id: 'speedy',
    title: 'The Booster Rocket',
    description: 'Use booster pads to accelerate beyond the regular limit and observe high rates of change.',
    instruction: 'Drive over an off-center green arrows booster pad to accelerate to extreme velocities!',
    targetExplanation: 'A massive speed boost creates a very steep spike upwards in distance vs. time. Instantly, the rate of change is maximized!',
    evaluate: (points: TelemetryPoint[]) => {
      const maxSpeed = points.reduce((max, p) => p.velocity > max ? p.velocity : max, 0);
      const targetSpeed = 7.5; // m/s
      
      const progress = Math.min(100, Math.floor((maxSpeed / targetSpeed) * 100));

      if (maxSpeed < targetSpeed) {
        return {
          success: false,
          progress,
          message: `Reach a velocity of ${targetSpeed} m/s. Max reached so far: ${maxSpeed.toFixed(1)} m/s. Hit a green booster pad!`
        };
      }

      return {
        success: true,
        progress: 100,
        message: `Success! You rocketed to ${maxSpeed.toFixed(1)} m/s! Witness that nearly vertical jump in the distance graph—that is a massive rate of change!`
      };
    }
  },
  {
    id: 'stopgo',
    title: 'The Stop-and-Go Trap',
    description: 'Create a distinctive stepped graph illustrating motion, stillness, and acceleration stages.',
    instruction: '1) Drive at speed for 2s. 2) Brake to a complete stop and hold STILL for 3 full seconds. 3) Accelerate rapidly back to full speed.',
    targetExplanation: 'Your distance graph should look like stairs: ascending (moving), perfectly flat horizontal (stopped), and ascending steeply again (speeding up).',
    evaluate: (points: TelemetryPoint[]) => {
      if (points.length < 15) {
        return {
          success: false,
          progress: 10,
          message: 'Start driving to begin the challenge sequence!'
        };
      }

      // We need to identify 3 consecutive phases in the telemetry arrays
      // Phase 1: Moving (v > 2.5) for at least ~1.5s
      // Phase 2: Stopped (v < 0.2) for at least ~2.8s
      // Phase 3: Moving (v > 3.5) for at least ~1.5s

      let firstMovingIndex = -1;
      let stopStart = -1;
      let stopEnd = -1;
      let secondMovingStart = -1;

      // Let's do a simple sliding analysis of points
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (firstMovingIndex === -1 && p.velocity > 2.5) {
          firstMovingIndex = i;
        }
        
        if (firstMovingIndex !== -1 && stopStart === -1 && p.velocity < 0.2) {
          // Verify we were moving for at least 6 points (~1 second) beforehand
          let countPref = 0;
          for (let j = firstMovingIndex; j < i; j++) {
            if (points[j].velocity > 2.0) countPref++;
          }
          if (countPref >= 6) {
            stopStart = i;
          }
        }

        if (stopStart !== -1 && stopEnd === -1 && p.velocity > 1.5) {
          // Verify we held stop for at least 15 points (~2.25 seconds)
          let countStop = 0;
          for (let j = stopStart; j < i; j++) {
            if (points[j].velocity < 0.3) countStop++;
          }
          if (countStop >= 15) {
            stopEnd = i;
            secondMovingStart = i;
          } else {
            // Reset stop search as they started moving prematurely
            stopStart = -1;
          }
        }
      }

      // Check third stage: moving rapidly after stop
      let stage3Success = false;
      if (secondMovingStart !== -1) {
        let countEnd = 0;
        for (let j = secondMovingStart; j < points.length; j++) {
          if (points[j].velocity > 3.0) countEnd++;
        }
        if (countEnd >= 6) {
          stage3Success = true;
        }
      }

      if (firstMovingIndex === -1) {
        return {
          success: false,
          progress: 20,
          message: 'Step 1: Drive smoothly at normal speed for a couple seconds.'
        };
      }

      if (stopStart === -1) {
        return {
          success: false,
          progress: 40,
          message: 'Step 1 Complete! Now, Step 2: Stop completely (speed = 0) and hold still for 3s.'
        };
      }

      if (stopEnd === -1) {
        // Calculate dynamic stop timer
        const currentStopDuration = points.filter((p, idx) => idx >= stopStart && p.velocity < 0.3).length * 0.15;
        const stopProg = Math.min(100, Math.floor((currentStopDuration / 3.0) * 100));
        return {
          success: false,
          progress: 40 + Math.floor(stopProg * 0.4),
          message: `Holding stop... Stopped for ${currentStopDuration.toFixed(1)} / 3.0 seconds.`
        };
      }

      if (!stage3Success) {
        return {
          success: false,
          progress: 80,
          message: 'Step 2 Complete! Now, Step 3: Floor the gas pedal to speed off!'
        };
      }

      return {
        success: true,
        progress: 100,
        message: 'Masterful! You crafted a perfectly stepped graph. A horizontal plateau on the Distance graph translates to exactly zero velocity—an instant rate of change of zero!'
      };
    }
  }
];
