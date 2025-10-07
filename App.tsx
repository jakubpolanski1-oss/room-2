import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

type Room = {
  id: string;
  title: string;
  description: string;
  city: string;
  hourly_price_cents: number;
  photos?: { url: string }[];
};

type Booking = {
  id: string;
  roomId: string;
  start: string;
  end: string;
  total_cents: number;
  client_secret?: string;
};

function currencyEUR(cents: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold tracking-tight">Room‑by‑the‑Hour</h1>
      <div className="text-sm text-gray-600">Full‑stack demo with Stripe</div>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={'rounded-2xl shadow-sm border border-gray-200 bg-white ' + className}>{children}</div>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-200">{children}</span>;
}

function RoomCard({ room, onSelect }: { room: Room; onSelect: (r: Room) => void }) {
  return (
    <Card>
      <div className="overflow-hidden rounded-2xl">
        {room.photos?.[0]?.url ? (
          <img src={room.photos[0].url} alt="" className="h-40 w-full object-cover" />
        ) : (
          <div className="h-40 w-full bg-gray-100 grid place-items-center">No photo</div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg truncate mr-2">{room.title}</h3>
          <div className="text-gray-900 font-semibold">{currencyEUR(room.hourly_price_cents)}/hr</div>
        </div>
        <p className="text-gray-600 text-sm mt-1 line-clamp-2">{room.description}</p>
        <div className="mt-2 flex gap-2">
          <Badge>{room.city}</Badge>
        </div>
        <button className="mt-4 w-full rounded-xl bg-black text-white py-2 hover:bg-gray-900" onClick={() => onSelect(room)}>
          Book this room
        </button>
      </div>
    </Card>
  );
}

function PaymentStep({ clientSecret, onDone }: { clientSecret: string; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [msg, setMsg] = useState<string>('');

  async function pay() {
    if (!stripe || !elements) return;
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (error) setMsg(error.message || 'Payment failed');
    else setMsg('Payment confirmed! (Webhook updates booking to confirmed)');
    onDone();
  }

  return (
    <div className="grid gap-3">
      <PaymentElement />
      <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={pay}>
        Pay
      </button>
      {msg && <div className="text-sm text-gray-700">{msg}</div>}
    </div>
  );
}

function BookingPanel({
  room,
  onClose,
  onBooked,
}: {
  room: Room;
  onClose: () => void;
  onBooked: (b: Booking) => void;
}) {
  const [start, setStart] = useState<string>('');
  const [end, setEnd] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  async function getQuote() {
    setError('');
    if (!start || !end) return setError('Pick start and end');
    const body = { roomId: room.id, startISO: new Date(start).toISOString(), endISO: new Date(end).toISOString() };
    const r = await fetch('/api/bookings/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setError(j.error || 'Quote error');
    return j.total_cents as number;
  }

  async function reserve() {
    setError('');
    if (!start || !end) return setError('Pick start and end');
    const body = { roomId: room.id, startISO: new Date(start).toISOString(), endISO: new Date(end).toISOString() };
    const r = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setError(j.error || 'Booking error');
    setClientSecret(j.client_secret);
    onBooked({ id: j.bookingId, roomId: room.id, start: body.startISO, end: body.endISO, total_cents: (await getQuote()) || 0 });
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm grid place-items-center p-4 z-50">
      <Card className="w-full max-w-xl">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Booking</div>
            <div className="font-semibold">{room.title}</div>
          </div>
          <button className="text-gray-500 hover:text-gray-800" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            Start
            <input type="datetime-local" className="border rounded-lg px-3 py-2" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            End
            <input type="datetime-local" className="border rounded-lg px-3 py-2" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl bg-gray-900 text-white" onClick={getQuote}>
              Get quote
            </button>
            <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={reserve}>
              Reserve & create payment
            </button>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {clientSecret && (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentStep clientSecret={clientSecret} onDone={onClose} />
            </Elements>
          )}
          <div className="text-xs text-gray-500">* Overlaps are blocked server‑side using a Postgres exclusion constraint.</div>
        </div>
      </Card>
    </div>
  );
}

function BookingsTable({ rooms, bookings }: { rooms: Room[]; bookings: Booking[] }) {
  const rows = useMemo(() => {
    return bookings
      .slice()
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .map((b) => ({
        id: b.id,
        room: rooms.find((r) => r.id === b.roomId)?.title || b.roomId,
        when: `${new Date(b.start).toLocaleString()} → ${new Date(b.end).toLocaleString()}`,
        price: currencyEUR(b.total_cents),
      }));
  }, [rooms, bookings]);

  if (!rows.length) return (
    <Card className="p-4">
      <div className="text-sm text-gray-600">No bookings yet. Make one!</div>
    </Card>
  );

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left bg-gray-50 border-b border-gray-200">
            <th className="p-3">Room</th>
            <th className="p-3">When</th>
            <th className="p-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0">
              <td className="p-3">{r.room}</td>
              <td className="p-3">{r.when}</td>
              <td className="p-3 font-medium">{r.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selected, setSelected] = useState<Room | null>(null);

  useEffect(() => {
    fetch('/api/rooms').then(r => r.json()).then(setRooms).catch(console.error);
  }, []);

  const onBooked = (b: Booking) => setBookings((arr) => [...arr, b]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <Header />

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Available rooms</h2>
              <div className="text-xs text-gray-500">Seeded via database · city: Dublin</div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {rooms.map((r) => (
                <motion.div key={r.id} layout>
                  <RoomCard room={r} onSelect={setSelected} />
                </motion.div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold">Your bookings (this session)</h2>
            <BookingsTable rooms={rooms} bookings={bookings} />
            <Card className="p-4">
              <div className="text-sm text-gray-600">
                Tip: Try overlapping bookings on the same room — server will block the slot.
              </div>
            </Card>
          </div>
        </div>

        <footer className="pt-4 text-xs text-gray-500">
          This demo connects to a Node + Postgres API with Stripe test payments.
        </footer>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <BookingPanel room={selected} onBooked={onBooked} onClose={() => setSelected(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
