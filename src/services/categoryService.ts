import { categoryRepository } from '../repositories/categoryRepository.js';

export class CategoryNotFoundError extends Error {
    constructor(idOrName: string | number) {
        super(`Category "${idOrName}" not found`);
        this.name = 'CategoryNotFoundError';
    }
}

export class CategoryParentError extends Error {
    constructor() {
        super('parent id is wrong or invalid');
        this.name = 'CategoryParentError';
    }
}

export class CategoryService {
    constructor(private repo = categoryRepository) {}

    async listAll() {
        return this.repo.findAll();
    }

    async getById(id: number) {
        const cat = await this.repo.findById(id);
        if (!cat) throw new CategoryNotFoundError(id);
        return cat;
    }

    async getByParent(id: number) {
        const cat = await this.repo.findByParent(id);
        if (cat) {
            return cat;
        } else {
            throw new CategoryParentError();
        }
    }

    async getByName(name: string) {
        const cat = await this.repo.findByName(name);
        if (!cat) throw new CategoryNotFoundError(name);
        return cat;
    }

    async create(name: string, parentId?: number) {
        // business logic：check duplicate、validate parent exists, etc.
        const existing = await this.repo.findByName(name);
        if (existing) throw new Error(`Category "${name}" already exists`);

        if (parentId) {
            await this.getById(parentId); // throw if parent not found
        }

        return this.repo.create(name, parentId);
    }
}

export const categoryService = new CategoryService();