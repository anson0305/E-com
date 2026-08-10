import express, { Router, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import userRouter from './routes/users.js';
import cartRouter from './routes/carts.js';
import productRouter from './routes/products.js';
import categoryRouter from './routes/categories.js';

const app = express();

// --- Global middleware ---
app.use(cors());
app.use(express.json());
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


// --- 404 handler ---
app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// --- Global error handler ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;