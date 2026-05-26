import { describe, it, expect } from 'vitest';
import { removeAccents } from '../../src/engines/removeAccents';

describe('removeAccents', () => {
  it('removes common tone marks', () => {
    expect(removeAccents('tôi là bạn')).toBe('toi la ban');
  });

  it('removes all diacritical marks from a complex sentence', () => {
    expect(removeAccents('Trường học đẹp quá!')).toBe('Truong hoc dep qua!');
  });

  it('handles đ→d mapping', () => {
    expect(removeAccents('đi đứng')).toBe('di dung');
  });

  it('handles Đ→D mapping', () => {
    expect(removeAccents('Đà Nẵng')).toBe('Da Nang');
  });

  it('preserves non-Vietnamese text', () => {
    expect(removeAccents('Hello world 123')).toBe('Hello world 123');
  });

  it('handles empty string', () => {
    expect(removeAccents('')).toBe('');
  });

  it('handles mixed Vietnamese and English', () => {
    expect(removeAccents('I love bạn')).toBe('I love ban');
  });

  it('removes breve (ă) and horn (ơ, ư)', () => {
    expect(removeAccents('ă ơ ư')).toBe('a o u');
  });

  it('handles syllables with multiple diacritics', () => {
    expect(removeAccents('ưỡn')).toBe('uon');
  });
});
