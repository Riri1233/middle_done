"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const requireAuth = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(header.slice(7), config_1.config.JWT_SECRET);
        req.user = { id: payload.sub, email: payload.email };
        next();
    }
    catch {
        res.status(401).json({ error: 'Token expired or invalid' });
    }
};
exports.requireAuth = requireAuth;
//# sourceMappingURL=auth.js.map