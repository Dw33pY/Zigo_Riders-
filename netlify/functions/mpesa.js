// ═══════════════════════════════════════════════════════════
//  Zigo Riders — Daraja M-Pesa STK Push
//  Netlify Serverless Function
//
//  SETUP:
//  Go to Netlify → Site Settings → Environment Variables and add:
//
//  MPESA_CONSUMER_KEY      → Your Daraja Consumer Key
//  MPESA_CONSUMER_SECRET   → Your Daraja Consumer Secret
//  MPESA_SHORTCODE         → Your Till / Paybill number
//  MPESA_PASSKEY           → Your Lipa Na M-Pesa Online Passkey
//  MPESA_CALLBACK_URL      → https://YOUR-SITE.netlify.app/.netlify/functions/mpesa-callback
//
//  For SANDBOX testing use:
//  MPESA_BASE_URL          → https://sandbox.safaricom.co.ke
//
//  For LIVE / PRODUCTION use:
//  MPESA_BASE_URL          → https://api.safaricom.co.ke
// ═══════════════════════════════════════════════════════════

exports.handler = async (event) => {

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { phone, amount, pickup, dropoff } = body;

  // Validate inputs
  if (!phone || !amount || !pickup || !dropoff) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: phone, amount, pickup, dropoff' }),
    };
  }

  // Pull credentials from Netlify environment variables
  const {
    MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET,
    MPESA_SHORTCODE,
    MPESA_PASSKEY,
    MPESA_CALLBACK_URL,
    MPESA_BASE_URL,
  } = process.env;

  const BASE_URL = MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke';

  // ── STEP 1: Get OAuth token ──
  let accessToken;
  try {
    const credentials = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
    const tokenRes = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token fetch failed — Status:', tokenRes.status, '— Body:', err);
      console.error('BASE_URL used:', BASE_URL);
      console.error('Consumer Key length:', MPESA_CONSUMER_KEY ? MPESA_CONSUMER_KEY.length : 'MISSING');
      console.error('Consumer Secret length:', MPESA_CONSUMER_SECRET ? MPESA_CONSUMER_SECRET.length : 'MISSING');
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'Failed to get M-Pesa access token',
          detail: err,
          status: tokenRes.status,
          debug: {
            baseUrl: BASE_URL,
            keyLength: MPESA_CONSUMER_KEY ? MPESA_CONSUMER_KEY.length : 'MISSING',
            secretLength: MPESA_CONSUMER_SECRET ? MPESA_CONSUMER_SECRET.length : 'MISSING',
            shortcode: MPESA_SHORTCODE || 'MISSING',
          }
        }),
      };
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
  } catch (err) {
    console.error('Token error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Token request failed', detail: err.message }) };
  }

  // ── STEP 2: Build STK Push payload ──
  const now       = new Date();
  const pad       = (n) => String(n).padStart(2, '0');
  const timestamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const password  = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');

  const stkPayload = {
    BusinessShortCode: MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.round(amount),
    PartyA:            phone,
    PartyB:            MPESA_SHORTCODE,
    PhoneNumber:       phone,
    CallBackURL:       MPESA_CALLBACK_URL,
    AccountReference:  'ZigoRiders',
    TransactionDesc:   `Delivery: ${pickup} to ${dropoff}`,
  };

  // ── STEP 3: Send STK Push ──
  try {
    const stkRes = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stkPayload),
    });

    const stkData = await stkRes.json();
    console.log('STK Push response:', stkData);

    // ResponseCode '0' = success
    return {
      statusCode: stkRes.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stkData),
    };

  } catch (err) {
    console.error('STK Push error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'STK Push request failed', detail: err.message }),
    };
  }
};
