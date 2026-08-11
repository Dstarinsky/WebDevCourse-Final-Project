// Typed application errors carrying the HTTP status they should produce.
//
// Previously every failure — a validation problem, a missing row, someone else's
// playlist — ended in the same `console.error` + redirect, so clients could not tell
// "you typed something wrong" from "that does not exist" from "the server broke",
// and invalid logins returned 200.

class AppError extends Error {
    constructor(message, status = 500, { expose = true, code = null } = {}) {
        super(message);
        this.name = new.target.name;
        this.status = status;
        // Whether this message is safe to show a user. Raw database/library errors
        // are never exposed; they surface as a generic 500.
        this.expose = expose;
        this.code = code;
    }
}

class ValidationError extends AppError {
    constructor(message, { field = null } = {}) {
        super(message, 400, { code: 'VALIDATION' });
        this.field = field;
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Invalid credentials') {
        super(message, 401, { code: 'AUTHENTICATION' });
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'You do not have access to that') {
        super(message, 403, { code: 'AUTHORIZATION' });
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Not found') {
        super(message, 404, { code: 'NOT_FOUND' });
    }
}

class ConflictError extends AppError {
    constructor(message) {
        super(message, 409, { code: 'CONFLICT' });
    }
}

class PayloadTooLargeError extends AppError {
    constructor(message = 'That file is too large') {
        super(message, 413, { code: 'PAYLOAD_TOO_LARGE' });
    }
}

class UnsupportedMediaTypeError extends AppError {
    constructor(message = 'That file type is not supported') {
        super(message, 415, { code: 'UNSUPPORTED_MEDIA_TYPE' });
    }
}

class RateLimitError extends AppError {
    constructor(message = 'Too many requests — please slow down') {
        super(message, 429, { code: 'RATE_LIMITED' });
    }
}

module.exports = {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    PayloadTooLargeError,
    UnsupportedMediaTypeError,
    RateLimitError
};
