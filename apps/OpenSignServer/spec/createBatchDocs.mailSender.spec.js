import { resolveDocumentMailSender } from '../cloud/parsefunction/createBatchDocs.js';

describe('resolveDocumentMailSender', () => {
  it('uses explicit SDK sender name for From display and explicit sender mail for Reply-To', () => {
    const document = {
      SenderName: 'Cargofort Sign',
      SenderMail: 'no-reply@example.com',
      ExtUserPtr: {
        Name: 'SDK Admin',
        Email: 'sdk-admin@example.com',
      },
    };

    expect(resolveDocumentMailSender(document)).toEqual({
      senderName: 'Cargofort Sign',
      senderEmail: 'no-reply@example.com',
      from: 'Cargofort Sign',
      replyto: 'no-reply@example.com',
    });
  });

  it('keeps existing email display behavior when no explicit sender name is set', () => {
    const document = {
      ExtUserPtr: {
        Name: 'Regular User',
        Email: 'regular@example.com',
      },
    };

    expect(resolveDocumentMailSender(document)).toEqual({
      senderName: 'Regular User',
      senderEmail: 'regular@example.com',
      from: 'regular@example.com',
      replyto: 'regular@example.com',
    });
  });

  it('uses external user name as From display when requested and no explicit sender name is set', () => {
    const document = {
      ExtUserPtr: {
        Name: 'Regular User',
        Email: 'regular@example.com',
        UseNameAsSender: true,
      },
    };

    expect(resolveDocumentMailSender(document)).toEqual({
      senderName: 'Regular User',
      senderEmail: 'regular@example.com',
      from: 'Regular User',
      replyto: 'regular@example.com',
    });
  });

  it('falls back to explicit sender mail when external user is absent', () => {
    const document = {
      SenderMail: 'no-reply@example.com',
    };

    expect(resolveDocumentMailSender(document)).toEqual({
      senderName: undefined,
      senderEmail: 'no-reply@example.com',
      from: 'no-reply@example.com',
      replyto: 'no-reply@example.com',
    });
  });
});
