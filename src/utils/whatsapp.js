import { esc, fmtDate, fmtDateTime, inr, nights, today } from '../utils.js';

/**
 * Normalizes phone numbers to standard international format (defaults to India +91).
 * e.g. "9441117278", "094411-17278", "+91 94411 17278" -> "919441117278"
 */
export function cleanPhone(raw, defaultCountry = '91') {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  // If 10 digits (standard Indian mobile), prepend 91
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  // If 11 digits starting with 0, replace 0 with 91
  if (digits.length === 11 && digits.startsWith('0')) return `${defaultCountry}${digits.slice(1)}`;
  // Already has country code
  return digits;
}

/**
 * Builds formatted WhatsApp message for Room Bookings.
 */
export function buildRoomMessage(b, settings, type = 'booking') {
  const propName = settings?.property_name || 'SMC Function Hall & Lodge';
  const tagline = settings?.property_tagline || 'Kalyana Mandapam & AC Rooms';
  const address = settings?.address || 'Next to BOI, K.T. Road, Palasa – Kasibugga';
  const phone = settings?.phone || '94411 17278 / 94410 89616';
  const n = nights(b.check_in, b.check_out);
  const balance = Math.max(0, (Number(b.total) || 0) - (Number(b.paid) || 0));

  if (type === 'check_in') {
    return (
`🏨 *${propName.toUpperCase()}*
_${tagline}_

Dear *${b.guest_name}*,
Welcome! You have successfully *checked in* to *${b.room_name}*.

📌 *Booking ID:* #${b.id}
🛏 *Room:* ${b.room_name}
📅 *Check-in:* ${fmtDate(b.check_in)}
📅 *Check-out:* ${fmtDate(b.check_out)} (${n} night${n === 1 ? '' : 's'})
👥 *Guests:* ${b.guests}

📞 *Front Desk Assistance:* ${phone}
📍 *Address:* ${address}

Have a wonderful and comfortable stay with us!`
    );
  }

  if (type === 'check_out') {
    return (
`🏨 *${propName.toUpperCase()}*
_${tagline}_

Dear *${b.guest_name}*,
Thank you for staying with us! You have successfully *checked out* of *${b.room_name}*.

📌 *Booking ID:* #${b.id}
📅 *Stay Duration:* ${fmtDate(b.check_in)} → ${fmtDate(b.check_out)} (${n} night${n === 1 ? '' : 's'})
💰 *Final Bill Total:* ${inr(b.total)}
💳 *Total Paid:* ${inr(b.paid)}
${balance > 0 ? `⚠️ *Pending Balance:* ${inr(balance)}` : '✨ *Settlement:* Fully Paid (₹0 Due)'}

📍 *Address:* ${address}
📞 *Contact:* ${phone}

We look forward to welcoming you back again soon!`
    );
  }

  // Default: Booking confirmation & payment receipt
  return (
`🏨 *${propName.toUpperCase()}*
_${tagline}_

Dear *${b.guest_name}*,
Your room booking has been *confirmed*!

📌 *Booking Reference:* #${b.id}
🛏 *Room:* ${b.room_name}
📅 *Check-in Date:* ${fmtDate(b.check_in)}
📅 *Check-out Date:* ${fmtDate(b.check_out)}
🌙 *Duration:* ${n} night${n === 1 ? '' : 's'}
👥 *No. of Guests:* ${b.guests}
${b.discount > 0 ? `🏷 *Discount Applied:* ${inr(b.discount)}\n` : ''}💰 *Total Room Fee:* ${inr(b.total)}
💳 *Payment Received:* ${inr(b.paid)} (Full Payment Upfront)
✨ *Balance Due:* ₹0 (Paid in Full)

📍 *Address:* ${address}
📞 *Helpdesk Contact:* ${phone}

Thank you for choosing ${propName}!`
  );
}

/**
 * Builds formatted WhatsApp message for Hall Bookings.
 */
