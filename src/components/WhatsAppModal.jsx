import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, Send, Smartphone } from 'lucide-react';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';
import { Badge, Button, Field, Input, Modal, Segmented, useUI } from './ui.jsx';
import { buildBulkRentalMessage, buildHallMessage, buildPackageMessage, buildRoomMessage, buildSupplyMessage, cleanPhone, openWhatsApp } from '../utils/whatsapp.js';

export function WhatsAppIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.477-.15-.678.15-.2.301-.778.978-.954 1.179-.176.2-.351.226-.652.075-.301-.15-1.272-.469-2.423-1.496-.896-.799-1.501-1.786-1.677-2.087-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.15-.176.2-.301.301-.502.101-.2.05-.376-.025-.527-.075-.15-.678-1.635-.929-2.239-.244-.589-.493-.509-.678-.519l-.578-.01c-.2 0-.527.075-.803.376s-1.054 1.029-1.054 2.509 1.079 2.91 1.229 3.111c.15.201 2.123 3.242 5.143 4.547.718.31 1.279.496 1.716.635.722.23 1.379.197 1.9.119.58-.088 1.78-.727 2.031-1.43.251-.703.251-1.305.176-1.43-.075-.126-.276-.201-.577-.351zM12.04 2C6.51 2 2.02 6.49 2.02 12.02c0 1.98.58 3.86 1.68 5.47L2 22l4.67-1.64c1.55 1.02 3.37 1.58 5.37 1.58 5.53 0 10.02-4.49 10.02-10.02S17.57 2 12.04 2zm0 18.24c-1.75 0-3.39-.56-4.75-1.52l-.34-.24-2.77.97.99-2.7-.26-.37a8.21 8.21 0 0 1-1.32-4.36c0-4.55 3.7-8.24 8.25-8.24 4.55 0 8.25 3.69 8.25 8.24 0 4.55-3.7 8.22-8.25 8.22z"/>
    </svg>
  );
}

export default function WhatsAppModal({ kind, booking, supplyItem, supplyMove, onClose }) {
  const { settings } = useSettings();
  const { toast } = useUI();
  const isRoom = kind === 'room';
  const isHall = kind === 'hall';
  const isSupply = kind === 'supply';
  const isPackage = kind === 'package';
  const isBulkRental = kind === 'bulk_rental';

  // Templates options based on booking kind
  const templates = isRoom
    ? [
        { value: 'booking', label: 'Booking & Payment' },
        { value: 'check_in', label: 'Check-in Welcome' },
        { value: 'check_out', label: 'Check-out Statement' },
      ]
    : isHall
    ? [
        { value: 'booking', label: 'Booking Confirmation' },
        { value: 'payment', label: 'Payment Receipt' },
        { value: 'completed', label: 'Final Settlement' },
      ]
    : isPackage
    ? [{ value: 'booking', label: 'Event Package Voucher' }]
    : isBulkRental
    ? [{ value: 'rental', label: 'Catering Dispatch Slip' }]
    : [{ value: 'supply', label: 'Supply Receipt' }];

  const [template, setTemplate] = useState('booking');
  const [phone, setPhone] = useState(() => (isSupply ? '' : booking?.phone || ''));
  const [sendingApi, setSendingApi] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate message based on selected template
  const text = isBulkRental
    ? buildBulkRentalMessage(booking, settings)
    : isPackage
    ? buildPackageMessage(booking, settings)
    : isRoom
    ? buildRoomMessage(booking, settings, template)
    : isHall
    ? buildHallMessage(booking, settings, template)
    : buildSupplyMessage(supplyItem, supplyMove, settings);

  const cleanedNumber = cleanPhone(phone);
  const isValidNumber = cleanedNumber.length >= 10;

  const handleDirectWhatsApp = () => {
    if (!phone.trim()) {
      return toast('Please enter a phone number', 'error');
    }
    openWhatsApp(phone, text);
    toast('Opening WhatsApp with pre-filled receipt…');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast('Receipt text copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy to clipboard', 'error');
    }
  };

  const handleApiSend = async () => {
    if (!isValidNumber) return toast('Please enter a valid mobile number', 'error');
    setSendingApi(true);
    try {
      const res = await api('/whatsapp/send', {
        method: 'POST',
        body: {
          phone: cleanedNumber,
          message: text,
          kind: isRoom ? 'room' : isHall ? 'hall' : 'supply',
          booking_id: booking?.id,
          recipient_name: isRoom ? booking?.guest_name : isHall ? booking?.customer_name : undefined,
        },
      });
      if (res.direct) {
        openWhatsApp(phone, text);
        toast('Opened in WhatsApp');
      } else {
        toast('Message sent via WhatsApp Bot!');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSendingApi(false);
    }
  };

  return (
    <Modal
      size="md"
      title="Share Receipt on WhatsApp"
      subtitle={`Send formatted receipt & confirmation to ${isRoom ? booking?.guest_name : isHall ? booking?.customer_name : 'Customer'}`}
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
          <Button type="button" variant="outline" size="sm" icon={copied ? Check : Copy} onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy text'}
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              size="sm"
              icon={WhatsAppIcon}
              onClick={handleDirectWhatsApp}
              className="bg-[#25D366] text-white hover:bg-[#20ba59] shadow-sm shadow-[#25D366]/30 font-semibold"
            >
              Send on WhatsApp
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Recipient Phone and Template Selector */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Recipient WhatsApp Number" hint={isValidNumber ? `Sending to +${cleanedNumber}` : 'Enter 10-digit mobile number'}>
            <div className="relative">
              <Smartphone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <Input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. 94411 17278"
                className="pl-8.5 font-medium"
              />
            </div>
          </Field>

          {templates.length > 1 && (
            <Field label="Message Type">
              <Segmented
                value={template}
                onChange={setTemplate}
                options={templates}
                className="w-full text-xs"
              />
            </Field>
          )}
        </div>

        {/* WhatsApp Chat Preview Card */}
        <div className="rounded-2xl border border-stone-200 bg-[#E5DDD5] p-3.5 relative overflow-hidden shadow-inner">
          <div className="mb-2 flex items-center justify-between border-b border-stone-300/60 pb-1.5 text-[11px] text-stone-600 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              WhatsApp Message Preview
            </span>
            <span className="text-stone-500">Auto-formatted</span>
          </div>

          <div className="rounded-xl bg-[#DCF8C6] p-3 text-xs leading-relaxed text-ink-950 font-sans shadow-sm whitespace-pre-wrap max-h-72 overflow-y-auto border border-emerald-200">
            {text}
            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-stone-500">
              <span>Just now</span>
              <span className="text-emerald-700 font-bold">✓✓</span>
            </div>
          </div>
        </div>

        {/* Automated WhatsApp Bot Option */}
        {settings.whatsapp_enabled === '1' && settings.whatsapp_provider && settings.whatsapp_provider !== 'direct' && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs">
            <div>
              <p className="font-semibold text-emerald-950">Automated WhatsApp Bot Active</p>
              <p className="text-emerald-700">Provider: {settings.whatsapp_provider.toUpperCase()}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Send}
              loading={sendingApi}
              onClick={handleApiSend}
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
            >
              Send via Bot API
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
