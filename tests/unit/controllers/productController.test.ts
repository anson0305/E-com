import { mockReq, mockRes } from '../../setup.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock productService (instance + error classes)
// ---------------------------------------------------------------------------
vi.mock('../../../src/services/productService.js', () => ({
  productService: {
    findById: vi.fn(),
    findByCategory: vi.fn(),
    findByName: vi.fn(),
    listAllProduct: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
  },
  UnknownProductID: class UnknownProductID extends Error {
    constructor() {
      super('unknown product ID');
      this.name = 'UnknownProductID';
    }
  },
  NoSuchProduct: class NoSuchProduct extends Error {
    constructor() {
      super('no such product');
      this.name = 'NoSuchProduct';
    }
  },
}));

// ---------------------------------------------------------------------------
// Mock categoryService (error class only — the controller imports it directly)
// ---------------------------------------------------------------------------
vi.mock('../../../src/services/categoryService.js', () => ({
  CategoryNotFoundError: class CategoryNotFoundError extends Error {
    constructor(idOrName?: string | number) {
      super(`Category "${idOrName}" not found`);
      this.name = 'CategoryNotFoundError';
    }
  },
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks so they resolve the mocked modules)
// ---------------------------------------------------------------------------
import {
  searchProduct,
  findAllProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  QueryIsMissing,
} from '../../../src/controllers/productController.js';
import { productService, UnknownProductID, NoSuchProduct } from '../../../src/services/productService.js';
import { CategoryNotFoundError } from '../../../src/services/categoryService.js';

// Narrow the mocked service so we can use mockResolvedValue etc.
const svc = vi.mocked(productService);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sampleProduct = {
  id: 1,
  name: 'Widget',
  description: 'A fine widget',
  price: 9.99,
  stock: 100,
  image_url: null,
  category_id: 5,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('productController', () => {
  let req: ReturnType<typeof mockReq>;
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    vi.clearAllMocks();
    req = mockReq();
    res = mockRes();
  });

  // ========================================================================
  // searchProduct
  // ========================================================================
  describe('searchProduct', () => {
    it('200 by id (req.query.id)', async () => {
      req.query = { id: '1' };
      svc.findById.mockResolvedValue(sampleProduct);

      await searchProduct(req, res);

      expect(svc.findById).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: sampleProduct });
    });

    it('200 by category (req.query.category)', async () => {
      req.query = { category: 'Electronics' };
      const products = [sampleProduct];
      svc.findByCategory.mockResolvedValue(products);

      await searchProduct(req, res);

      expect(svc.findByCategory).toHaveBeenCalledWith('Electronics');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: products });
    });

    it('200 by name (req.query.name)', async () => {
      req.query = { name: 'Widget' };
      svc.findByName.mockResolvedValue(sampleProduct);

      await searchProduct(req, res);

      expect(svc.findByName).toHaveBeenCalledWith('Widget');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: sampleProduct });
    });

    it('400 when no query params (throws QueryIsMissing)', async () => {
      // req.query is {} by default
      await searchProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'no query parameter is provided',
      });
    });

    it('404 when UnknownProductID thrown', async () => {
      req.query = { id: '999' };
      svc.findById.mockRejectedValue(new UnknownProductID());

      await searchProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'unknown product ID',
      });
    });

    it('404 when NoSuchProduct thrown', async () => {
      req.query = { name: 'NonExistent' };
      svc.findByName.mockRejectedValue(new NoSuchProduct());

      await searchProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'no such product',
      });
    });

    it('404 when CategoryNotFoundError thrown', async () => {
      req.query = { category: 'FakeCategory' };
      svc.findByCategory.mockRejectedValue(new CategoryNotFoundError('FakeCategory'));

      await searchProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category "FakeCategory" not found',
      });
    });
  });

  // ========================================================================
  // findAllProduct
  // ========================================================================
  describe('findAllProduct', () => {
    it('200 with product list', async () => {
      const list = [sampleProduct, { ...sampleProduct, id: 2, name: 'Gadget' }];
      svc.listAllProduct.mockResolvedValue(list);

      await findAllProduct(req, res);

      expect(svc.listAllProduct).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true, data: list });
    });
  });

  // ========================================================================
  // createProduct
  // ========================================================================
  describe('createProduct', () => {
    it('201 with product data', async () => {
      req.body = {
        name: 'NewProduct',
        description: 'Desc',
        price: 19.99,
        stock: 50,
        image_url: '/img.png',
        category_id: 3,
      };
      svc.createProduct.mockResolvedValue({ ...sampleProduct, name: 'NewProduct' });

      await createProduct(req, res);

      expect(svc.createProduct).toHaveBeenCalledWith({
        name: 'NewProduct',
        description: 'Desc',
        price: 19.99,
        stock: 50,
        image_url: '/img.png',
        category_id: 3,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { ...sampleProduct, name: 'NewProduct' },
      });
    });

    it('400 when required fields missing (name, price, stock, category_id)', async () => {
      // Send an empty body — all four checks should trigger
      req.body = {};

      await createProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'name, price, stock, and category_id are required',
      });
      expect(svc.createProduct).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // updateProduct
  // ========================================================================
  describe('updateProduct', () => {
    it('200 with updated product', async () => {
      req.params = { id: '1' };
      req.body = { name: 'UpdatedWidget', price: 12.5 };
      const updated = { ...sampleProduct, name: 'UpdatedWidget', price: 12.5 };
      svc.updateProduct.mockResolvedValue(updated);

      await updateProduct(req, res);

      expect(svc.updateProduct).toHaveBeenCalledWith(1, { name: 'UpdatedWidget', price: 12.5 });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
    });

    it('400 when id is NaN', async () => {
      req.params = { id: 'abc' }; // Number.parseInt('abc') → NaN → !NaN → true

      await updateProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'valid product id is required',
      });
      expect(svc.updateProduct).not.toHaveBeenCalled();
    });

    it('404 when UnknownProductID', async () => {
      req.params = { id: '999' };
      req.body = { name: 'Ghost' };
      svc.updateProduct.mockRejectedValue(new UnknownProductID());

      await updateProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'unknown product ID',
      });
    });
  });

  // ========================================================================
  // deleteProduct
  // ========================================================================
  describe('deleteProduct', () => {
    it('200 on success', async () => {
      req.params = { id: '1' };
      svc.deleteProduct.mockResolvedValue(true);

      await deleteProduct(req, res);

      expect(svc.deleteProduct).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: 'product 1 is removed',
      });
    });

    it('404 when UnknownProductID', async () => {
      req.params = { id: '999' };
      svc.deleteProduct.mockRejectedValue(new UnknownProductID());

      await deleteProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'unknown product ID',
      });
    });
  });
});
