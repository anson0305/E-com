export interface Product {
    id: number;
    name: string;
    description: string;
    price: number;           // stored in cents
    stock: number;
    image_url: string | null;
    category_id: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface CreateProductInput {
    name: string;
    description: string;
    price: number;
    stock: number;
    image_url?: string;
    category_id: number;
}

export interface UpdateProductInput {
    name?: string;
    description?: string;
    price?: number;
    stock?: number;
    image_url?: string;
    category_id?: number;
    is_active?: boolean;
}

export interface ProductResponse {
    id: number;
    name: string;
    description: string;
    price: number;
    stock: number;
    image_url: string | null;
    category_id: number;
}