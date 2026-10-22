const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized, forbidden } = require('../errors');

function sign(payload) {
  return jwt.sign(payload, config.jwt.secret, { algorithm: 'HS256', expiresIn: config.jwt.expiresIn });
}

/** requireAuth('customer') / requireAuth('manager', 'rider') */
function requireAuth(...roles) {
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(unauthorized());
    try {
      req.auth = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
    } catch (e) {
      return next(unauthorized(e.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token'));
    }
    if (roles.length && !roles.includes(req.auth.role)) return next(forbidden('This action is not available for your role'));
    next();
  };
}

module.exports = { sign, requireAuth };
