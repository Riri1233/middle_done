"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        res.status(400).json({ error: 'Validation error', details: errors });
        return;
    }
    req.body = result.data;
    next();
};
exports.validate = validate;
//# sourceMappingURL=validate.js.map