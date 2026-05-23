export type DiceRollResult = {
  notation: string;
  dice: number[];
  keptIndices: number[];
  modifier: number;
  total: number;
  advantage?: 'advantage' | 'disadvantage';
};

const VALID_DIE_SIZES = [2, 4, 6, 8, 10, 12, 20, 100];
const NOTATION_PATTERN = /^(\d+)d(\d+)(?:(kh|kl)(\d+)?)?([+-]\d+)?$/i;

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function resolveShorthand(input: string): string {
  const normalized = input.toLowerCase();
  if (normalized === 'adv' || normalized === 'advantage') return '2d20kh1';
  if (normalized === 'dis' || normalized === 'disadv' || normalized === 'disadvantage') return '2d20kl1';
  return input;
}

export function parseAndRoll(rawInput: string): DiceRollResult | null {
  const input = resolveShorthand(rawInput.trim());
  const match = input.match(NOTATION_PATTERN);
  if (!match) return null;

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const keepMode = match[3]?.toLowerCase() as 'kh' | 'kl' | undefined;
  const keepCount = keepMode ? (match[4] ? parseInt(match[4], 10) : 1) : null;
  const modifier = match[5] ? parseInt(match[5], 10) : 0;

  if (!VALID_DIE_SIZES.includes(sides) || count < 1 || count > 100) return null;

  const dice = Array.from({ length: count }, () => rollDie(sides));

  let keptIndices: number[];
  let advantage: 'advantage' | 'disadvantage' | undefined;

  if (keepMode && keepCount !== null) {
    const sorted = dice.map((val, i) => ({ val, i })).sort((a, b) => b.val - a.val);
    keptIndices =
      keepMode === 'kh'
        ? sorted.slice(0, keepCount).map((d) => d.i)
        : sorted.slice(sorted.length - keepCount).map((d) => d.i);
    if (count === 2 && sides === 20 && keepCount === 1) {
      advantage = keepMode === 'kh' ? 'advantage' : 'disadvantage';
    }
  } else {
    keptIndices = dice.map((_, i) => i);
  }

  const total = keptIndices.map((i) => dice[i]).reduce((sum, d) => sum + d, 0) + modifier;

  let notation = `${count}d${sides}`;
  if (keepMode && keepCount !== null) notation += `${keepMode}${keepCount}`;
  if (modifier > 0) notation += `+${modifier}`;
  else if (modifier < 0) notation += `${modifier}`;

  return { notation, dice, keptIndices, modifier, total, advantage };
}
