// Unit tests for the metadata validation logic.
// These test the pure helper in isolation — Parse is initialized by spec/helpers/parseInit.js.

import {
  resolveSdkSignRequestSender,
  validateMetadata,
} from '../cloud/parsefunction/sdkSignRequests.js';

describe('validateMetadata', () => {
  it('returns undefined when metadata is undefined (omitted)', () => {
    expect(validateMetadata(undefined)).toBeUndefined();
  });

  it('returns the object when metadata is a plain object', () => {
    const m = { id: 'XYZ', company_id: 'ZYS' };
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

describe('resolveSdkSignRequestSender', () => {
  const originalName = process.env.SDK_SIGN_REQUEST_FROM_NAME;
  const originalReplyTo = process.env.SDK_SIGN_REQUEST_REPLY_TO;

  afterEach(() => {
    if (originalName === undefined) {
      delete process.env.SDK_SIGN_REQUEST_FROM_NAME;
    } else {
      process.env.SDK_SIGN_REQUEST_FROM_NAME = originalName;
    }

    if (originalReplyTo === undefined) {
      delete process.env.SDK_SIGN_REQUEST_REPLY_TO;
    } else {
      process.env.SDK_SIGN_REQUEST_REPLY_TO = originalReplyTo;
    }
  });

  it('uses Cargofort SDK defaults when env vars are missing', () => {
    delete process.env.SDK_SIGN_REQUEST_FROM_NAME;
    delete process.env.SDK_SIGN_REQUEST_REPLY_TO;

    expect(resolveSdkSignRequestSender()).toEqual({
      SenderName: 'Cargofort Sign',
      SenderMail: 'no-reply@your-domain.example',
    });
  });

  it('uses Cargofort SDK defaults when env vars are blank', () => {
    process.env.SDK_SIGN_REQUEST_FROM_NAME = '   ';
    process.env.SDK_SIGN_REQUEST_REPLY_TO = '   ';

    expect(resolveSdkSignRequestSender()).toEqual({
      SenderName: 'Cargofort Sign',
      SenderMail: 'no-reply@your-domain.example',
    });
  });

  it('uses SDK sender env vars when configured', () => {
    process.env.SDK_SIGN_REQUEST_FROM_NAME = 'Custom SDK Sender';
    process.env.SDK_SIGN_REQUEST_REPLY_TO = 'custom@example.com';

    expect(resolveSdkSignRequestSender()).toEqual({
      SenderName: 'Custom SDK Sender',
      SenderMail: 'custom@example.com',
    });
  });
});