export function buildHallMessage(b, settings, type = 'booking') {
  const propName = settings?.property_name || 'SMC Function Hall (A/C)';
  const bannerName = settings?.banner_name || '';
  const tagline = settings?.property_tagline || 'Kalyana Mandapam & Function Hall';
  const address = settings?.address || 'Next to BOI, K.T. Road, Palasa – Kasibugga';
  const phone = settings?.phone || '94411 17278 / 94410 89616';
  const balance = Math.max(0, (Number(b.total) || 0) - (Number(b.paid) || 0));
  const slotName = b.slot === 'morning' ? 'Morning Slot' : b.slot === 'evening' ? 'Evening Slot' : 'Full Day Slot';

  if (type === 'payment' || type === 'completed') {
    return (
`🏛 *${propName.toUpperCase()}*
${bannerName ? `*Proprietor:* ${bannerName}\n` : ''}_${tagline}_

Dear *${b.customer_name}*,
Here is the settlement receipt for your event on *${fmtDate(b.event_date)}*:

📌 *Booking ID:* #${b.id}
🏛 *Hall:* ${b.hall_name}
🎉 *Event:* ${b.event_type || 'Function'}
📅 *Date & Slot:* ${fmtDate(b.event_date)} (${slotName})

*Bill Breakdown:*
• Base Hall Rent: ${inr(b.rent || b.total)}
${b.power_amount > 0 ? `• Power Bill: ${inr(b.power_amount)} (${b.power_units} units @ ₹${b.power_rate || 15}/unit)\n` : ''}${b.generator_amount > 0 ? `• Generator: ${inr(b.generator_amount)} (${b.generator_hours} hrs @ ${inr(b.generator_rate)}/hr)\n` : ''}--------------------------------
💰 *Final Bill Total:* ${inr(b.total)}
💳 *Amount Received:* ${inr(b.paid)}
${balance > 0 ? `⚠️ *Pending Balance Due:* ${inr(balance)}` : '✨ *Settlement Status:* Fully Paid'}

📍 *Venue Address:* ${address}
📞 *Contact:* ${phone}

Thank you for celebrating with us at ${propName}!`
    );
  }

  // Default: Booking confirmation & Advance payment receipt
  return (
`🏛 *${propName.toUpperCase()}*
${bannerName ? `*Proprietor:* ${bannerName}\n` : ''}_${tagline}_

Dear *${b.customer_name}*,
Your banquet hall booking has been *confirmed*!

📌 *Booking Reference:* #${b.id}
🏛 *Venue:* ${b.hall_name}
🎉 *Event Type:* ${b.event_type || 'Function'}
📅 *Event Date:* ${fmtDate(b.event_date)}
⏰ *Time Slot:* ${slotName}
👥 *Expected Guests:* ${b.guests || '—'}

💵 *Base Hall Rent:* ${inr(b.rent || b.total)}
💳 *Advance Received:* ${inr(b.paid)}
⏳ *Pending Rent Due:* ${inr(balance)}

⚡ *Extra Charges Note:*
Electricity units & Generator hours will be recorded on the event day and added to the final bill.

📍 *Address:* ${address}
📞 *Contact & Enquiries:* ${phone}

Thank you for booking with ${propName}!`
  );
}

/**
 * Builds formatted WhatsApp message for Supply Item Movement / Rental slip.
 */
