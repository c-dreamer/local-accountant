import { isValidBaseURL } from './server-config';

describe('isValidBaseURL', () => {
  test('accepts HTTP and HTTPS server URLs', () => {
    expect(isValidBaseURL('http://localhost:5006')).toBe(true);
    expect(isValidBaseURL('https://budget.example')).toBe(true);
  });

  test('rejects app and other non-HTTP schemes', () => {
    expect(isValidBaseURL('app://actual')).toBe(false);
    expect(isValidBaseURL('file:///tmp/server')).toBe(false);
    expect(isValidBaseURL('ftp://budget.example')).toBe(false);
  });

  test('rejects malformed URLs', () => {
    expect(isValidBaseURL('http://')).toBe(false);
    expect(isValidBaseURL('not a URL')).toBe(false);
  });
});
