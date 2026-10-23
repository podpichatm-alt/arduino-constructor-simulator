import { describe, expect, it } from 'vitest';
import { PROJECT_TEMPLATES } from './templates';

describe('стартовые шаблоны', () => {
  it('содержит оба класса устройств', () => {
    expect(PROJECT_TEMPLATES).toHaveLength(2);
    expect(new Set(PROJECT_TEMPLATES.map((item) => item.kind)).size).toBe(2);
  });

  it('использует уникальные идентификаторы', () => {
    expect(new Set(PROJECT_TEMPLATES.map((item) => item.id)).size).toBe(PROJECT_TEMPLATES.length);
  });

  it('задаёт компоненты каждому шаблону', () => {
    PROJECT_TEMPLATES.forEach((item) => expect(item.components.length).toBeGreaterThan(0));
  });
});
