const { z } = require('zod');
const { badRequest } = require('./errors');

const id = z.coerce.number().int().positive();

/** Normalises Indian-style phone numbers so "9876543210" and "+919876543210" are the same person. */
function normalizePhone(raw) {
  const s = String(raw).replace(/[\s-]/g, '');
  if (/^\d{10}$/.test(s)) return '+91' + s;
  if (/^91\d{10}$/.test(s)) return '+' + s;
  return s;
}
const phone = z.string().trim()
  .refine(v => /^\+?\d{10,15}$/.test(v.replace(/[\s-]/g, '')), 'Phone must be 10 to 15 digits')
  .transform(normalizePhone);

const email = z.string().trim().toLowerCase().email('Enter a valid email').max(255);
const name = z.string().trim().min(2, 'Name is too short').max(100);

function parse(schema, data) {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const details = r.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
  const first = details[0];
  throw badRequest(first ? `${first.field ? first.field + ': ' : ''}${first.message}` : 'Invalid input', details);
}

module.exports = { z, id, phone, email, name, parse, normalizePhone };
