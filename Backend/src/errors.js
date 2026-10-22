class AppError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details;
  }
}
const badRequest = (m, d) => new AppError(400, m, 'BAD_REQUEST', d);
const unauthorized = m => new AppError(401, m || 'Authentication required', 'UNAUTHORIZED');
const forbidden = m => new AppError(403, m || 'Not allowed', 'FORBIDDEN');
const notFound = m => new AppError(404, m || 'Not found', 'NOT_FOUND');
const conflict = (m, d) => new AppError(409, m, 'CONFLICT', d);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
