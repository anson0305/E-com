export interface Category {
    id: number;
    name: string;
    parent_id: number | null;
    created_at: Date;
}

export interface CategoryResponse {
    id: number;
    name: string;
    parent_id: number | null;
}
