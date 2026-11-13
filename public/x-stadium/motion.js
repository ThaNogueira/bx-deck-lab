import { speedProfiles } from './speed-profiles.js';
import { clamp } from './stadium.js';

function speedAt(style, quantile) {
  const { grid, profiles } = speedProfiles;
  const i = style <= grid[1] ? 0 : 1;
  const t = (style - grid[i]) / (grid[i+1] - grid[i]);
  return profiles[i][quantile]*(1-t) + profiles[i+1][quantile]*t;
}

export function launchSpeed(power,style) {
  return speedAt(style,1) * (.24 + .76 * power / 100);
}

export function runningSpeed(spinFraction, style) {
  return speedAt(style,2) * (.48 + .52 * clamp(spinFraction,0,1));
}
