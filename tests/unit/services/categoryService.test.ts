import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted by vitest — must appear before any static import)
// ---------------------------------------------------------------------------

const mockCategoryRepo = vi.hoisted(() => ({
    findAll: vi.fn(),
    findById: vi.fn(),
    findByParent: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
}));

vi.mock('../../../src/repositories/categoryRepository.js', () => ({
    categoryRepository: mockCategoryRepo,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks so vitest resolves mocked versions)
// ---------------------------------------------------------------------------

import {
    CategoryService,
    CategoryNotFoundError,
    CategoryParentError,
} from '../../../src/services/categoryService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCategory(
    overrides: Partial<{ id: number; name: string; parent_id: number | null }> = {},
) {
    return {
        id: 1,
        name: 'Electronics',
        parent_id: null,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CategoryService', () => {
    let service: CategoryService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new CategoryService(mockCategoryRepo);
    });

    // -- listAll -------------------------------------------------------------

    describe('listAll', () => {
        it('returns categories when repo returns data', async () => {
            const categories = [
                makeCategory({ id: 1, name: 'Electronics' }),
                makeCategory({ id: 2, name: 'Books' }),
            ];
            mockCategoryRepo.findAll.mockResolvedValue(categories);

            const result = await service.listAll();

            expect(result).toEqual(categories);
            expect(mockCategoryRepo.findAll).toHaveBeenCalled();
        });
    });

    // -- getById -------------------------------------------------------------

    describe('getById', () => {
        it('returns category when found', async () => {
            const category = makeCategory({ id: 5, name: 'Music' });
            mockCategoryRepo.findById.mockResolvedValue(category);

            const result = await service.getById(5);

            expect(result).toEqual(category);
            expect(mockCategoryRepo.findById).toHaveBeenCalledWith(5);
        });

        it('throws CategoryNotFoundError when not found', async () => {
            mockCategoryRepo.findById.mockResolvedValue(null);

            await expect(service.getById(999)).rejects.toThrow(CategoryNotFoundError);
            expect(mockCategoryRepo.findById).toHaveBeenCalledWith(999);
        });
    });

    // -- getByName -----------------------------------------------------------

    describe('getByName', () => {
        it('returns category when found', async () => {
            const category = makeCategory({ id: 3, name: 'Books' });
            mockCategoryRepo.findByName.mockResolvedValue(category);

            const result = await service.getByName('Books');

            expect(result).toEqual(category);
            expect(mockCategoryRepo.findByName).toHaveBeenCalledWith('Books');
        });

        it('throws CategoryNotFoundError when not found', async () => {
            mockCategoryRepo.findByName.mockResolvedValue(null);

            await expect(service.getByName('GhostCategory')).rejects.toThrow(
                CategoryNotFoundError,
            );
            expect(mockCategoryRepo.findByName).toHaveBeenCalledWith('GhostCategory');
        });
    });

    // -- getByParent ---------------------------------------------------------

    describe('getByParent', () => {
        it('returns child categories when found', async () => {
            const children = [
                makeCategory({ id: 2, name: 'Laptops', parent_id: 1 }),
                makeCategory({ id: 3, name: 'Phones', parent_id: 1 }),
            ];
            mockCategoryRepo.findByParent.mockResolvedValue(children);

            const result = await service.getByParent(1);

            expect(result).toEqual(children);
            expect(mockCategoryRepo.findByParent).toHaveBeenCalledWith(1);
        });

        it('throws CategoryParentError when null/empty', async () => {
            mockCategoryRepo.findByParent.mockResolvedValue(null);

            await expect(service.getByParent(999)).rejects.toThrow(
                CategoryParentError,
            );
            expect(mockCategoryRepo.findByParent).toHaveBeenCalledWith(999);
        });
    });

    // -- create --------------------------------------------------------------

    describe('create', () => {
        it('creates a new category when no duplicate and no parent_id', async () => {
            mockCategoryRepo.findByName.mockResolvedValue(null);
            const created = makeCategory({ id: 10, name: 'NewCat', parent_id: null });
            mockCategoryRepo.create.mockResolvedValue(created);

            const result = await service.create('NewCat');

            expect(result).toEqual(created);
            expect(mockCategoryRepo.findByName).toHaveBeenCalledWith('NewCat');
            expect(mockCategoryRepo.create).toHaveBeenCalledWith('NewCat', undefined);
        });

        it('creates with parent_id and validates parent exists', async () => {
            mockCategoryRepo.findByName.mockResolvedValue(null);
            const parent = makeCategory({ id: 1, name: 'Electronics', parent_id: null });
            mockCategoryRepo.findById.mockResolvedValue(parent);
            const created = makeCategory({ id: 11, name: 'Laptops', parent_id: 1 });
            mockCategoryRepo.create.mockResolvedValue(created);

            const result = await service.create('Laptops', 1);

            expect(result).toEqual(created);
            expect(mockCategoryRepo.findById).toHaveBeenCalledWith(1);
            expect(mockCategoryRepo.create).toHaveBeenCalledWith('Laptops', 1);
        });

        it('throws Error when name already exists', async () => {
            const existing = makeCategory({ id: 1, name: 'Electronics' });
            mockCategoryRepo.findByName.mockResolvedValue(existing);

            await expect(service.create('Electronics')).rejects.toThrow(
                'Category "Electronics" already exists',
            );
            expect(mockCategoryRepo.create).not.toHaveBeenCalled();
        });

        it('throws CategoryNotFoundError when parent_id does not exist', async () => {
            mockCategoryRepo.findByName.mockResolvedValue(null);
            mockCategoryRepo.findById.mockResolvedValue(null);

            await expect(service.create('Orphan', 999)).rejects.toThrow(
                CategoryNotFoundError,
            );
            expect(mockCategoryRepo.create).not.toHaveBeenCalled();
        });
    });
});
