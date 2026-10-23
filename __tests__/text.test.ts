import { escapeLike, normalizeSearch } from '@/lib/text';

describe('normalizeSearch', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizeSearch(' El amor en los tiempos del CÓLERA ')).toBe(
      'el amor en los tiempos del colera',
    );
    expect(normalizeSearch('García Márquez')).toBe('garcia marquez');
  });
});

describe('escapeLike', () => {
  it('escapa comodines para que se busquen de forma literal', () => {
    expect(escapeLike('100%_real\\')).toBe('100\\%\\_real\\\\');
  });
});
