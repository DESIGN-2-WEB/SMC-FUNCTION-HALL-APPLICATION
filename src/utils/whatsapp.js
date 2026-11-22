import { fmtDate, fmtDateTime, generatorText, inr, nights, roomTimes, slotName, slotTime, today } from '../utils.js';

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
const timing = (slot, settings, hall) => [slotName(slot), slotTime(slot, settings, hall)].filter(Boolean).join(' · ');
const money = n => Math.max(0, Number(n) || 0);
const bullets = rows => rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `• ${k}: ${v}`).join('\n');
// An open area (rooftop, parking, ground) is a "Venue"; an indoor hall is a "Hall"
const venueWord = kind => (kind === 'area' ? 'Venue' : 'Hall');

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

/** Total, paid and balance rows. */
function amounts(total, paid) {
  const balance = money(total - paid);
  return [
    ['Total', inr(total)],
    ['Paid', inr(Math.min(total, money(paid)))],
    ['Balance', balance > 0 ? inr(balance) : '₹0 (fully paid ✅)'],
  ];
}

/**
 * The payment message: a polite reminder while money is due, and a "payment completed" note
 * once everything is paid. Opening it again after a payment shows the updated message.
 */
function paymentNote(total, paid, when) {
  const balance = money(total - paid);
  const [whenEn, whenTe] = WHEN[when] || WHEN.soon;
  return balance > 0
    ? {
        en: `This is a gentle reminder that *${inr(balance)}* is still due for your booking.\nKindly pay the remaining amount ${whenEn}. Thank you!`,
        te: `మీ బుకింగ్‌కు *${inr(balance)}* ఇంకా చెల్లించవలసి ఉందని గుర్తు చేస్తున్నాము.\nదయచేసి మిగిలిన మొత్తాన్ని ${whenTe} చెల్లించండి. ధన్యవాదాలు!`,
      }
    : {
        en: `✅ We have received your full payment of *${inr(total)}*. Your payment is complete. Thank you!`,
        te: `✅ మీ పూర్తి చెల్లింపు *${inr(total)}* అందింది. మీ చెల్లింపు పూర్తయింది. ధన్యవాదాలు!`,
      };
}

/**
 * The messages that fit a booking right now, in order. Greeting while it is booked; the payment
 * message whenever there is an amount (a reminder while due, "payment completed" once paid);
 * the thank-you only after the event is over or the guest has checked out. A cancelled booking
 * has none.
 */
export function messageTypes(kind, b) {
  if (!b) return [];
  const make = ({ cancelled, over, total, paid, payable = true }) => {
    if (cancelled) return [];
    const due = money(total - paid) > 0;
    return [
      ...(over ? [] : [{ value: 'booking', label: 'Greeting' }]),
      ...(payable && Number(total) > 0 ? [{ value: 'payment', label: due ? 'Payment reminder' : 'Payment completed' }] : []),
      ...(over ? [{ value: 'thank_you', label: 'Thank you' }] : []),
    ];
  };
  if (kind === 'room') {
    return make({ cancelled: b.status === 'cancelled', over: b.status === 'checked_out', total: Number(b.total) || 0, paid: Number(b.paid) || 0 });
  }
  if (kind === 'hall') {
    return make({ cancelled: b.status === 'cancelled', over: b.status === 'completed', total: Number(b.total) || 0, paid: Number(b.paid) || 0 });
  }
  if (kind === 'package') {
    const total = Number(b.grand_total ?? b.total_amount) || 0;
    const rooms = (b.rooms || []).filter(r => r.status !== 'cancelled');
    // Over when its hall's event is completed; a combo without a hall, when every room has checked out
    const over = b.hall ? b.hall.status === 'completed' : rooms.length > 0 && rooms.every(r => r.status === 'checked_out');
    return make({ cancelled: b.status === 'cancelled' || b.hall?.status === 'cancelled', over, total, paid: total - money(b.balance ?? total) });
  }
  if (kind === 'band') {
    const types = make({
      cancelled: b.status === 'cancelled', over: b.status === 'done', total: Number(b.amount) || 0, paid: Number(b.paid) || 0,
      payable: !b.package_id, // paid on the hall's combined bill
    });
    return b.status === 'cancelled' ? [] : [...types, { value: 'band_team', label: 'Timing to sannai team' }];
  }
  return [];
}

