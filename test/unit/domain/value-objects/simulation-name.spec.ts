import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('SimulationName', () => {
  describe('accepts', () => {
    it('ASCII letters + digits + spaces 8-30 chars', () => {
      expect(SimulationName.create('Katar 2023').value).toBe('Katar 2023');
    });

    it('Polish diacritics', () => {
      expect(SimulationName.create('Paryż 2024').value).toBe('Paryż 2024');
    });

    it('exactly 8 characters', () => {
      expect(SimulationName.create('12345678').value).toBe('12345678');
    });

    it('exactly 30 characters', () => {
      const name = 'A'.repeat(30);
      expect(SimulationName.create(name).value).toBe(name);
    });
  });

  describe('rejects', () => {
    it('shorter than 8 chars', () => {
      expect(() => SimulationName.create('Katar23')).toThrow(InvalidValueError);
    });

    it('longer than 30 chars', () => {
      expect(() => SimulationName.create('A'.repeat(31))).toThrow(InvalidValueError);
    });

    it('special characters (hyphen)', () => {
      expect(() => SimulationName.create('Katar-2023')).toThrow(InvalidValueError);
    });

    it('special characters (emoji)', () => {
      expect(() => SimulationName.create('Katar 2023 ⚽')).toThrow(InvalidValueError);
    });

    it('leading whitespace', () => {
      expect(() => SimulationName.create(' Katar 2023')).toThrow(InvalidValueError);
    });

    it('trailing whitespace', () => {
      expect(() => SimulationName.create('Katar 2023 ')).toThrow(InvalidValueError);
    });

    it('tab character', () => {
      expect(() => SimulationName.create('Katar\t2023')).toThrow(InvalidValueError);
    });

    it('newline', () => {
      expect(() => SimulationName.create('Katar\n2023')).toThrow(InvalidValueError);
    });
  });

  it('equality by value', () => {
    expect(SimulationName.create('Katar 2023').equals(SimulationName.create('Katar 2023'))).toBe(
      true,
    );
  });

  it('toString returns value', () => {
    expect(SimulationName.create('Katar 2023').toString()).toBe('Katar 2023');
  });
});
