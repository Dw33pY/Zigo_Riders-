// ═══════════════════════════════════════════════════════════
//  Zigo Riders — M-Pesa Payment Callback
//  Netlify Serverless Function
//
//  Safaricom calls this URL after the customer completes
//  or cancels the M-Pesa payment.
//
//  You can extend this to:
//  - Save confirmed payments to a database
//  - Send a WhatsApp confirmation message
//  - Update an order status dashboard
// ═══════════════════════════════════════════════════════════

exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let callback;
  try {
    callback = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const result = callback?.Body?.stkCallback;

  if (!result) {
    return { statusCode: 400, body: 'Invalid callback structure' };
  }

  const { ResultCode, ResultDesc, CallbackMetadata } = result;

  if (ResultCode === 0) {
    // ✅ PAYMENT SUCCESSFUL
    const items   = CallbackMetadata?.Item || [];
    const get     = (name) => items.find(i => i.Name === name)?.Value;

    const amount      = get('Amount');
    const receipt     = get('MpesaReceiptNumber');
    const phone       = get('PhoneNumber');
    const paidAt      = get('TransactionDate');

    console.log('✅ PAYMENT CONFIRMED:', { amount, receipt, phone, paidAt });

    // TODO: Save to database, send WhatsApp notification, etc.

  } else {
    // ❌ PAYMENT FAILED OR CANCELLED
    console.log('❌ Payment failed/cancelled:', ResultDesc);
  }

  // Always respond with 200 to acknowledge receipt
  return {
    statusCode: 200,
    body: JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
  };
};