/**
 * Room booking messages.
 * type: 'booking' (greeting, or welcome once checked in), 'payment', 'thank_you' (after check-out)
 */
export function buildRoomMessage(b, settings, type = 'booking') {
  const n = nights(b.check_in, b.check_out);
  const t = roomTimes(settings, b);
  const checkedIn = b.status === 'checked_in';
  const total = Number(b.total) || 0;
  const paid = Number(b.paid) || 0;
  const roomDisc = Number(b.discount) || 0;
  const bill = [...(roomDisc > 0 ? [['Room rent', inr(total + roomDisc)], ['Discount', `- ${inr(roomDisc)}`]] : []), ...amounts(total, paid)];
  const details = [
    ['Room', b.room_name],
    ['Check-in', `${fmtDate(b.check_in)}, ${t.checkIn}`],
    ['Check-out', `${fmtDate(b.check_out)}, ${t.checkOut} (${n} night${n === 1 ? '' : 's'})`],
    ...(Number(b.guests) ? [['Guests', b.guests]] : []),
  ];

  if (type === 'payment') {
    const note = paymentNote(total, paid, checkedIn ? 'check_out' : b.status === 'checked_out' ? 'soon' : 'check_in');
    return compose(settings, { name: b.guest_name, details, bill, en: [note.en], te: [note.te] });
  }

  if (type === 'thank_you') {
    return compose(settings, {
      name: b.guest_name, detailsTitle: 'Your stay', details,
      en: ['Thank you for staying with us! We hope you had a comfortable stay. We look forward to welcoming you again. 🙏'],
      te: ['మా వద్ద బస చేసినందుకు ధన్యవాదాలు! మీ బస సౌకర్యంగా గడిచిందని ఆశిస్తున్నాము. మళ్ళీ మిమ్మల్ని స్వాగతించడానికి ఎదురుచూస్తున్నాము. 🙏'],
    });
  }

  return compose(settings, {
    name: b.guest_name, details, bill,
    en: [checkedIn
      ? `Welcome! You have checked in to *${b.room_name}*. We wish you a comfortable stay.`
      : `Thank you for booking with us. Your room booking is *confirmed*.\nCheck-in is from ${t.checkIn} and check-out by ${t.checkOut}.`],
    te: [checkedIn
      ? `స్వాగతం! మీరు *${b.room_name}* లో చెక్-ఇన్ అయ్యారు. మీ బస సౌకర్యంగా ఉండాలని కోరుకుంటున్నాము.`
      : `మాతో బుక్ చేసినందుకు ధన్యవాదాలు. మీ గది బుకింగ్ *నిర్ధారించబడింది*.\nచెక్-ఇన్ ${t.checkIn} నుండి, చెక్-అవుట్ ${t.checkOut} లోపు.`],
  });
}

// Said on a hall's greeting until the meter reading is on the bill (indoor halls only)
const POWER_NOTE = {
  en: '⚡ Electricity charges, as per the meter reading, are added to the bill after the event.',
  te: '⚡ మీటర్ రీడింగ్ ప్రకారం విద్యుత్ ఛార్జీలు కార్యక్రమం తర్వాత బిల్లులో చేర్చబడతాయి.',
};

/**
 * Hall (or open area) booking messages.
 * type: 'booking' (greeting), 'payment', 'thank_you' (after the event)
 */
