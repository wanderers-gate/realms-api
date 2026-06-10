import { parseAndRoll } from './dice';

describe('parseAndRoll', () => {
  it('rolls a basic die', () => {
    const result = parseAndRoll('1d20');
    expect(result).not.toBeNull();
    expect(result?.groups[0].dice).toHaveLength(1);
    expect(result?.modifier).toBe(0);
  });

  it('applies a positive modifier', () => {
    const result = parseAndRoll('1d20+5');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(5);
    expect(result?.total).toBe((result?.groups[0].dice[0] ?? 0) + 5);
  });

  it('applies a negative modifier', () => {
    const result = parseAndRoll('1d20-3');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(-3);
    expect(result?.total).toBe((result?.groups[0].dice[0] ?? 0) - 3);
  });

  it('strips [label] and correctly applies modifier', () => {
    const result = parseAndRoll('1d20+4 [STR Saving Throw]');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(4);
    expect(result?.total).toBe((result?.groups[0].dice[0] ?? 0) + 4);
  });

  it('strips [label] and correctly applies negative modifier', () => {
    const result = parseAndRoll('1d6+-2 [Sneak Attack]');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(-2);
    expect(result?.total).toBe((result?.groups[0].dice[0] ?? 0) - 2);
  });

  it('handles spaces around operators', () => {
    const result = parseAndRoll('1d20 + 3');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(3);
    expect(result?.total).toBe((result?.groups[0].dice[0] ?? 0) + 3);
  });

  it('handles spaces with label', () => {
    const result = parseAndRoll('1d20 + 3 [Slam Attack]');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(3);
    expect(result?.total).toBe((result?.groups[0].dice[0] ?? 0) + 3);
  });

  it('handles negative modifier from spaced formula (e.g. 1d20 + -2)', () => {
    const result = parseAndRoll('1d20 + -2');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(-2);
    expect(result?.total).toBe((result?.groups[0].dice[0] ?? 0) - 2);
  });

  it('sums compound modifiers like str_mod + prof_bonus', () => {
    const result = parseAndRoll('1d20+3+2');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(5);
    expect(result?.total).toBe((result?.groups[0].dice[0] ?? 0) + 5);
  });

  it('sums compound modifiers with spaces and label', () => {
    const result = parseAndRoll('1d20 + 3 + 2 [Athletics]');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(5);
    expect(result?.total).toBe((result?.groups[0].dice[0] ?? 0) + 5);
  });

  it('strips [label] with no modifier', () => {
    const result = parseAndRoll('1d20 [Perception]');
    expect(result).not.toBeNull();
    expect(result?.modifier).toBe(0);
  });

  it('returns null for invalid input', () => {
    expect(parseAndRoll('not a roll')).toBeNull();
    expect(parseAndRoll('')).toBeNull();
  });
});
