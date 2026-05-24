export type DiceGroup = {
  notation: string;
  sides: number;
  dice: number[];
  keptIndices: number[];
  keepMode?: 'kh' | 'kl';
};

export type DiceRollResult = {
  notation: string;
  groups: DiceGroup[];
  modifier: number;
  total: number;
  advantage?: 'advantage' | 'disadvantage';
};

const VALID_DIE_SIZES = [2, 4, 6, 8, 10, 12, 20, 100];

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function resolveShorthand(input: string): string {
  const normalized = input.toLowerCase();
  if (normalized === 'adv' || normalized === 'advantage') return '2d20kh1';
  if (normalized === 'dis' || normalized === 'disadv' || normalized === 'disadvantage')
    return '2d20kl1';
  return input;
}

function extractModifier(notation: string): number {
  const withoutGroups = notation.replace(/\d+d\d+(?:(?:kh|kl)\d*)?/gi, '');
  const cleaned = withoutGroups.replace(/\++/g, '+').replace(/^[+]/, '').replace(/[+]$/, '').trim();
  if (!cleaned) return 0;
  const match = cleaned.match(/^([+-]?\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function normalizeDiceRoll(raw: Record<string, unknown>): DiceRollResult {
  if (Array.isArray(raw.groups)) return raw as unknown as DiceRollResult;

  const notation = (raw.notation as string) ?? '';
  const sidesMatch = notation.match(/d(\d+)/);
  const sides = sidesMatch ? Number.parseInt(sidesMatch[1], 10) : 0;
  const keepMode =
    raw.advantage === 'advantage' ? 'kh' : raw.advantage === 'disadvantage' ? 'kl' : undefined;

  return {
    notation,
    groups: [
      {
        notation: notation.replace(/[+-]\d+$/, ''),
        sides,
        dice: (raw.dice as number[]) ?? [],
        keptIndices: (raw.keptIndices as number[]) ?? [],
        keepMode,
      },
    ],
    modifier: (raw.modifier as number) ?? 0,
    total: (raw.total as number) ?? 0,
    advantage: raw.advantage as DiceRollResult['advantage'],
  };
}

export function parseAndRoll(rawInput: string): DiceRollResult | null {
  const input = resolveShorthand(rawInput.trim());

  const groupMatches = [...input.matchAll(/(\d+)d(\d+)(?:(kh|kl)(\d+)?)?/gi)];
  if (groupMatches.length === 0) return null;

  const modifier = extractModifier(input);
  const groups: DiceGroup[] = [];
  const notationParts: string[] = [];

  for (const match of groupMatches) {
    const count = Number.parseInt(match[1], 10);
    const sides = Number.parseInt(match[2], 10);
    const keepMode = match[3]?.toLowerCase() as 'kh' | 'kl' | undefined;
    const keepCount = match[4] ? Number.parseInt(match[4], 10) : 1;

    if (!VALID_DIE_SIZES.includes(sides) || count < 1 || count > 100) return null;

    const dice = Array.from({ length: count }, () => rollDie(sides));

    let keptIndices: number[];
    if (keepMode) {
      const sorted = dice.map((val, i) => ({ val, i })).sort((a, b) => b.val - a.val);
      keptIndices =
        keepMode === 'kh'
          ? sorted.slice(0, keepCount).map((d) => d.i)
          : sorted.slice(sorted.length - keepCount).map((d) => d.i);
    } else {
      keptIndices = dice.map((_, i) => i);
    }

    let groupNotation = `${count}d${sides}`;
    if (keepMode) groupNotation += `${keepMode}${keepCount}`;

    groups.push({ notation: groupNotation, sides, dice, keptIndices, keepMode });
    notationParts.push(groupNotation);
  }

  let notation = notationParts.join('+');
  if (modifier > 0) notation += `+${modifier}`;
  else if (modifier < 0) notation += `${modifier}`;

  const total =
    groups.reduce(
      (sum, g) => sum + g.keptIndices.map((i) => g.dice[i]).reduce((s, d) => s + d, 0),
      0
    ) + modifier;

  let advantage: 'advantage' | 'disadvantage' | undefined;
  if (groups.length === 1) {
    const g = groups[0];
    if (g.sides === 20 && g.dice.length === 2 && g.keptIndices.length === 1 && g.keepMode) {
      advantage = g.keepMode === 'kh' ? 'advantage' : 'disadvantage';
    }
  }

  return { notation, groups, modifier, total, advantage };
}