export function buildHallMessage(b, settings, type = 'booking') {
  const event = b.event_type || 'function';
  const total = Number(b.total) || 0;
  const paid = Number(b.paid) || 0;
  const details = [
    [venueWord(b.hall_kind), b.hall_name],
    ['Event', b.event_type || 'Function'],
    ['Date', fmtDate(b.event_date)],
    ['Timing', timing(b.slot, settings, b)],
    ...(Number(b.guests) ? [['Guests', b.guests]] : []),
  ];
  const hallDisc = Number(b.discount) || 0;
  const bill = [
    // with a discount: the hall price and the discount; otherwise the rent line only when power
    // or generator were added on top of it
    ...(hallDisc > 0
      ? [[`${venueWord(b.hall_kind)} rent`, inr((Number(b.rent) || 0) + hallDisc)], ['Discount', `- ${inr(hallDisc)}`]]
      : Number(b.power_amount) > 0 || Number(b.generator_amount) > 0 ? [[`${venueWord(b.hall_kind)} rent`, inr(b.rent || b.total)]] : []),
    ...(Number(b.power_amount) > 0 ? [['Electricity', `${inr(b.power_amount)} (${b.power_units} units × ₹${b.power_rate || 15})`]] : []),
    ...(Number(b.generator_amount) > 0 ? [['Generator', `${inr(b.generator_amount)} (${generatorText(b)})`]] : []),
    ...amounts(total, paid),
  ];

  if (type === 'payment') {
    const note = paymentNote(total, paid, b.status === 'completed' ? 'soon' : 'event');
    return compose(settings, { name: b.customer_name, details, bill, en: [note.en], te: [note.te] });
  }

  if (type === 'thank_you') {
    return compose(settings, {
      name: b.customer_name, detailsTitle: 'Your event', details: details.filter(([k]) => k !== 'Timing'),
      en: [`Thank you for celebrating your ${event} with us at *${b.hall_name}*! It was our pleasure to host you and your guests. We look forward to serving you again. 🙏`],
      te: [`మీ వేడుకను *${b.hall_name}* లో మాతో జరుపుకున్నందుకు ధన్యవాదాలు! మీకు మరియు మీ అతిథులకు ఆతిథ్యం ఇవ్వడం మాకు ఎంతో సంతోషం. మళ్ళీ మీకు సేవ చేయడానికి ఎదురుచూస్తున్నాము. 🙏`],
    });
  }

  const powerNote = b.hall_kind !== 'area' && !(Number(b.power_amount) > 0);
  const tentative = b.status === 'tentative';
  return compose(settings, {
    name: b.customer_name, details, bill,
    en: [
      tentative
        ? `Thank you for choosing *${b.hall_name}* for your ${event}. We have noted your booking and will confirm it shortly.`
        : `Thank you for booking *${b.hall_name}* for your ${event}. Your booking is *confirmed*. 🎉`,
      powerNote && POWER_NOTE.en,
    ],
    te: [
      tentative
        ? `మీ వేడుక కోసం *${b.hall_name}* ను ఎంచుకున్నందుకు ధన్యవాదాలు. మీ బుకింగ్‌ను నమోదు చేసుకున్నాము, త్వరలో నిర్ధారిస్తాము.`
        : `మీ వేడుక కోసం *${b.hall_name}* ను బుక్ చేసినందుకు ధన్యవాదాలు. మీ బుకింగ్ *నిర్ధారించబడింది*. 🎉`,
      powerNote && POWER_NOTE.te,
    ],
  });
}

/**
 * One bill holding a hall and the customer's add-ons. Only what the customer actually booked is
 * named: a hall with rooms mentions the hall and the rooms, and nothing else.
 * type: 'booking' (greeting), 'payment', 'thank_you' (after the event)
 */
