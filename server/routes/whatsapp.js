import { Router } from 'express';
import { log } from '../db.js';
import { fail, str } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { getDBSettings } from './settings.js';

const r = Router();
export default r;

/**
 * Normalizes phone numbers to standard international format (defaults to India 91).
 */
export function cleanPhone(raw, defaultCountry = '91') {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `${defaultCountry}${digits.slice(1)}`;
  return digits;
}

r.post('/send', requireAuth, async (req, res) => {
  const phone = cleanPhone(req.body.phone);
  const message = str(req.body.message);
  const kind = str(req.body.kind) || 'notification';
  const recipient = str(req.body.recipient_name) || 'Customer';

  if (!phone || phone.length < 10) fail('A valid mobile number is required');
  if (!message) fail('Message content is required');

  const settings = getDBSettings();
  const enabled = settings.whatsapp_enabled === '1';
  const provider = settings.whatsapp_provider || 'direct';

  // If automated API is configured and enabled
  if (enabled && provider === 'meta' && settings.whatsapp_api_token && settings.whatsapp_phone_number_id) {
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v19.0/${settings.whatsapp_phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.whatsapp_api_token}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'text',
            text: { preview_url: false, body: message },
          }),
        }
      );
      if (!metaRes.ok) {
        const errData = await metaRes.text();
        console.error('Meta WhatsApp API error:', errData);
        fail(`WhatsApp Cloud API error: ${errData}`, 502);
      }
      log(req.user.id, 'whatsapp sent', `${recipient} (${phone}) · via Meta Cloud API`);
      return res.json({ ok: true, provider: 'meta' });
    } catch (err) {
      fail(`Failed to send WhatsApp message via Meta API: ${err.message}`, 502);
    }
  }

  if (enabled && provider === 'twilio' && settings.whatsapp_twilio_sid && settings.whatsapp_twilio_token) {
    try {
      const fromNumber = settings.whatsapp_twilio_from.startsWith('whatsapp:')
        ? settings.whatsapp_twilio_from
        : `whatsapp:${settings.whatsapp_twilio_from}`;
      const toNumber = `whatsapp:+${phone}`;
      const authHeader = Buffer.from(`${settings.whatsapp_twilio_sid}:${settings.whatsapp_twilio_token}`).toString('base64');

      const params = new URLSearchParams();
      params.append('From', fromNumber);
      params.append('To', toNumber);
      params.append('Body', message);

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${settings.whatsapp_twilio_sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${authHeader}`,
          },
          body: params.toString(),
        }
      );
      if (!twilioRes.ok) {
        const errData = await twilioRes.text();
        console.error('Twilio WhatsApp API error:', errData);
        fail(`Twilio API error: ${errData}`, 502);
      }
      log(req.user.id, 'whatsapp sent', `${recipient} (${phone}) · via Twilio WhatsApp`);
      return res.json({ ok: true, provider: 'twilio' });
    } catch (err) {
      fail(`Failed to send WhatsApp message via Twilio: ${err.message}`, 502);
    }
  }

  if (enabled && provider === 'webhook' && settings.whatsapp_webhook_url) {
    try {
      const hookRes = await fetch(settings.whatsapp_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message, kind, recipient }),
      });
      if (!hookRes.ok) {
        const errData = await hookRes.text();
        fail(`Webhook error: ${errData}`, 502);
      }
      log(req.user.id, 'whatsapp sent', `${recipient} (${phone}) · via Webhook`);
      return res.json({ ok: true, provider: 'webhook' });
    } catch (err) {
      fail(`Failed to send WhatsApp message via Webhook: ${err.message}`, 502);
    }
  }

  // Default: Direct WhatsApp link (wa.me)
  const encoded = encodeURIComponent(message);
  const wa_link = `https://wa.me/${phone}?text=${encoded}`;
  log(req.user.id, 'whatsapp link created', `${recipient} (${phone})`);
  res.json({ ok: true, direct: true, wa_link });
});

r.post('/test', requireAuth, async (req, res) => {
  const phone = cleanPhone(req.body.phone);
  if (!phone || phone.length < 10) fail('Enter a valid mobile number for test');

  const settings = getDBSettings();
  const testMessage = `🏨 *SMC FUNCTION HALL & LODGE*\nTest notification from your booking system bot.\nEverything is set up correctly!\nTime: ${new Date().toLocaleTimeString('en-IN')}`;

  const enabled = settings.whatsapp_enabled === '1';
  const provider = settings.whatsapp_provider || 'direct';

  if (enabled && provider === 'meta' && settings.whatsapp_api_token && settings.whatsapp_phone_number_id) {
    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${settings.whatsapp_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.whatsapp_api_token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: testMessage },
        }),
      }
    );
    if (!metaRes.ok) {
      const err = await metaRes.text();
      fail(`Meta API Error: ${err}`, 502);
    }
    return res.json({ ok: true, message: 'Test message sent successfully via Meta WhatsApp API' });
  }

  res.json({
    ok: true,
    direct: true,
    message: 'Direct WhatsApp link ready',
    wa_link: `https://wa.me/${phone}?text=${encodeURIComponent(testMessage)}`,
  });
});
