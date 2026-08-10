import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted by vitest — factory must not reference top-level variables)
// ---------------------------------------------------------------------------

vi.mock('../../../src/repositories/productRepository.js', () => ({
    productRepository: {
        findall: vi.fn(),
        findByID: vi.fn(),
        findByCategoryId: vi.fn(),
        findByName: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteById: vi.fn(),
    },
}));

vi.mock('../../../src/services/categoryService.js', async (importOriginal) => {
    const actual = await importOriginal<
        typeof import('../../../src/services/categoryService.js')
    >();
    return {
        ...actual, // keep CategoryNotFoundError real (needed for instanceof)
        categoryService: {
            getByName: vi.fn(),
            getByParent: vi.fn(),
        },
    };
});

// ---------------------------------------------------------------------------
// Imports (after mocks so vitest resolves mocked versions)
// ---------------------------------------------------------------------------

import type {
    ProductResponse,
    CreateProductInput,
} from '../../../src/models/products.js';
import {
    ProductService,
    UnknownProductID,
    NoSuchProduct,
} from '../../../src/services/productService.js';
import { CategoryNotFoundError, categoryService } from '../../../src/services/categoryService.js';
import { productRepository } from '../../../src/repositories/productRepository.js';

// ---------------------------------------------------------------------------
// Extract typed mock references from the mocked imports
// ---------------------------------------------------------------------------

type MockFn = ReturnType<typeof vi.fn>;

const mockProductRepo = productRepository as unknown as {
    findall: MockFn;
    findByID: MockFn;
    findByCategoryId: MockFn;
    findByName: MockFn;
    create: MockFn;
    update: MockFn;
    deleteById: MockFn;
};

const mockedCategoryService = categoryService as unknown as {
    getByName: MockFn;
    getByParent: MockFn;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<ProductResponse> = {}): ProductResponse {
    return {
        id: 1,
        name: 'Test Product',
        description: 'A test product',
        price: 999,
        stock: 10,
        image_url: null,
        category_id: 1,
        ...overrides,
    };
}

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

