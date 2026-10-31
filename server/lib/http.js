class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

export const fail = (msg, status = 400) => { throw new HttpError(status, msg); };
export const found = (row, what = 'Record') => row || fail(`${what} not found`, 404);

// Input coercion
export const str = v => (v == null ? '' : String(v).trim());
export const num = (v, d = 0) => { const n = Number(v); return v !== '' && Number.isFinite(n) ? n : d; };
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');
