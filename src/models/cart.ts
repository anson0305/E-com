export interface Cart {
    id: number
    user_id: number
    created_at: Date
    updated_at: Date
}

export interface CartItem {
    id: number
    cart_id: number
    product_id: number
    quantity: number
    created_at: Date
    updated_at: Date
}

export interface CartItemWithProduct {
    id: number;
    cart_id: number;
    product_id: number;
    quantity: number;
    // product fields
    product_name: string;
    product_price: number;
    product_image_url: string | null;
    product_stock: number;
}

export interface AddToCartInput {
    product_id: number;
    quantity: number;
}

export interface UpdateCartItemInput {
    quantity: number;
}

// --- Response types (what we send back) ---

export interface CartItemResponse {
    id: number;
    product_id: number;
    product_name: string;
    product_price: number;
    product_image_url: string | null;
    quantity: number;
    subtotal: number;           // price * quantity，方便 frontend 直接 display
}

export interface CartResponse {
    id: number;
    user_id: number;
    items: CartItemResponse[];
    total: number;              // sum of all subtotals
    created_at: Date;
    updated_at: Date;
}