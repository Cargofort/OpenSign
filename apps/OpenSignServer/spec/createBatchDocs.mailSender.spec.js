import { resolveDocumentMailSender } from '../cloud/parsefunction/createBatchDocs.js';

describe('resolveDocumentMailSender', () => {
  it('uses explicit SDK sender name for From display and explicit sender mail for Reply-To', () => {
    const document = {
      SenderName: 'Cargofort Sign',
      SenderMail: 'marian.atanasov@cargofort.com',
      ExtUserPtr: {
        Name: 'SDK Admin',
        Email: 'sdk-admin@example.com',
      },
    };

    expect(resolveDocumentMailSender(document)).toEqual({
      senderName: 'Cargofort Sign',
      senderEmail: 'marian.atanasov@cargofort.com',
      from: 'Cargofort Sign',
      replyto: 'marian.atanasov@cargofort.com',
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
});
