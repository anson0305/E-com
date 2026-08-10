import { mockReq, mockRes } from '../../setup';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the category service module, keeping real error classes for instanceof checks
vi.mock('../../../src/services/categoryService.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/services/categoryService.js')
  >('../../../src/services/categoryService.js');
  return {
    CategoryNotFoundError: actual.CategoryNotFoundError,
    CategoryParentError: actual.CategoryParentError,
    categoryService: {
      listAll: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
    },
  };
});

import {
  CategoryNotFoundError,
  CategoryParentError,
  categoryService,
} from '../../../src/services/categoryService.js';
import {
  listCategories,
  getCategory,
  createCategory,
} from '../../../src/controllers/categoryController.js';

// Typed accessors for the mocked service methods
const mockListAll = categoryService.listAll as ReturnType<typeof vi.fn>;
const mockGetById = categoryService.getById as ReturnType<typeof vi.fn>;
const mockCreate = categoryService.create as ReturnType<typeof vi.fn>;

describe('categoryController', () => {
  let req: ReturnType<typeof mockReq>;
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    vi.clearAllMocks();
    req = mockReq();
    res = mockRes();
  });

  // ------------------------------------------------------------------
  // listCategories
  // ------------------------------------------------------------------
  describe('listCategories', () => {
    it('returns 200 with category list', async () => {
      const categories = [
        { id: 1, name: 'Electronics', parent_id: null },
        { id: 2, name: 'Books', parent_id: null },
      ];
      mockListAll.mockResolvedValue(categories);

      await listCategories(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: categories,
      });
    });
  });

  // ------------------------------------------------------------------
  // getCategory
  // ------------------------------------------------------------------
  describe('getCategory', () => {
    it('returns 200 with category data', async () => {
      const category = { id: 1, name: 'Electronics', parent_id: null };
      mockGetById.mockResolvedValue(category);
      req = mockReq({ params: { id: '1' } });

      await getCategory(req, res);

      expect(mockGetById).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: category,
      });
    });

    it('returns 400 when id is invalid (NaN)', async () => {
      req = mockReq({ params: { id: 'abc' } });

      await getCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'valid category id is required',
      });
      expect(mockGetById).not.toHaveBeenCalled();
    });

    it('returns 404 when CategoryNotFoundError is thrown', async () => {
      mockGetById.mockRejectedValue(new CategoryNotFoundError(99));
      req = mockReq({ params: { id: '99' } });

      await getCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category "99" not found',
      });
    });
  });

  // ------------------------------------------------------------------
  // createCategory
  // ------------------------------------------------------------------
  describe('createCategory', () => {
    it('returns 201 with new category (name only, no parent_id)', async () => {
      const newCategory = { id: 3, name: 'Clothing', parent_id: null };
      mockCreate.mockResolvedValue(newCategory);
      req = mockReq({ body: { name: 'Clothing' } });

      await createCategory(req, res);

      expect(mockCreate).toHaveBeenCalledWith('Clothing', undefined);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: newCategory,
      });
    });

    it('returns 201 with parent_id', async () => {
      const newCategory = { id: 4, name: 'Laptops', parent_id: 1 };
      mockCreate.mockResolvedValue(newCategory);
      req = mockReq({ body: { name: 'Laptops', parent_id: 1 } });

      await createCategory(req, res);

      expect(mockCreate).toHaveBeenCalledWith('Laptops', 1);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: newCategory,
      });
    });

    it('returns 400 when name is missing', async () => {
      req = mockReq({ body: {} });

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'name is required',
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('returns 400 when CategoryParentError is thrown', async () => {
      mockCreate.mockRejectedValue(new CategoryParentError());
      req = mockReq({ body: { name: 'Test', parent_id: 999 } });

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'parent id is wrong or invalid',
      });
    });

    it('returns 409 when category name already exists', async () => {
      mockCreate.mockRejectedValue(
        new Error('Category "Electronics" already exists'),
      );
      req = mockReq({ body: { name: 'Electronics' } });

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category "Electronics" already exists',
      });
    });
  });
});
