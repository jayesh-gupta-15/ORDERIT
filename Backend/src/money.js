// Money is handled in integer paise so totals match MySQL's per-line ROUND(..., 2).
const toPaise = rupees => Math.round(Number(rupees) * 100);
const toRupees = paise => paise / 100;

/** GST for one cart line, rounded to the paisa exactly like the order_totals view. */
function lineAmounts(quantity, unitPrice, gstRate) {
  const subtotal = quantity * toPaise(unitPrice);
  const gst = Math.round((subtotal * toPaise(gstRate)) / 10000);
  return { subtotal, gst, total: subtotal + gst };
}

module.exports = { toPaise, toRupees, lineAmounts };
