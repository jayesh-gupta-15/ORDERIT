const { AppError } = require('../errors');
const config = require('../config');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Translate database constraint failures into friendly API errors.
const DB_ERRORS = {
  ER_DUP_ENTRY: [409, 'That record already exists (duplicate value)'],
  ER_NO_REFERENCED_ROW_2: [400, 'Referenced record does not exist'],
  ER_ROW_IS_REFERENCED_2: [409, 'Record is in use and cannot be removed'],
  ER_CHECK_CONSTRAINT_VIOLATED: [400, 'Value violates a database rule'],
  ER_DATA_TOO_LONG: [400, 'A value is too long'],
};

function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'Route not found', 'NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') err = new AppError(400, 'Malformed JSON body', 'BAD_REQUEST');
  if (err.type === 'entity.too.large') err = new AppError(413, 'Request body too large', 'TOO_LARGE');
  if (!(err instanceof AppError) && DB_ERRORS[err.code]) {
    const [status, message] = DB_ERRORS[err.code];
    err = new AppError(status, message, err.code);
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    error: { code: 'INTERNAL', message: config.isProd ? 'Something went wrong' : String(err.message) },
  });
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
