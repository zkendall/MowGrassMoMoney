export const TIER_DATA = [
  { id: 'manual_push', label: 'Manual Push', qualityBonus: 0, maintenance: 6, fuelRate: 4, upgradeCost: 0 },
  { id: 'gas_push', label: 'Gas Push', qualityBonus: 6, maintenance: 11, fuelRate: 6, upgradeCost: 320 },
  { id: 'riding_mower', label: 'Riding Mower', qualityBonus: 11, maintenance: 20, fuelRate: 9, upgradeCost: 790 },
];

export const COMPLEXITY_PENALTY = {
  low: 0,
  med: 7,
  high: 15,
};

export const PATTERNS = ['circle', 'stripe', 'none'];
export const PASSING_SCORE = 70;
export const ACTION_OPTIONS = ['solicit', 'follow_up', 'mow', 'shop_hardware'];
export const SPINNER_FRAMES = ['|', '/', '-', '\\'];
export const STARTING_CASH = 220;
export const LOG_LEVEL = 'DEBUG';
