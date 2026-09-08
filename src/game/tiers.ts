// Tier configuration for Mochi Merge.
// 11 tiers, smallest -> largest. Radii are defined at a reference jar width
// of 480px and scaled proportionally to the actual jar width.

export type EyeStyle = 'open' | 'happy' | 'wink' | 'sparkle' | 'sleepy';
export type MouthStyle = 'smile' | 'open' | 'cat' | 'tiny' | 'grin';

export interface TierDef {
  name: string;
  radius: number; // px at jar width 480
  color: string; // main body color
  light: string; // top highlight
  dark: string; // bottom shade / outline
  eyes: EyeStyle;
  mouth: MouthStyle;
}

export const BASE_JAR_WIDTH = 480;

export const TIERS: TierDef[] = [
  { name: 'Cherry',        radius: 14,  color: '#ff9eb5', light: '#ffd3de', dark: '#e87e99', eyes: 'open',    mouth: 'tiny'  },
  { name: 'Berry',         radius: 20,  color: '#b8a9f2', light: '#ddd4fb', dark: '#9a86dd', eyes: 'happy',   mouth: 'smile' },
  { name: 'Peach',         radius: 27,  color: '#ffc39e', light: '#ffe3cd', dark: '#f0a276', eyes: 'wink',    mouth: 'smile' },
  { name: 'Lemon Drop',    radius: 35,  color: '#ffdf8a', light: '#fff1c4', dark: '#eec25e', eyes: 'open',    mouth: 'cat'   },
  { name: 'Minty',         radius: 44,  color: '#a9e7c6', light: '#d5f5e4', dark: '#83cda4', eyes: 'sleepy',  mouth: 'smile' },
  { name: 'Soda',          radius: 54,  color: '#9ed8f2', light: '#cdeeff', dark: '#77b8d9', eyes: 'sparkle', mouth: 'open'  },
  { name: 'Pudding',       radius: 65,  color: '#f2c38d', light: '#ffe2bd', dark: '#d9a267', eyes: 'happy',   mouth: 'open'  },
  { name: 'Melon',         radius: 77,  color: '#ffb3d9', light: '#ffd8ec', dark: '#ec8fbe', eyes: 'wink',    mouth: 'grin'  },
  { name: 'Taro',          radius: 89,  color: '#d3b6ec', light: '#eadbf9', dark: '#b392d4', eyes: 'sleepy',  mouth: 'cat'   },
  { name: 'Matcha',        radius: 100, color: '#bcd98c', light: '#deefc0', dark: '#9cb968', eyes: 'open',    mouth: 'grin'  },
  { name: 'Rainbow Mochi', radius: 112, color: '#ffc7e8', light: '#fff0fa', dark: '#e8a3cf', eyes: 'sparkle', mouth: 'open'  },
];

export const MAX_TIER = TIERS.length - 1;

/** Tiers that can appear as the next droppable piece (smallest 5). */
export const SPAWNABLE_TIERS = 5;

export function tierScale(jarWidth: number): number {
  return jarWidth / BASE_JAR_WIDTH;
}

export function tierRadius(tier: number, jarWidth: number): number {
  return TIERS[tier].radius * tierScale(jarWidth);
}

/** Points awarded when a merge CREATES the given tier (triangular numbers). */
export function tierPoints(createdTier: number): number {
  const n = createdTier + 1;
  return (n * (n + 1)) / 2;
}