describe('ProductService', () => {
    let service: ProductService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new ProductService(mockProductRepo, mockedCategoryService);
    });

    // -- listAllProduct ------------------------------------------------------

    describe('listAllProduct', () => {
        it('returns products when repo returns data', async () => {
            const products = [makeProduct({ id: 1 }), makeProduct({ id: 2 })];
            mockProductRepo.findall.mockResolvedValue(products);

            const result = await service.listAllProduct();

            expect(result).toEqual(products);
        });

        it('returns empty array when repo returns null', async () => {
            mockProductRepo.findall.mockResolvedValue(null);

            const result = await service.listAllProduct();

            expect(result).toEqual([]);
        });
    });

    // -- findById ------------------------------------------------------------

    describe('findById', () => {
        it('returns product when found', async () => {
            const product = makeProduct({ id: 42 });
            mockProductRepo.findByID.mockResolvedValue(product);

            const result = await service.findById(42);

            expect(result).toEqual(product);
            expect(mockProductRepo.findByID).toHaveBeenCalledWith(42);
        });

        it('throws UnknownProductID when product not found', async () => {
            mockProductRepo.findByID.mockResolvedValue(null);

            await expect(service.findById(999)).rejects.toThrow(UnknownProductID);
            expect(mockProductRepo.findByID).toHaveBeenCalledWith(999);
        });
    });

    // -- findByName ----------------------------------------------------------

    describe('findByName', () => {
        it('returns product when found', async () => {
            const product = makeProduct({ id: 10, name: 'Laptop' });
            mockProductRepo.findByName.mockResolvedValue([product]);

            const result = await service.findByName('Laptop');

            expect(result).toEqual(product);
            expect(mockProductRepo.findByName).toHaveBeenCalledWith('Laptop');
        });

        it('throws NoSuchProduct when repo returns null', async () => {
            mockProductRepo.findByName.mockResolvedValue(null);

            await expect(service.findByName('DoesNotExist')).rejects.toThrow(
                NoSuchProduct,
            );
            expect(mockProductRepo.findByName).toHaveBeenCalledWith('DoesNotExist');
        });
    });

    // -- findByCategory ------------------------------------------------------

    describe('findByCategory', () => {
        it('collects products from all child categories when parent_id is null', async () => {
            const parentCat = makeCategory({
                id: 1,
                name: 'Electronics',
                parent_id: null,
            });
            const childCatLaptops = makeCategory({
                id: 2,
                name: 'Laptops',
                parent_id: 1,
            });
            const childCatPhones = makeCategory({
                id: 3,
                name: 'Phones',
                parent_id: 1,
            });
            const laptop = makeProduct({ id: 10, name: 'Laptop', category_id: 2 });
            const phone = makeProduct({ id: 20, name: 'Phone', category_id: 3 });

            mockedCategoryService.getByName.mockResolvedValue(parentCat);
            mockedCategoryService.getByParent.mockResolvedValue([
                childCatLaptops,
                childCatPhones,
            ]);
            mockProductRepo.findByCategoryId.mockImplementation(
                (id: number) => {
                    if (id === 2) return Promise.resolve([laptop]);
                    if (id === 3) return Promise.resolve([phone]);
                    return Promise.resolve(null);
                },
            );

            const result = await service.findByCategory('Electronics');

            expect(result).toEqual([laptop, phone]);
            expect(mockProductRepo.findByCategoryId).toHaveBeenCalledWith(2);
            expect(mockProductRepo.findByCategoryId).toHaveBeenCalledWith(3);
        });

        it('returns products directly when parent_id is set (leaf category)', async () => {
            const leafCat = makeCategory({
                id: 2,
                name: 'Laptops',
                parent_id: 1,
            });
            const laptop = makeProduct({ id: 10, name: 'Laptop', category_id: 2 });

            mockedCategoryService.getByName.mockResolvedValue(leafCat);
            mockProductRepo.findByCategoryId.mockResolvedValue([laptop]);

            const result = await service.findByCategory('Laptops');

            expect(result).toEqual([laptop]);
            expect(mockProductRepo.findByCategoryId).toHaveBeenCalledWith(2);
            expect(mockedCategoryService.getByParent).not.toHaveBeenCalled();
        });

        it('throws CategoryNotFoundError when category does not exist', async () => {
            const error = new CategoryNotFoundError('MissingCat');
            mockedCategoryService.getByName.mockRejectedValue(error);

            await expect(service.findByCategory('MissingCat')).rejects.toThrow(
                CategoryNotFoundError,
            );
        });
    });

    // -- createProduct -------------------------------------------------------

    describe('createProduct', () => {
        it('creates and returns new product', async () => {
            const input: CreateProductInput = {
                name: 'New Product',
                description: 'Fresh off the press',
                price: 1500,
                stock: 20,
                category_id: 1,
            };
            const created = makeProduct({
                id: 99,
                name: 'New Product',
                description: 'Fresh off the press',
                price: 1500,
                stock: 20,
                category_id: 1,
            });

            mockProductRepo.create.mockResolvedValue(created);

            const result = await service.createProduct(input);

            expect(result).toEqual(created);
            expect(mockProductRepo.create).toHaveBeenCalledWith(input);
        });
    });

    // -- updateProduct -------------------------------------------------------

    describe('updateProduct', () => {
        it('returns updated product', async () => {
            const update = { name: 'Updated Name' };
            const updated = makeProduct({ id: 1, name: 'Updated Name' });
            mockProductRepo.update.mockResolvedValue(updated);

            const result = await service.updateProduct(1, update);

            expect(result).toEqual(updated);
            expect(mockProductRepo.update).toHaveBeenCalledWith(1, update);
        });

        it('throws UnknownProductID when repo returns null', async () => {
            mockProductRepo.update.mockResolvedValue(null);

            await expect(
                service.updateProduct(999, { name: 'Nope' }),
            ).rejects.toThrow(UnknownProductID);
            expect(mockProductRepo.update).toHaveBeenCalledWith(999, { name: 'Nope' });
        });
    });

    // -- deleteProduct -------------------------------------------------------

    describe('deleteProduct', () => {
        it('returns true on successful delete', async () => {
            mockProductRepo.deleteById.mockResolvedValue(true);

            const result = await service.deleteProduct(1);

            expect(result).toBe(true);
            expect(mockProductRepo.deleteById).toHaveBeenCalledWith(1);
        });

        it('throws UnknownProductID when delete affected zero rows', async () => {
            mockProductRepo.deleteById.mockResolvedValue(false);

            await expect(service.deleteProduct(999)).rejects.toThrow(
                UnknownProductID,
            );
            expect(mockProductRepo.deleteById).toHaveBeenCalledWith(999);
        });
    });
});