export function buildSupplyMessage(item, moveOrRental, settings) {
  const propName = settings?.property_name || 'SMC Function Hall & Lodge';
  const phone = settings?.phone || '94411 17278 / 94410 89616';

  if (moveOrRental?.customer_name) {
    const isReturned = moveOrRental.status === 'returned';
    return (
`📦 *${propName.toUpperCase()} - FUNCTION RENTAL VOUCHER*

*Customer / Function:* ${moveOrRental.customer_name}${moveOrRental.event_name ? ` (${moveOrRental.event_name})` : ''}
*Item:* ${item?.name || moveOrRental.supply_name}
*Quantity Rented:* ${moveOrRental.quantity} ${item?.unit || moveOrRental.supply_unit || 'pcs'}
*Rent Rate:* ₹${moveOrRental.rent_rate || 0}/${item?.unit || moveOrRental.supply_unit || 'pcs'} (Total: ₹${moveOrRental.total_rent || 0})
*Rented Date:* ${fmtDate(moveOrRental.rent_date)}
*Expected Return:* ${moveOrRental.expected_return_date ? fmtDate(moveOrRental.expected_return_date) : 'After function'}
*Status:* ${isReturned ? `✅ Returned on ${fmtDate(moveOrRental.return_date)}` : '⏳ Active (With Function)'}
${moveOrRental.damage_notes ? `*Condition Notes:* ${moveOrRental.damage_notes}\n` : ''}${moveOrRental.notes ? `*Notes:* ${moveOrRental.notes}\n` : ''}
📞 Contact: ${phone}
Thank you for choosing ${propName}!`
    );
  }

  const isReceive = moveOrRental?.type === 'in';
  return (
`📦 *${propName.toUpperCase()} - SUPPLY RECEIPT*

*Item:* ${item?.name || moveOrRental?.supply_name || 'Item'} (${item?.category || moveOrRental?.supply_category || 'General'})
*Action:* ${isReceive ? 'Stock Received (Inward)' : 'Stock Issued / Delivered (Outward)'}
*Quantity:* ${Math.abs(moveOrRental?.quantity || 0)} ${item?.unit || moveOrRental?.supply_unit || 'pcs'}
*Current In-Stock Balance:* ${moveOrRental?.balance ?? item?.quantity} ${item?.unit || moveOrRental?.supply_unit || 'pcs'}
${moveOrRental?.note ? `*Note / Purpose:* ${moveOrRental.note}\n` : ''}*Date:* ${fmtDateTime(moveOrRental?.created_at || today())}

📞 Contact: ${phone}`
  );
}

/**
 * Builds formatted WhatsApp message for Bulk Event Package.
 */
export function buildPackageMessage(pkg, settings) {
  const propName = settings?.property_name || 'SMC Function Hall & Lodge';
  const phone = settings?.phone || '94411 17278 / 94410 89616';
  const address = settings?.address || 'Next to BOI, K.T. Road, Palasa – Kasibugga';

  const balance = Math.max(0, (pkg.total_amount || 0) - (pkg.advance_paid || 0));

  let hallSection = '';
  if (pkg.hall) {
    hallSection = `\n🏛️ *Banquet Hall:* ${pkg.hall.hall_name} (${pkg.hall.slot === 'half' ? 'Half Day' : 'Full Day'}) — ${inr(pkg.hall_amount || pkg.hall.rent)}`;
  }

  let roomsSection = '';
  if (pkg.rooms && pkg.rooms.length > 0) {
    roomsSection = `\n\n🛏️ *Reserved Rooms (${pkg.rooms.length} Rooms — Total: ${inr(pkg.rooms_amount)}):*\n` +
      pkg.rooms.map(r => `• ${r.room_number ? `Room ${r.room_number} (${r.room_name})` : r.room_name} (${fmtDate(r.check_in)} → ${fmtDate(r.check_out)}) — ${inr(r.rate)}`).join('\n');
  }

  let suppliesSection = '';
  if (pkg.supplies && pkg.supplies.length > 0) {
    suppliesSection = `\n\n📦 *Catering & Equipment Rentals (${pkg.supplies.length} items — Total: ${inr(pkg.supplies_amount)}):*\n` +
      pkg.supplies.map(s => `• ${s.supply_name}: ${s.quantity} ${s.supply_unit || 'pcs'} @ ₹${s.rent_rate} = ${inr(s.total_rent)}`).join('\n');
  }

  return (
`🏛️ *${propName.toUpperCase()}*
🎉 *ALL-IN-ONE EVENT PACKAGE BOOKING*

👤 *Customer:* ${pkg.customer_name}
📞 *Phone:* ${pkg.phone}
🎊 *Event:* ${pkg.event_type || 'Function'}
📅 *Event Date:* ${fmtDate(pkg.event_date)} (${pkg.slot === 'half' ? 'Half Day' : 'Full Day'})
${hallSection}${roomsSection}${suppliesSection}

━━━━━━━━━━━━━━━━━━━━
💵 *PACKAGE BILLING BREAKDOWN:*
${pkg.hall_amount ? `• Hall Rent: ${inr(pkg.hall_amount)}\n` : ''}${pkg.rooms_amount ? `• Rooms Total: ${inr(pkg.rooms_amount)}\n` : ''}${pkg.supplies_amount ? `• Equipment Rent: ${inr(pkg.supplies_amount)}\n` : ''}⭐ *GRAND TOTAL:* ${inr(pkg.total_amount)}
💳 *Advance Received:* ${inr(pkg.advance_paid)} (${pkg.payment_method || 'Cash'})
⏳ *Balance Due:* ${inr(balance)}
━━━━━━━━━━━━━━━━━━━━

📍 *Address:* ${address}
📞 *Contact & Enquiries:* ${phone}

Thank you for choosing ${propName}!`
  );
}

