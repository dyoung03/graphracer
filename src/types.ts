export type CarState = 'normal' | 'mud' | 'boost' | 'offtrack' | 'stopped';

export interface TelemetryPoint {
  id: string;
  time: number; // elapsed time in seconds
  distance: number; // cumulative distance in "meters" (scaled from pixels)
  displacement?: number; // straight-line displacement in "meters" (scaled from pixels)
  velocity: number; // velocity in "m/s" (scaled from pixels)
  acceleration: number; // acceleration in "m/s²"
  state: CarState;
  x: number; // car x position on track
  y: number; // car y position on track
}

export interface Obstacle {
  id: string;
  type: 'mud' | 'booster';
  x: number;
  y: number;
  radius?: number; // for circular obstacles (mud pits)
  width?: number;  // for rectangular obstacles (booster pads)
  height?: number; // for rectangular obstacles (booster pads)
  angle?: number;  // directional boost angle in radians (for boosters)
  label: string;
}

export type ChallengeId = 'free' | 'constant' | 'slogger' | 'speedy' | 'stopgo';

export interface Challenge {
  id: ChallengeId;
  title: string;
  description: string;
  instruction: string;
  targetExplanation: string;
  evaluate: (points: TelemetryPoint[]) => {
    success: boolean;
    progress: number; // 0 to 100
    message: string;
  };
}
