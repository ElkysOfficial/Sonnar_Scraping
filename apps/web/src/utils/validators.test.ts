import { describe, it, expect } from 'vitest';
import {
  validateCPF,
  validateCNPJ,
  validateCEP,
  validateEmail,
  checkEmailDomain,
  formatCPF,
  formatCNPJ,
  formatCEP,
  validatePassword,
} from './validators';

describe('validateCPF', () => {
  it('rejects CPF with all equal digits', () => {
    expect(validateCPF('111.111.111-11')).toBe(false);
    expect(validateCPF('000.000.000-00')).toBe(false);
    expect(validateCPF('999.999.999-99')).toBe(false);
  });

  it('rejects CPF with wrong length', () => {
    expect(validateCPF('123.456.789')).toBe(false);
    expect(validateCPF('123.456.789-000')).toBe(false);
    expect(validateCPF('')).toBe(false);
  });

  it('accepts valid CPF', () => {
    expect(validateCPF('529.982.247-25')).toBe(true);
    expect(validateCPF('52998224725')).toBe(true);
    expect(validateCPF('123.456.789-09')).toBe(true);
  });

  it('rejects invalid CPF (wrong check digits)', () => {
    expect(validateCPF('529.982.247-26')).toBe(false);
    expect(validateCPF('123.456.789-00')).toBe(false);
  });
});

describe('validateCNPJ', () => {
  it('rejects CNPJ with all equal digits', () => {
    expect(validateCNPJ('11.111.111/1111-11')).toBe(false);
    expect(validateCNPJ('00.000.000/0000-00')).toBe(false);
  });

  it('rejects CNPJ with wrong length', () => {
    expect(validateCNPJ('11.111.111/1111')).toBe(false);
    expect(validateCNPJ('')).toBe(false);
  });

  it('accepts valid CNPJ', () => {
    expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
    expect(validateCNPJ('11222333000181')).toBe(true);
  });

  it('rejects invalid CNPJ (wrong check digits)', () => {
    expect(validateCNPJ('11.222.333/0001-82')).toBe(false);
  });
});

describe('validateEmail', () => {
  it('rejects empty or invalid input', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail(null as unknown as string)).toBe(false);
    expect(validateEmail(undefined as unknown as string)).toBe(false);
  });

  it('rejects emails without @', () => {
    expect(validateEmail('testexample.com')).toBe(false);
  });

  it('rejects emails with consecutive dots', () => {
    expect(validateEmail('test..email@example.com')).toBe(false);
    expect(validateEmail('test@example..com')).toBe(false);
  });

  it('rejects emails starting/ending with dot in local part', () => {
    expect(validateEmail('.test@example.com')).toBe(false);
    expect(validateEmail('test.@example.com')).toBe(false);
  });

  it('rejects emails with short TLD', () => {
    expect(validateEmail('test@example.c')).toBe(false);
  });

  it('accepts valid emails', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user.name@domain.co.br')).toBe(true);
    expect(validateEmail('user+tag@gmail.com')).toBe(true);
    expect(validateEmail('UPPER@CASE.COM')).toBe(true);
  });
});

describe('checkEmailDomain', () => {
  it('returns invalid for invalid emails', () => {
    expect(checkEmailDomain('invalid')).toEqual({ valid: false });
  });

  it('returns valid for common domains', () => {
    expect(checkEmailDomain('test@gmail.com')).toEqual({ valid: true });
    expect(checkEmailDomain('test@hotmail.com')).toEqual({ valid: true });
  });

  it('suggests corrections for typos', () => {
    const result = checkEmailDomain('test@gmai.com');
    expect(result.valid).toBe(true);
    expect(result.suggestion).toBe('test@gmail.com');
  });

  it('returns valid for unknown domains without suggestion', () => {
    const result = checkEmailDomain('test@customdomain.org');
    expect(result.valid).toBe(true);
    expect(result.suggestion).toBeUndefined();
  });
});

