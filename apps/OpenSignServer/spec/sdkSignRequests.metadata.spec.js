// Unit tests for the metadata validation logic.
// These test the pure helper in isolation — Parse is initialized by spec/helper.js.

import { validateMetadata } from '../cloud/parsefunction/sdkSignRequests.js';

describe('validateMetadata', () => {
  it('returns undefined when metadata is undefined (omitted)', () => {
    expect(validateMetadata(undefined)).toBeUndefined();
  });

  it('returns the object when metadata is a plain object', () => {
    const m = { crm_id: 'XYZ', crm_company_id: 'ZYS' };
    expect(validateMetadata(m)).toEqual(m);
  });

  it('returns the object when metadata is an empty object', () => {
    expect(validateMetadata({})).toEqual({});
  });

  it('throws Parse.Error 400 when metadata is null', () => {
    expect(() => validateMetadata(null)).toThrowMatching(
      err => err instanceof Parse.Error && err.code === 400
    );
  });

  it('throws Parse.Error 400 when metadata is an array', () => {
    expect(() => validateMetadata(['a', 'b'])).toThrowMatching(
      err => err instanceof Parse.Error && err.code === 400
    );
  });

  it('throws Parse.Error 400 when metadata is a string', () => {
    expect(() => validateMetadata('hello')).toThrowMatching(
      err => err instanceof Parse.Error && err.code === 400
    );
  });

  it('throws Parse.Error 400 when metadata is a number', () => {
    expect(() => validateMetadata(42)).toThrowMatching(
      err => err instanceof Parse.Error && err.code === 400
    );
  });

  it('throws Parse.Error 400 when metadata is a boolean', () => {
    expect(() => validateMetadata(true)).toThrowMatching(
      err => err instanceof Parse.Error && err.code === 400
    );
  });
});
