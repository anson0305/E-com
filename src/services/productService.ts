import { productRepository } from "../repositories/productRepository.js";
import { categoryService, CategoryNotFoundError } from "./categoryService.js";
import { PaginatedProductResponse, ProductResponse } from "../models/products.js";
import type { CreateProductBody, ListProductsQuery, UpdateProductBody } from '../schemas/productSchemas.js';

export class UnknownProductID extends Error {
    constructor() {
        super("unknown product ID");
        this.name = "UnknownProductID";
    }
}

export class NoSuchProduct extends Error {
    constructor() {
        super("no such product");
        this.name = "NoSuchProduct";
    }
}

export class productOutOfStock extends Error {
    constructor() {
        super("out of stocks");
        this.name = "productOutOfStock";
    }
}

export class ProductService {
    constructor(
        private productRepo = productRepository,
        private categories = categoryService,
    ) {}

    async listAllProduct(): Promise<ProductResponse[]> {
        const rows = await this.productRepo.findall();
        return rows ?? [];
    }

    async listProducts(query: ListProductsQuery): Promise<PaginatedProductResponse> {
        return this.productRepo.findPage(query);
    }

    async findById(id: number): Promise<ProductResponse> {
        const row = await this.productRepo.findByID(id);
        if (row) {
            return row;
        } else {
            throw new UnknownProductID();
        }
    }

    async findByCategory(categoryName: string): Promise<ProductResponse[]> {
        // delegate 俾 categoryService 而唔係直接 query repo
        try {
            const cat = await this.categories.getByName(categoryName);
            // if parent id is null, it means user is choosing the super set 
            // otherwise the user is choosing subset
            if (cat.parent_id == null) {
                let result: ProductResponse[] = [];
                const childCategories = await this.categories.getByParent(cat.id);
                for (const child of childCategories) {
                    const productList = await this.productRepo.findByCategoryId(child.id);
                    if (productList) {
                        for (const product of productList) {
                            result.push(product);
                        }
                    }
                }
                return result;
            } else {
                const productList = await this.productRepo.findByCategoryId(cat.id);
                if (productList) {
                    return productList;
                } else {
                    return [];
                }
            }
        } catch (error) {
            if (error instanceof CategoryNotFoundError) {
                throw new CategoryNotFoundError(categoryName);
            }
            throw error;
        }
    }

    async findByName(name: string) {
        const product = await this.productRepo.findByName(name);
        if (product != null) {
            return product[0];
        } else {
            throw new NoSuchProduct();
        }
    }

    async createProduct(input: CreateProductBody): Promise<ProductResponse> {
        const product = await this.productRepo.create(input);
        return product;
    }

    async updateProduct(id: number, product: UpdateProductBody) {
        const updated = await this.productRepo.update(id, product);
        if (!updated) {
            throw new UnknownProductID();
        }
        return updated;
    }

    async deleteProduct(id: number): Promise<boolean> {
        const deleted = await this.productRepo.deleteById(id);
        if (!deleted) {
            throw new UnknownProductID();
        }
        return true;
    }
}

export const productService = new ProductService();