/**
 * Builds formatted WhatsApp message for Bulk Catering Equipment Rentals.
 */
export function buildBulkRentalMessage(order, settings) {
  const propName = settings?.property_name || 'SMC Function Hall & Lodge';
  const phone = settings?.phone || '94411 17278 / 94410 89616';
  const address = settings?.address || 'Next to BOI, K.T. Road, Palasa – Kasibugga';

  const items = order.items || order.rentals || [];
  const totalRent = Number(order.total_rent || order.total_amount) || 0;
  const advance = Number(order.advance_amount || order.advance_paid) || 0;
  const balance = Math.max(0, totalRent - advance);

  const itemsText = items.map((it, idx) => {
    const name = it.supply_name || it.name;
    const qty = it.quantity;
    const unit = it.supply_unit || it.unit || 'pcs';
    const rate = it.rent_rate;
    const lineTotal = it.total_rent || (qty * rate);
    return `${idx + 1}. *${name}*\n   Qty: ${qty} ${unit} @ ₹${rate}/${unit} = ${inr(lineTotal)}`;
  }).join('\n');

  return (
`📦 *${propName.toUpperCase()}*
🥘 *CATERING EQUIPMENT DISPATCH SLIP*

📄 *Order No:* ${order.rental_group_id || 'RNT-DISPATCH'}
👤 *Customer / In-Charge:* ${order.customer_name}
📞 *Phone:* ${order.phone || 'N/A'}
${order.event_name ? `🎊 *Function / Event:* ${order.event_name}\n` : ''}📅 *Dispatch Date:* ${fmtDate(order.rent_date || today())}
${order.expected_return_date ? `🔄 *Expected Return Date:* ${fmtDate(order.expected_return_date)}\n` : ''}
━━━━━━━━━━━━━━━━━━━━
📋 *RENTED EQUIPMENT ITEMS (${items.length} items):*
${itemsText}
━━━━━━━━━━━━━━━━━━━━
💰 *Total Rental Fee:* ${inr(totalRent)}
💳 *Advance Received:* ${inr(advance)}${order.payment_method ? ` (${order.payment_method})` : ''}
${balance > 0 ? `⏳ *Balance Due on Return:* ${inr(balance)}` : '✨ *Settlement:* Advance Paid in Full'}
━━━━━━━━━━━━━━━━━━━━
${order.notes ? `📝 *Notes:* ${order.notes}\n` : ''}
📍 *Address:* ${address}
📞 *Enquiries / Return Desk:* ${phone}

Thank you for choosing ${propName}!`
  );
}

/**
 * Opens WhatsApp Web or WhatsApp Desktop/Mobile app directly.
 */
export function openWhatsApp(phone, text) {
  const cleaned = cleanPhone(phone);
  const encoded = encodeURIComponent(text);
  const url = cleaned
    ? `https://wa.me/${cleaned}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