describe('formatCPF', () => {
  it('formats valid CPF correctly', () => {
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
  });

  it('returns original for invalid length', () => {
    expect(formatCPF('123456')).toBe('123456');
    expect(formatCPF('')).toBe('');
  });
});

describe('formatCNPJ', () => {
  it('formats valid CNPJ correctly', () => {
    expect(formatCNPJ('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('returns original for invalid length', () => {
    expect(formatCNPJ('123456')).toBe('123456');
    expect(formatCNPJ('')).toBe('');
  });
});

describe('validateCEP', () => {
  it('accepts CEP with 8 digits', () => {
    expect(validateCEP('01310100')).toBe(true);
    expect(validateCEP('01310-100')).toBe(true);
    expect(validateCEP('01.310-100')).toBe(true);
  });

  it('rejects CEP with wrong length', () => {
    expect(validateCEP('1234567')).toBe(false);
    expect(validateCEP('123456789')).toBe(false);
    expect(validateCEP('')).toBe(false);
  });

  it('handles null/undefined gracefully', () => {
    expect(validateCEP(null as unknown as string)).toBe(false);
    expect(validateCEP(undefined as unknown as string)).toBe(false);
  });
});

describe('formatCEP', () => {
  it('formats 8-digit CEP correctly', () => {
    expect(formatCEP('01310100')).toBe('01310-100');
  });

  it('returns original for invalid length', () => {
    expect(formatCEP('123')).toBe('123');
    expect(formatCEP('')).toBe('');
  });

  it('handles already-formatted CEP', () => {
    expect(formatCEP('01310-100')).toBe('01310-100');
  });
});

describe('validatePassword', () => {
  it('rejects empty password', () => {
    const result = validatePassword('');
    expect(result.isValid).toBe(false);
    expect(result.rules.minLength).toBe(false);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = validatePassword('Abc1!');
    expect(result.isValid).toBe(false);
    expect(result.rules.minLength).toBe(false);
  });

  it('rejects password without uppercase', () => {
    const result = validatePassword('abcdefg1!');
    expect(result.isValid).toBe(false);
    expect(result.rules.hasUppercase).toBe(false);
    expect(result.rules.hasLowercase).toBe(true);
  });

  it('rejects password without lowercase', () => {
    const result = validatePassword('ABCDEFG1!');
    expect(result.isValid).toBe(false);
    expect(result.rules.hasLowercase).toBe(false);
    expect(result.rules.hasUppercase).toBe(true);
  });

  it('rejects password without number', () => {
    const result = validatePassword('Abcdefgh!');
    expect(result.isValid).toBe(false);
    expect(result.rules.hasNumber).toBe(false);
  });

  it('rejects password without special character', () => {
    const result = validatePassword('Abcdefg1');
    expect(result.isValid).toBe(false);
    expect(result.rules.hasSpecial).toBe(false);
  });

  it('accepts valid password with all requirements', () => {
    const result = validatePassword('Abcdefg1!');
    expect(result.isValid).toBe(true);
    expect(result.rules.minLength).toBe(true);
    expect(result.rules.hasUppercase).toBe(true);
    expect(result.rules.hasLowercase).toBe(true);
    expect(result.rules.hasNumber).toBe(true);
    expect(result.rules.hasSpecial).toBe(true);
  });

  it('accepts various special characters', () => {
    expect(validatePassword('Abcdefg1@').isValid).toBe(true);
    expect(validatePassword('Abcdefg1#').isValid).toBe(true);
    expect(validatePassword('Abcdefg1$').isValid).toBe(true);
    expect(validatePassword('Abcdefg1%').isValid).toBe(true);
    expect(validatePassword('Abcdefg1.').isValid).toBe(true);
  });

  it('handles null/undefined gracefully', () => {
    const result = validatePassword(null as unknown as string);
    expect(result.isValid).toBe(false);
  });
});