export function buildPackageMessage(pkg, settings, type = 'booking') {
  const total = Number(pkg.grand_total ?? pkg.total_amount) || 0;
  const balance = money(pkg.balance ?? total - (Number(pkg.advance_paid) || 0));
  const paid = total - balance;
  const event = pkg.event_type || 'function';
  const hall = pkg.hall && pkg.hall.status !== 'cancelled' ? pkg.hall : null;
  const rooms = (pkg.rooms || []).filter(r => r.status !== 'cancelled');
  const supplies = pkg.supplies || [];
  const decor = (pkg.decor || []).filter(p => p.status !== 'cancelled');
  const band = (pkg.band || []).filter(b => b.status !== 'cancelled');

  const roomsTotal = rooms.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const firstIn = rooms.map(r => r.check_in).sort()[0];
  const lastOut = rooms.map(r => r.check_out).sort().pop();
  const decorAreas = [...new Set(decor.flatMap(p => (p.items || []).map(i => i.area)).filter(Boolean))];
  const decorTotal = decor.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const bandTotal = band.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const bandTimes = band.map(b => b.timing).filter(Boolean).join(', ');

  // What was booked: one line each, only for the things on this bill (prices left out of the thank-you)
  const booked = withPrice => {
    const price = n => (withPrice ? ` — ${inr(n)}` : '');
    return [
      ...(hall ? [[venueWord(hall.hall_kind), `${hall.hall_name}${price(pkg.hall_amount || hall.rent)}`]] : []),
      ...(rooms.length ? [[rooms.length > 1 ? `Rooms (${rooms.length})` : 'Room',
        `${rooms.map(r => r.room_name).join(', ')} · ${fmtDate(firstIn)} to ${fmtDate(lastOut)}${price(roomsTotal)}`]] : []),
      ...(supplies.length ? [['Supplies', `${supplies.length} item${supplies.length > 1 ? 's' : ''}${price(pkg.supplies_amount)}`]] : []),
      ...(decor.length ? [['Decoration', `${decorAreas.join(', ') || 'As planned'}${price(decorTotal)}`]] : []),
      ...(band.length ? [['Sannai Melam', `${bandTimes || 'Booked'}${price(bandTotal)}`]] : []),
    ];
  };
  const head = [
    ['Event', pkg.event_type || 'Function'],
    ['Date', fmtDate(pkg.event_date)],
    ...(hall ? [['Timing', timing(pkg.slot, settings, hall)]] : []),
  ];
  const details = [...head, ...booked(true)];
  const power = hall ? Number(hall.power_amount) || 0 : 0;
  const generator = hall ? Number(hall.generator_amount) || 0 : 0;
  const bill = [
    ...(power > 0 ? [['Electricity', inr(power)]] : []),
    ...(generator > 0 ? [['Generator', inr(generator)]] : []),
    ...amounts(total, paid),
  ];

  if (type === 'payment') {
    const note = paymentNote(total, paid, hall?.status === 'completed' ? 'soon' : 'event');
    return compose(settings, { name: pkg.customer_name, details, bill, en: [note.en], te: [note.te] });
  }

  if (type === 'thank_you') {
    return compose(settings, {
      name: pkg.customer_name, detailsTitle: 'Your event',
      details: [...head.filter(([k]) => k !== 'Timing'), ...booked(false)],
      en: [`Thank you for celebrating your ${event} with us! It was our pleasure to host you and your guests. We look forward to serving you again. 🙏`],
      te: ['మీ వేడుకను మాతో జరుపుకున్నందుకు ధన్యవాదాలు! మీకు మరియు మీ అతిథులకు ఆతిథ్యం ఇవ్వడం మాకు ఎంతో సంతోషం. మళ్ళీ మీకు సేవ చేయడానికి ఎదురుచూస్తున్నాము. 🙏'],
    });
  }

  const powerNote = hall && hall.hall_kind !== 'area' && !(power > 0);
  return compose(settings, {
    name: pkg.customer_name, details, bill,
    en: [`Thank you for booking with us for your ${event}. Your booking is *confirmed*. 🎉`, powerNote && POWER_NOTE.en],
    te: ['మీ వేడుక కోసం మాతో బుక్ చేసినందుకు ధన్యవాదాలు. మీ బుకింగ్ *నిర్ధారించబడింది*. 🎉', powerNote && POWER_NOTE.te],
  });
}

