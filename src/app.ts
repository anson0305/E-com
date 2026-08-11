import express, { Router, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import userRouter from './routes/users.js';
import cartRouter from './routes/carts.js';
import productRouter from './routes/products.js';
import categoryRouter from './routes/categories.js';
import paymentRouter from './routes/payments.js';
import { apiLimiter } from './middleware/rateLimit.js';

const app = express();

// --- Global middleware ---
app.use(cors());
app.use(helmet());
app.use(apiLimiter);
// Stripe verifies the exact bytes it sends. This must run before express.json().
app.use('/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use((_req: Request, res: Response, next: NextFunction) => {
    console.log("received request");
    next();
});

// --- Routes ---
app.use('/cart', cartRouter);
app.use('/users', userRouter);
app.use('/products', productRouter);
app.use('/categories', categoryRouter);
app.use('/payments', paymentRouter);


// --- 404 handler ---
app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// --- Global error handler ---
app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.too.large' || err.status === 413) {
        res.status(413).json({ success: false, error: 'Request body is too large' });
        return;
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;
