import { fmtDate, fmtDateTime, inr, nights, roomTimes, slotName, slotTime, today } from '../utils.js';

/**
 * WhatsApp messages. Every message has the same layout (the hall name sits at the end):
 *   greeting and message in English
 *   details (booking, dates) and the money: total, paid, balance
 *   the same message in Telugu
 *   hall name, address and phone
 * They are opened in WhatsApp with the text filled in (see openWhatsApp); nothing is sent
 * automatically.
 */

/**
 * Normalizes phone numbers to international format (defaults to India +91).
 * e.g. "9441117278", "094411-17278", "+91 94411 17278" -> "919441117278"
 */
export function cleanPhone(raw, defaultCountry = '91') {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `${defaultCountry}${digits.slice(1)}`;
  return digits;
}

export function openWhatsApp(phone, text) {
  const cleaned = cleanPhone(phone);
  const encoded = encodeURIComponent(text);
  const url = cleaned ? `https://wa.me/${cleaned}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

const LINE = '━━━━━━━━━━━━━━━━';

// When the balance should be paid, in English and Telugu
const WHEN = {
  check_in: ['at check-in', 'చెక్-ఇన్ సమయంలో'],
  check_out: ['before check-out', 'చెక్-అవుట్ లోపు'],
  event: ['before the event', 'కార్యక్రమానికి ముందు'],
  soon: ['at the earliest', 'వీలైనంత త్వరగా'],
  return: ['when the items are returned', 'సామాగ్రి తిరిగి ఇచ్చేటప్పుడు'],
};

function property(settings) {
  return {
    name: settings?.property_name || 'SMC Function Hall (A/C)',
    address: settings?.address || 'Next to BOI, K.T. Road, Palasa – Kasibugga',
    phone: settings?.phone || '94411 17278 / 94410 89616',
  };
}

// "Full day · 7:00 AM to 3:00 AM (next day)"
const timing = (slot, settings) => [slotName(slot), slotTime(slot, settings)].filter(Boolean).join(' · ');
const money = n => Math.max(0, Number(n) || 0);
const lastPayment = payments => (Array.isArray(payments) && payments.length ? payments[payments.length - 1] : null);
const bullets = rows => rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `• ${k}: ${v}`).join('\n');

/**
 * Put a message together. `en` and `te` are the message paragraphs; `details` and `bill` are
 * [label, value] rows shown once between the two languages.
 */
function compose(settings, { name, en, te, detailsTitle = 'Booking details', details = [], bill = [] }) {
  const p = property(settings);
  const parts = [
    `🙏 Namaste *${name}*,`,
    en.filter(Boolean).join('\n\n'),
  ];
  if (details.length) parts.push(`📋 *${detailsTitle}*\n${bullets(details)}`);
  if (bill.length) parts.push(`💰 *Payment*\n${bullets(bill)}`);
  parts.push(LINE, `🙏 నమస్కారం *${name}* గారు,`, te.filter(Boolean).join('\n\n'), LINE, `🏛 *${p.name}*\n📍 ${p.address}\n📞 ${p.phone}`);
  return parts.join('\n\n');
}

/** The money lines and the payment sentences, in both languages. */
function paymentStatus({ total, paid, when }) {
  const balance = money(total - paid);
  const [whenEn, whenTe] = WHEN[when] || WHEN.soon;
  return {
    balance,
    bill: [
      ['Total', inr(total)],
      ['Paid', inr(paid)],
      ['Balance due', balance > 0 ? inr(balance) : '₹0 (fully paid ✅)'],
    ],
    en: balance > 0
      ? `⚠️ *Payment due: ${inr(balance)}*\nKindly pay the balance ${whenEn}.`
      : '✅ Your payment is fully completed. Thank you!',
    te: balance > 0
      ? `⚠️ *చెల్లించవలసిన బకాయి: ${inr(balance)}*\nదయచేసి మిగిలిన మొత్తాన్ని ${whenTe} చెల్లించండి.`
      : '✅ మీ చెల్లింపు పూర్తిగా అయిపోయింది. ధన్యవాదాలు!',
  };
}

/** "Payment received" sentences for the latest payment, or full-payment thanks when nothing is due. */
function paymentReceived(payments, balance) {
  const last = lastPayment(payments);
  if (!last) return { en: 'We have not received a payment for this booking yet.', te: 'ఈ బుకింగ్‌కు ఇంకా ఎలాంటి చెల్లింపు అందలేదు.' };
  const how = `${inr(last.amount)} (${last.method || 'Cash'}, ${fmtDate(last.paid_on)})`;
  return balance > 0
    ? { en: `💳 We have received your payment of *${how}*. Thank you!`, te: `💳 మీ చెల్లింపు *${how}* అందింది. ధన్యవాదాలు!` }
    : {
        en: `🎉 We have received your payment of *${how}*.\nYou have successfully completed the full payment. Thank you!`,
        te: `🎉 మీ చెల్లింపు *${how}* అందింది.\nమీరు పూర్తి చెల్లింపును విజయవంతంగా పూర్తి చేశారు. ధన్యవాదాలు!`,
      };
}

/**
 * Room booking messages.
 * type: 'booking' (greeting / confirmation, or welcome once checked in), 'payment', 'check_out' (thank you)
 */
export function buildRoomMessage(b, settings, type = 'booking') {
  const n = nights(b.check_in, b.check_out);
  const t = roomTimes(settings);
  const checkedIn = b.status === 'checked_in';
  const when = type === 'check_out' ? 'soon' : checkedIn ? 'check_out' : 'check_in';
  const status = paymentStatus({ total: Number(b.total) || 0, paid: Number(b.paid) || 0, when });
  const details = [
    ['Bill No', b.bill_no],
    ['Room', b.room_name],
    ['Check-in', `${fmtDate(b.check_in)}, ${t.checkIn}`],
    ['Check-out', `${fmtDate(b.check_out)}, ${t.checkOut} (${n} night${n === 1 ? '' : 's'})`],
    ['Guests', b.guests],
    ...(b.checked_out_at ? [['Checked out at', fmtDateTime(b.checked_out_at)]] : []),
  ];

  if (type === 'payment') {
    const got = paymentReceived(b.payments, status.balance);
    return compose(settings, {
      name: b.guest_name, details, bill: status.bill,
      en: [got.en, status.balance > 0 && status.en],
      te: [got.te, status.balance > 0 && status.te],
    });
  }

  if (type === 'check_out') {
    return compose(settings, {
      name: b.guest_name, detailsTitle: 'Stay details', details, bill: status.bill,
      en: ['Thank you for staying with us! We hope you had a comfortable stay. Please visit us again. 🙏', status.en],
      te: ['మా వద్ద బస చేసినందుకు ధన్యవాదాలు! మీ బస సౌకర్యంగా గడిచిందని ఆశిస్తున్నాము. దయచేసి మళ్ళీ రండి. 🙏', status.te],
    });
  }

  return compose(settings, {
    name: b.guest_name, details, bill: status.bill,
    en: [
      checkedIn
        ? `Welcome! You have checked in to *${b.room_name}*. We wish you a comfortable stay.`
        : `Thank you for booking with us. Your room booking is *confirmed*.\nCheck-in is from ${t.checkIn} and check-out by ${t.checkOut}.`,
      status.en,
    ],
    te: [
      checkedIn
        ? `స్వాగతం! మీరు *${b.room_name}* లో చెక్-ఇన్ అయ్యారు. మీ బస సౌకర్యంగా ఉండాలని కోరుకుంటున్నాము.`
        : `మాతో బుక్ చేసినందుకు ధన్యవాదాలు. మీ గది బుకింగ్ *నిర్ధారించబడింది*.\nచెక్-ఇన్ ${t.checkIn} నుండి, చెక్-అవుట్ ${t.checkOut} లోపు.`,
      status.te,
    ],
  });
}

/**
 * Hall booking messages.
 * type: 'booking' (greeting / confirmation), 'payment', 'completed' (thank you after the event)
 */
export function buildHallMessage(b, settings, type = 'booking') {
  const event = b.event_type || 'function';
  const status = paymentStatus({ total: Number(b.total) || 0, paid: Number(b.paid) || 0, when: type === 'completed' ? 'soon' : 'event' });
  const details = [
    ['Bill No', b.bill_no],
    ['Hall', b.hall_name],
    ['Event', b.event_type || 'Function'],
    ['Date', fmtDate(b.event_date)],
    ['Timing', timing(b.slot, settings)],
    ...(b.guests ? [['Guests', b.guests]] : []),
  ];
  const bill = [
    // the rent line only when power or generator were added on top of it
    ...(Number(b.power_amount) > 0 || Number(b.generator_amount) > 0 ? [['Hall rent', inr(b.rent || b.total)]] : []),
    ...(Number(b.power_amount) > 0 ? [['Power', `${inr(b.power_amount)} (${b.power_units} units × ₹${b.power_rate || 15})`]] : []),
    ...(Number(b.generator_amount) > 0 ? [['Generator', `${inr(b.generator_amount)} (${b.generator_hours} hrs × ${inr(b.generator_rate)})`]] : []),
    ...status.bill,
  ];

  if (type === 'payment') {
    const got = paymentReceived(b.payments, status.balance);
    return compose(settings, {
      name: b.customer_name, details, bill,
      en: [got.en, status.balance > 0 && status.en],
      te: [got.te, status.balance > 0 && status.te],
    });
  }

  if (type === 'completed') {
    return compose(settings, {
      name: b.customer_name, detailsTitle: 'Event details', details, bill,
      en: [`Thank you for celebrating your ${event} with us! It was our pleasure to host you and your guests. 🙏`, status.en],
      te: ['మీ వేడుకను మాతో జరుపుకున్నందుకు ధన్యవాదాలు! మీకు మరియు మీ అతిథులకు ఆతిథ్యం ఇవ్వడం మాకు ఎంతో సంతోషం. 🙏', status.te],
    });
  }

  return compose(settings, {
    name: b.customer_name, details, bill,
    en: [
      `Thank you for choosing us for your ${event}. Your hall booking is *confirmed*. 🎉`,
      status.en,
      '⚡ Power and generator charges are added to the bill after the event.',
    ],
    te: [
      'మీ వేడుక కోసం మమ్మల్ని ఎంచుకున్నందుకు ధన్యవాదాలు. మీ హాల్ బుకింగ్ *నిర్ధారించబడింది*. 🎉',
      status.te,
      '⚡ విద్యుత్ మరియు జనరేటర్ ఛార్జీలు కార్యక్రమం తర్వాత బిల్లులో చేర్చబడతాయి.',
    ],
  });
}

/**
 * Combo (hall + rooms + supplies on one bill).
 * type: 'booking' (greeting / confirmation) or 'payment'
 */
export function buildPackageMessage(pkg, settings, type = 'booking') {
  const total = Number(pkg.grand_total ?? pkg.total_amount) || 0;
  const balance = money(pkg.balance ?? total - (Number(pkg.advance_paid) || 0));
  const status = paymentStatus({ total, paid: total - balance, when: 'event' });
  const details = [
    ['Bill No', pkg.bill_no],
    ['Event', pkg.event_type || 'Function'],
    ['Date', `${fmtDate(pkg.event_date)} (${timing(pkg.slot, settings)})`],
    ...(pkg.hall ? [['Hall', `${pkg.hall.hall_name} — ${inr(pkg.hall_amount || pkg.hall.rent)}`]] : []),
    ...(pkg.rooms?.length ? [['Rooms', `${pkg.rooms.map(r => r.room_name).join(', ')} — ${inr(pkg.rooms_amount)}`]] : []),
    ...(pkg.supplies?.length ? [['Supplies', `${pkg.supplies.length} item${pkg.supplies.length > 1 ? 's' : ''} — ${inr(pkg.supplies_amount)}`]] : []),
  ];
  const bill = [
    ...(Number(pkg.extras_amount) > 0 ? [['Power & generator', inr(pkg.extras_amount)]] : []),
    ...status.bill,
  ];

  if (type === 'payment') {
    const got = paymentReceived(pkg.payments, status.balance);
    return compose(settings, {
      name: pkg.customer_name, detailsTitle: 'Combo details', details, bill,
      en: [got.en, status.balance > 0 && status.en],
      te: [got.te, status.balance > 0 && status.te],
    });
  }

  return compose(settings, {
    name: pkg.customer_name, detailsTitle: 'Combo details', details, bill,
    en: [`Thank you for choosing us for your ${pkg.event_type || 'function'}. Your combo booking (hall, rooms and supplies on one bill) is *confirmed*. 🎉`, status.en],
    te: ['మీ వేడుక కోసం మమ్మల్ని ఎంచుకున్నందుకు ధన్యవాదాలు. మీ కాంబో బుకింగ్ (హాల్, గదులు మరియు సామాగ్రి ఒకే బిల్లులో) *నిర్ధారించబడింది*. 🎉', status.te],
  });
}

/** A single supply rented to a customer, or (without a customer) a stock in/out slip. */
export function buildSupplyMessage(item, move, settings) {
  const unit = item?.unit || move?.supply_unit || 'pcs';
  const name = item?.name || move?.supply_name || 'Item';

  if (move?.customer_name) {
    const returned = move.status === 'returned';
    const total = Number(move.total_rent) || 0;
    const status = paymentStatus({ total, paid: Math.min(total, Number(move.advance_amount) || 0), when: returned ? 'soon' : 'return' });
    return compose(settings, {
      name: move.customer_name, detailsTitle: 'Rental details',
      details: [
        ['Bill No', move.bill_no],
        ['Item', `${name} × ${move.quantity} ${unit}`],
        ['Rate', `₹${move.rent_rate || 0} per ${unit}`],
        ['Rented on', fmtDate(move.rent_date)],
        ['Return', returned ? `Returned on ${fmtDate(move.return_date)} ✅` : move.expected_return_date ? fmtDate(move.expected_return_date) : 'After the function'],
        ...(move.damage_notes ? [['Condition', move.damage_notes]] : []),
      ],
      bill: status.bill,
      en: [returned ? 'Thank you for returning the items. 🙏' : 'Here are the details of the items you have rented from us.', status.en],
      te: [returned ? 'సామాగ్రిని తిరిగి ఇచ్చినందుకు ధన్యవాదాలు. 🙏' : 'మా వద్ద నుండి మీరు అద్దెకు తీసుకున్న సామాగ్రి వివరాలు ఇవి.', status.te],
    });
  }

  // Stock slip for the team (no customer): English only, same header
  const p = property(settings);
  const isIn = move?.type === 'in';
  return [
    `📦 *Stock ${isIn ? 'received' : 'issued'}*`,
    bullets([
      ['Item', `${name} (${item?.category || move?.supply_category || 'General'})`],
      ['Quantity', `${Math.abs(move?.quantity || 0)} ${unit}`],
      ['In stock now', `${move?.balance ?? item?.quantity} ${unit}`],
      ['Note', move?.note],
      ['Date', fmtDateTime(move?.created_at || today())],
    ]),
    LINE,
    `🏛 *${p.name}*\n📞 ${p.phone}`,
  ].join('\n\n');
}

/** Several supplies rented together on one dispatch slip. */
export function buildBulkRentalMessage(order, settings) {
  const items = order.items || order.rentals || [];
  const total = Number(order.total_rent || order.total_amount) || 0;
  const advance = Number(order.advance_amount || order.advance_paid) || 0;
  const status = paymentStatus({ total, paid: Math.min(total, advance), when: 'return' });
  const list = items.map((it, i) => {
    const unit = it.supply_unit || it.unit || 'pcs';
    return `${i + 1}. ${it.supply_name || it.name} — ${it.quantity} ${unit} × ₹${it.rent_rate} = ${inr(it.total_rent || it.quantity * it.rent_rate)}`;
  }).join('\n');
  return compose(settings, {
    name: order.customer_name, detailsTitle: `Items rented (${items.length})`,
    details: [
      ['Bill No', order.bill_no || order.rentals?.[0]?.bill_no],
      ...(order.event_name ? [['Function', order.event_name]] : []),
      ['Dispatched on', fmtDate(order.rent_date || today())],
      ...(order.expected_return_date ? [['Return by', fmtDate(order.expected_return_date)]] : []),
    ],
    bill: status.bill,
    en: [`Here are the catering items sent for your function:\n${list}`, status.en],
    te: ['మీ వేడుక కోసం పంపిన సామాగ్రి వివరాలు పైన ఇవ్వబడ్డాయి.', status.te],
  });
}

/** Decoration plan sent as a quote: items grouped by area (stage, entrance...) and the total. */
export function buildDecorMessage(plan, settings) {
  const items = plan.items || [];
  const areas = [...new Set(items.map(it => it.area))];
  const list = areas.map(area => {
    const rows = items.filter(it => it.area === area);
    const sub = rows.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const lines = rows.map(it => `   - ${it.name}: ${it.qty} ${it.unit || 'pcs'} × ${inr(it.rate)} = ${inr(it.amount)}`).join('\n');
    return `*${area}* (${inr(sub)})\n${lines}`;
  }).join('\n\n');
  const discount = Number(plan.discount) || 0;
  return compose(settings, {
    name: plan.customer_name, detailsTitle: 'Decoration details',
    details: [
      ['Bill No', plan.bill_no],
      ...(plan.event_name ? [['Function', plan.event_name]] : []),
      ['Event date', fmtDate(plan.event_date)],
      ...(plan.hall_name ? [['Hall', plan.hall_name]] : []),
    ],
    bill: [
      ...(discount > 0 ? [['Items', inr(plan.subtotal)], ['Discount', `- ${inr(discount)}`]] : []),
      ['Decoration total', inr(plan.total)],
    ],
    en: [`Here is the decoration plan for your function:\n\n${list}`, 'Please tell us if you would like to change anything.'],
    te: ['మీ వేడుక కోసం అలంకరణ వివరాలు పైన ఇవ్వబడ్డాయి.', 'ఏమైనా మార్పులు కావాలంటే దయచేసి మాకు తెలియజేయండి.'],
  });
}