/** One line about the balance on a rental slip, only while something is due. */
function dueLine(total, paid, when) {
  const balance = money(total - paid);
  if (!(balance > 0)) return { en: '', te: '' };
  const [whenEn, whenTe] = WHEN[when] || WHEN.soon;
  return {
    en: `Kindly pay the balance of *${inr(balance)}* ${whenEn}.`,
    te: `దయచేసి మిగిలిన *${inr(balance)}* ను ${whenTe} చెల్లించండి.`,
  };
}

/** A single supply rented to a customer, or (without a customer) a stock in/out slip. */
export function buildSupplyMessage(item, move, settings) {
  const unit = item?.unit || move?.supply_unit || 'pcs';
  const name = item?.name || move?.supply_name || 'Item';

  if (move?.customer_name) {
    const returned = move.status === 'returned';
    const total = Number(move.total_rent) || 0;
    const paid = Math.min(total, Number(move.advance_amount) || 0);
    const due = dueLine(total, paid, returned ? 'soon' : 'return');
    return compose(settings, {
      name: move.customer_name, detailsTitle: 'Rental details',
      details: [
        ['Item', `${name} × ${move.quantity} ${unit}`],
        ['Rate', `₹${move.rent_rate || 0} per ${unit}`],
        ['Rented on', fmtDate(move.rent_date)],
        ['Return', returned ? `Returned on ${fmtDate(move.return_date)} ✅` : move.expected_return_date ? fmtDate(move.expected_return_date) : 'After the function'],
        ...(move.damage_notes ? [['Condition', move.damage_notes]] : []),
      ],
      bill: amounts(total, paid),
      en: [returned ? 'Thank you for returning the items. 🙏' : 'Here are the details of the items you have rented from us.', due.en],
      te: [returned ? 'సామాగ్రిని తిరిగి ఇచ్చినందుకు ధన్యవాదాలు. 🙏' : 'మా వద్ద నుండి మీరు అద్దెకు తీసుకున్న సామాగ్రి వివరాలు ఇవి.', due.te],
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
  const advance = Math.min(total, Number(order.advance_amount || order.advance_paid) || 0);
  const due = dueLine(total, advance, 'return');
  const list = items.map((it, i) => {
    const unit = it.supply_unit || it.unit || 'pcs';
    return `${i + 1}. ${it.supply_name || it.name} — ${it.quantity} ${unit} × ₹${it.rent_rate} = ${inr(it.quantity * it.rent_rate)}`;
  }).join('\n');
  const discount = items.reduce((s, it) => s + (Number(it.discount) || 0), 0);
  return compose(settings, {
    name: order.customer_name, detailsTitle: `Items rented (${items.length})`,
    details: [
      ...(order.event_name ? [['Function', order.event_name]] : []),
      ['Dispatched on', fmtDate(order.rent_date || today())],
      ...(order.expected_return_date ? [['Return by', fmtDate(order.expected_return_date)]] : []),
    ],
    bill: [
      ...(discount > 0 ? [['Items', inr(total + discount)], ['Discount (full set)', `- ${inr(discount)}`]] : []),
      ...(discount < 0 ? [['Items', inr(total + discount)], ['Full set price', inr(total)]] : []),
      ...amounts(total, advance),
    ],
    en: [`Here are the items sent for your function:\n${list}`, due.en],
    te: ['మీ వేడుక కోసం పంపిన సామాగ్రి వివరాలు పైన ఇవ్వబడ్డాయి.', due.te],
  });
}

/** Decoration plan sent as a quote: items grouped by area (stage, entrance...) and the total. */
export function buildDecorMessage(plan, settings) {
  const items = plan.items || [];
  const areas = [...new Set(items.map(it => it.area))];
  const list = areas.map(area => {
    const rows = items.filter(it => it.area === area);
    const sub = rows.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const lines = rows.map(it => (Number(it.qty) === 1
      ? `   - ${it.name}: ${inr(it.amount)}`
      : `   - ${it.name}: ${it.qty} × ${inr(it.rate)} = ${inr(it.amount)}`)).join('\n');
    return `*${area}* (${inr(sub)})\n${lines}`;
  }).join('\n\n');
  const discount = Number(plan.discount) || 0;
  return compose(settings, {
    name: plan.customer_name, detailsTitle: 'Decoration details',
    details: [
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

/**
 * Sannai Melam booked for an event (a performance, not an item).
 * type: 'booking' (greeting), 'payment', 'thank_you' (after the programme)
 */
export function buildBandMessage(b, settings, type = 'booking') {
  const total = Number(b.amount) || 0;
  const paid = Number(b.paid) || 0;
  // On a hall's combined bill its money is shown and paid there
  const onHallBill = !!b.package_id;
  const details = [
    ['Event date', fmtDate(b.event_date)],
    ...(b.timing ? [['Timing', b.timing]] : []),
    ...(Number(b.players) ? [['Players', b.players]] : []),
    ...(b.hall_name ? [['Venue', b.hall_name]] : []),
  ];
  const bill = onHallBill ? [] : amounts(total, paid);

  if (type === 'payment') {
    const note = paymentNote(total, paid, b.status === 'done' ? 'soon' : 'event');
    return compose(settings, { name: b.customer_name, detailsTitle: 'Sannai Melam details', details, bill, en: [note.en], te: [note.te] });
  }

  if (type === 'thank_you') {
    return compose(settings, {
      name: b.customer_name, detailsTitle: 'Sannai Melam details', details,
      en: ['Thank you for choosing our Sannai Melam for your function! We hope you and your guests enjoyed it. 🙏'],
      te: ['మీ వేడుకకు మా సన్నాయి మేళాన్ని ఎంచుకున్నందుకు ధన్యవాదాలు! మీకు మరియు మీ అతిథులకు నచ్చిందని ఆశిస్తున్నాము. 🙏'],
    });
  }

  return compose(settings, {
    name: b.customer_name, detailsTitle: 'Sannai Melam details', details, bill,
    en: ['Thank you for booking our Sannai Melam. Your booking is *confirmed*. 🎺', onHallBill && 'Its amount is included in your hall bill.'],
    te: ['మా సన్నాయి మేళాన్ని బుక్ చేసినందుకు ధన్యవాదాలు. మీ బుకింగ్ *నిర్ధారించబడింది*. 🎺', onHallBill && 'దీని మొత్తం మీ హాల్ బిల్లులో చేర్చబడింది.'],
  });
}

/** Sent to the sannai team: when and where to perform, and their own amount (never the customer's price). */
export function buildBandTeamMessage(b, settings) {
  return compose(settings, {
    name: b.team || 'Sannai team', detailsTitle: 'Programme details',
    details: [
      ['Function', [b.hall_event_type, b.customer_name].filter(Boolean).join(' · ') || b.customer_name],
      ['Date', fmtDate(b.event_date)],
      ['Programme timing', b.timing || 'To be confirmed'],
      ...(b.hall_name ? [['Venue', b.hall_name]] : []),
      ...(Number(b.players) ? [['Players', b.players]] : []),
      ...(Number(b.team_amount) > 0 ? [['Your amount', inr(b.team_amount)]] : []),
      ...(b.phone ? [['Customer phone', b.phone]] : []),
      ...(b.notes ? [['Notes', b.notes]] : []),
    ],
    en: ['Here is your Sannai Melam programme. Please reach the venue before the programme timing. 🎺'],
    te: ['మీ సన్నాయి మేళం కార్యక్రమం వివరాలు పైన ఉన్నాయి. దయచేసి కార్యక్రమ సమయానికి ముందే వేదిక వద్దకు చేరుకోండి. 🎺'],
  });
}
